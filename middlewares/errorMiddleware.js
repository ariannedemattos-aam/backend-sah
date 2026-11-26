import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';

const unavailable = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'EPIPE', 'ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ER_CON_COUNT_ERROR']);
export const notFound = (_req, res) => res.status(404).json({ success: false, message: 'Recurso não encontrado.' });

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof ZodError) {
    const errors = error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: ['invalid_enum_value', 'invalid_value'].includes(issue.code) ? 'Valor fora das opções permitidas.' : issue.message,
    }));
    return res.status(422).json({ success: false, message: 'Dados inválidos.', errors });
  }
  const status = error instanceof AppError && error.status < 500 ? error.status
    : error instanceof AppError && [502, 503].includes(error.status) ? error.status
    : error.type === 'entity.parse.failed' ? 400
    : error.type === 'entity.too.large' ? 413
    : unavailable.has(error.code) ? 503 : 500;
  if (status >= 500) {
    console.error(JSON.stringify({
      event: 'api_error', method: req.method, status,
      code: /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'UNKNOWN',
    }));
  }
  const message = error instanceof AppError && status !== 500 ? error.message
    : status === 400 ? 'O corpo da requisição contém JSON inválido.'
    : status === 413 ? 'O corpo da requisição excede o limite permitido.'
    : status === 503 ? 'Serviço temporariamente indisponível. Tente novamente.'
    : 'Não foi possível realizar a operação.';
  return res.status(status).json({ success: false, message });
}
