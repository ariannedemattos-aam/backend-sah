import { list, object, ref, schemas, uuid } from './schemas.js';

const tags = {
  auth: 'Autenticação e autorização',
  users: 'Usuários e permissões',
  admin: 'Administração',
  sectors: 'Setores hospitalares',
  services: 'Serviços e etapas de atendimento',
  questions: 'Perguntas e questionários',
  approvals: 'Aprovação de perguntas',
  surveys: 'Pesquisas de satisfação',
  answers: 'Respostas e avaliações',
  feedback: 'Elogios e sugestões',
  returns: 'Solicitações de retorno',
  reports: 'Relatórios e exportações',
  invitations: 'Convites e comunicação',
  notifications: 'Notificações',
  dashboard: 'Dashboard e indicadores',
  tv: 'Painel de TV',
  health: 'Status e saúde da API',
};
const tagDescriptions = {
  auth: 'Sessões JWT. Use o accessToken no Authorize e o refreshToken no corpo de renovação ou encerramento.',
  users: 'Identidade e permissões da sessão. O catálogo administrativo está registrado, com as limitações descritas nas operações.',
  admin: 'Catálogos internos protegidos pela permissão users.manage.',
  health: 'Verifica se a API responde. A rota de saúde não consulta o banco.',
};

const fictitiousId = (n) => '671ec25c-4015-4bce-a706-' + String(n).padStart(12, '0');
const ids = Object.fromEntries(['user', 'sector', 'service', 'stage', 'shift', 'survey', 'attendance', 'question'].map((key, index) => [key, fictitiousId(index + 1)]));
const loginExample = { email: 'colaborador@example.invalid', password: 'senha-ficticia-sem-acesso' };
const refreshExample = { refreshToken: 'SUBSTITUA_PELO_REFRESH_TOKEN' };
const user = { id: ids.user, name: 'Colaborador Fictício', email: loginExample.email, role: 'userSetor', is_active: 1 };
const session = { user, accessToken: 'SUBSTITUA_PELO_ACCESS_TOKEN', ...refreshExample };
const question = {
  id: ids.question, attendanceId: ids.attendance, text: 'Como você avalia a recepção?', type: 'rating', required: 1, displayOrder: 1,
  options: [{ value: '5', label: 'Muito satisfeito' }],
};
const noData = { type: 'object', nullable: true, enum: [null] };
const bearer = [{ bearerAuth: [] }];
const surveyToken = [{ surveyToken: [] }];
const tvToken = [{}, { tvwallToken: [] }];
const media = (schema, example) => ({ 'application/json': { schema, example } });
const body = (name, example, required = true) => ({ required, content: media(ref(name), example) });
const response = (description, schema, data, message = 'Operação realizada com sucesso.') => ({
  description,
  content: media(object({
    success: { type: 'boolean', enum: [true] }, message: { type: 'string' }, data: schema,
  }, ['success', 'message', 'data']), { success: true, message, data }),
});
const error = (description, message = description, errors) => ({
  description,
  content: media(ref('Error'), { success: false, message, ...(errors && { errors }) }),
});
const badJson = error('JSON inválido.', 'Unexpected token in JSON at position 0');
const tooLarge = error('Corpo acima do limite global de 100 KB.', 'request entity too large');
const failure = error('Erro interno, inclusive erros de persistência quando aplicável.', 'Não foi possível realizar a operação.');
const rateLimit = {
  description: 'Limite de 500 requisições por IP em 15 minutos para /api. A resposta padrão é texto.',
  content: { 'text/plain': { schema: { type: 'string' }, example: 'Too many requests, please try again later.' } },
};
const missingJwt = error('JWT Bearer ausente, inválido ou expirado.', 'Token inválido ou expirado.');
const forbidden = error('A sessão não tem a permissão exigida.', 'Acesso não autorizado.');
const invalidData = error('O corpo ou os parâmetros não atendem aos campos e limites esperados.', 'Dados inválidos.');
const surveyConflict = error('A pesquisa está em outra etapa.', 'A pesquisa não está na etapa necessária para esta operação.');
const invalidSurvey = error('Pesquisa não encontrada ou token incompatível com o identificador.', 'Pesquisa não encontrada ou acesso inválido.');
const missingSurveyToken = error('Cabeçalho X-Survey-Token obrigatório.', 'Token da pesquisa obrigatório.');
const noContent = { description: 'Operação concluída. A resposta não tem corpo.' };
const idParameter = (name, id, description) => ({ name, in: 'path', required: true, description, schema: uuid, example: id });
const integerQuery = (name, value, description, minimum, maximum) => ({
  name, in: 'query', description, schema: { type: 'integer', minimum, default: value, ...(maximum && { maximum }) },
  example: value,
});
const searchQuery = { name: 'search', in: 'query', description: 'Busca por trecho do nome ou do enunciado.', schema: { type: 'string', maxLength: 120 }, example: 'Fictício' };
const statusQuery = (values) => ({ name: 'status', in: 'query', description: 'Filtra pelo status.', schema: { type: 'string', enum: values } });
const dateQuery = (name, description) => ({ name, in: 'query', description, schema: { type: 'string', format: 'date' }, example: '2026-01-15' });
const periodQueries = [
  dateQuery('from', 'Data inicial inclusiva no calendário UTC.'),
  dateQuery('to', 'Data final inclusiva no calendário UTC.'),
];
const analysisQueries = [
  ...periodQueries,
  ...[['sectorId', ids.sector, 'setor'], ['serviceId', ids.service, 'serviço'], ['stageId', ids.stage, 'etapa']].map(([name, example, label]) =>
    ({ name, in: 'query', description: 'UUID de ' + label + ' retornado nas opções de análise.', schema: uuid, example })),
  { name: 'score', in: 'query', description: 'Filtra pela nota individual da resposta, de 1 a 5.', schema: { type: 'integer', minimum: 1, maximum: 5 }, example: 5 },
  { ...searchQuery, description: 'Busca por trecho do código da pesquisa, do nome do setor ou do serviço.' },
];
const analysisPaging = [integerQuery('page', 1, 'Número da página.', 1, 1000000), integerQuery('limit', 20, 'Itens por página.', 1, 100)];
const sortQuery = (values) => ({ name: 'sort', in: 'query', description: 'Ordenação.', schema: { type: 'string', enum: values, default: 'recent' } });
const pageResponse = (entity, example, description) => ({
  description,
  content: media(object({
    success: { type: 'boolean', enum: [true] }, data: list(ref(entity)), pagination: ref('Pagination'),
  }, ['success', 'data', 'pagination']), { success: true, data: [example], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }),
});
const surveyId = idParameter('id', ids.survey, 'ID da pesquisa retornado na criação.');
const paths = {};

