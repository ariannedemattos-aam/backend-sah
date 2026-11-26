import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import pool from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { ok, paginated } from '../utils/response.js';
import { withTransaction } from '../utils/withTransaction.js';
import { notifyPermission, notifyQuestionAuthor } from '../services/Notifications.js';
import { storeRule, validStage } from '../services/QuestionJourney.js';
import { emitNotificationUpdates } from '../services/SocketService.js';

const questionFields = z.object({
  prompt: z.string().trim().min(10).max(500),
  type: z.enum(['rating', 'text', 'single_choice', 'multiple_choice']),
  required: z.boolean().default(false),
  rule: z.object({ questionId: z.string().uuid(), value: z.string().min(1).max(100) }).nullish(),
  options: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
});
function validateOptions(value, ctx) {
  if (['single_choice', 'multiple_choice'].includes(value.type)
    && (!value.options || value.options.length < 2 || new Set(value.options).size !== value.options.length)) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'Informe de duas a dez opções distintas.' });
  }
}
const questionInput = questionFields.extend({ serviceId: z.string().uuid(), stageId: z.string().uuid().nullish() }).superRefine(validateOptions);
const questionEdit = questionFields.extend({
  version: z.number().int().min(1),
  changeReason: z.string().trim().min(3).max(500),
}).superRefine(validateOptions);
const filters = z.object({
  status: z.enum(['pending', 'approved', 'active', 'inactive', 'rejected']).optional(),
  search: z.string().trim().max(120).default(''),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});
const reviewInput = z.object({ justification: z.string().trim().min(3).max(500) });
const statusInput = z.object({ active: z.boolean() });
const ratingOptions = ['Muito insatisfeito', 'Insatisfeito', 'Neutro', 'Satisfeito', 'Muito satisfeito'];

const permitted = (user, permission) => user.permissions?.includes(permission);
const isSector = user => user.role === 'userSetor';
const canManage = user => !isSector(user)
  && ['questions.create', 'questions.update', 'questions.approve', 'questions.reject'].some(permission => permitted(user, permission));
const canEditAll = user => !isSector(user) && permitted(user, 'questions.update');
const sectorMayEdit = (question, user) => permitted(user, 'questions.propose')
  && question.createdBy === user.sub && ['pending', 'rejected'].includes(question.status);

const questionColumns = 'q.id,q.type,q.status,q.is_required AS required,q.created_at AS createdAt, q.current_version AS version, v.prompt, '
  + "(SELECT GROUP_CONCAT(DISTINCT sv.name ORDER BY sv.name SEPARATOR ', ') FROM question_assignments a JOIN services sv ON sv.id=a.service_id WHERE a.question_id=q.id) AS services ";
const questionJoin = 'FROM questions q JOIN question_versions v ON v.question_id=q.id AND v.version=q.current_version ';

async function storeVersion(conn, { id, version, input, author, reason = null }) {
  const versionId = randomUUID();
  await conn.execute('INSERT INTO question_versions (id,question_id,version,prompt,change_reason,created_by) VALUES (?,?,?,?,?,?)',
    [versionId, id, version, input.prompt, reason, author]);
  const options = input.type === 'rating' ? ratingOptions : input.type === 'text' ? [] : input.options;
  for (const [index, label] of options.entries()) {
    await conn.execute('INSERT INTO question_options (id,question_version_id,label,value,display_order) VALUES (UUID(),?,?,?,?)',
      [versionId, label, String(index + 1), index + 1]);
  }
  return versionId;
}

export async function catalog(req, res) {
  const canManage = !isSector(req.user) && permitted(req.user, 'questions.create');
  const [data] = await pool.execute(
    'SELECT v.id, v.name, s.name AS sectorName FROM services v JOIN sectors s ON s.id=v.sector_id '
      + 'WHERE v.is_active=1 AND s.is_active=1 '
      + (canManage ? '' : 'AND EXISTS (SELECT 1 FROM user_sectors us WHERE us.sector_id=s.id AND us.user_id=?) ')
      + 'ORDER BY s.name,v.name',
    canManage ? [] : [req.user.sub],
  );
  ok(res, data);
}


