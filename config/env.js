import 'dotenv/config';
import { readFileSync } from 'node:fs';
const production = process.env.NODE_ENV === 'production';
if (production && (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET)) throw new Error('JWT secrets obrigatórios em produção.');
let ssl;
if (process.env.DB_SSL === 'true') {
  const ca = process.env.DB_SSL_CA_BASE64
    ? Buffer.from(process.env.DB_SSL_CA_BASE64, 'base64').toString('utf8')
    : process.env.DB_SSL_CA_FILE && readFileSync(process.env.DB_SSL_CA_FILE, 'utf8');
  ssl = { ca: ca || undefined, rejectUnauthorized: true, verifyIdentity: true };
}
if (process.env.DB_HOST?.endsWith('.aivencloud.com') && !ssl?.ca) {
  throw new Error('Configure DB_SSL=true e o certificado CA do Aiven.');
}
export const env = Object.freeze({ nodeEnv: process.env.NODE_ENV || 'development', port: Number(process.env.PORT || 3000), db: { host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'fhdod_ouvidoria', ssl }, jwtSecret: process.env.JWT_SECRET || 'development-only-change-me', jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m', refreshSecret: process.env.JWT_REFRESH_SECRET || 'development-refresh-change-me', refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d', corsOrigins: (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map((v) => v.trim()), invitationHours: Number(process.env.INVITATION_EXPIRATION_HOURS || 72), maxFeedbackLength: Number(process.env.MAX_FEEDBACK_LENGTH || 500), tvwallToken: process.env.TVWALL_ACCESS_TOKEN, tvwallMinResponses: Number(process.env.TVWALL_MIN_RESPONSES || 5), swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false' });
