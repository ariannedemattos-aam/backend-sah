import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import pool from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { ok } from '../utils/response.js';

const questionInput = z.object({
  prompt: z.string().trim().min(10).max(500),
  type: z.enum(['rating', 'text', 'single_choice', 'multiple_choice']),
  serviceId: z.string().uuid(),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
}).superRefine((value, ctx) => {
  if (['single_choice', 'multiple_choice'].includes(value.type)
    && (!value.options || value.options.length < 2 || new Set(value.options).size !== value.options.length)) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'Informe de duas a dez opções distintas.' });
  }
});
const reviewInput = z.object({ justification: z.string().trim().min(3).max(500) });
const ratingOptions = ['Muito insatisfeito', 'Insatisfeito', 'Neutro', 'Satisfeito', 'Muito satisfeito'];

const permitted = (user, permission) => user.permissions?.includes(permission);
async function transaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function catalog(req, res) {
  const canManage = permitted(req.user, 'questions.create');
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
  const canManage = permitted(req.user, 'questions.approve') || permitted(req.user, 'questions.reject') || permitted(req.user, 'questions.create');
  const [data] = await pool.execute(
    'SELECT q.id,q.type,q.status,q.is_required AS required,q.created_at AS createdAt, v.prompt, '
      + "(SELECT GROUP_CONCAT(DISTINCT sv.name ORDER BY sv.name SEPARATOR ', ') FROM question_assignments a JOIN services sv ON sv.id=a.service_id WHERE a.question_id=q.id) AS services "
      + 'FROM questions q JOIN question_versions v ON v.question_id=q.id AND v.version=q.current_version '
      + (canManage ? '' : 'WHERE q.created_by=? ')
      + 'ORDER BY q.created_at DESC, q.id LIMIT 100',
    canManage ? [] : [req.user.sub],
  );
  ok(res, data);
}

export async function propose(req, res) {
  const input = questionInput.parse(req.body);
  const id = randomUUID();
  const versionId = randomUUID();
  const status = 'pending';
  await transaction(async conn => {
    const [[service]] = await conn.execute(
      'SELECT v.sector_id AS sectorId FROM services v JOIN sectors s ON s.id=v.sector_id WHERE v.id=? AND v.is_active=1 AND s.is_active=1',
      [input.serviceId],
    );
    if (!service) throw new AppError('Serviço indisponível.', 422);
    if (!permitted(req.user, 'questions.create')) {
      const [[membership]] = await conn.execute('SELECT 1 AS allowed FROM user_sectors WHERE user_id=? AND sector_id=?', [req.user.sub, service.sectorId]);
      if (!membership) throw new AppError('O serviço não pertence a um setor atribuído ao usuário.', 403);
    }
    await conn.execute('INSERT INTO questions (id, created_by, type, status, is_required) VALUES (?,?,?,?,?)',
      [id, req.user.sub, input.type, status, Number(input.required)]);
    await conn.execute('INSERT INTO question_versions (id, question_id, version, prompt, created_by) VALUES (?,?,1,?,?)',
      [versionId, id, input.prompt, req.user.sub]);
    const options = input.type === 'rating' ? ratingOptions : input.type === 'text' ? [] : input.options;
    for (const [index, label] of options.entries()) {
      await conn.execute('INSERT INTO question_options (id,question_version_id,label,value,display_order) VALUES (UUID(),?,?,?,?)',
        [versionId, label, String(index + 1), index + 1]);
    }
    await conn.execute('INSERT INTO question_assignments (id, question_id, sector_id, service_id, display_order) VALUES (UUID(),?,?,?,100)',
      [id, service.sectorId, input.serviceId]);
  });
  ok(res, { id, status }, 'Pergunta enviada para aprovação.', 201);
}

export function review(action) {
  return async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { justification } = reviewInput.parse(req.body);
    const status = action === 'approved' ? 'active' : 'rejected';
    await transaction(async conn => {
      const [[question]] = await conn.execute('SELECT status FROM questions WHERE id=? FOR UPDATE', [id]);
      if (!question) throw new AppError('Pergunta não encontrada.', 404);
      if (question.status !== 'pending') throw new AppError('A pergunta já foi analisada.', 409);
      await conn.execute('UPDATE questions SET status=? WHERE id=?', [status, id]);
      await conn.execute('INSERT INTO question_approvals (id, question_id, reviewer_id, action, justification) VALUES (UUID(),?,?,?,?)',
        [id, req.user.sub, action, justification]);
    });
    ok(res, { id, status }, action === 'approved' ? 'Pergunta aprovada e ativada.' : 'Pergunta rejeitada.');
  };
}
