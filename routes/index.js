import { Router } from 'express'; import auth from './AuthRoute.js'; import publicSurvey from './SurveyRoute.js'; import admin from './AdminRoute.js'; import tvwall from './TvWallRoute.js';
import questions from './QuestionRoute.js';
const r=Router(); r.use('/auth',auth); r.use('/public',publicSurvey); r.use('/admin',admin); r.use('/tvwall',tvwall); r.use('/questions',questions); export default r;
