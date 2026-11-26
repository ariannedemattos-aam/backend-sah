import { z } from 'zod';
import pool from '../config/database.js';
import { withTransaction } from '../utils/withTransaction.js';
import { ok, paginated } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import {
  attendanceFilter, distribution, evaluationListSchema, feedbackListSchema, feedbackTypes, filtersSchema, idSchema,
  isSector, periodConditions, redactFeedback, returnListSchema, returnStatuses, selections, summary, where,
} from '../services/EvaluationData.js';

const missing = message => new AppError(message, 404);
const sortOrder = {
  recent: 'm.completed_at DESC,m.id',
  oldest: 'm.completed_at ASC,m.id',
  highest: 'r.averageRating IS NULL,r.averageRating DESC,m.completed_at DESC,m.id',
  lowest: 'r.averageRating IS NULL,r.averageRating ASC,m.completed_at DESC,m.id',
};

export async function options(req, res) {
  const scope = attendanceFilter({}, req.user);
  const selection = selections({}, req.user, { exclusive: true });
  const attendances = ' FROM selected m JOIN survey_attendances a ON a.survey_id=m.id ';
  const sql = [
    'SELECT DISTINCT se.id,se.name' + attendances + 'JOIN sectors se ON se.id=a.sector_id' + where(scope.conditions) + ' ORDER BY se.name,se.id',
    'SELECT DISTINCT sv.id,sv.name,a.sector_id AS sectorId' + attendances + 'JOIN services sv ON sv.id=a.service_id' + where(scope.conditions) + ' ORDER BY sv.name,sv.id,a.sector_id',
    'SELECT DISTINCT st.id,st.name' + attendances + 'JOIN survey_questions q ON q.attendance_id=a.id '
      + 'JOIN questions qq ON qq.id=q.question_id JOIN stages st ON st.id=qq.stage_id' + where(scope.conditions) + ' ORDER BY st.name,st.id',
  ];
  const [[sectors], [services], [stages]] = await Promise.all(
    sql.map(query => pool.execute(selection.cte + ' ' + query, [...selection.params, ...scope.params])),
  );
  ok(res, { sectors, services, stages });
}

export async function list(req, res) {
  const filters = evaluationListSchema.parse(req.query);
  const { page, limit, sort } = filters;
  const selection = selections(filters, req.user);
  const { cte, answerContext, answerConditions, answerParams, attendance } = selection;
  const result = await withTransaction(async conn => {
    const totals = await summary(conn, selection);
    const ratings = ', ratings AS (SELECT m.id,ROUND(AVG(x.rating_value),2) averageRating,COUNT(x.id) answers'
      + answerContext + where(answerConditions) + ' GROUP BY m.id)';
    const attendanceConditions = where(['a.survey_id=m.id', ...attendance.conditions]);
    const [rows] = await conn.execute(
      cte + ratings + " SELECT m.id,DATE_FORMAT(m.completed_at,'%Y-%m-%d') completedDate,m.overall_rating overallRating,"
        + " (SELECT GROUP_CONCAT(DISTINCT CONCAT(se.name, ' · ', sv.name) ORDER BY se.name,sv.name SEPARATOR '; ')"
        + ' FROM survey_attendances a JOIN sectors se ON se.id=a.sector_id JOIN services sv ON sv.id=a.service_id'
        + attendanceConditions + ') attendances, r.averageRating,COALESCE(r.answers,0) answers '
        + 'FROM selected m LEFT JOIN ratings r ON r.id=m.id ORDER BY ' + sortOrder[sort] + ' LIMIT ? OFFSET ?',
      [...answerParams, ...attendance.params, limit, (page - 1) * limit],
    );
    return { rows, totals, scores: await distribution(conn, selection) };
  });
  const { rows, totals, scores } = result;
  res.json({
    success: true, data: rows, summary: totals, distribution: scores,
    pagination: { page, limit, total: totals.total, totalPages: Math.ceil(totals.total / limit) },
  });
}