function add(path, method, group, summary, description, responses, {
  security = [], parameters = [], requestBody, operationId,
} = {}) {
  const hasJson = Boolean(requestBody) || ['post', 'put'].includes(method);
  paths[path] ??= {};
  paths[path][method] = {
    operationId, tags: [tags[group]], summary, description, security,
    ...(parameters.length && { parameters }),
    ...(requestBody && { requestBody }),
    responses: {
      ...responses,
      ...(hasJson && { ...(!responses[400] && { 400: badJson }), 413: tooLarge }),
      ...(path.startsWith('/api/') && { 429: rateLimit }),
    },
  };
}

function surveyOperation(suffix, method, group, summary, description, responses, options = {}) {
  const { errorResponses, parameters = [], ...rest } = options;
  add('/api/v1/public/surveys/{id}' + suffix, method, group, summary,
    'Público com o token da própria pesquisa. ' + description,
    { ...responses, 401: missingSurveyToken, 404: invalidSurvey, 500: failure,
      ...(method !== 'get' && { 409: surveyConflict }), ...errorResponses },
    { ...rest, parameters: [surveyId, ...parameters], security: surveyToken });
}

add('/health', 'get', 'health', 'Verificar saúde da API',
  'Acesso público. Confirma que o servidor HTTP está operacional sem verificar a conexão MySQL.',
  { 200: response('API operacional.', ref('Health'), { status: 'ok' }, 'API operacional') },
  { operationId: 'checkHealth' });

add('/api/v1/auth/login', 'post', 'auth', 'Iniciar sessão',
  'Acesso público. Informe e-mail válido e senha com pelo menos oito caracteres. O papel e as permissões são atribuídos pelo servidor, sem parâmetro de seleção de perfil.',
  {
    200: response('Sessão iniciada.', ref('Session'), session, 'Login realizado.'),
    401: error('Credenciais não reconhecidas.', 'E-mail ou senha inválidos.'),
    403: error('A conta existe, mas está inativa.', 'Usuário inativo.'),
    422: error('E-mail inválido ou senha abaixo do tamanho mínimo.', 'Dados inválidos.', [{ field: 'body.email', message: 'Invalid email' }]),
    500: failure,
  }, { operationId: 'login', requestBody: body('Login', loginExample) });

add('/api/v1/auth/refresh', 'post', 'auth', 'Renovar sessão',
  'Não exige Bearer. Envie no corpo o refreshToken válido da sessão, com no mínimo 20 caracteres. A renovação revoga o refresh token anterior.',
  {
    200: response('Sessão renovada.', ref('Session'), { ...session, user: {
      id: user.id, name: user.name, email: user.email, role: user.role,
    } }, 'Sessão renovada.'),
    401: error('Refresh token inválido, expirado ou revogado.', 'Refresh token inválido.'),
    403: error('Conta indisponível para renovar a sessão.', 'Usuário inativo.'),
    422: error('Refresh token ausente ou abaixo do tamanho mínimo.', 'Dados inválidos.', [{ field: 'body.refreshToken', message: 'Required' }]),
    500: failure,
  }, { operationId: 'refreshSession', requestBody: body('Refresh', refreshExample) });

add('/api/v1/auth/logout', 'post', 'auth', 'Encerrar sessão',
  'Não exige Bearer. Revoga o refresh token informado, quando cadastrado. Um valor bem formatado não cadastrado também retorna 204. O access token já emitido continua válido até expirar.',
  {
    204: noContent,
    422: error('Refresh token ausente ou abaixo do tamanho mínimo.', 'Dados inválidos.', [{ field: 'body.refreshToken', message: 'Required' }]),
    500: failure,
  }, { operationId: 'logout', requestBody: body('Refresh', refreshExample) });

add('/api/v1/auth/me', 'get', 'users', 'Consultar identidade e permissões',
  'JWT Bearer válido, sem permissão específica. Retorna dados da conta e permissões presentes no token.',
  {
    200: response('Identidade autenticada.', ref('Identity'), {
      id: user.id, name: user.name, email: user.email, role: user.role, permissions: ['questions.read', 'questions.propose'],
    }),
    401: missingJwt, 500: failure,
  }, { operationId: 'getIdentity', security: bearer });

add('/api/v1/public/sectors', 'get', 'sectors', 'Listar setores ativos',
  'Acesso público. Retorna setores ativos em ordem de nome.',
  { 200: response('Setores disponíveis.', list(ref('CatalogItem')), [{ id: ids.sector, name: 'Pronto Atendimento', slug: 'pronto-atendimento', description: null }]), 500: failure },
  { operationId: 'listPublicSectors' });

add('/api/v1/public/sectors/{id}/services', 'get', 'services', 'Listar serviços ativos do setor',
  'Acesso público. Retorna uma lista vazia quando não há correspondência para o setor informado.',
  { 200: response('Serviços disponíveis.', list(ref('CatalogItem')), [{ id: ids.service, name: 'Atendimento de Urgência', slug: 'atendimento-urgencia', description: null }]), 500: failure },
  { operationId: 'listSectorServices', parameters: [idParameter('id', ids.sector, 'ID obtido na lista de setores.')] });

add('/api/v1/public/services/{id}/stages', 'get', 'services', 'Listar etapas de um serviço',
  'Acesso público. Retorna os vínculos ativos em ordem de exibição. Um serviço sem etapas correspondentes retorna uma lista vazia.',
  { 200: response('Etapas disponíveis.', list(ref('ServiceStage')), [{ id: ids.stage, name: 'Recepção', display_order: 1, is_required: 1, team_id: null }]), 500: failure },
  { operationId: 'listServiceStages', parameters: [idParameter('id', ids.service, 'ID obtido na lista de serviços do setor.')] });

add('/api/v1/public/shifts', 'get', 'services', 'Listar turnos ativos',
  'Acesso público. Retorna os turnos ativos em ordem de exibição.',
  { 200: response('Turnos disponíveis.', list(ref('Shift')), [{ id: ids.shift, name: 'Manhã' }]), 500: failure },
  { operationId: 'listPublicShifts' });

