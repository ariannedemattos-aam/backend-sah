import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import pool from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { ok } from '../utils/response.js';
import { withTransaction } from '../utils/withTransaction.js';
import { disconnectSession } from '../services/SocketService.js';
import { profilePermissions } from '../services/Profiles.js';

const id = z.string().uuid();
const access = z.object({ role: z.enum(Object.keys(profilePermissions)), sectorIds: z.array(id).max(100) }).superRefine((value, ctx) => {
  if (new Set(value.sectorIds).size !== value.sectorIds.length || (value.role === 'userSetor') !== Boolean(value.sectorIds.length)) {
    ctx.addIssue({ code: 'custom', path: ['sectorIds'], message: 'Atribua setores distintos somente ao Admin de Setor.' });
  }
});
const account = access.safeExtend({
  name: z.string().trim().min(2).max(150), email: z.email().max(255).transform(v => v.toLowerCase()),
  password: z.string().min(12).refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'A senha deve ter até 72 bytes.'),
});

async function validateScope(connection, input) {
  if (!input.sectorIds.length) return;
  const [rows] = await connection.execute(
    'SELECT id FROM sectors WHERE is_active=1 AND id IN (' + input.sectorIds.map(() => '?').join(',') + ') FOR SHARE', input.sectorIds,
  );
  if (rows.length !== input.sectorIds.length) throw new AppError('Selecione setores ativos.', 422);
}

async function saveMemberships(connection, userId, sectorIds) {
  await connection.execute('DELETE FROM user_sectors WHERE user_id=?', [userId]);
  for (const sectorId of sectorIds) {
    await connection.execute('INSERT INTO user_sectors (user_id,sector_id) VALUES (?,?)', [userId, sectorId]);
  }
}

export async function get(req, res) {
  const userId = id.parse(req.params.id);
  const [[user]] = await pool.execute('SELECT u.id,r.name role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND u.deleted_at IS NULL', [userId]);
  if (!user) throw new AppError('Usuário não encontrado.', 404);
  const [sectors] = await pool.execute('SELECT sector_id id FROM user_sectors WHERE user_id=? ORDER BY sector_id', [userId]);
  ok(res, { ...user, sectorIds: sectors.map(s => s.id) });
}

export async function create(req, res) {
  const input = account.parse(req.body);
  const userId = randomUUID();
  const passwordHash = await bcrypt.hash(input.password, 12);
  await withTransaction(async connection => {
    await validateScope(connection, input);
    await connection.execute('INSERT INTO users (id,role_id,name,email,password_hash) SELECT ?,id,?,?,? FROM roles WHERE name=?',
      [userId, input.name, input.email, passwordHash, input.role])
      .catch(error => { if (error.code === 'ER_DUP_ENTRY') throw new AppError('Já existe conta para este e-mail.', 409); throw error; });
    for (const sectorId of input.sectorIds) {
      await connection.execute('INSERT INTO user_sectors (user_id,sector_id) VALUES (?,?)', [userId, sectorId]);
    }
    await audit(connection, req.user.sub, userId, input);
  });
  ok(res, { id: userId, role: input.role, sectorIds: input.sectorIds }, 'Conta criada.', 201);
}

async function audit(connection, actor, userId, input) {
  await connection.execute("INSERT INTO audit_logs (id,user_id,action,entity,entity_id,metadata) VALUES (UUID(),?,'user.access_assigned','user',?,?)",
    [actor, userId, JSON.stringify({ role: input.role, sectorIds: input.sectorIds })]);
}

export async function update(req, res) {
  const userId = id.parse(req.params.id);
  const input = access.parse(req.body);
  const revoked = await withTransaction(async connection => {
    const [[user]] = await connection.execute('SELECT r.name role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND u.deleted_at IS NULL FOR UPDATE', [userId]);
    if (!user) throw new AppError('Usuário não encontrado.', 404);
    if (user.role === 'userAdmin') throw new AppError('Contas Super Admin estão protegidas contra alterações de perfil nesta tela.', 403);
    await validateScope(connection, input);
    await connection.execute('UPDATE users u JOIN roles r ON r.name=? SET u.role_id=r.id WHERE u.id=?', [input.role, userId]);
    await saveMemberships(connection, userId, input.sectorIds);
    const [active] = await connection.execute('SELECT id FROM auth_sessions WHERE user_id=? AND revoked_at IS NULL FOR UPDATE', [userId]);
    await connection.execute('UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=? AND revoked_at IS NULL', [userId]);
    await audit(connection, req.user.sub, userId, input);
    return active;
  });
  for (const session of revoked) disconnectSession(session.id);
  ok(res, { id: userId, ...input }, 'Acesso atualizado. O usuário deverá entrar novamente.');
}
