import { asyncRoute } from '../utils/asyncRoute.js';
import { Router } from 'express'; import * as c from '../controllers/TvWallController.js'; const r=Router();r.get('/overview', asyncRoute(c.overview));r.get('/sectors', asyncRoute(c.sectors));export default r;
