import crypto from 'node:crypto';
import { z } from 'zod';
import pool from '../config/database.js';
import { env } from '../config/env.js';
import { ok } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import { emitDashboardUpdate } from '../services/SocketService.js';

const id = z.string().uuid();
const attendanceInput = z.object({
  sectorId: id, serviceId: id, shiftId: id,
  attendanceDate: z.string().date().nullish(),
});
const paging = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
const answerInput = z.object({
  value: z.number().int().min(1).max(5).nullish(),
  textValue: z.string().trim().max(2000).nullish(),
  optionValues: z.array(z.string().min(1).max(100)).min(1).max(10).optional(),
});
const feedbackField = z.string().trim().max(env.maxFeedbackLength).nullish();
const feedbackInput = z.object({ positive: feedbackField, negative: feedbackField, praise: feedbackField, suggestion: feedbackField });
const returnInput = z.object({
  name: z.string().trim().max(150).nullish(),
  contact: z.string().trim().min(1).max(255),
  preferredChannel: z.string().trim().max(30).nullish(),
  message: z.string().trim().max(500).nullish(),
});
const completeInput = z.object({ overallRating: z.number().int().min(0).max(10).optional() });

async function ensure(req, conn = pool, lock = false) {
  const hash = crypto.createHash('sha256').update(req.surveyToken).digest('hex');
  const [[survey]] = await conn.execute(
    'SELECT id,status,created_at,completed_at FROM surveys WHERE id=? AND access_token_hash=?' + (lock ? ' FOR UPDATE' : ''),
    [req.params.id, hash],
  );
  if (!survey) throw new AppError('Pesquisa não encontrada ou acesso inválido.', 404);
  return survey;
}