add('/api/v1/public/surveys', 'post', 'surveys', 'Criar pesquisa de satisfação',
  'Acesso público e sem corpo. Guarde data.id e data.surveyToken da resposta. No Authorize, preencha surveyToken com o valor recebido para acessar apenas essa pesquisa.',
  { 201: response('Pesquisa em rascunho criada.', ref('SurveyAccess'), { id: ids.survey, surveyToken: '0'.repeat(64) }, 'Pesquisa criada.'), 500: failure },
  { operationId: 'createSurvey' });

surveyOperation('', 'get', 'surveys', 'Consultar situação da pesquisa',
  'Retorna o estado e as datas da pesquisa. O código 404 também cobre tokens associados a outra pesquisa.',
  { 200: response('Situação da pesquisa.', ref('Survey'), { id: ids.survey, status: 'draft', createdAt: '2026-01-15T13:00:00.000Z', completedAt: null }) },
  { operationId: 'getSurvey' });

surveyOperation('/attendances', 'post', 'surveys', 'Adicionar atendimento à pesquisa',
  'A pesquisa deve estar em rascunho. Informe IDs UUID de setor, serviço e turno ativos. O serviço deve pertencer ao setor informado. A data é opcional. Reutilize attendanceKey ao repetir o mesmo cadastro após uma falha de conexão.',
  { 201: response('Atendimento adicionado.', ref('Id'), { id: ids.attendance }, 'Atendimento adicionado.'), 422: invalidData },
  { operationId: 'addAttendance', requestBody: body('Attendance', { sectorId: ids.sector, serviceId: ids.service, shiftId: ids.shift, attendanceDate: '2026-01-15' }) });

surveyOperation('/attendances/{attendanceId}', 'delete', 'surveys', 'Remover atendimento da pesquisa',
  'Permitido enquanto a pesquisa está em rascunho. Se o atendimento não pertencer à pesquisa ou não existir, retorna 204 sem remover registros.',
  { 204: noContent },
  { operationId: 'removeAttendance', parameters: [idParameter('attendanceId', ids.attendance, 'ID retornado ao adicionar o atendimento.')] });

surveyOperation('/start', 'post', 'surveys', 'Iniciar preenchimento da pesquisa',
  'Sem corpo obrigatório. Exige um atendimento cadastrado, gera as perguntas de vínculos ativos e marca o estado como in_progress. Repetir a chamada enquanto está em preenchimento retorna 200 sem gerar perguntas novamente.',
  { 200: response('Pesquisa iniciada.', noData, null, 'Pesquisa iniciada.'), 422: error('Pesquisa sem atendimento.', 'Adicione um atendimento antes de iniciar a pesquisa.') },
  { operationId: 'startSurvey' });

surveyOperation('/questions', 'get', 'questions', 'Listar perguntas da pesquisa',
  'Use o id de cada item para responder. Informe limit de 1 a 30 e offset de 0 a 10000. As opções respeitam a ordem do cadastro.',
  { 200: response('Perguntas e opções da pesquisa.', list(ref('SurveyQuestion')), [{ ...question, stage: 'Recepção' }]), 422: invalidData },
  { operationId: 'listSurveyQuestions', parameters: [
    integerQuery('limit', 20, 'Quantidade máxima de perguntas.', 1, 30),
    integerQuery('offset', 0, 'Quantidade de perguntas a pular.', 0, 10000),
  ] });

surveyOperation('/next-question', 'get', 'questions', 'Consultar próxima pergunta sem resposta',
  'Retorna um único item com campos em snake_case e sem a lista de opções. Quando não há perguntas pendentes, data é null.',
  { 200: response('Próxima pergunta ou null.', { ...schemas.NextSurveyQuestion, nullable: true }, {
    id: question.id, attendance_id: question.attendanceId, prompt_snapshot: question.text,
    type_snapshot: question.type, required_snapshot: question.required, display_order: question.displayOrder,
  }) },
  { operationId: 'getNextSurveyQuestion' });

surveyOperation('/answers/{surveyQuestionId}', 'put', 'answers', 'Salvar resposta a uma pergunta',
  'A pesquisa deve estar em preenchimento. Use value de 1 a 5 para nota, textValue para texto ou escolha única e optionValues para múltipla escolha. Para escolhas, envie valores existentes nas opções. Uma questão obrigatória exige resposta do tipo correspondente.',
  { 200: response('Resposta registrada.', noData, null, 'Resposta salva.') },
  {
    operationId: 'saveSurveyAnswer',
    parameters: [idParameter('surveyQuestionId', ids.question, 'ID da pergunta gerada para esta pesquisa.')],
    requestBody: body('Answer', { value: 5 }),
    errorResponses: {
      404: error('Pesquisa, credencial ou pergunta não encontrada para essa pesquisa.', 'Pergunta não encontrada.'),
      422: error('Resposta obrigatória ausente ou incompatível com o tipo ou opções.', 'Resposta incompatível com o tipo ou com as opções da pergunta.'),
    },
  });

surveyOperation('/feedback', 'put', 'feedback', 'Salvar elogios e sugestões',
  'A pesquisa deve estar em preenchimento. Todos os campos são opcionais; textos omitidos ou vazios passam a null. Cada campo aceita até 500 caracteres na configuração padrão. O front-end envia comentários livres em suggestion.',
  { 200: response('Feedback salvo.', noData, null, 'Feedback salvo.'), 422: invalidData },
  { operationId: 'saveSurveyFeedback', requestBody: body('Feedback', { positive: 'A recepção fictícia foi organizada.', negative: 'A sinalização fictícia pode melhorar.', praise: 'Equipe de demonstração atenciosa.', suggestion: 'Incluir uma placa fictícia de orientação.' }) });

surveyOperation('/return-request', 'put', 'returns', 'Registrar pedido de retorno',
  'A pesquisa deve estar em preenchimento. O contato é obrigatório. Salva ou substitui o pedido de retorno. A operação apenas registra o pedido e não envia e-mail nem WhatsApp.',
  {
    200: response('Pedido registrado.', noData, null, 'Solicitação de retorno registrada.'),
    422: invalidData,
  }, { operationId: 'saveReturnRequest', requestBody: body('ReturnRequest', { name: 'Pessoa Fictícia', contact: 'retorno@example.invalid', preferredChannel: 'email', message: 'Pedido de demonstração.' }) });

