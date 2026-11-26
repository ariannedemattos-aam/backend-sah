import { verifyAccessToken } from '../services/AuthService.js';
import { AppError } from '../utils/errors.js';

export { verifyAccessToken };
export const authenticate = async (req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    const token = req.get('Authorization')?.match(/^Bearer ([A-Za-z0-9._-]+)$/i)?.[1];
    if (!token || token.length > 8192) throw new AppError('Token de acesso inválido ou ausente.', 401);
    req.user = await verifyAccessToken(token);
    next();
  } catch (error) { next(error); }
};
export const requirePermission = (...permissions) => (req, _res, next) => {
  if (!permissions.some(permission => req.user?.permissions.includes(permission))) return next(new AppError('Acesso não autorizado.', 403));
  next();
};
export const surveyAccess = (req, _res, next) => {
  const token = req.get('X-Survey-Token');
  if (!token || !/^[A-Fa-f0-9]{64}$/.test(token)) return next(new AppError('Token da pesquisa inválido ou ausente.', 401));
  req.surveyToken = token;
  next();
};
