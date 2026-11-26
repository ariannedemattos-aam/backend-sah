import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
export const verifyAccessToken = (token) => jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
export const authenticate = (req, _res, next) => { const token = req.headers.authorization?.replace(/^Bearer\s+/i, ''); if (!token) throw new AppError('Token de acesso obrigatório.', 401); try { req.user = verifyAccessToken(token); next(); } catch { next(new AppError('Token inválido ou expirado.', 401)); } };
export const requirePermission = (...permissions) => (req, _res, next) => { const granted = req.user?.permissions || []; if (!permissions.some((p) => granted.includes(p))) return next(new AppError('Acesso não autorizado.', 403)); next(); };
export const surveyAccess = (req, _res, next) => { const token = req.headers['x-survey-token']; if (!token) return next(new AppError('Token da pesquisa obrigatório.', 401)); req.surveyToken = token; next(); };