surveyOperation('/complete', 'post', 'answers', 'Finalizar pesquisa de satisfação',
  'Exige pesquisa em preenchimento com todas as perguntas obrigatórias respondidas. A nota geral opcional é um inteiro de 0 a 10. A primeira conclusão registra o resultado e emite dashboard:update aos assinantes autorizados. Uma repetição não substitui a nota nem emite outro evento.',
  {
    200: response('Pesquisa finalizada.', noData, null, 'Pesquisa finalizada.'),
    422: error('Nota geral inválida ou perguntas obrigatórias pendentes.', 'Existem perguntas obrigatórias sem resposta.'),
  }, { operationId: 'completeSurvey', requestBody: body('Completion', { overallRating: 9 }, false) });

const dashboardExample = { surveys: { total: 1, completed: '1' }, total: 1, answers: 5, averageRating: '4.60', positiveAnswers: 4, ratedAnswers: 5 };
add('/api/v1/admin/dashboard/overview', 'get', 'dashboard', 'Consultar resumo do dashboard',
  'Exige JWT Bearer com dashboard.read. Considera pesquisas concluídas, com os mesmos filtros e cálculo de média das avaliações e dos relatórios. A média usa as notas das respostas individuais de 1 a 5.',
  {
    200: response('Resumo dos indicadores.', ref('DashboardOverview'), dashboardExample),
    401: missingJwt, 403: forbidden, 422: invalidData, 500: failure,
  }, { operationId: 'getDashboardOverview', security: bearer, parameters: analysisQueries });

const dimensions = {
  sectors: 'setores', services: 'serviços', teams: 'equipes', stages: 'etapas', shifts: 'turnos',
};
for (const [key, label] of Object.entries(dimensions)) {
  add('/api/v1/admin/dashboard/' + key, 'get', 'dashboard', 'Consultar indicadores por ' + label,
    'Exige JWT Bearer com dashboard.read. Agrupa respostas de pesquisas concluídas, após aplicar os mesmos filtros das avaliações e dos relatórios.',
    { 200: response('Indicadores agrupados.', list(ref('Dimension')), [{ label: 'Grupo fictício', evaluations: 2, responses: 8, averageRating: '4.25' }]), 401: missingJwt, 403: forbidden, 422: invalidData, 500: failure },
    { operationId: 'getDashboard_' + key, security: bearer, parameters: analysisQueries });
}

const administrativeErrors = { 401: missingJwt, 403: forbidden, 422: invalidData, 500: failure };
const invitationId = fictitiousId(26);
const inviteToken = 'A'.repeat(43);
const inviteDate = '2026-01-15T13:00:00.000Z';
const inviteList = pageResponse('InvitationRow', {
  id: invitationId, channel: 'manual', status: 'active', expiresAt: inviteDate, createdAt: inviteDate, usedAt: null, lastDelivery: null,
}, 'Página de convites e configuração de comunicação.');
inviteList.content['application/json'].schema.properties.communication = ref('CommunicationModes');
inviteList.content['application/json'].schema.required.push('communication');
inviteList.content['application/json'].example.communication = { email: 'demo', whatsapp: 'demo' };
add('/api/v1/admin/invitations', 'get', 'invitations', 'Listar convites de pesquisa',
  'Exige invitations.manage. Filtra por canal e situação. A listagem mostra o registro de comunicação mais recente e o modo de cada adaptador, mantendo links, tokens e contatos fora da resposta.',
  { 200: inviteList, ...administrativeErrors },
  { operationId: 'listInvitations', security: bearer, parameters: [
    ...analysisPaging, statusQuery(['active', 'used', 'expired']),
    { name: 'channel', in: 'query', schema: { type: 'string', enum: ['manual', 'email', 'whatsapp'] }, description: 'Canal previsto.' },
  ] });
add('/api/v1/admin/invitations', 'post', 'invitations', 'Gerar convite individual',
  'Exige invitations.manage. Gera link de uso único, com validade de 1 a 336 horas. O token e o link só são retornados nesta operação. O servidor persiste somente o hash do token.',
  { 201: response('Link individual criado.', ref('InvitationNew'), {
    id: invitationId, token: inviteToken, link: 'https://example.invalid/pesquisa/convite#' + inviteToken,
    expiresAt: inviteDate, channel: 'manual', status: 'active',
  }, 'Convite gerado.'), ...administrativeErrors },
  { operationId: 'createInvitation', security: bearer, requestBody: body('InvitationInput', { channel: 'manual', hours: 72 }, false) });

const invitationMissing = error('Convite inexistente ou credencial inválida.', 'Convite inválido.');
const invitationExpired = error('Convite expirado.', 'O convite expirou.');
add('/api/v1/public/invitations/redeem', 'post', 'invitations', 'Resgatar convite de pesquisa',
  'Acesso público. Envie o token e um nonce aleatório de 32 bytes em hexadecimal. O resgate consome o convite e cria uma pesquisa anônima sem vínculo persistido. Se houver falha na conexão, repita com o mesmo nonce para recuperar a mesma pesquisa. Não divulgue o nonce.',
  { 200: response('Pesquisa liberada.', ref('SurveyAccess'), { id: ids.survey, surveyToken: '0'.repeat(64) }, 'Pesquisa liberada.'),
    404: invitationMissing, 409: error('Convite já resgatado com outro nonce.', 'Este convite já foi utilizado.'),
    410: invitationExpired, 422: invalidData, 500: failure },
  { operationId: 'redeemInvitation', requestBody: body('InvitationRedeem', { token: inviteToken, nonce: '0'.repeat(64) }) });

add('/api/v1/admin/invitations/{id}/communications', 'post', 'invitations', 'Registrar tentativa de comunicação de um convite',
  'Exige invitations.manage e o token mostrado na geração. Reutilize deliveryId em uma repetição de rede. No modo demonstração, registra a tentativa sem enviar mensagem. No modo real, accepted significa que o provedor aceitou a solicitação. O endereço do destinatário não é armazenado.',
  { 200: response('Tentativa registrada.', ref('CommunicationResult'), { status: 'demo', channel: 'email' }, 'Demonstração registrada. Nenhuma mensagem foi enviada.'),
    ...administrativeErrors, 404: invitationMissing, 409: error('Convite usado ou tentativa em andamento.'),
    410: invitationExpired, 502: error('Provedor não confirmou a aceitação.'), 503: error('Canal não configurado.') },
  { operationId: 'communicateInvitation', security: bearer, parameters: [idParameter('id', invitationId, 'UUID do convite.')],
    requestBody: body('InvitationCommunication', { token: inviteToken, deliveryId: fictitiousId(27), channel: 'email', contact: 'contato@example.invalid' }) });