function choiceLabels(type, choice, options) {
  if (!choice || !options) return [];
  let values = [choice];
  if (type === 'multiple_choice') {
    try { values = JSON.parse(choice); } catch { return []; }
  }
  if (!Array.isArray(values)) return [];
  return options.filter(option => values.includes(option.value)).map(option => option.label);
}

export async function detail(req, res) {
  const id = idSchema.parse(req.params.id);
  const filters = filtersSchema.parse(req.query);
  const selection = selections(filters, req.user);
  const { cte, params, attendance, answerContext, answerConditions, answerParams } = selection;
  const result = await withTransaction(async conn => {
    const [[survey]] = await conn.execute(
      cte + " SELECT m.id,DATE_FORMAT(m.completed_at,'%Y-%m-%d') completedDate,m.overall_rating overallRating FROM selected m WHERE m.id=?",
      [...params, id],
    );
    if (!survey) throw missing('Avaliação não encontrada para os filtros selecionados.');
    const [attendances] = await conn.execute(
      'SELECT se.name sector,sv.name service,sh.name shift FROM survey_attendances a JOIN sectors se ON se.id=a.sector_id '
        + 'JOIN services sv ON sv.id=a.service_id JOIN shifts sh ON sh.id=a.shift_id'
        + where(['a.survey_id=?', ...attendance.conditions]) + ' ORDER BY a.id',
      [id, ...attendance.params],
    );
    const [rows] = await conn.execute(
      cte + " SELECT q.id,q.prompt_snapshot prompt,q.type_snapshot type,x.rating_value rating,IF(qc.question_id IS NULL,st.name,qc.stage_name) stage,sv.name service,"
        + " CASE WHEN q.type_snapshot IN ('single_choice','multiple_choice') THEN x.text_value END choice,"
        + " CASE WHEN q.type_snapshot='text' AND x.text_value IS NOT NULL THEN 1 ELSE 0 END hasText,"
        + " (SELECT JSON_ARRAYAGG(JSON_OBJECT('value',o.value,'label',o.label)) FROM question_options o WHERE o.question_version_id=q.question_version_id) AS choices"
        + answerContext + ' LEFT JOIN stages st ON st.id=qq.stage_id JOIN services sv ON sv.id=a.service_id'
        + where([...answerConditions, 'm.id=?']) + ' ORDER BY a.id,q.display_order,q.id',
      [...answerParams, id],
    );
    return { ...survey, attendances, answers: rows.map(({ choice, choices, hasText, ...row }) => ({
      ...row, hasText: Boolean(hasText), options: choiceLabels(row.type, choice, choices),
    })) };
  });
  ok(res, result);
}

export async function feedback(req, res) {
  const filters = feedbackListSchema.parse(req.query);
  const { page, limit, sort, kind } = filters;
  const selection = selections(filters, req.user, { exclusive: true });
  const kinds = kind ? [kind] : Object.keys(feedbackTypes);
  const entries = kinds.map(key => {
    const field = 'f.' + feedbackTypes[key].column;
    return "SELECT f.id, '" + key + "' AS kind," + field + " AS content,f.created_at FROM selected m "
      + "JOIN feedback f ON f.survey_id=m.id WHERE NULLIF(TRIM(" + field + "), '') IS NOT NULL";
  });
  const cte = selection.cte + ', entries AS (' + entries.join(' UNION ALL ') + ')';
  const { count, rows } = await withTransaction(async conn => {
    const [[count]] = await conn.execute(cte + ' SELECT COUNT(*) total FROM entries', selection.params);
    const [rows] = await conn.execute(
      cte + " SELECT id,kind,content,DATE_FORMAT(created_at,'%Y-%m-%d') receivedDate FROM entries ORDER BY created_at "
        + (sort === 'oldest' ? 'ASC' : 'DESC') + ',id,kind LIMIT ? OFFSET ?',
      [...selection.params, limit, (page - 1) * limit],
    );
    return { count: count.total, rows };
  });
  paginated(res, rows.map(({ id, content, ...row }) => ({
    ...row, id: id + ':' + row.kind, content: redactFeedback(content),
  })), { page, limit, total: count, totalPages: Math.ceil(count / limit) });
}

