import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import pool from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { ok } from '../utils/response.js';
import { withTransaction } from '../utils/withTransaction.js';
import { communicationModes, dispatchInvitation } from '../services/Communication.js';
import { notifyPermission } from '../services/Notifications.js';
import { emitNotificationUpdates } from '../services/SocketService.js';

const idSchema = z.string().uuid();
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Convite inválido.');
const channelSchema = z.enum(['manual', 'email', 'whatsapp']);
const statuses = ['active', 'used', 'expired'];
const statusSql = "CASE WHEN used_at IS NOT NULL THEN 'used' WHEN expires_at<=UTC_TIMESTAMP() THEN 'expired' ELSE 'active' END";
const defaultHours = Number.isInteger(env.invitationHours) && env.invitationHours >= 1 && env.invitationHours <= 336 ? env.invitationHours : 72;
const creation = z.object({ channel: channelSchema.default('manual'), hours: z.number().int().min(1).max(336).default(defaultHours) });
const filters = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  channel: channelSchema.optional(), status: z.enum(statuses).optional(),
});
const redemption = z.object({ token: tokenSchema, nonce: z.string().regex(/^[a-f0-9]{64}$/) });
const delivery = z.object({
  token: tokenSchema, deliveryId: idSchema,
  channel: z.enum(['email', 'whatsapp']), contact: z.string().trim().max(255),
}).superRefine(({ channel, contact }, ctx) => {
  const valid = channel === 'email' ? z.string().email().safeParse(contact).success : /^\+[1-9]\d{7,14}$/.test(contact);
  if (!valid) ctx.addIssue({ code: 'custom', path: ['contact'], message: 'Informe um e-mail válido ou um telefone com código internacional, conforme o canal.' });
});
const hash = value => createHash('sha256').update(value).digest('hex');
const noInvite = () => new AppError('Convite inválido.', 404);
const expired = () => new AppError('O convite expirou.', 410);
const used = () => new AppError('Este convite já foi utilizado.', 409);

function buildLink(token) {
  const base = new URL(process.env.FRONTEND_URL || env.corsOrigins[0]);
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password) throw Error('Origem inválida para o convite.');
  const url = new URL('/pesquisa/convite', base.origin);
  url.hash = token;
  return url.href;
}

function deriveSurvey(token, nonce) {
  const derive = purpose => createHmac('sha256', env.jwtSecret).update(purpose + '\0' + token + '\0' + nonce).digest();
  const bytes = derive('fhdod-invitation-survey-id').subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  const id = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  return { id, surveyToken: derive('fhdod-invitation-survey-token').toString('hex') };
}

export async function list(req, res) {
  const { page, limit, channel, status } = filters.parse(req.query);
  const terms = [], params = [];
  if (channel) { terms.push('i.channel=?'); params.push(channel); }
  if (status) { terms.push('(' + statusSql + ')=?'); params.push(status); }
  const where = terms.length ? ' WHERE ' + terms.join(' AND ') : '';
  const [[[count]], [data]] = await Promise.all([
    pool.execute('SELECT COUNT(*) total FROM invitations i' + where, params),
    pool.execute(
      'SELECT i.id,i.channel,i.created_at createdAt,i.expires_at expiresAt,i.used_at usedAt,' + statusSql + ' status, '
        + '(SELECT l.status FROM notification_logs l WHERE l.invitation_id=i.id ORDER BY l.created_at DESC,l.id LIMIT 1) lastDelivery '
        + 'FROM invitations i' + where + ' ORDER BY i.created_at DESC,i.id LIMIT ? OFFSET ?',
      [...params, limit, (page - 1) * limit],
    ),
  ]);
  res.json({ success: true, data, communication: communicationModes(), pagination: {
    page, limit, total: count.total, totalPages: Math.ceil(count.total / limit),
  } });
}

