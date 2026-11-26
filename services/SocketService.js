let io;
export const setSocketServer = (server) => { io = server; };
export const emitDashboardUpdate = (data) => io?.to('dashboards').emit('dashboard:update', data);
export const notificationRoom = (userId) => 'recipient:' + userId;
export const emitNotificationUpdates = (userIds) => {
  for (const userId of userIds) io?.of('/notifications').to(notificationRoom(userId)).emit('notifications:update');
};
