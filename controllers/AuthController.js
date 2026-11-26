import * as auth from '../services/AuthService.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { ok } from '../utils/response.js';

const production = env.nodeEnv === 'production';
const cookieName = production ? '__Secure-fhdod_refresh' : 'fhdod_refresh';
const cookie = { secure: production, httpOnly: true, sameSite: 'strict', path: '/api/v1/auth/web' };

export function browserOrigin(req, res, next) {
  const origin = req.get('Origin');
  if (!origin || !env.corsOrigins.includes(origin)) return next(new AppError('Origem de sessão não autorizada.', 403));
  return next();
}

function readRefresh(req) {
  const item = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(cookieName + '='));
  return item?.slice(cookieName.length + 1);
}

function respond(res, session, message, browser = false) {
  const { expiresAt, refreshToken, ...publicData } = session;
  if (!browser) return ok(res, { ...publicData, refreshToken }, message);
  res.cookie(cookieName, refreshToken, { ...cookie, expires: expiresAt });
  return ok(res, publicData, message);
}

export const login = async (req, res) => respond(res, await auth.login(req.validated.body.email, req.validated.body.password), 'Login realizado.');
export const refresh = async (req, res) => respond(res, await auth.refresh(req.validated.body.refreshToken), 'Sessão renovada.');
export const logout = async (req, res) => { await auth.logout(req.validated.body.refreshToken); res.status(204).end(); };
export const me = (req, res) => {
  const { is_active, ...user } = req.user.user;
  ok(res, { ...user, permissions: req.user.permissions });
};

export async function webLogin(req, res) {
  const session = await auth.login(req.validated.body.email, req.validated.body.password);
  const previous = readRefresh(req);
  if (previous) await auth.logout(previous);
  respond(res, session, 'Login realizado.', true);
}
export async function webRefresh(req, res) {
  try { respond(res, await auth.refresh(readRefresh(req)), 'Sessão renovada.', true); }
  catch (error) {
    if (error.status === 401) res.clearCookie(cookieName, cookie);
    throw error;
  }
}
export async function webLogout(req, res) {
  await auth.logout(readRefresh(req));
  res.clearCookie(cookieName, cookie);
  res.status(204).end();
}