export async function configuration(req, res) {
  const serviceId = z.string().uuid().parse(req.params.serviceId);
  const [[service]] = await pool.execute(
    'SELECT v.id FROM services v JOIN sectors s ON s.id=v.sector_id WHERE v.id=? AND v.is_active=1 AND s.is_active=1 '
      + (isSector(req.user) ? 'AND EXISTS (SELECT 1 FROM user_sectors m WHERE m.user_id=? AND m.sector_id=s.id)' : ''),
    [serviceId, ...(isSector(req.user) ? [req.user.sub] : [])],
  );
  if (!service) throw new AppError('Serviço indisponível para este perfil.', 403);
  const [[stages], [questions]] = await Promise.all([
    pool.execute(
      'SELECT st.id,st.name FROM service_stages ss JOIN stages st ON st.id=ss.stage_id WHERE ss.service_id=? AND ss.is_active=1 AND st.is_active=1 ORDER BY ss.display_order',
      [serviceId],
    ),
    pool.execute(
      'SELECT q.id,q.stage_id stageId,v.prompt,a.display_order position,'
        + '(SELECT JSON_ARRAYAGG(JSON_OBJECT(\'value\',o.value,\'label\',o.label,\'order\',o.display_order)) FROM question_options o WHERE o.question_version_id=v.id) options '
        + 'FROM question_assignments a JOIN questions q ON q.id=a.question_id '
        + 'JOIN question_versions v ON v.question_id=q.id AND v.version=q.current_version '
        + "WHERE a.service_id=? AND a.is_active=1 AND q.status='active' AND q.type<>'text' ORDER BY a.display_order,q.id", [serviceId],
    ),
  ]);
  ok(res, { stages, questions: questions.map(q => ({ ...q, options: (q.options ?? []).sort((a, b) => a.order - b.order) })) });
}

