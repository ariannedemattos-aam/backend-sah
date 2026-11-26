import { z } from 'zod';
import pool from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { ok, paginated } from '../utils/response.js';
import { withTransaction } from '../utils/withTransaction.js';
import { idSchema, periodConditions, redactFeedback, where } from '../services/EvaluationData.js';
import { lowScoreMax } from '../services/Profiles.js';

const states = z.enum(['open','in_progress','closed']);
const priorities = z.enum(['normal','high']);
const filters = z.object({
  status: states.optional(), priority: priorities.optional(), sectorId: idSchema.optional(),
  from: z.iso.date().optional(), to: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const action = z.object({ status: states, priority: priorities, note: z.string().trim().min(3).max(1500) });
const source = " FROM ombudsman_cases c JOIN surveys s ON s.id=c.survey_id AND s.status='completed'"
  + ' LEFT JOIN return_requests r ON r.survey_id=s.id LEFT JOIN feedback f ON f.survey_id=s.id';
const hasComplaint = "NULLIF(TRIM(f.negative_text),'') IS NOT NULL";
const fields = 'c.id,c.status,c.priority,c.created_at createdAt, s.overall_rating overallRating, r.id returnId,r.status returnStatus,'
  + hasComplaint + ' AS hasComplaint,'
  + '(SELECT GROUP_CONCAT(DISTINCT se.name ORDER BY se.name SEPARATOR \', \') FROM survey_attendances a JOIN sectors se ON se.id=a.sector_id WHERE a.survey_id=c.survey_id) sectors';
const missing = () => new AppError('Manifestação não encontrada.', 404);

export async function enqueue(connection, surveyId, score) {
  const [[flags]] = await connection.execute(
    'SELECT EXISTS(SELECT 1 FROM return_requests WHERE survey_id=?) AS hasReturn, '
      + "EXISTS(SELECT 1 FROM feedback f WHERE f.survey_id=? AND " + hasComplaint + ') AS hasComplaint',
    [surveyId, surveyId],
  );
  const priority = score <= lowScoreMax || flags.hasReturn ? 'high' : 'normal';
  if (priority === 'normal' && !flags.hasComplaint) return null;
  await connection.execute('INSERT INTO ombudsman_cases (id,survey_id,priority,created_at) VALUES (UUID(),?,?,UTC_TIMESTAMP())', [surveyId, priority]);
  return flags;
}

export async function list(req, res) {
  const query = filters.parse(req.query);
  const { status, priority, sectorId, page, limit, from, to } = query;
  if (from && to && from > to) throw new AppError('Período inválido.', 422);
  const rules = [], params = [];
  periodConditions(query, 'c.created_at', rules, params);
  if (status) { rules.push('c.status=?'); params.push(status); }
  if (priority) { rules.push('c.priority=?'); params.push(priority); }
  if (sectorId) { rules.push('EXISTS (SELECT 1 FROM survey_attendances a WHERE a.survey_id=c.survey_id AND a.sector_id=?)'); params.push(sectorId); }
  const conditions = where(rules);
  const result = await withTransaction(async conn => {
    const [[count]] = await conn.execute('SELECT COUNT(*) total' + source + conditions, params);
    const [rows] = await conn.execute('SELECT ' + fields + source + conditions
      + ' ORDER BY c.created_at DESC,c.id LIMIT ? OFFSET ?', [...params, limit, (page - 1) * limit]);
    return { rows, total: count.total };
  });
  paginated(res, result.rows, { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) });
}

export async function detail(req, res) {
  const id = idSchema.parse(req.params.id);
  const [[entry]] = await pool.execute('SELECT ' + fields + ',f.negative_text complaint' + source + ' WHERE c.id=?', [id]);
  if (!entry) throw missing();
  const [history] = await pool.execute(
    'SELECT a.id,a.previous_status previousStatus,a.status,a.priority,a.note,a.created_at createdAt,u.name actor '
      + 'FROM ombudsman_actions a JOIN users u ON u.id=a.actor_id WHERE a.case_id=? ORDER BY a.created_at DESC,a.id DESC', [id],
  );
  const contact = req.user.permissions.includes('return_requests.manage');
  const { returnId, ...details } = entry;
  ok(res, { ...details, returnId: contact ? returnId : null,
    complaint: entry.complaint ? redactFeedback(entry.complaint) : null, history });
}

export async function addAction(req, res) {
  const id = idSchema.parse(req.params.id);
  const { status, priority, note } = action.parse(req.body);
  await withTransaction(async conn => {
    const [[entry]] = await conn.execute('SELECT c.status,r.status returnStatus' + source + ' WHERE c.id=? FOR UPDATE', [id]);
    if (!entry) throw missing();
    const transitions = { open: ['open','in_progress'], in_progress: ['in_progress','closed'], closed: ['closed','in_progress'] };
    if (!transitions[entry.status].includes(status)) throw new AppError('A manifestação deve passar por atendimento antes da conclusão.', 409);
    if (status === 'closed' && entry.returnStatus && entry.returnStatus !== 'closed') throw new AppError('Conclua a solicitação de retorno vinculada antes de encerrar a manifestação.', 409);
    await conn.execute('UPDATE ombudsman_cases SET status=?,priority=? WHERE id=?', [status, priority, id]);
    await conn.execute('INSERT INTO ombudsman_actions (id,case_id,actor_id,previous_status,status,priority,note) VALUES (UUID(),?,?,?,?,?,?)',
      [id, req.user.sub, entry.status, status, priority, redactFeedback(note)]);
  });
  ok(res, { id, status, priority }, 'Providência registrada.', 201);
}
