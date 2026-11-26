import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import pool from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { ok, paginated } from '../utils/response.js';
import { withTransaction } from '../utils/withTransaction.js';
import { notifyPermission, notifyQuestionAuthor } from '../services/Notifications.js';
import { emitNotificationUpdates } from '../services/SocketService.js';

const questionFields = z.object({
  prompt: z.string().trim().min(10).max(500),
  type: z.enum(['rating', 'text', 'single_choice', 'multiple_choice']),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
});
function validateOptions(value, ctx) {
  if (['single_choice', 'multiple_choice'].includes(value.type)
    && (!value.options || value.options.length < 2 || new Set(value.options).size !== value.options.length)) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'Informe de duas a dez opções distintas.' });
  }
}
const questionInput = questionFields.extend({ serviceId: z.string().uuid() }).superRefine(validateOptions);
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
      'SELECT v.sector_id AS sectorId FROM services v JOIN sectors s ON s.id=v.sector_id WHERE v.id=? AND v.is_active=1 AND s.is_active=1 FOR SHARE',
      [input.serviceId],
    );
    if (!service) throw new AppError('Serviço indisponível.', 422);
    if (isSector(req.user) || !permitted(req.user, 'questions.create')) {
      const [[membership]] = await conn.execute('SELECT 1 AS allowed FROM user_sectors WHERE user_id=? AND sector_id=?', [req.user.sub, service.sectorId]);
      if (!membership) throw new AppError('O serviço não pertence a um setor atribuído ao usuário.', 403);
    }
    await conn.execute('INSERT INTO questions (id, created_by, type, status, is_required) VALUES (?,?,?,?,?)',
      [id, req.user.sub, input.type, status, Number(input.required)]);
    await storeVersion(conn, { id, version: 1, input, author: req.user.sub });
    await conn.execute('INSERT INTO question_assignments (id, question_id, sector_id, service_id, display_order) VALUES (UUID(),?,?,?,100)',
      [id, service.sectorId, input.serviceId]);
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
    'SELECT ' + questionColumns + ', q.created_by AS createdBy, v.id AS versionId ' + questionJoin + 'WHERE q.id=?',
    [id],
  );
  if (!row || (!canManage(req.user) && row.createdBy !== req.user.sub)) throw new AppError('Pergunta não encontrada.', 404);
  const { createdBy, versionId, ...question } = row;
  const [options] = await pool.execute('SELECT label FROM question_options WHERE question_version_id=? ORDER BY display_order,id', [versionId]);
  ok(res, {
    ...question,
    canEdit: Boolean(canEditAll(req.user) || sectorMayEdit(row, req.user)),
    options: options.map(option => option.label),
  });
}

export async function update(req, res) {
  const id = z.string().uuid().parse(req.params.id);
  const input = questionEdit.parse(req.body);
  const result = await withTransaction(async conn => {
    const [[current]] = await conn.execute(
      'SELECT status,created_by AS createdBy,current_version AS version FROM questions WHERE id=? FOR UPDATE', [id],
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
    await storeVersion(conn, { id, version, input, author: req.user.sub, reason: input.changeReason });
    await conn.execute('UPDATE questions SET current_version=?,type=?,is_required=?,status=? WHERE id=?',
      [version, input.type, Number(input.required), status, id]);
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
