import { Router } from 'express';
import * as admin from '../controllers/AdminController.js';
import { authenticate, requirePermission } from '../middlewares/authMiddleware.js';
import { asyncRoute } from '../utils/asyncRoute.js';

const router = Router();
router.use(authenticate);
const dashboard = requirePermission('dashboard.read');
const manage = requirePermission('users.manage');
router.get('/dashboard/overview', dashboard, asyncRoute(admin.overview));

for (const dimension of ['sectors', 'services', 'teams', 'stages', 'shifts']) {
  router.get('/dashboard/' + dimension, dashboard, asyncRoute((req, res) => admin.dimensions(req, res, dimension)));
}
for (const resource of ['sectors', 'services', 'stages', 'teams', 'shifts', 'users', 'roles', 'permissions']) {
  router.get('/' + resource, manage, asyncRoute((req, res) => admin.list(req, res, resource)));
  router.post('/' + resource, manage, asyncRoute((req, res) => admin.create(req, res, resource)));
}
for (const resource of Object.keys(admin.catalogFields)) {
  const path = '/' + resource + '/:id';
  router.get(path, manage, asyncRoute((req, res) => admin.get(req, res, resource)));
  router.put(path, manage, asyncRoute((req, res) => admin.update(req, res, resource)));
  router.patch(path + '/status', manage, asyncRoute((req, res) => admin.setStatus(req, res, resource)));
}
export default router;