const notificationId = fictitiousId(28);
add('/api/v1/notifications', 'get', 'notifications', 'Listar as notificações da própria conta',
  'Exige JWT Bearer. Retorna somente as notificações do titular da sessão, com o número total de não lidas.',
  { 200: response('Notificações da sessão.', ref('Notifications'), { unread: 1, items: [{
    id: notificationId, type: 'question.proposed', title: 'Nova proposta de pergunta',
    message: 'Uma proposta de pergunta está pendente de revisão.', href: '/admin/perguntas', createdAt: inviteDate, readAt: null,
  }] }), 401: missingJwt, 422: invalidData, 500: failure },
  { operationId: 'listNotifications', security: bearer, parameters: [
    integerQuery('limit', 20, 'Número de notificações recentes.', 1, 100),
    { name: 'unread', in: 'query', description: 'Filtra somente as não lidas quando true.', schema: { type: 'string', enum: ['true', 'false'], default: 'false' } },
  ] });
add('/api/v1/notifications/{id}/read', 'patch', 'notifications', 'Marcar uma notificação como lida',
  'Exige JWT Bearer. Atualiza somente a notificação do titular da sessão. Repetir a chamada preserva a primeira data de leitura.',
  { 200: response('Leitura registrada.', ref('Id'), { id: notificationId }, 'Notificação marcada como lida.'),
    401: missingJwt, 404: error('Notificação inexistente para a sessão.', 'Notificação não encontrada.'), 422: invalidData, 500: failure },
  { operationId: 'markNotificationRead', security: bearer, parameters: [idParameter('id', notificationId, 'UUID da notificação.')] });
add('/api/v1/notifications/read-all', 'patch', 'notifications', 'Marcar todas as notificações como lidas',
  'Exige JWT Bearer. Atualiza apenas notificações não lidas da própria conta.',
  { 200: response('Leituras registradas.', ref('NotificationUpdates'), { updated: 1 }, 'Notificações marcadas como lidas.'),
    401: missingJwt, 500: failure },
  { operationId: 'markAllNotificationsRead', security: bearer });

add('/api/v1/admin/analysis/options', 'get', 'answers', 'Listar setores, serviços e etapas para os filtros',
  'Exige surveys.read, reports.export ou perfil de setor. Retorna opções com histórico de pesquisas concluídas. Usuários de setor veem somente opções dos atendimentos que podem consultar.',
  { 200: response('Opções de análise.', ref('AnalysisOptions'), {
    sectors: [{ id: ids.sector, name: 'Setor Fictício' }],
    services: [{ id: ids.service, name: 'Serviço Fictício', sectorId: ids.sector }],
    stages: [{ id: ids.stage, name: 'Recepção' }],
  }), 401: missingJwt, 403: forbidden, 500: failure },
  { operationId: 'listAnalysisOptions', security: bearer });

const evaluationExample = {
  id: ids.survey, completedDate: '2026-01-15', overallRating: 9,
  attendances: 'Setor Fictício · Serviço Fictício', averageRating: '4.60', answers: 5,
};
const evaluationPage = pageResponse('EvaluationRow', evaluationExample, 'Página de avaliações concluídas e indicadores da seleção.');
const evaluationMedia = evaluationPage.content['application/json'];
Object.assign(evaluationMedia.schema.properties, { summary: ref('DashboardOverview'), distribution: list(ref('RatingCount')) });
evaluationMedia.schema.required.push('summary', 'distribution');
Object.assign(evaluationMedia.example, { summary: dashboardExample, distribution: [{ score: 4, responses: 2 }, { score: 5, responses: 3 }] });
add('/api/v1/admin/evaluations', 'get', 'answers', 'Listar avaliações concluídas',
  'Exige surveys.read. Retorna uma página anônima, com total, média e distribuição de todas as avaliações que correspondem aos filtros. No filtro por etapa ou nota, a média usa as respostas correspondentes. O período se refere à data de conclusão.',
  { 200: evaluationPage, ...administrativeErrors }, { operationId: 'listEvaluations', security: bearer,
    parameters: [...analysisQueries, ...analysisPaging, sortQuery(['recent', 'oldest', 'highest', 'lowest'])] });

add('/api/v1/admin/evaluations/{id}', 'get', 'answers', 'Consultar detalhe anônimo de uma avaliação',
  'Exige surveys.read. Exibe a data, os atendimentos, a nota geral, notas individuais e rótulos das opções selecionadas. Respostas de texto livre são representadas por uma indicação de presença. Os dados de contato são tratados em outro fluxo com permissão específica.',
  { 200: response('Avaliação encontrada.', ref('EvaluationDetail'), {
    id: ids.survey, completedDate: '2026-01-15', overallRating: 9,
    attendances: [{ sector: 'Setor Fictício', service: 'Serviço Fictício', shift: 'Manhã' }],
    answers: [{ id: ids.question, prompt: question.text, type: 'rating', rating: '5.00', stage: 'Recepção', service: 'Serviço Fictício', hasText: false, options: [] }],
  }), 404: error('Avaliação inexistente ou fora dos filtros.', 'Avaliação não encontrada para os filtros selecionados.'), ...administrativeErrors },
  { operationId: 'getEvaluation', security: bearer, parameters: [surveyId, ...analysisQueries] });

add('/api/v1/admin/feedback', 'get', 'feedback', 'Listar elogios, sugestões e outros comentários',
  'Exige surveys.read ou perfil de setor. O setor recebe comentários somente de pesquisas cujos atendimentos estão integralmente em seus setores autorizados. Separa os quatro campos existentes e mascara e-mails, telefones e CPF. A data de apresentação do comentário é a data de registro.',
  { 200: pageResponse('FeedbackEntry', { id: fictitiousId(19) + ':praise', kind: 'praise', content: 'A recepção fictícia foi atenciosa.', receivedDate: '2026-01-15' }, 'Página de comentários.'), ...administrativeErrors },
  { operationId: 'listFeedback', security: bearer, parameters: [
    ...analysisQueries, ...analysisPaging, sortQuery(['recent', 'oldest']),
    { name: 'kind', in: 'query', description: 'Tipo de comentário.', schema: { type: 'string', enum: ['praise', 'positive', 'suggestion', 'negative'] } },
  ] });