export async function create(req, res) {
  const { channel, hours } = creation.parse(req.body);
  const id = randomUUID(), token = randomBytes(32).toString('base64url');
  const link = buildLink(token);
  const { expiresAt, recipients } = await withTransaction(async conn => {
    await conn.execute('INSERT INTO invitations (id,token_hash,channel,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? HOUR))',
      [id, hash(token), channel, hours]);
    const [[invitation]] = await conn.execute('SELECT expires_at expiresAt FROM invitations WHERE id=?', [id]);
    const recipients = await notifyPermission(conn, ['invitations.manage'], {
      type: 'invitation.created', title: 'Convite gerado',
      message: 'Um link individual para pesquisa foi gerado.', href: '/admin/convites',
    });
    return { expiresAt: invitation.expiresAt, recipients };
  });
  emitNotificationUpdates(recipients);
  ok(res, { id, token, link, expiresAt, channel, status: 'active' }, 'Convite gerado.', 201);
}

export async function redeem(req, res) {
  const { token, nonce } = redemption.parse(req.body);
  const access = deriveSurvey(token, nonce);
  const tokenHash = hash(access.surveyToken);
  await withTransaction(async conn => {
    const [[invite]] = await conn.execute('SELECT id,' + statusSql + ' status FROM invitations WHERE token_hash=? FOR UPDATE', [hash(token)]);
    if (!invite) throw noInvite();
    if (invite.status === 'used') {
      const [[retry]] = await conn.execute('SELECT id FROM surveys WHERE id=? AND access_token_hash=?', [access.id, tokenHash]);
      if (retry) return;
      throw used();
    }
    if (invite.status === 'expired') throw expired();
    await conn.execute("INSERT INTO surveys (id,access_token_hash,status) VALUES (?,?,'draft')", [access.id, tokenHash]);
    await conn.execute('UPDATE invitations SET used_at=UTC_TIMESTAMP() WHERE id=?', [invite.id]);
  });
  ok(res, access, 'Pesquisa liberada.');
}

export async function communicate(req, res) {
  const id = idSchema.parse(req.params.id);
  const input = delivery.parse(req.body);
  const link = buildLink(input.token);
  const previous = await withTransaction(async conn => {
    const [[invite]] = await conn.execute('SELECT id,' + statusSql + ' status FROM invitations WHERE id=? AND token_hash=? FOR UPDATE', [id, hash(input.token)]);
    if (!invite) throw noInvite();
    const [[last]] = await conn.execute('SELECT invitation_id,channel,status FROM notification_logs WHERE id=?', [input.deliveryId]);
    if (last) {
      if (last.invitation_id !== id || last.channel !== input.channel || last.status === 'processing') {
        throw new AppError('Já existe uma tentativa com este identificador. Consulte o histórico.', 409);
      }
      if (last.status === 'failed') throw new AppError('A tentativa anterior falhou. Confira o estado antes de repetir.', 502);
      return last.status;
    }
    if (invite.status === 'expired') throw expired();
    if (invite.status === 'used') throw used();
    if (communicationModes()[input.channel] === 'disabled') throw new AppError('O canal não está configurado.', 503);
    await conn.execute("INSERT INTO notification_logs (id,invitation_id,channel,status) VALUES (?,?,?,'processing')",
      [input.deliveryId, id, input.channel]);
    return null;
  });
  let status = previous;
  if (!status) {
    try { status = await dispatchInvitation({ ...input, link }); }
    catch (error) {
      await pool.execute("UPDATE notification_logs SET status='failed' WHERE id=?", [input.deliveryId]);
      throw error;
    }
    await pool.execute('UPDATE notification_logs SET status=? WHERE id=?', [status, input.deliveryId]);
  }
  ok(res, { status, channel: input.channel }, status === 'demo'
    ? 'Demonstração registrada. Nenhuma mensagem foi enviada.'
    : 'O provedor aceitou a solicitação. A entrega não foi confirmada.');
}
