import { createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { withTransaction } from '../utils/withTransaction.js';
import { disconnectSession } from './SocketService.js';

const issuer = 'fhdod-api';
const accessAudience = 'fhdod-access';
const refreshAudience = 'fhdod-refresh';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const denied = () => new AppError('Sessão inválida ou expirada.', 401);
const dummyPassword = await bcrypt.hash('credencial-interna-de-teste-de-tempo', 12);
const permissionsSql = '(SELECT JSON_ARRAYAGG(p.name) FROM permissions p WHERE '
  + 'EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id=u.role_id AND rp.permission_id=p.id) '
  + 'OR EXISTS (SELECT 1 FROM user_permissions up WHERE up.user_id=u.id AND up.permission_id=p.id)) AS permissions';
const identitySql = 'u.id,u.name,u.email,r.name role,u.is_active,' + permissionsSql;
const formatUser = ({ id, name, email, role, is_active }) => ({ id, name, email, role, is_active });
const permissionsOf = user => Array.isArray(user.permissions) ? user.permissions : [];
const jwtOptions = (audience) => ({ algorithm: 'HS256', issuer, audience });

function verifyToken(token, secret, audience, type) {
  try {
    const claims = jwt.verify(token, secret, { algorithms: ['HS256'], issuer, audience });
    if (claims.typ !== type || !claims.sub || !claims.sid || !Number.isFinite(claims.exp)) throw denied();
    return claims;
  } catch {
    throw denied();
  }
}

function signRefresh(userId, sid, expiresAt) {
  return jwt.sign({ sub: userId, sid, typ: 'refresh', ...(expiresAt && { exp: Math.floor(expiresAt.getTime() / 1000) }) },
    env.refreshSecret, { ...jwtOptions(refreshAudience), jwtid: randomUUID(), ...(!expiresAt && { expiresIn: env.refreshExpiresIn }) });
}

function packageSession(user, sid, refreshToken, expiresAt) {
  const accessToken = jwt.sign({ sub: user.id, sid, typ: 'access', role: user.role, permissions: permissionsOf(user) },
    env.jwtSecret, { ...jwtOptions(accessAudience), expiresIn: env.jwtExpiresIn });
  return { user: formatUser(user), accessToken, refreshToken, expiresAt };
}

export async function login(email, password) {
  const [[user]] = await pool.execute(
    'SELECT ' + identitySql + ',u.password_hash FROM users u JOIN roles r ON r.id=u.role_id WHERE u.email=? AND u.deleted_at IS NULL',
    [email],
  );
  const matched = await bcrypt.compare(password, user?.password_hash ?? dummyPassword);
  if (!user || !matched) throw new AppError('E-mail ou senha inválidos.', 401);
  if (!user.is_active) throw new AppError('Usuário inativo.', 403);
  const sid = randomUUID();
  const refreshToken = signRefresh(user.id, sid);
  const expiresAt = new Date(jwt.decode(refreshToken).exp * 1000);
  await pool.execute('INSERT INTO auth_sessions(id,user_id,refresh_hash,expires_at) VALUES (?,?,?,?)',
    [sid, user.id, hash(refreshToken), expiresAt]);
  return packageSession(user, sid, refreshToken, expiresAt);
}

export async function refresh(token) {
  const { sub, sid } = verifyToken(token, env.refreshSecret, refreshAudience, 'refresh');
  const presented = hash(token);
  const result = await withTransaction(async connection => {
    const [[session]] = await connection.execute(
      'SELECT refresh_hash,previous_refresh_hash,expires_at, '
        + 'TIMESTAMPDIFF(MICROSECOND,rotated_at,UTC_TIMESTAMP(3)) rotationAge FROM auth_sessions '
        + 'WHERE id=? AND user_id=? AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP() FOR UPDATE',
      [sid, sub],
    );
    if (!session) throw denied();
    if (presented !== session.refresh_hash) {
      if (presented === session.previous_refresh_hash && session.rotationAge < 4_000_000) {
        throw new AppError('A sessão foi renovada em outra aba. Tente novamente.', 409);
      }
      await connection.execute('UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE id=?', [sid]);
      return null;
    }

    const [[user]] = await connection.execute(
      'SELECT ' + identitySql + ' FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND u.is_active=1 AND u.deleted_at IS NULL',
      [sub],
    );
    if (!user) throw denied();
    const refreshToken = signRefresh(sub, sid, session.expires_at);
    await connection.execute(
      'UPDATE auth_sessions SET previous_refresh_hash=?,refresh_hash=?,rotated_at=UTC_TIMESTAMP(3) WHERE id=?',
      [presented, hash(refreshToken), sid],
    );
    return packageSession(user, sid, refreshToken, session.expires_at);
  });
  if (!result) {
    disconnectSession(sid);
    throw denied();
  }
  return result;
}

export async function logout(token) {
  let claims;
  try { claims = verifyToken(token, env.refreshSecret, refreshAudience, 'refresh'); } catch { return; }
  await pool.execute('UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE id=? AND user_id=? AND revoked_at IS NULL', [claims.sid, claims.sub]);
  disconnectSession(claims.sid);
}

export async function verifyAccessToken(token) {
  const claims = verifyToken(token, env.jwtSecret, accessAudience, 'access');
  const [[user]] = await pool.execute(
    'SELECT ' + identitySql + ' FROM auth_sessions a JOIN users u ON u.id=a.user_id JOIN roles r ON r.id=u.role_id '
      + 'WHERE a.id=? AND a.user_id=? AND a.revoked_at IS NULL AND a.expires_at>UTC_TIMESTAMP() AND u.is_active=1 AND u.deleted_at IS NULL',
    [claims.sid, claims.sub],
  );
  if (!user) throw denied();
  return { sub: user.id, sid: claims.sid, exp: claims.exp, user: formatUser(user), role: user.role, permissions: permissionsOf(user) };
}
