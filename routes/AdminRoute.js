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
export default router;