const requestsFrom = " FROM return_requests r JOIN surveys s ON s.id=r.survey_id AND s.status='completed'";
const changeStatus = z.object({ status: z.enum(returnStatuses) });
const nextStatus = { open: 'in_progress', in_progress: 'closed' };
function requestConditions(req, filters) {
  const conditions = [], params = [];
  if (isSector(req.user)) {
    conditions.push('EXISTS (SELECT 1 FROM survey_attendances a WHERE a.survey_id=s.id)'
      + ' AND NOT EXISTS (SELECT 1 FROM survey_attendances a WHERE a.survey_id=s.id '
      + 'AND NOT EXISTS (SELECT 1 FROM user_sectors us WHERE us.sector_id=a.sector_id AND us.user_id=?))');
    params.push(req.user.sub);
  }
  periodConditions(filters, 'r.created_at', conditions, params);
  if (filters.requestId) { conditions.push('r.id=?'); params.push(filters.requestId); }
  if (filters.status) { conditions.push('r.status=?'); params.push(filters.status); }
  return { conditions, params };
}

export async function returns(req, res) {
  const filters = returnListSchema.parse(req.query);
  const { page, limit } = filters;
  const scope = requestConditions(req, filters);
  const result = await withTransaction(async conn => {
    const [[count]] = await conn.execute('SELECT COUNT(*) total' + requestsFrom + where(scope.conditions), scope.params);
    const [rows] = await conn.execute(
      'SELECT r.id,r.status,r.created_at createdAt' + requestsFrom + where(scope.conditions)
        + ' ORDER BY r.created_at DESC,r.id LIMIT ? OFFSET ?',
      [...scope.params, limit, (page - 1) * limit],
    );
    return { total: count.total, rows };
  });
  paginated(res, result.rows, { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) });
}

async function requestRecord(conn, req, id, fields) {
  const scope = requestConditions(req, {});
  const [[record]] = await conn.execute(
    'SELECT ' + fields + requestsFrom + where(['r.id=?', ...scope.conditions]) + ' FOR UPDATE',
    [id, ...scope.params],
  );
  if (!record) throw missing('Solicitação de retorno não encontrada.');
  return record;
}

export async function revealContact(req, res) {
  const id = idSchema.parse(req.params.id);
  const contact = await withTransaction(async conn => {
    const data = await requestRecord(conn, req, id, 'r.id,r.name,r.contact,r.preferred_channel preferredChannel,r.message,r.status');
    await conn.execute("INSERT INTO audit_logs (id,user_id,action,entity,entity_id) VALUES (UUID(),?,'return.contact_viewed','return_request',?)",
      [req.user.sub, id]);
    return data;
  });
  ok(res, contact);
}

export async function updateReturnStatus(req, res) {
  const id = idSchema.parse(req.params.id);
  const { status } = changeStatus.parse(req.body);
  await withTransaction(async conn => {
    const before = await requestRecord(conn, req, id, 'r.status');
    if (before.status === status) return;
    if (nextStatus[before.status] !== status) throw new AppError('A solicitação deve seguir a ordem pendente, em atendimento e concluída.', 409);
    await conn.execute('UPDATE return_requests SET status=? WHERE id=?', [status, id]);
    await conn.execute("INSERT INTO audit_logs (id,user_id,action,entity,entity_id,metadata) VALUES (UUID(),?,'return.status_changed','return_request',?,?)",
      [req.user.sub, id, JSON.stringify({ previous: before.status, status })]);
  });
  ok(res, { id, status }, 'Situação da solicitação atualizada.');
}
