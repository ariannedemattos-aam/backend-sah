import { Router } from 'express';
import * as admin from '../controllers/AdminController.js';
import * as evaluation from '../controllers/EvaluationController.js';
import { exportReport } from '../controllers/ReportController.js';
import * as invitation from '../controllers/InvitationController.js';
import { authenticate, requirePermission } from '../middlewares/authMiddleware.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { isSector } from '../services/EvaluationData.js';

const router = Router();
router.use(authenticate);
const dashboard = requirePermission('dashboard.read');
const manage = requirePermission('users.manage');
const surveys = requirePermission('surveys.read');
const returns = requirePermission('return_requests.manage');
const reports = requirePermission('reports.export');
const invitations = requirePermission('invitations.manage');
const feedbackAccess = (req, res, next) => isSector(req.user) ? next() : surveys(req, res, next);
const analysisAccess = (req, res, next) => isSector(req.user)
  ? next() : requirePermission('surveys.read', 'reports.export')(req, res, next);
const noStore = (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); };

router.get('/analysis/options', analysisAccess, asyncRoute(evaluation.options));
router.get('/evaluations', surveys, noStore, asyncRoute(evaluation.list));
router.get('/evaluations/:id', surveys, noStore, asyncRoute(evaluation.detail));
router.get('/feedback', feedbackAccess, noStore, asyncRoute(evaluation.feedback));
router.get('/return-requests', returns, noStore, asyncRoute(evaluation.returns));
router.get('/return-requests/:id/contact', returns, noStore, asyncRoute(evaluation.revealContact));
router.patch('/return-requests/:id/status', returns, noStore, asyncRoute(evaluation.updateReturnStatus));
router.get('/reports/excel', reports, noStore, asyncRoute(exportReport('excel')));
router.get('/reports/pdf', reports, noStore, asyncRoute(exportReport('pdf')));
router.get('/invitations', invitations, noStore, asyncRoute(invitation.list));
router.post('/invitations', invitations, noStore, asyncRoute(invitation.create));
router.post('/invitations/:id/communications', invitations, noStore, asyncRoute(invitation.communicate));
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