const returnId = fictitiousId(20);
const returnParam = idParameter('id', returnId, 'UUID da solicitação retornado na listagem.');
const returnMissing = error('Solicitação inexistente ou fora do escopo.', 'Solicitação de retorno não encontrada.');
add('/api/v1/admin/return-requests', 'get', 'returns', 'Listar solicitações de retorno',
  'Exige return_requests.manage. Inclui solicitações de pesquisas concluídas. A listagem omite nome, contato e mensagem. O período filtra pela data de registro da solicitação.',
  { 200: pageResponse('ReturnItem', { id: returnId, status: 'open', createdAt: '2026-01-15T13:00:00.000Z' }, 'Página de solicitações.'), ...administrativeErrors },
  { operationId: 'listReturnRequests', security: bearer, parameters: [...periodQueries, ...analysisPaging, statusQuery(['open', 'in_progress', 'closed'])] });

add('/api/v1/admin/return-requests/{id}/contact', 'get', 'returns', 'Revelar contato de uma solicitação',
  'Exige return_requests.manage. Exposição sob demanda com registro de auditoria por usuário e solicitação. A resposta usa Cache-Control privado sem armazenamento.',
  { 200: response('Contato autorizado.', ref('ReturnContact'), {
    id: returnId, status: 'open', name: 'Pessoa Fictícia', contact: 'retorno@example.invalid', preferredChannel: 'email', message: 'Pedido fictício.',
  }), 404: returnMissing, ...administrativeErrors },
  { operationId: 'revealReturnContact', security: bearer, parameters: [returnParam] });

add('/api/v1/admin/return-requests/{id}/status', 'patch', 'returns', 'Alterar situação de uma solicitação',
  'Exige return_requests.manage. A transição é pendente (open), em atendimento (in_progress) e concluída (closed). Repetir o status atual é idempotente. A alteração é auditada e não dispara mensagens.',
  { 200: response('Situação atualizada.', ref('ReturnStatusUpdate'), { id: returnId, status: 'in_progress' }, 'Situação da solicitação atualizada.'),
    404: returnMissing, 409: error('Transição de situação inválida.', 'A solicitação deve seguir a ordem pendente, em atendimento e concluída.'), ...administrativeErrors },
  { operationId: 'updateReturnStatus', security: bearer, parameters: [returnParam], requestBody: body('ReturnStatusInput', { status: 'in_progress' }) });

