import { AppError } from '../utils/errors.js';

const configuration = process.env;
const smtpReady = () => ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'].every(key => configuration[key]);
const whatsappReady = () => Boolean(
  /^\d+$/.test(configuration.WHATSAPP_PHONE_NUMBER_ID || '')
  && /^v\d+\.\d+$/.test(configuration.WHATSAPP_GRAPH_VERSION || '')
  && configuration.WHATSAPP_ACCESS_TOKEN && configuration.WHATSAPP_TEMPLATE_NAME,
);

export function communicationModes() {
  if (configuration.NOTIFICATION_MODE !== 'live') return { email: 'demo', whatsapp: 'demo' };
  return { email: smtpReady() ? 'live' : 'disabled', whatsapp: whatsappReady() ? 'live' : 'disabled' };
}

async function viaEmail(contact, link) {
  const { default: nodemailer } = await import('nodemailer');
  const port = Number(configuration.SMTP_PORT || 587);
  const secure = port === 465;
  const transport = nodemailer.createTransport({
    host: configuration.SMTP_HOST, port, secure, requireTLS: !secure,
    auth: { user: configuration.SMTP_USER, pass: configuration.SMTP_PASSWORD },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000,
  });
  const response = await transport.sendMail({
    from: configuration.SMTP_FROM, to: contact, subject: 'Convite para a pesquisa de satisfação | FHDOD',
    text: 'Fundação Hospitalar Dr. Oswaldo Diesel\n\nQueremos ouvir sua opinião. Use este link individual para responder: ' + link,
  });
  if (!response.accepted?.length) throw Error('SMTP recusou a tentativa');
}

async function viaWhatsApp(contact, link) {
  const endpoint = 'https://graph.facebook.com/' + configuration.WHATSAPP_GRAPH_VERSION + '/'
    + configuration.WHATSAPP_PHONE_NUMBER_ID + '/messages';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + configuration.WHATSAPP_ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: contact.slice(1), type: 'template',
      template: {
        name: configuration.WHATSAPP_TEMPLATE_NAME,
        language: { code: configuration.WHATSAPP_LANGUAGE || 'pt_BR' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: link }] }],
      },
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok || !(await response.json()).messages?.length) throw Error('Meta recusou a tentativa');
}

const adapters = { email: viaEmail, whatsapp: viaWhatsApp };
export async function dispatchInvitation({ channel, contact, link }) {
  const mode = communicationModes()[channel];
  if (mode === 'demo') return 'demo';
  if (mode !== 'live') throw new AppError('O canal não está configurado.', 503);
  try {
    await adapters[channel](contact, link);
    return 'accepted';
  } catch {
    throw new AppError('O provedor não confirmou o recebimento da solicitação. Confira antes de tentar novamente.', 502);
  }
}
