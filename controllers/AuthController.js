import * as auth from '../services/AuthService.js';
import pool from '../config/database.js';
import { ok } from '../utils/response.js';
export const login = async (req, res) => ok(res, await auth.login(req.body.email, req.body.password), 'Login realizado.');
export const refresh = async (req, res) => ok(res, await auth.refresh(req.body.refreshToken), 'Sessão renovada.');
export const logout = async (req, res) => { await auth.logout(req.body.refreshToken); res.status(204).end(); };
export const me = async (req, res) => { const [rows] = await pool.execute('SELECT id,name,email FROM users WHERE id=?', [req.user.sub]); ok(res, { ...rows[0], role: req.user.role, permissions: req.user.permissions }); };