for (const [format, label, mime] of [
  ['excel', 'Excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['pdf', 'PDF', 'application/pdf'],
]) {
  add('/api/v1/admin/reports/' + format, 'get', 'reports', 'Baixar relatório em ' + label,
    'Exige reports.export. O arquivo contém período, quantidade de avaliações, satisfação média, distribuição, indicadores por dimensão e contagens de feedback. Comentários livres e contatos ficam fora do arquivo. Os filtros são os mesmos das avaliações.',
    { 200: { description: 'Relatório para download.', content: { [mime]: { schema: { type: 'string', format: 'binary' } } } }, ...administrativeErrors },
    { operationId: format === 'pdf' ? 'downloadReportPdf' : 'downloadReportExcel', security: bearer, parameters: analysisQueries });
}

const resources = {
  sectors: { label: 'setores', name: 'Setor Fictício', entity: 'Sector', fields: { slug: 'setor-ficticio' } },
  services: { label: 'serviços', name: 'Serviço Fictício', entity: 'Service', fields: { slug: 'servico-ficticio', sector_id: ids.sector } },
  stages: { label: 'etapas', name: 'Etapa Fictícia', entity: 'Stage' },
  teams: { label: 'equipes', name: 'Equipe Fictícia', entity: 'Team', fields: { sector_id: ids.sector, service_id: ids.service } },
  shifts: { label: 'turnos', name: 'Turno Fictício', entity: 'Shift', fields: { display_order: 2 } },
  users: { label: 'usuários', entity: 'User', fields: { email: 'colaborador@example.invalid', role_id: fictitiousId(11) } },
  roles: { label: 'papéis', entity: 'Role' },
  permissions: { label: 'permissões', entity: 'Permission' },
};
for (const [key, { label, name, entity, fields }] of Object.entries(resources)) {
  const group = name ? 'admin' : 'users';
  const path = '/api/v1/admin/' + key;
  const example = {
    id: fictitiousId(14), name: name || 'Registro fictício', created_at: '2026-01-15T13:00:00.000Z',
    ...(key !== 'roles' && key !== 'users' && { description: 'Registro demonstrativo.' }),
    ...((name || key === 'users') && { is_active: 1 }),
    ...(['sectors', 'services', 'users'].includes(key) && { updated_at: '2026-01-15T13:00:00.000Z' }),
    ...fields,
  };
  add(path, 'get', group, 'Listar ' + label + ' na administração',
    'Exige JWT Bearer com users.manage. A listagem é paginada. A listagem de usuários retorna exclusivamente dados de cadastro e papel.',
    {
      200: pageResponse('Admin' + entity, example, 'Página do catálogo.'),
      401: missingJwt, 403: forbidden, 422: invalidData, 500: failure,
    },
    { operationId: 'listAdmin_' + key, security: bearer, parameters: [
      integerQuery('page', 1, 'Número da página.', 1, 1000000),
      integerQuery('limit', 20, 'Registros por página.', 1, 100),
      searchQuery,
      ...(name || key === 'users' ? [statusQuery(['active', 'inactive'])] : []),
    ] });
  const postResponses = name
    ? {
      201: response('Registro criado.', ref('Id'), { id: fictitiousId(14) }, 'Registro criado.'),
      409: error('Identificador duplicado.', 'Já existe um registro com esse identificador de catálogo.'), 422: invalidData, 500: failure,
    }
    : { 400: error('Criação genérica indisponível.', 'Recurso não disponível para criação genérica.') };
  add(path, 'post', group, 'Solicitar criação administrativa para ' + label,
    'Exige JWT Bearer com users.manage. ' + (name
      ? 'Valida os campos e retorna o UUID do registro criado. Identificadores de catálogo duplicados retornam 409.'
      : 'Usuários, papéis e permissões não podem ser criados pelo mecanismo genérico. A operação retorna 400 e não grava dados.'),
    { ...postResponses, 401: missingJwt, 403: forbidden },
    {
      operationId: 'createAdmin_' + key, security: bearer,
      ...(name && { requestBody: body('Input' + entity, { name, description: 'Registro de demonstração.', ...fields }) }),
    });
  if (!name) continue;
  const recordPath = path + '/{id}';
  const parameters = [idParameter('id', example.id, 'UUID retornado na criação ou na listagem.')];
  const missingRecord = error('Registro inexistente.', 'Registro não encontrado.');
  const commonErrors = { 401: missingJwt, 403: forbidden, 404: missingRecord, 422: invalidData, 500: failure };
  add(recordPath, 'get', group, 'Consultar registro de ' + label,
    'Exige users.manage. Retorna o registro, inclusive se arquivado.',
    { 200: response('Registro encontrado.', ref('Admin' + entity), example), ...commonErrors },
    { operationId: 'getAdmin_' + key, security: bearer, parameters });
  add(recordPath, 'put', group, 'Editar registro de ' + label,
    'Exige users.manage. Substitui os campos editáveis e mantém o UUID e o status. O setor de um serviço com dependências não pode ser alterado.',
    { 200: response('Registro atualizado.', ref('Id'), { id: example.id }, 'Registro atualizado.'),
      409: error('Identificador em uso ou alteração de vínculo vedada.', 'Já existe um registro com esse identificador de catálogo.'), ...commonErrors },
    { operationId: 'updateAdmin_' + key, security: bearer, parameters,
      requestBody: body('Input' + entity, { name: name + ' atualizado', description: 'Alteração fictícia.', ...fields }) });
  add(recordPath + '/status', 'patch', group, 'Arquivar ou reativar registro de ' + label,
    'Exige users.manage. A operação é idempotente e preserva referências e histórico. Arquivar um setor também retira seus serviços das novas seleções públicas enquanto o setor estiver inativo.',
    { 200: response('Status salvo.', ref('CatalogStatus'), { id: example.id, active: false }, 'Registro arquivado.'), ...commonErrors },
    { operationId: 'setAdminStatus_' + key, security: bearer, parameters, requestBody: body('StatusInput', { active: false }) });
}

const questionStamp = { id: ids.question, status: 'pending' };
const questionEntry = { ...questionStamp, version: 1, canEdit: true, type: 'rating', required: 0, createdAt: '2026-01-15T13:00:00.000Z', services: 'Atendimento de Urgência', prompt: question.text };
const questionMissing = error('Pergunta inexistente ou fora do escopo do usuário.', 'Pergunta não encontrada.');
const questionParameters = [idParameter('id', ids.question, 'UUID da pergunta.')];
add('/api/v1/questions', 'get', 'questions', 'Listar propostas e perguntas cadastradas',
  'Exige questions.read. Retorna perguntas paginadas, com filtro por status ou enunciado. Colaboradores de setor veem somente as próprias propostas.',
  { 200: pageResponse('QuestionEntry', questionEntry, 'Página de perguntas.'), 401: missingJwt, 403: forbidden, 422: invalidData, 500: failure },
  { operationId: 'listQuestions', security: bearer, parameters: [
    integerQuery('page', 1, 'Número da página.', 1, 1000000), integerQuery('limit', 100, 'Perguntas por página.', 1, 100),
    searchQuery, statusQuery(['pending', 'approved', 'active', 'inactive', 'rejected']),
  ] });

add('/api/v1/questions/services', 'get', 'questions', 'Listar serviços disponíveis para propostas',
  'Exige questions.propose ou questions.create. Colaboradores de setor veem apenas serviços ativos dos setores atribuídos.',
  { 200: response('Serviços disponíveis.', list(ref('QuestionService')), [{ id: ids.service, name: 'Atendimento de Urgência', sectorName: 'Pronto Atendimento' }]),
    401: missingJwt, 403: forbidden, 500: failure },
  { operationId: 'listQuestionServices', security: bearer });

add('/api/v1/questions', 'post', 'questions', 'Enviar pergunta para aprovação',
  'Exige questions.propose ou questions.create. Usuários de setor só propõem em serviços dos setores atribuídos. Tipos de escolha exigem de 2 a 10 opções distintas. A pergunta é criada como pending.',
  { 201: response('Pergunta enviada.', ref('QuestionState'), questionStamp, 'Pergunta enviada para aprovação.'),
    401: missingJwt, 403: forbidden, 422: invalidData, 500: failure },
  { operationId: 'proposeQuestion', security: bearer, requestBody: body('QuestionInput', {
    prompt: 'Como você avalia a orientação recebida para o exame?', type: 'single_choice', serviceId: ids.service, required: false,
    options: ['Clara', 'Poderia melhorar'],
  }) });

add('/api/v1/questions/{id}', 'get', 'questions', 'Consultar a versão atual de uma pergunta',
  'Exige questions.read. Administradores podem abrir todas as perguntas. Colaboradores de setor consultam somente as próprias propostas. Retorna opções e número da versão.',
  { 200: response('Pergunta encontrada.', ref('QuestionDetail'), { ...questionEntry, options: ['Muito insatisfeito', 'Insatisfeito', 'Neutro', 'Satisfeito', 'Muito satisfeito'] }),
    401: missingJwt, 403: forbidden, 404: questionMissing, 422: invalidData, 500: failure },
  { operationId: 'getQuestion', security: bearer, parameters: questionParameters });

add('/api/v1/questions/{id}', 'put', 'questions', 'Salvar nova versão de uma pergunta',
  'Exige questions.update ou questions.propose. O setor só pode editar propostas próprias pendentes ou rejeitadas, de serviços ativos atribuídos ao setor. Uma proposta rejeitada retorna à revisão. O administrador pode publicar uma nova versão de uma pergunta ativa. Os serviços associados e os questionários já iniciados são preservados. Envie a versão atual para evitar sobrescrever uma edição concorrente.',
  { 200: response('Versão salva.', ref('QuestionVersion'), { ...questionStamp, version: 2 }, 'Nova versão da pergunta salva.'),
    401: missingJwt, 403: forbidden, 404: questionMissing, 409: error('Versão desatualizada ou edição vedada pelo status.', 'A pergunta foi alterada. Reabra a edição e tente novamente.'),
    422: invalidData, 500: failure },
  { operationId: 'updateQuestion', security: bearer, parameters: questionParameters, requestBody: body('QuestionEdit', {
    version: 1, changeReason: 'Melhorar a clareza do enunciado.', prompt: 'Como você avalia a orientação no atendimento?', type: 'rating', required: false,
  }) });

add('/api/v1/questions/{id}/status', 'patch', 'approvals', 'Arquivar ou reabrir a revisão de uma pergunta',
  'Exige questions.update. Defina active como false para arquivar uma pergunta ativa, ou como true para que uma pergunta inativa volte ao status pendente. Pesquisas já iniciadas mantêm suas perguntas. A volta à pesquisa exige nova aprovação.',
  { 200: response('Status salvo.', ref('QuestionState'), { ...questionStamp, status: 'inactive' }, 'Pergunta arquivada.'),
    401: missingJwt, 403: forbidden, 404: questionMissing, 409: error('Transição vedada.', 'O status atual não permite esta transição.'),
    422: invalidData, 500: failure },
  { operationId: 'setQuestionStatus', security: bearer, parameters: questionParameters, requestBody: body('StatusInput', { active: false }) });

for (const [action, permission, summary, status] of [
  ['approve', 'questions.approve', 'Aprovar e ativar uma pergunta', 'active'],
  ['reject', 'questions.reject', 'Rejeitar uma pergunta', 'rejected'],
]) {
  add('/api/v1/questions/{id}/' + action, 'post', 'approvals', summary,
    'Exige ' + permission + '. Registra a decisão e a justificativa. Apenas perguntas pendentes podem ser analisadas.',
    { 200: response('Decisão registrada.', ref('QuestionState'), { ...questionStamp, status },
      action === 'approve' ? 'Pergunta aprovada e ativada.' : 'Pergunta rejeitada.'),
    401: missingJwt, 403: forbidden, 404: error('Pergunta inexistente.', 'Pergunta não encontrada.'),
    409: error('Pergunta já analisada.', 'A pergunta já foi analisada.'), 422: invalidData, 500: failure },
    { operationId: action + 'Question', security: bearer, parameters: [idParameter('id', ids.question, 'UUID retornado na proposta.')],
      requestBody: body('QuestionReview', { justification: 'Revisão de uma pergunta fictícia.' }) });
}

add('/api/v1/tvwall/overview', 'get', 'tv', 'Consultar resumo do painel de TV',
  'Acesso público quando TVWALL_ACCESS_TOKEN não está configurado. Quando configurado, use o esquema tvwallToken no Authorize. Agrega somente notas de pesquisas concluídas. Abaixo do limite mínimo configurado (padrão 5), retorna contagem zero e média nula.',
  {
    200: response('Indicadores gerais do painel de TV.', ref('TvOverview'), { responses: 15, averageRating: '4.8' }),
    401: error('Token do painel ausente ou incorreto, quando exigido.', 'Token TV Wall inválido.'), 500: failure,
  }, { operationId: 'getTvOverview', security: tvToken });

add('/api/v1/tvwall/sectors', 'get', 'tv', 'Consultar indicadores por setor no painel de TV',
  'Acesso público quando TVWALL_ACCESS_TOKEN não está configurado. Quando configurado, envie X-TVWall-Token. Exibe setores que atingem o mínimo configurado de respostas (padrão 5).',
  {
    200: response('Setores que atingiram a quantidade mínima.', list(ref('TvSector')), [{ name: 'Pronto Atendimento', responses: 15, averageRating: '4.8' }]),
    401: error('Token do painel ausente ou incorreto, quando exigido.', 'Token TV Wall inválido.'), 500: failure,
  }, { operationId: 'listTvSectors', security: tvToken });

export default {
  openapi: '3.0.3',
  info: {
    title: 'API Ouvidoria FHDOD',
    version: '1.4.0',
    description: [
      'API de pesquisa de satisfação hospitalar. Use o Swagger aberto no servidor que pretende testar.',
      'Para a equipe: execute **Iniciar sessão** com sua conta de demonstração. Em **Authorize**, cole somente o accessToken no esquema bearerAuth. A permissão dashboard.read é exigida no dashboard. O papel de setor do seed não recebe dashboard.read nem users.manage.',
      'Para uma pessoa respondente: crie uma pesquisa, copie o id e autorize o esquema surveyToken com o valor retornado. Consulte setores, serviços e turnos, adicione um atendimento, inicie a pesquisa, liste as perguntas, responda e finalize.',
      'Os exemplos usam identificadores fictícios. Durante os testes, substitua os IDs pelos retornados pela API e informe somente dados de demonstração.',
      'Socket.IO: dashboard:update usa o canal padrão protegido por dashboard.read. notifications:update usa o namespace /notifications, exige JWT em auth.token e é entregue somente ao titular. O evento sinaliza que a central deve recarregar, sem transmitir conteúdo.',
    ].join('\n\n'),
  },
  servers: [
    { url: '/', description: 'Servidor que hospeda este Swagger' },
    { url: 'https://fhdod-ouvidoria-demo.onrender.com', description: 'Demonstração publicada no Render' },
    { url: 'http://localhost:3000', description: 'Servidor local (porta padrão)' },
  ],
  externalDocs: {
    description: 'Guia de integração, eventos Socket.IO e lacunas',
    url: 'https://github.com/ariannedemattos-aam/backend-sah/blob/main/docs/integration.md',
  },
  tags: Object.entries(tags).map(([key, name]) => ({ name, ...(tagDescriptions[key] && { description: tagDescriptions[key] }) })),
  paths,
  components: {
    schemas,
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Cole só o accessToken retornado pelo login. O Swagger inclui o prefixo Bearer.' },
      surveyToken: { type: 'apiKey', in: 'header', name: 'X-Survey-Token', description: 'Cole o surveyToken retornado na criação da pesquisa.' },
      tvwallToken: { type: 'apiKey', in: 'header', name: 'X-TVWall-Token', description: 'Preencha somente se o servidor exigir um token de painel de TV.' },
    },
  },
};
