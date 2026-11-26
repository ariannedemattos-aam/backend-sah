import { Router } from 'express';
import { z } from 'zod';
import pool from '../config/database.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { AppError } from '../utils/errors.js';
import { ok } from '../utils/response.js';
import { emitNotificationUpdates } from '../services/SocketService.js';

const router = Router();
const filters = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unread: z.enum(['true', 'false']).default('false'),
});
router.use(authenticate, (_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
});
router.get('/', asyncRoute(async (req, res) => {
  const { limit, unread } = filters.parse(req.query);
  const user = req.user.sub;
  const [[[count]], [items]] = await Promise.all([
    pool.execute('SELECT COUNT(*) unread FROM user_notifications WHERE user_id=? AND read_at IS NULL', [user]),
    pool.execute('SELECT id,event_type type,title,message,href,created_at createdAt,read_at readAt FROM user_notifications WHERE user_id=?'
      + (unread === 'true' ? ' AND read_at IS NULL' : '')
      + ' ORDER BY created_at DESC,id LIMIT ?', [user, limit]),
  ]);
  ok(res, { unread: count.unread, items });
}));
router.patch('/read-all', asyncRoute(async (req, res) => {
  const [result] = await pool.execute('UPDATE user_notifications SET read_at=UTC_TIMESTAMP() WHERE user_id=? AND read_at IS NULL', [req.user.sub]);
  if (result.affectedRows) emitNotificationUpdates([req.user.sub]);
  ok(res, { updated: result.affectedRows }, 'Notificações marcadas como lidas.');
}));
router.patch('/:id/read', asyncRoute(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const [[item]] = await pool.execute('SELECT id FROM user_notifications WHERE id=? AND user_id=?', [id, req.user.sub]);
  if (!item) throw new AppError('Notificação não encontrada.', 404);
  const [result] = await pool.execute('UPDATE user_notifications SET read_at=UTC_TIMESTAMP() WHERE id=? AND user_id=? AND read_at IS NULL', [id, req.user.sub]);
  if (result.affectedRows) emitNotificationUpdates([req.user.sub]);
  ok(res, { id }, 'Notificação marcada como lida.');
}));
export default router;