export async function list(req, res) {
  const { page, limit, status, search } = filters.parse(req.query);
  const clauses = [], values = [];
  if (!canManage(req.user)) {
    clauses.push('q.created_by=?');
    values.push(req.user.sub);
  }
  if (status) {
    clauses.push('q.status=?');
    values.push(status);
  }
  if (search) {
    clauses.push('LOCATE(?,v.prompt)>0');
    values.push(search);
  }
  if (isSector(req.user)) {
    clauses.push('EXISTS (SELECT 1 FROM question_assignments qa JOIN user_sectors us ON us.sector_id=qa.sector_id WHERE qa.question_id=q.id AND qa.is_active=1 AND us.user_id=?)');
    values.push(req.user.sub);
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') + ' ' : '';
  const [[[count]], [rows]] = await Promise.all([
    pool.execute('SELECT COUNT(*) AS total ' + questionJoin + where, values),
    pool.execute('SELECT ' + questionColumns + ', q.created_by AS createdBy ' + questionJoin + where
      + 'ORDER BY q.created_at DESC,q.id LIMIT ? OFFSET ?', [...values, limit, (page - 1) * limit]),
  ]);
  const data = rows.map(({ createdBy, ...question }) => ({
    ...question, canEdit: Boolean(canEditAll(req.user) || sectorMayEdit({ ...question, createdBy }, req.user)),
  }));
  paginated(res, data, { page, limit, total: count.total, totalPages: Math.ceil(count.total / limit) });
}

export async function propose(req, res) {
  const input = questionInput.parse(req.body);
  const id = randomUUID();
  const status = 'pending';
  const recipients = await withTransaction(async conn => {
    const [[service]] = await conn.execute(
      'SELECT v.sector_id AS sectorId FROM services v JOIN sectors s ON s.id=v.sector_id WHERE v.id=? AND v.is_active=1 AND s.is_active=1 FOR UPDATE',
      [input.serviceId],
    );
    if (!service) throw new AppError('Serviço indisponível.', 422);
    if (isSector(req.user) || !permitted(req.user, 'questions.create')) {
      const [[membership]] = await conn.execute('SELECT 1 AS allowed FROM user_sectors WHERE user_id=? AND sector_id=?', [req.user.sub, service.sectorId]);
      if (!membership) throw new AppError('O serviço não pertence a um setor atribuído ao usuário.', 403);
    }
    await validStage(conn, input.serviceId, input.stageId);
    const [[{ position }]] = await conn.execute(
      'SELECT COALESCE(MAX(display_order),0)+1 position FROM question_assignments WHERE service_id=?', [input.serviceId],
    );
    await conn.execute('INSERT INTO questions (id,created_by,stage_id,type,status,is_required) VALUES (?,?,?,?,?,0)',
      [id, req.user.sub, input.stageId ?? null, input.type, status]);
    const versionId = await storeVersion(conn, { id, version: 1, input, author: req.user.sub });
    await storeRule(conn, versionId, input.serviceId, position, input.stageId, input.rule);
    await conn.execute('INSERT INTO question_assignments (id,question_id,sector_id,service_id,stage_id,display_order) VALUES (UUID(),?,?,?,?,?)',
      [id, service.sectorId, input.serviceId, input.stageId ?? null, position]);
    return notifyPermission(conn, ['questions.approve', 'questions.reject'], {
      type: 'question.proposed', title: 'Nova proposta de pergunta',
      message: 'Uma proposta de pergunta está pendente de revisão.', href: '/admin/perguntas',
    });
  });
  emitNotificationUpdates(recipients);
  ok(res, { id, status }, 'Pergunta enviada para aprovação.', 201);
}

export async function get(req, res) {
  const id = z.string().uuid().parse(req.params.id);
  const [[row]] = await pool.execute(
    'SELECT ' + questionColumns + ', q.created_by AS createdBy, v.id AS versionId, q.stage_id stageId, a.service_id serviceId, a.display_order position, qr.prerequisite_id prerequisiteId, qr.expected_value expectedValue ' + questionJoin
      + 'LEFT JOIN question_assignments a ON a.question_id=q.id AND a.is_active=1 '
      + 'LEFT JOIN question_version_rules qr ON qr.version_id=v.id WHERE q.id=?'
      + (isSector(req.user) ? ' AND EXISTS (SELECT 1 FROM user_sectors m WHERE m.sector_id=a.sector_id AND m.user_id=?)' : '')
      + ' ORDER BY a.display_order,a.id LIMIT 1',
    [id, ...(isSector(req.user) ? [req.user.sub] : [])],
  );
  if (!row || (!canManage(req.user) && row.createdBy !== req.user.sub)) throw new AppError('Pergunta não encontrada.', 404);
  const { createdBy, versionId, prerequisiteId, expectedValue, ...question } = row;
  const [options] = await pool.execute('SELECT label FROM question_options WHERE question_version_id=? ORDER BY display_order,id', [versionId]);
  ok(res, {
    ...question,
    canEdit: Boolean(canEditAll(req.user) || sectorMayEdit(row, req.user)),
    rule: prerequisiteId ? { questionId: prerequisiteId, value: expectedValue } : null,
    options: options.map(option => option.label),
  });
}

export async function update(req, res) {
  const id = z.string().uuid().parse(req.params.id);
  const input = questionEdit.parse(req.body);
  const result = await withTransaction(async conn => {
    const [[current]] = await conn.execute(
      'SELECT status,created_by AS createdBy,stage_id stageId,current_version AS version FROM questions WHERE id=? FOR UPDATE', [id],
    );
    if (!current) throw new AppError('Pergunta não encontrada.', 404);
    if (!canEditAll(req.user)) {
      if (current.createdBy !== req.user.sub) throw new AppError('Pergunta não encontrada.', 404);
      if (!sectorMayEdit(current, req.user)) throw new AppError('Somente uma proposta pendente ou rejeitada pode ser editada pelo setor.', 409);
      const [[access]] = await conn.execute(
        'SELECT COUNT(*) total, SUM(us.user_id IS NULL OR s.is_active<>1 OR v.is_active<>1 '
          + 'OR s.id IS NULL OR v.id IS NULL OR NOT (v.sector_id <=> s.id)) blocked '
          + 'FROM question_assignments a LEFT JOIN sectors s ON s.id=a.sector_id LEFT JOIN services v ON v.id=a.service_id '
          + 'LEFT JOIN user_sectors us ON us.user_id=? AND us.sector_id=a.sector_id WHERE a.question_id=? AND a.is_active=1',
        [req.user.sub, id],
      );
      if (!access.total || Number(access.blocked)) throw new AppError('O serviço da pergunta não está disponível para o setor.', 403);
    }
    if (input.version !== current.version) throw new AppError('A pergunta foi alterada. Reabra a edição e tente novamente.', 409);
    const version = current.version + 1;
    const status = ['rejected', 'approved'].includes(current.status) ? 'pending' : current.status;
    const versionId = await storeVersion(conn, { id, version, input, author: req.user.sub, reason: input.changeReason });
    if (input.rule !== undefined) {
      if (input.rule) {
        const [[assignment]] = await conn.execute(
          'SELECT service_id serviceId,display_order position FROM question_assignments WHERE question_id=? AND is_active=1 ORDER BY display_order,id LIMIT 1', [id],
        );
        if (!assignment?.serviceId) throw new AppError('A pergunta precisa de um serviço para receber uma condição.', 422);
        await storeRule(conn, versionId, assignment.serviceId, assignment.position, current.stageId, input.rule);
      }
    } else {
      await conn.execute('INSERT INTO question_version_rules(version_id,prerequisite_id,expected_value) '
        + 'SELECT ?,r.prerequisite_id,r.expected_value FROM question_version_rules r JOIN question_versions v ON v.id=r.version_id '
        + 'WHERE v.question_id=? AND v.version=?', [versionId, id, current.version]);
    }
    await conn.execute('UPDATE questions SET current_version=?,type=?,is_required=?,status=? WHERE id=?',
      [version, input.type, 0, status, id]);
    return { id, status, version };
  });
  ok(res, result, 'Nova versão da pergunta salva.');
}

export async function setStatus(req, res) {
  if (isSector(req.user)) throw new AppError('Acesso não autorizado.', 403);
  const id = z.string().uuid().parse(req.params.id);
  const { active } = statusInput.parse(req.body);
  const status = active ? 'pending' : 'inactive';
  await withTransaction(async conn => {
    const [[question]] = await conn.execute('SELECT status FROM questions WHERE id=? FOR UPDATE', [id]);
    if (!question) throw new AppError('Pergunta não encontrada.', 404);
    if (question.status === status) return;
    if (question.status !== (active ? 'inactive' : 'active')) {
      throw new AppError('O status atual não permite esta transição.', 409);
    }
    await conn.execute('UPDATE questions SET status=? WHERE id=?', [status, id]);
  });
  ok(res, { id, status }, active ? 'Pergunta devolvida à revisão.' : 'Pergunta arquivada.');
}

export function review(action) {
  return async (req, res) => {
    if (isSector(req.user)) throw new AppError('Acesso não autorizado.', 403);
    const id = z.string().uuid().parse(req.params.id);
    const { justification } = reviewInput.parse(req.body);
    const status = action === 'approved' ? 'active' : 'rejected';
    const recipients = await withTransaction(async conn => {
      const [[question]] = await conn.execute('SELECT status,created_by createdBy FROM questions WHERE id=? FOR UPDATE', [id]);
      if (!question) throw new AppError('Pergunta não encontrada.', 404);
      if (question.status !== 'pending') throw new AppError('A pergunta já foi analisada.', 409);
      await conn.execute('UPDATE questions SET status=? WHERE id=?', [status, id]);
      await conn.execute('INSERT INTO question_approvals (id, question_id, reviewer_id, action, justification) VALUES (UUID(),?,?,?,?)',
        [id, req.user.sub, action, justification]);
      return notifyQuestionAuthor(conn, question.createdBy, action === 'approved');
    });
    emitNotificationUpdates(recipients);
    ok(res, { id, status }, action === 'approved' ? 'Pergunta aprovada e ativada.' : 'Pergunta rejeitada.');
  };
}
