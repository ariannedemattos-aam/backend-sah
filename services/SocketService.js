let io;
export const setSocketServer = (server) => { io = server; };
export const emitDashboardUpdate = (data) => io?.to('dashboards').emit('dashboard:update', data);
export const notificationRoom = (userId) => 'recipient:' + userId;
export const sessionRoom = (sid) => 'session:' + sid;
export const disconnectSession = (sid) => {
  io?.in(sessionRoom(sid)).disconnectSockets();
  io?.of('/notifications').in(sessionRoom(sid)).disconnectSockets();
};
export const emitNotificationUpdates = (userIds) => {
  for (const userId of userIds) io?.of('/notifications').to(notificationRoom(userId)).emit('notifications:update');
};
