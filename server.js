import http from 'node:http';
import { Server } from 'socket.io';
import app from './app.js';
import { env } from './config/env.js';
import { setSocketServer } from './services/SocketService.js';
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: env.corsOrigins } });
setSocketServer(io); io.on('connection', (socket) => socket.join('dashboards'));
server.listen(env.port, '0.0.0.0', () => console.log(`API FHDOD na porta ${env.port}`));
