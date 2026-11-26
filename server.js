import http from 'node:http';
import { Server } from 'socket.io';
import app from './app.js';
import { env } from './config/env.js';
import { notificationRoom, setSocketServer } from './services/SocketService.js';
import { verifyAccessToken } from './middlewares/authMiddleware.js';
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: env.corsOrigins },
  allowRequest: (req, allow) => allow(null, !req.headers.origin || env.corsOrigins.includes(req.headers.origin)),
});
function authorizeSocket(permission) {
  return (socket, next) => {
    try {
      const user = verifyAccessToken(socket.handshake.auth?.token);
      if (!user.sub || !Number.isFinite(user.exp)) return next(new Error('Sessão inválida.'));
      if (permission && !user.permissions?.includes(permission)) return next(new Error('Acesso não autorizado.'));
      socket.data.user = user;
      return next();
    } catch {
      return next(new Error('Sessão inválida ou expirada.'));
    }
  };
}
function joined(socket, room) {
  socket.join(room);
  const expiry = setTimeout(() => socket.disconnect(false), Math.max(0, socket.data.user.exp * 1000 - Date.now()));
  socket.once('disconnect', () => clearTimeout(expiry));
}
io.use(authorizeSocket('dashboard.read'));
setSocketServer(io);
io.on('connection', (socket) => joined(socket, 'dashboards'));
const notifications = io.of('/notifications');
notifications.use(authorizeSocket());
notifications.on('connection', (socket) => joined(socket, notificationRoom(socket.data.user.sub)));
server.listen(env.port, '0.0.0.0', () => console.log(`API FHDOD na porta ${env.port}`));
