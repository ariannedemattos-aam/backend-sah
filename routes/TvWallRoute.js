import { Router } from 'express'; import * as c from '../controllers/TvWallController.js'; const r=Router();r.get('/overview',c.overview);r.get('/sectors',c.sectors);export default r;
