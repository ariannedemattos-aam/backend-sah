import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import pool from '../config/database.js';
import { ok, paginated } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import { withTransaction } from '../utils/withTransaction.js';
import { dimension, filtersSchema, selections, summary } from '../services/EvaluationData.js';

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
export const catalogFields = {
  sectors: ['slug'], services: ['slug', 'sector_id'], stages: [],
  teams: ['sector_id', 'service_id'], shifts: ['display_order'],
};
const pagination = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).default(''),
  status: z.enum(['active', 'inactive']).optional(),
});
const common = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(2000).nullish() });
const slug = z.string().trim().min(1).max(140).nullish();
const idField = z.string().uuid().nullish();
const statusInput = z.object({ active: z.boolean() });
const catalog = {
  sectors: common.extend({ slug }),
  services: common.extend({ slug, sector_id: idField }),
  stages: common,
  teams: common.extend({ sector_id: idField, service_id: idField }),
  shifts: common.extend({ name: z.string().trim().min(1).max(50), display_order: z.number().int().min(0).max(2147483647).default(0) }),
};

export async function list(req, res, resource) {
  const { page, limit, search, status } = pagination.parse(req.query);
  const offset = (page - 1) * limit;
  const clauses = [], values = [];
  if (search) {
    clauses.push('LOCATE(?, name)>0');
    values.push(search);
  }
  if (status) {
    if (!Object.hasOwn(catalog, resource) && resource !== 'users') {
      throw new AppError('Este catálogo não possui status.', 422);
    }
    clauses.push('is_active=?');
    values.push(Number(status === 'active'));
  }
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  const [[[count]], [data]] = await Promise.all([
    pool.execute('SELECT COUNT(*) total FROM ' + resource + where, values),
    pool.execute('SELECT ' + resourceColumns[resource] + ' FROM ' + resource + where + ' ORDER BY name,id LIMIT ? OFFSET ?', [...values, limit, offset]),
  ]);
  paginated(res, data, { page, limit, total: count.total, totalPages: Math.ceil(count.total / limit) });
}

async function requireCatalogEntry(connection, resource, id, lock = false) {
  const [[entry]] = await connection.execute(
    'SELECT ' + resourceColumns[resource] + ' FROM ' + resource + ' WHERE id=?' + (lock ? ' FOR UPDATE' : ''),
    [id],
  );
  if (!entry) throw new AppError('Registro não encontrado.', 404);
  return entry;
}

async function validateLinks(connection, resource, entry, previous) {
  if (resource === 'teams' && entry.service_id && entry.sector_id) {
    const [[service]] = await connection.execute('SELECT sector_id FROM services WHERE id=? FOR UPDATE', [entry.service_id]);
    if (service?.sector_id !== entry.sector_id) throw new AppError('O serviço deve pertencer ao setor informado.', 422);
  }
  if (resource === 'teams' && previous && previous.sector_id !== (entry.sector_id ?? null)) {
    const [[link]] = await connection.execute('SELECT 1 FROM roster_shifts WHERE team_id=? LIMIT 1', [previous.id]);
    if (link) throw new AppError('Uma equipe vinculada a escalas deve permanecer no setor original.', 409);
  }
  if (resource === 'services' && previous && previous.sector_id !== (entry.sector_id ?? null)) {
    const [[dependencies]] = await connection.execute(
      'SELECT EXISTS(SELECT 1 FROM survey_attendances WHERE service_id=?) AS attendance, '
        + 'EXISTS(SELECT 1 FROM question_assignments WHERE service_id=?) AS question, '
        + 'EXISTS(SELECT 1 FROM teams WHERE service_id=?) AS team',
      [previous.id, previous.id, previous.id],
    );
    if (dependencies.attendance || dependencies.question || dependencies.team) {
      throw new AppError('O setor de um serviço vinculado a atendimentos, perguntas ou equipes não pode ser alterado.', 409);
    }
  }
}

