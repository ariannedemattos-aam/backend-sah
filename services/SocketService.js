let io; export const setSocketServer = (server) => { io = server; }; export const emitDashboardUpdate = (data) => io?.to('dashboards').emit('dashboard:update', data);
