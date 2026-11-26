import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFound } from './middlewares/errorMiddleware.js';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './swagger/swagger.js';
const app = express();
app.disable('x-powered-by');
if (process.env.RENDER === 'true') app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: env.corsOrigins }));
app.use(express.json({ limit: '100kb' }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 500, standardHeaders: true, legacyHeaders: false }));
const authLimiter = (limit) => rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: true, legacyHeaders: false });
app.use(['/api/v1/auth/login', '/api/v1/auth/web/login'], authLimiter(30));
app.use(['/api/v1/auth/refresh', '/api/v1/auth/web/refresh'], authLimiter(160));
app.use('/api/v1/public/invitations/redeem', authLimiter(80));
app.get('/health', (_req, res) => res.json({ success: true, message: 'API operacional', data: { status: 'ok' } }));
app.use('/api/v1', routes);
if (env.swaggerEnabled) {
  const swaggerOptions = { persistAuthorization: false, validatorUrl: null };
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { swaggerOptions }));
  app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));
}
app.use(notFound); app.use(errorHandler);
export default app;
