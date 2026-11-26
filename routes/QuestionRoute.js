import { Router } from 'express';
import { authenticate, requirePermission } from '../middlewares/authMiddleware.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import * as questions from '../controllers/QuestionController.js';

const router = Router();
router.use(authenticate);
router.get('/', requirePermission('questions.read'), asyncRoute(questions.list));
router.get('/services', requirePermission('questions.propose', 'questions.create'), asyncRoute(questions.catalog));
router.post('/', requirePermission('questions.propose', 'questions.create'), asyncRoute(questions.propose));
router.post('/:id/approve', requirePermission('questions.approve'), asyncRoute(questions.review('approved')));
router.post('/:id/reject', requirePermission('questions.reject'), asyncRoute(questions.review('rejected')));
export default router;