async function change(req, work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const survey = await ensure(req, conn, true);
    const result = await work(conn, survey);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

function requireStatus(survey, status) {
  if (survey.status !== status) throw new AppError('A pesquisa não está na etapa necessária para esta operação.', 409);
}

export async function sectors(_req, res) {
  const [data] = await pool.execute('SELECT id,name,slug,description FROM sectors WHERE is_active=1 ORDER BY name');
  ok(res, data);
}

export async function services(req, res) {
  const [data] = await pool.execute(
    'SELECT v.id,v.name,v.slug,v.description FROM services v JOIN sectors s ON s.id=v.sector_id WHERE s.id=? AND s.is_active=1 AND v.is_active=1 ORDER BY v.name',
    [req.params.id],
  );
  ok(res, data);
}

export async function stages(req, res) {
  const [data] = await pool.execute(
    'SELECT st.id,st.name,ss.display_order,ss.is_required,ss.team_id FROM service_stages ss JOIN stages st ON st.id=ss.stage_id '
      + 'JOIN services v ON v.id=ss.service_id JOIN sectors s ON s.id=v.sector_id '
      + 'WHERE v.id=? AND ss.is_active=1 AND st.is_active=1 AND v.is_active=1 AND s.is_active=1 ORDER BY ss.display_order',
    [req.params.id],
  );
  ok(res, data);
}

export async function shifts(_req, res) {
  const [data] = await pool.execute('SELECT id,name FROM shifts WHERE is_active=1 ORDER BY display_order,name');
  ok(res, data);
}

export async function createSurvey(_req, res) {
  const surveyId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('hex');
  await pool.execute("INSERT INTO surveys (id,access_token_hash,status) VALUES (?,?,'draft')", [surveyId, crypto.createHash('sha256').update(token).digest('hex')]);
  ok(res, { id: surveyId, surveyToken: token }, 'Pesquisa criada.', 201);
}

export async function survey(req, res) {
  const data = await ensure(req);
  ok(res, { id: data.id, status: data.status, createdAt: data.created_at, completedAt: data.completed_at });
}

export async function addAttendance(req, res) {
  const { sectorId, serviceId, shiftId, attendanceDate } = attendanceInput.parse(req.body);
  const attendanceId = crypto.randomUUID();
  await change(req, async (conn, survey) => {
    requireStatus(survey, 'draft');
    const [[valid]] = await conn.execute(
      'SELECT v.id FROM services v JOIN sectors s ON s.id=v.sector_id JOIN shifts sh ON sh.id=? '
        + 'WHERE v.id=? AND s.id=? AND s.is_active=1 AND v.is_active=1 AND sh.is_active=1 FOR SHARE',
      [shiftId, serviceId, sectorId],
    );
    if (!valid) throw new AppError('Informe setor, serviço e turno ativos e compatíveis.', 422);
    await conn.execute('INSERT INTO survey_attendances (id,survey_id,sector_id,service_id,shift_id,attendance_date) VALUES (?,?,?,?,?,?)',
      [attendanceId, survey.id, sectorId, serviceId, shiftId, attendanceDate ?? null]);
  });
  ok(res, { id: attendanceId }, 'Atendimento adicionado.', 201);
}

export async function removeAttendance(req, res) {
  await change(req, async (conn, survey) => {
    requireStatus(survey, 'draft');
    await conn.execute('DELETE FROM survey_attendances WHERE id=? AND survey_id=?', [req.params.attendanceId, survey.id]);
  });
  res.status(204).end();
}

export async function start(req, res) {
  await change(req, async (conn, survey) => {
    if (survey.status === 'in_progress') return;
    requireStatus(survey, 'draft');
    const [[attendance]] = await conn.execute('SELECT id FROM survey_attendances WHERE survey_id=? LIMIT 1', [survey.id]);
    if (!attendance) throw new AppError('Adicione um atendimento antes de iniciar a pesquisa.', 422);
    await conn.execute(
      'INSERT INTO survey_questions (id,survey_id,attendance_id,question_id,question_version_id,prompt_snapshot,type_snapshot,required_snapshot,display_order) '
        + 'SELECT UUID(), a.survey_id,a.id,q.id,qv.id,qv.prompt,q.type,q.is_required,qa.display_order '
        + 'FROM survey_attendances a JOIN question_assignments qa ON (qa.sector_id=a.sector_id OR qa.sector_id IS NULL) '
        + "AND (qa.service_id=a.service_id OR qa.service_id IS NULL) AND qa.is_active=1 JOIN questions q ON q.id=qa.question_id AND q.status='active' "
        + 'JOIN question_versions qv ON qv.question_id=q.id AND qv.version=q.current_version WHERE a.survey_id=?',
      [survey.id],
    );
    await conn.execute("UPDATE surveys SET status='in_progress',started_at=UTC_TIMESTAMP() WHERE id=?", [survey.id]);
  });
  ok(res, null, 'Pesquisa iniciada.');
}

export async function questions(req, res) {
  await ensure(req);
  const { limit, offset } = paging.parse(req.query);
  const [data] = await pool.execute(
    "SELECT sq.id,sq.attendance_id attendanceId,sq.prompt_snapshot text,sq.type_snapshot type,sq.required_snapshot required,sq.display_order displayOrder,st.name stage,"
      + "(SELECT JSON_ARRAYAGG(JSON_OBJECT('value',qo.value,'label',qo.label,'order',qo.display_order)) FROM question_options qo WHERE qo.question_version_id=sq.question_version_id) options "
      + 'FROM survey_questions sq LEFT JOIN questions q ON q.id=sq.question_id LEFT JOIN stages st ON st.id=q.stage_id '
      + 'WHERE sq.survey_id=? ORDER BY sq.display_order,sq.id LIMIT ? OFFSET ?',
    [req.params.id, limit, offset],
  );
  ok(res, data.map(({ options, ...question }) => ({
    ...question,
    ...(options && { options: options.sort((a, b) => a.order - b.order).map(({ value, label }) => ({ value, label })) }),
  })));
}

export async function nextQuestion(req, res) {
  await ensure(req);
  const [[data]] = await pool.execute(
    'SELECT sq.id,sq.attendance_id,sq.prompt_snapshot,sq.type_snapshot,sq.required_snapshot,sq.display_order FROM survey_questions sq '
      + 'LEFT JOIN answers a ON a.survey_question_id=sq.id WHERE sq.survey_id=? AND a.id IS NULL ORDER BY sq.display_order,sq.id LIMIT 1',
    [req.params.id],
  );
  ok(res, data ?? null);
}

async function normalizeAnswer(conn, question, input) {
  const { value, textValue, optionValues } = input;
  if (value == null && !textValue && !optionValues) {
    if (question.required_snapshot) throw new AppError('Resposta obrigatória.', 422);
    return [null, null];
  }
  if (question.type_snapshot === 'rating' && value != null && !textValue && !optionValues) return [value, null];
  if (question.type_snapshot === 'text' && textValue && value == null && !optionValues) return [null, textValue];
  const choice = question.type_snapshot === 'single_choice' && textValue && !optionValues ? [textValue]
    : question.type_snapshot === 'multiple_choice' && !textValue ? optionValues : null;
  if (choice && value == null && new Set(choice).size === choice.length) {
    const [allowed] = await conn.execute('SELECT value FROM question_options WHERE question_version_id=?', [question.question_version_id]);
    const values = new Set(allowed.map(option => option.value));
    if (choice.every(value => values.has(value))) {
      return [null, question.type_snapshot === 'single_choice' ? choice[0] : JSON.stringify(choice)];
    }
  }
  throw new AppError('Resposta incompatível com o tipo ou com as opções da pergunta.', 422);
}

export async function answer(req, res) {
  const input = answerInput.parse(req.body);
  await change(req, async (conn, survey) => {
    requireStatus(survey, 'in_progress');
    const [[question]] = await conn.execute('SELECT id,type_snapshot,required_snapshot,question_version_id FROM survey_questions WHERE id=? AND survey_id=?',
      [req.params.surveyQuestionId, survey.id]);
    if (!question) throw new AppError('Pergunta não encontrada.', 404);
    const [value, textValue] = await normalizeAnswer(conn, question, input);
    await conn.execute('INSERT INTO answers (id,survey_question_id,rating_value,text_value) VALUES (UUID(),?,?,?) '
      + 'ON DUPLICATE KEY UPDATE rating_value=VALUES(rating_value),text_value=VALUES(text_value),updated_at=UTC_TIMESTAMP()',
    [question.id, value, textValue]);
  });
  ok(res, null, 'Resposta salva.');
}

export async function feedback(req, res) {
  const { positive, negative, praise, suggestion } = feedbackInput.parse(req.body);
  await change(req, async (conn, survey) => {
    requireStatus(survey, 'in_progress');
    await conn.execute('INSERT INTO feedback (id,survey_id,positive_text,negative_text,praise_text,suggestion_text) VALUES (UUID(),?,?,?,?,?) '
      + 'ON DUPLICATE KEY UPDATE positive_text=VALUES(positive_text),negative_text=VALUES(negative_text),praise_text=VALUES(praise_text),suggestion_text=VALUES(suggestion_text)',
    [survey.id, positive || null, negative || null, praise || null, suggestion || null]);
  });
  ok(res, null, 'Feedback salvo.');
}

export async function returnRequest(req, res) {
  const { name, contact, preferredChannel, message } = returnInput.parse(req.body);
  await change(req, async (conn, survey) => {
    requireStatus(survey, 'in_progress');
    await conn.execute("INSERT INTO return_requests (id,survey_id,name,contact,preferred_channel,message,status) VALUES (UUID(),?,?,?,?,?,'open') "
      + 'ON DUPLICATE KEY UPDATE name=VALUES(name),contact=VALUES(contact),preferred_channel=VALUES(preferred_channel),message=VALUES(message)',
    [survey.id, name || null, contact, preferredChannel || null, message || null]);
  });
  ok(res, null, 'Solicitação de retorno registrada.');
}

export async function complete(req, res) {
  const { overallRating } = completeInput.parse(req.body);
  const changed = await change(req, async (conn, survey) => {
    if (survey.status === 'completed') return false;
    requireStatus(survey, 'in_progress');
    const [[required]] = await conn.execute(
      'SELECT COUNT(*) count FROM survey_questions sq LEFT JOIN answers a ON a.survey_question_id=sq.id WHERE sq.survey_id=? AND sq.required_snapshot=1 AND a.id IS NULL',
      [survey.id],
    );
    if (required.count) throw new AppError('Existem perguntas obrigatórias sem resposta.', 422);
    await conn.execute("UPDATE surveys SET status='completed',completed_at=UTC_TIMESTAMP(),overall_rating=? WHERE id=?", [overallRating ?? null, survey.id]);
    return true;
  });
  if (changed) emitDashboardUpdate({ surveyId: req.params.id, type: 'survey_completed' });
  ok(res, null, 'Pesquisa finalizada.');
}
