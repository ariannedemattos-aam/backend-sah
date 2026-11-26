import { Router } from 'express'; import auth from './AuthRoute.js'; import publicSurvey from './SurveyRoute.js'; import admin from './AdminRoute.js'; import tvwall from './TvWallRoute.js';
const r=Router(); r.use('/auth',auth); r.use('/public',publicSurvey); r.use('/admin',admin); r.use('/tvwall',tvwall); export default r;
