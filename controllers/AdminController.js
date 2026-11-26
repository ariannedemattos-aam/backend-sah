import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import pool from '../config/database.js';
import { ok, paginated } from '../utils/response.js';
import { AppError } from '../utils/errors.js';

const resourceColumns = {
  sectors: 'id,name,slug,description,is_active,created_at,updated_at',
  services: 'id,sector_id,name,slug,description,is_active,created_at,updated_at',
  stages: 'id,name,description,is_active,created_at',
  teams: 'id,sector_id,service_id,name,description,is_active,created_at',
  shifts: 'id,name,display_order,description,is_active,created_at',
  users: 'id,role_id,name,email,is_active,created_at,updated_at',
  roles: 'id,name,created_at',
  permissions: 'id,name,description,created_at',
};
const catalogFields = {
  sectors: ['slug'], services: ['slug', 'sector_id'], stages: [],
  teams: ['sector_id', 'service_id'], shifts: ['display_order'],
};
const pagination = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const common = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(2000).nullish() });
const slug = z.string().trim().min(1).max(140).nullish();
const idField = z.string().uuid().nullish();
const catalog = {
  sectors: common.extend({ slug }),
  services: common.extend({ slug, sector_id: idField }),
  stages: common,
  teams: common.extend({ sector_id: idField, service_id: idField }),
  shifts: common.extend({ name: z.string().trim().min(1).max(50), display_order: z.number().int().min(0).max(2147483647).default(0) }),
};

export async function list(req, res, resource) {
  const { page, limit } = pagination.parse(req.query);
  const offset = (page - 1) * limit;
  const [[[count]], [data]] = await Promise.all([
    pool.execute('SELECT COUNT(*) total FROM ' + resource),
    pool.execute('SELECT ' + resourceColumns[resource] + ' FROM ' + resource + ' ORDER BY id LIMIT ? OFFSET ?', [limit, offset]),
  ]);
  paginated(res, data, { page, limit, total: count.total, totalPages: Math.ceil(count.total / limit) });
}

export async function create(req, res, resource) {
  if (!Object.hasOwn(catalog, resource)) throw new AppError('Recurso não disponível para criação genérica.', 400);
  const entry = catalog[resource].parse(req.body);
  const id = randomUUID();
  if (resource === 'teams' && entry.service_id && entry.sector_id) {
    const [[service]] = await pool.execute('SELECT sector_id FROM services WHERE id=?', [entry.service_id]);
    if (service?.sector_id !== entry.sector_id) throw new AppError('O serviço deve pertencer ao setor informado.', 422);
  }
  const fields = ['id', 'name', 'description', ...catalogFields[resource]];
  try {
    await pool.execute(
      'INSERT INTO ' + resource + ' (' + fields.join(',') + ') VALUES (' + fields.map(() => '?').join(',') + ')',
      [id, ...fields.slice(1).map(field => entry[field] ?? null)],
    );
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new AppError('Já existe um registro com esse identificador de catálogo.', 409);
    if (error.code === 'ER_NO_REFERENCED_ROW_2') throw new AppError('Setor ou serviço informado não encontrado.', 422);
    throw error;
  }
  ok(res, { id }, 'Registro criado.', 201);
}

export async function overview(_req, res) {
  const [[[surveys]], [[rating]]] = await Promise.all([
    pool.query("SELECT COUNT(*) total, SUM(status='completed') completed FROM surveys"),
    pool.query('SELECT COUNT(*) total, ROUND(AVG(rating_value),2) average, COUNT(CASE WHEN rating_value >= 4 THEN 1 END) positive, COUNT(rating_value) rated FROM answers'),
  ]);
  ok(res, { surveys, answers: rating.total, averageRating: rating.average, positiveAnswers: rating.positive, ratedAnswers: rating.rated });
}

const dimensionsByKey = { sectors: 's', services: 'sv', teams: 't', stages: 'st', shifts: 'sh' };
export async function dimensions(_req, res, dimension) {
  const field = dimensionsByKey[dimension];
  const sql = [
    'SELECT ' + field + '.name label, COUNT(a.id) responses, ROUND(AVG(a.rating_value),2) averageRating',
    'FROM answers a JOIN survey_questions sq ON sq.id=a.survey_question_id',
    'JOIN survey_attendances sa ON sa.id=sq.attendance_id',
    'LEFT JOIN sectors s ON s.id=sa.sector_id LEFT JOIN services sv ON sv.id=sa.service_id',
    'LEFT JOIN shifts sh ON sh.id=sa.shift_id LEFT JOIN questions q ON q.id=sq.question_id',
    'LEFT JOIN teams t ON t.id=q.team_id LEFT JOIN stages st ON st.id=q.stage_id',
    'WHERE ' + field + '.id IS NOT NULL',
    'GROUP BY ' + field + '.id,' + field + '.name ORDER BY responses DESC, label',
  ].join(' ');
  const [data] = await pool.query(sql);
  ok(res, data);
}
