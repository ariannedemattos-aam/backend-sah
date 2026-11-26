import { list, object, ref, schemas, uuid } from './schemas.js';

const tags = {
  auth: 'Autenticação e autorização',
  users: 'Usuários e permissões',
  admin: 'Administração',
  sectors: 'Setores hospitalares',
  services: 'Serviços e etapas de atendimento',
  questions: 'Perguntas e questionários',
  surveys: 'Pesquisas de satisfação',
  answers: 'Respostas e avaliações',
  feedback: 'Elogios e sugestões',
  returns: 'Solicitações de retorno',
  dashboard: 'Dashboard e indicadores',
  tv: 'Painel de TV',
  health: 'Status e saúde da API',
};
const tagDescriptions = {
  auth: 'Sessões JWT. Use o accessToken no Authorize e o refreshToken no corpo de renovação ou encerramento.',
  users: 'Identidade e permissões da sessão. O catálogo administrativo está registrado, com as limitações descritas nas operações.',
  admin: 'Rotas administrativas registradas. O status de cada operação reflete o comportamento da versão publicada.',
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
const invalidSurvey = error('Pesquisa não encontrada ou token incompatível com o identificador.', 'Pesquisa não encontrada ou acesso inválido.');
const missingSurveyToken = error('Cabeçalho X-Survey-Token obrigatório.', 'Token da pesquisa obrigatório.');
const noContent = { description: 'Operação concluída. A resposta não tem corpo.' };
const idParameter = (name, id, description) => ({ name, in: 'path', required: true, description, schema: uuid, example: id });
const integerQuery = (name, value, description, minimum, maximum) => ({
  name, in: 'query', description, schema: { type: 'integer', minimum, default: value, ...(maximum && { maximum }) },
  example: value,
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
    { ...responses, 401: missingSurveyToken, 404: invalidSurvey, 500: failure, ...errorResponses },
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
  'Informe IDs existentes de setor, serviço e turno, obtidos no catálogo público. A data é opcional. A API não verifica se o serviço pertence ao setor informado. IDs inválidos podem resultar em erro de banco.',
  { 201: response('Atendimento adicionado.', ref('Id'), { id: ids.attendance }, 'Atendimento adicionado.') },
  { operationId: 'addAttendance', requestBody: body('Attendance', { sectorId: ids.sector, serviceId: ids.service, shiftId: ids.shift, attendanceDate: '2026-01-15' }) });

surveyOperation('/attendances/{attendanceId}', 'delete', 'surveys', 'Remover atendimento da pesquisa',
  'Recomendado antes de iniciar a pesquisa. Se o atendimento não pertencer à pesquisa ou não existir, retorna 204 sem remover registros. Referências de perguntas já geradas podem impedir a exclusão e resultar em 500.',
  { 204: noContent },
  { operationId: 'removeAttendance', parameters: [idParameter('attendanceId', ids.attendance, 'ID retornado ao adicionar o atendimento.')] });

surveyOperation('/start', 'post', 'surveys', 'Iniciar preenchimento da pesquisa',
  'Sem corpo obrigatório. Gera as perguntas aplicáveis a partir dos atendimentos cadastrados, conserva o texto e o tipo usados na pesquisa e marca o estado como in_progress.',
  { 200: response('Pesquisa iniciada.', noData, null, 'Pesquisa iniciada.') },
  { operationId: 'startSurvey' });

surveyOperation('/questions', 'get', 'questions', 'Listar perguntas da pesquisa',
  'Use o id de cada item para responder. O limite padrão é 20, limitado a 30; offset menor que zero vira zero. Use inteiros não negativos, pois não há validação de todos os formatos pelo servidor.',
  { 200: response('Perguntas e opções da pesquisa.', list(ref('SurveyQuestion')), [question]) },
  { operationId: 'listSurveyQuestions', parameters: [
    integerQuery('limit', 20, 'Quantidade máxima de perguntas.', 1, 30),
    integerQuery('offset', 0, 'Quantidade de perguntas a pular.', 0),
  ] });

surveyOperation('/next-question', 'get', 'questions', 'Consultar próxima pergunta sem resposta',
  'Retorna um único item com campos em snake_case e sem a lista de opções. Quando não há perguntas pendentes, data é null.',
  { 200: response('Próxima pergunta ou null.', { ...schemas.NextSurveyQuestion, nullable: true }, {
    id: question.id, attendance_id: question.attendanceId, prompt_snapshot: question.text,
    type_snapshot: question.type, required_snapshot: question.required, display_order: question.displayOrder,
  }) },
  { operationId: 'getNextSurveyQuestion' });

surveyOperation('/answers/{surveyQuestionId}', 'put', 'answers', 'Salvar resposta a uma pergunta',
  'Salva ou substitui a resposta. Use value para uma nota numérica e textValue para texto. Perguntas obrigatórias exigem value não nulo ou textValue não vazio. O tipo, a escala e a seleção de opções não têm validação específica no servidor.',
  { 200: response('Resposta registrada.', noData, null, 'Resposta salva.') },
  {
    operationId: 'saveSurveyAnswer',
    parameters: [idParameter('surveyQuestionId', ids.question, 'ID da pergunta gerada para esta pesquisa.')],
    requestBody: body('Answer', { value: 5 }),
    errorResponses: {
      404: error('Pesquisa, credencial ou pergunta não encontrada para essa pesquisa.', 'Pergunta não encontrada.'),
      422: error('Pergunta obrigatória sem resposta.', 'Resposta obrigatória.'),
    },
  });

surveyOperation('/feedback', 'put', 'feedback', 'Salvar elogios e sugestões',
  'Salva ou substitui o registro de feedback da pesquisa. Todos os campos são opcionais; campos omitidos ou vazios passam a null. O front-end envia comentários livres em suggestion.',
  { 200: response('Feedback salvo.', noData, null, 'Feedback salvo.') },
  { operationId: 'saveSurveyFeedback', requestBody: body('Feedback', { positive: 'A recepção fictícia foi organizada.', negative: 'A sinalização fictícia pode melhorar.', praise: 'Equipe de demonstração atenciosa.', suggestion: 'Incluir uma placa fictícia de orientação.' }) });

surveyOperation('/return-request', 'put', 'returns', 'Registrar pedido de retorno',
  'O contato é obrigatório. Salva ou substitui os dados do pedido de retorno. A operação apenas registra o pedido e não envia e-mail nem WhatsApp.',
  {
    200: response('Pedido registrado.', noData, null, 'Solicitação de retorno registrada.'),
    422: error('Contato ausente ou vazio.', 'Contato é obrigatório para solicitar retorno.'),
  }, { operationId: 'saveReturnRequest', requestBody: body('ReturnRequest', { name: 'Pessoa Fictícia', contact: 'retorno@example.invalid', preferredChannel: 'email', message: 'Pedido de demonstração.' }) });

surveyOperation('/complete', 'post', 'answers', 'Finalizar pesquisa de satisfação',
  'Exige respostas para todas as perguntas obrigatórias. A nota geral, se informada, deve ser um inteiro de 0 a 10. A primeira conclusão armazena o resultado e emite dashboard:update. Repetir a conclusão de uma pesquisa já concluída não substitui a nota nem emite outro evento, desde que a pesquisa permaneça concluída.',
  {
    200: response('Pesquisa finalizada.', noData, null, 'Pesquisa finalizada.'),
    422: error('Nota geral inválida ou perguntas obrigatórias pendentes.', 'Existem perguntas obrigatórias sem resposta.'),
  }, { operationId: 'completeSurvey', requestBody: body('Completion', { overallRating: 9 }, false) });

add('/api/v1/admin/dashboard/overview', 'get', 'dashboard', 'Consultar resumo do dashboard',
  'Exige JWT Bearer com dashboard.read. Mostra totais globais, sem filtros de período. A média usa as notas das respostas individuais, e não a nota geral de encerramento.',
  {
    200: response('Resumo dos indicadores.', ref('DashboardOverview'), { surveys: { total: 2, completed: '1' }, answers: 5, averageRating: '4.60' }),
    401: missingJwt, 403: forbidden, 500: failure,
  }, { operationId: 'getDashboardOverview', security: bearer });

const dimensions = {
  sectors: 'setores', services: 'serviços', teams: 'equipes', stages: 'etapas', shifts: 'turnos',
};
for (const [key, label] of Object.entries(dimensions)) {
  add('/api/v1/admin/dashboard/' + key, 'get', 'dashboard', 'Consultar indicadores por ' + label,
    'Exige JWT Bearer com dashboard.read. Nesta versão, a rota está registrada com um caminho fixo e o controlador espera req.params.dimension. A operação retorna 404 mesmo para um administrador autorizado.',
    { 401: missingJwt, 403: forbidden, 404: error('Dimensão indisponível nesta versão.', 'Indicador inválido.') },
    { operationId: 'getDashboard_' + key, security: bearer });
}

const resources = {
  sectors: { label: 'setores', name: 'Setor Fictício', slug: 'setor-ficticio' },
  services: { label: 'serviços', name: 'Serviço Fictício', slug: 'servico-ficticio' },
  stages: { label: 'etapas', name: 'Etapa Fictícia' },
  teams: { label: 'equipes', name: 'Equipe Fictícia' },
  shifts: { label: 'turnos', name: 'Turno Fictício' },
  users: { label: 'usuários' }, roles: { label: 'papéis' }, permissions: { label: 'permissões' },
};
for (const [key, { label, name, slug }] of Object.entries(resources)) {
  const group = name ? 'admin' : 'users';
  const path = '/api/v1/admin/' + key;
  add(path, 'get', group, 'Listar ' + label + ' na administração',
    'Exige JWT Bearer com users.manage. A rota fixa não fornece req.params.resource ao controlador e retorna 404. O código de paginação por page e limit não chega a ser executado.',
    { 401: missingJwt, 403: forbidden, 404: error('Listagem indisponível nesta versão.', 'Recurso inválido.') },
    { operationId: 'listAdmin_' + key, security: bearer, parameters: [
      integerQuery('page', 1, 'Página prevista no controlador. O parâmetro não chega a ser aplicado nesta versão.', 1),
      integerQuery('limit', 20, 'Tamanho previsto da página. O controlador prevê máximo de 100.', 1, 100),
    ] });
  add(path, 'post', group, 'Solicitar criação administrativa para ' + label,
    'Exige JWT Bearer com users.manage. ' + (name
      ? 'A rota fixa não fornece req.params.resource ao controlador. O corpo descrito corresponde aos campos previstos no controlador; a operação retorna 400 antes de validar os campos ou gravar dados.'
      : 'O controlador não permite criação genérica deste recurso. A operação retorna 400 sem validar nem gravar o corpo.'),
    { 400: error('Criação genérica indisponível.', 'Recurso não disponível para criação genérica.'), 401: missingJwt, 403: forbidden },
    {
      operationId: 'createAdmin_' + key, security: bearer,
      ...(name && { requestBody: body(slug ? 'AdminCatalogInputWithSlug' : 'AdminCatalogInput', { name, description: 'Registro de demonstração.', ...(slug && { slug }) }, false) }),
    });
}

add('/api/v1/tvwall/overview', 'get', 'tv', 'Consultar resumo do painel de TV',
  'Acesso público quando TVWALL_ACCESS_TOKEN não está configurado. Quando configurado, use o esquema tvwallToken no Authorize. Calcula média das respostas numéricas, sem limite mínimo neste endpoint.',
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
    version: '1.0.0',
    description: [
      'API de pesquisa de satisfação hospitalar. Use o Swagger aberto no servidor que pretende testar.',
      'Para a equipe: execute **Iniciar sessão** com sua conta de demonstração. Em **Authorize**, cole somente o accessToken no esquema bearerAuth. A permissão dashboard.read é exigida no dashboard. O papel de setor do seed não recebe dashboard.read nem users.manage.',
      'Para uma pessoa respondente: crie uma pesquisa, copie o id e autorize o esquema surveyToken com o valor retornado. Consulte setores, serviços e turnos, adicione um atendimento, inicie a pesquisa, liste as perguntas, responda e finalize.',
      'Os exemplos usam identificadores fictícios. Durante os testes, substitua os IDs pelos retornados pela API e informe somente dados de demonstração.',
      'Eventos Socket.IO e lacunas da implementação estão descritos no guia de integração do repositório de demonstração.',
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
