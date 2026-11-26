import http from 'node:http';
import { Server } from 'socket.io';
import app from './app.js';
import { env } from './config/env.js';
import { setSocketServer } from './services/SocketService.js';
import { verifyAccessToken } from './middlewares/authMiddleware.js';
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: env.corsOrigins },
  allowRequest: (req, allow) => allow(null, !req.headers.origin || env.corsOrigins.includes(req.headers.origin)),
});
io.use((socket, next) => {
  try {
    const user = verifyAccessToken(socket.handshake.auth?.token);
    if (!user.permissions?.includes('dashboard.read')) return next(new Error('Acesso ao dashboard não autorizado.'));
    socket.data.expiresAt = user.exp * 1000;
    return next();
  } catch {
    return next(new Error('Sessão inválida ou expirada.'));
  }
});
setSocketServer(io);
io.on('connection', (socket) => {
  socket.join('dashboards');
  const expiry = setTimeout(() => socket.disconnect(true), Math.max(0, socket.data.expiresAt - Date.now()));
  socket.once('disconnect', () => clearTimeout(expiry));
});
server.listen(env.port, '0.0.0.0', () => console.log(`API FHDOD na porta ${env.port}`));