function catalogError(error) {
  if (error.code === 'ER_DUP_ENTRY') return new AppError('Já existe um registro com esse identificador de catálogo.', 409);
  if (error.code === 'ER_NO_REFERENCED_ROW_2') return new AppError('Setor ou serviço informado não encontrado.', 422);
  return error;
}

export async function create(req, res, resource) {
  if (!Object.hasOwn(catalog, resource)) throw new AppError('Recurso não disponível para criação genérica.', 400);
  const entry = catalog[resource].parse(req.body);
  const id = randomUUID();
  const fields = ['id', 'name', 'description', ...catalogFields[resource]];
  try {
    await withTransaction(async connection => {
      await validateLinks(connection, resource, entry);
      await connection.execute(
        'INSERT INTO ' + resource + ' (' + fields.join(',') + ') VALUES (' + fields.map(() => '?').join(',') + ')',
        [id, ...fields.slice(1).map(field => entry[field] ?? null)],
      );
    });
  } catch (error) {
    throw catalogError(error);
  }
  ok(res, { id }, 'Registro criado.', 201);
}

export async function get(req, res, resource) {
  const id = z.string().uuid().parse(req.params.id);
  ok(res, await requireCatalogEntry(pool, resource, id));
}

export async function update(req, res, resource) {
  const id = z.string().uuid().parse(req.params.id);
  const entry = catalog[resource].parse(req.body);
  const fields = ['name', 'description', ...catalogFields[resource]];
  try {
    await withTransaction(async connection => {
      const previous = await requireCatalogEntry(connection, resource, id, true);
      await validateLinks(connection, resource, entry, previous);
      await connection.execute(
        'UPDATE ' + resource + ' SET ' + fields.map(field => field + '=?').join(',') + ' WHERE id=?',
        [...fields.map(field => entry[field] ?? null), id],
      );
    });
  } catch (error) {
    throw catalogError(error);
  }
  ok(res, { id }, 'Registro atualizado.');
}

export async function setStatus(req, res, resource) {
  const id = z.string().uuid().parse(req.params.id);
  const { active } = statusInput.parse(req.body);
  await withTransaction(async connection => {
    await requireCatalogEntry(connection, resource, id, true);
    await connection.execute('UPDATE ' + resource + ' SET is_active=? WHERE id=?', [Number(active), id]);
  });
  ok(res, { id, active }, active ? 'Registro reativado.' : 'Registro arquivado.');
}


export async function setServiceStages(req, res) {
  const id = z.string().uuid().parse(req.params.id);
  const { stageIds } = z.object({
    stageIds: z.array(z.string().uuid()).max(50).refine(values => new Set(values).size === values.length, 'Etapas duplicadas.'),
  }).parse(req.body);
  await withTransaction(async connection => {
    const service = await requireCatalogEntry(connection, 'services', id, true);
    if (!service.is_active) throw new AppError('Reative o serviço antes de editar suas etapas.', 409);
    if (stageIds.length) {
      const [active] = await connection.execute(
        'SELECT id FROM stages WHERE is_active=1 AND id IN (' + stageIds.map(() => '?').join(',') + ') FOR SHARE', stageIds,
      );
      if (active.length !== stageIds.length) throw new AppError('Selecione somente etapas ativas.', 422);
    }
    await connection.execute('UPDATE service_stages SET is_active=0 WHERE service_id=? AND is_active=1', [id]);
    for (const [index, stage] of stageIds.entries()) {
      const order = index + 1;
      await connection.execute('INSERT INTO service_stages (id,service_id,stage_id,display_order,is_required,is_active) '
        + 'VALUES (UUID(),?,?,?,0,1) ON DUPLICATE KEY UPDATE display_order=?,is_active=1', [id, stage, order, order]);
    }
  });
  ok(res, { stageIds }, 'Etapas da jornada atualizadas.');
}

export async function overview(req, res) {
  ok(res, await summary(pool, selections(filtersSchema.parse(req.query), req.user)));
}

export async function dimensions(req, res, key) {
  ok(res, await dimension(pool, selections(filtersSchema.parse(req.query), req.user), key));
}
