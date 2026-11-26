export const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
export const list = (items) => ({ type: 'array', items });
export const object = (properties, required = []) => ({
  type: 'object',
  properties,
  ...(required.length && { required }),
});

const string = { type: 'string' };
export const uuid = { type: 'string', format: 'uuid' };
const email = { type: 'string', format: 'email' };
const timestamp = { type: 'string', format: 'date-time' };
const flag = { type: 'integer', enum: [0, 1] };
const count = { type: 'integer', minimum: 0 };
const nullable = (schema) => ({ ...schema, nullable: true });
const average = nullable({ type: 'string', description: 'Valor DECIMAL serializado pelo MySQL como texto.' });
const named = { id: uuid, name: string };
const questionType = { type: 'string', enum: ['rating', 'text', 'single_choice', 'multiple_choice'] };
const questionKeys = { id: uuid, attendanceId: nullable(uuid), text: string, type: questionType, required: flag, displayOrder: count };
const token = { type: 'string', description: 'Valor retornado pela API. Os exemplos contêm marcadores fictícios.' };
const catalogInput = { name: { ...string, minLength: 1, maxLength: 120 }, description: nullable({ ...string, maxLength: 2000 }) };
const catalogSlug = nullable({ ...string, minLength: 1, maxLength: 140 });
const catalogBase = { ...named, created_at: nullable(timestamp) };
const catalogRecord = { ...catalogBase, description: nullable(string), is_active: nullable(flag) };

export const schemas = {
  Error: object({ success: { type: 'boolean', enum: [false] }, message: string, errors: list(object({ field: string, message: string }, ['field', 'message'])) }, ['success', 'message']),
  Health: object({ status: { type: 'string', enum: ['ok'] } }, ['status']),
  Login: object({ email: { ...email, maxLength: 255 }, password: { type: 'string', minLength: 8, format: 'password', description: 'Até 72 bytes em UTF-8.' } }, ['email', 'password']),
  Refresh: object({ refreshToken: { ...token, minLength: 20, maxLength: 4096 } }, ['refreshToken']),
  User: object({
    ...named, email, role: { type: 'string', example: 'userSetor' }, is_active: flag,
  }, ['id', 'name', 'email', 'role']),
  Identity: {
    allOf: [ref('User'), object({ permissions: list(string) }, ['permissions'])],
  },
  Session: object({ user: ref('User'), accessToken: token, refreshToken: token }, ['user', 'accessToken', 'refreshToken']),
  BrowserSession: object({ user: ref('User'), accessToken: token }, ['user', 'accessToken']),
  CatalogItem: object({ ...named, slug: nullable(string), description: nullable(string) }, ['id', 'name', 'slug', 'description']),
  Shift: object(named, ['id', 'name']),
  ServiceStage: object({
    ...named, display_order: count, is_required: nullable(flag), team_id: nullable(uuid),
  }, ['id', 'name', 'display_order', 'is_required', 'team_id']),
  Id: object({ id: uuid }, ['id']),
  SurveyAccess: object({
    id: uuid, surveyToken: { ...token, pattern: '^[0-9a-f]{64}$' },
  }, ['id', 'surveyToken']),
  Survey: object({
    id: uuid,
    status: { type: 'string', enum: ['draft', 'in_progress', 'completed', 'expired'] },
    createdAt: nullable(timestamp),
    completedAt: nullable(timestamp),
  }, ['id', 'status', 'createdAt', 'completedAt']),
  Attendance: object({
    sectorId: uuid, serviceId: uuid, shiftId: uuid, attendanceDate: nullable({ type: 'string', format: 'date' }),
    attendanceKey: { ...uuid, description: 'UUID do dispositivo para repetir o mesmo cadastro sem duplicá-lo.' },
  }, ['sectorId', 'serviceId', 'shiftId']),
  SurveyQuestion: object({
    ...questionKeys, stage: nullable(string), options: list(object({ value: string, label: string }, ['value', 'label'])),
  }, Object.keys(questionKeys)),
  NextSurveyQuestion: object({
    id: uuid, attendance_id: nullable(uuid), prompt_snapshot: string, type_snapshot: questionType,
    required_snapshot: flag, display_order: count,
  }, ['id', 'attendance_id', 'prompt_snapshot', 'type_snapshot', 'required_snapshot', 'display_order']),
  Answer: object({
    value: nullable({ type: 'integer', minimum: 1, maximum: 5, description: 'Nota da pergunta do tipo rating.' }),
    textValue: nullable({ ...string, maxLength: 2000, description: 'Texto livre ou valor de uma opção de escolha única.' }),
    optionValues: { type: 'array', items: { ...string, minLength: 1, maxLength: 100 }, minItems: 1, maxItems: 10, uniqueItems: true },
  }),
  Feedback: object({
    positive: nullable(string), negative: nullable(string), praise: nullable(string), suggestion: nullable(string),
  }),
  ReturnRequest: object({
    name: nullable({ ...string, maxLength: 150 }),
    contact: { ...string, minLength: 1, maxLength: 255 },
    preferredChannel: nullable({ ...string, maxLength: 30 }),
    message: nullable({ ...string, maxLength: 500 }),
  }, ['contact']),
  Completion: object({ overallRating: { type: 'integer', minimum: 0, maximum: 10 } }, ['overallRating']),
  DashboardOverview: object({
    surveys: object({ total: count, completed: nullable({ type: 'string' }) }, ['total', 'completed']),
    answers: count,
    averageRating: average,
    positiveAnswers: count,
    ratedAnswers: count,
    total: count,
  }, ['surveys', 'answers', 'averageRating', 'positiveAnswers', 'ratedAnswers', 'total']),
  Dimension: object({ label: string, evaluations: count, responses: count, averageRating: average }, ['label', 'evaluations', 'responses', 'averageRating']),
  RatingCount: object({ score: { type: 'number' }, responses: count }, ['score', 'responses']),
  AnalysisOptions: object({
    sectors: list(ref('Shift')),
    services: list(object({ ...named, sectorId: uuid }, ['id', 'name', 'sectorId'])),
    stages: list(ref('Shift')),
  }, ['sectors', 'services', 'stages']),
  EvaluationRow: object({
    id: uuid,
    completedDate: nullable({ type: 'string', format: 'date' }),
    overallRating: nullable({ type: 'integer', minimum: 0, maximum: 10 }),
    attendances: nullable(string), averageRating: average, answers: count,
  }, ['id', 'completedDate', 'overallRating', 'attendances', 'averageRating', 'answers']),
  EvaluationDetail: object({
    id: uuid,
    completedDate: nullable({ type: 'string', format: 'date' }),
    overallRating: nullable({ type: 'integer', minimum: 0, maximum: 10 }),
    attendances: list(object({ sector: string, service: string, shift: string }, ['sector', 'service', 'shift'])),
    answers: list(object({
      id: uuid, prompt: string, type: questionType, rating: average, stage: nullable(string), service: string,
      hasText: { type: 'boolean' }, options: list(string),
    }, ['id', 'prompt', 'type', 'rating', 'stage', 'service', 'hasText', 'options'])),
  }, ['id', 'completedDate', 'overallRating', 'attendances', 'answers']),
  FeedbackEntry: object({
    id: string, kind: { type: 'string', enum: ['praise', 'positive', 'suggestion', 'negative'] },
    content: string, receivedDate: nullable({ type: 'string', format: 'date' }),
  }, ['id', 'kind', 'content', 'receivedDate']),
  ReturnStatusInput: object({ status: { type: 'string', enum: ['open', 'in_progress', 'closed'] } }, ['status']),
  ReturnItem: object({
    id: uuid, status: { type: 'string', enum: ['open', 'in_progress', 'closed'] }, createdAt: nullable(timestamp),
  }, ['id', 'status', 'createdAt']),
  ReturnContact: object({
    id: uuid, status: { type: 'string', enum: ['open', 'in_progress', 'closed'] },
    name: nullable(string), contact: string, preferredChannel: nullable(string), message: nullable(string),
  }, ['id', 'status', 'name', 'contact', 'preferredChannel', 'message']),
  ReturnStatusUpdate: { allOf: [ref('Id'), ref('ReturnStatusInput')] },
  InvitationInput: object({
    channel: { type: 'string', enum: ['manual', 'email', 'whatsapp'], default: 'manual' },
    hours: { type: 'integer', minimum: 1, maximum: 336, default: 72 },
  }),
  InvitationRow: object({
    id: uuid, channel: { type: 'string', enum: ['manual', 'email', 'whatsapp'] },
    status: { type: 'string', enum: ['active', 'used', 'expired'] },
    expiresAt: timestamp, createdAt: nullable(timestamp), usedAt: nullable(timestamp),
    lastDelivery: nullable(string),
  }, ['id', 'channel', 'status', 'expiresAt', 'createdAt', 'usedAt', 'lastDelivery']),
  InvitationNew: object({
    id: uuid, token: { ...string, pattern: '^[A-Za-z0-9_-]{43}$' }, link: { ...string, format: 'uri' }, expiresAt: timestamp,
    channel: { type: 'string', enum: ['manual', 'email', 'whatsapp'] }, status: { type: 'string', enum: ['active'] },
  }, ['id', 'token', 'link', 'expiresAt', 'channel', 'status']),
  InvitationRedeem: object({
    token: { ...string, pattern: '^[A-Za-z0-9_-]{43}$' }, nonce: { ...string, pattern: '^[a-f0-9]{64}$' },
  }, ['token', 'nonce']),
  CommunicationModes: object({
    email: { type: 'string', enum: ['demo', 'live', 'disabled'] },
    whatsapp: { type: 'string', enum: ['demo', 'live', 'disabled'] },
  }, ['email', 'whatsapp']),
  InvitationCommunication: object({
    token: { ...string, pattern: '^[A-Za-z0-9_-]{43}$' }, deliveryId: uuid, contact: { ...string, maxLength: 255 },
    channel: { type: 'string', enum: ['email', 'whatsapp'] },
  }, ['token', 'deliveryId', 'contact', 'channel']),
  CommunicationResult: object({
    status: { type: 'string', enum: ['demo', 'accepted'] }, channel: { type: 'string', enum: ['email', 'whatsapp'] },
  }, ['status', 'channel']),
  UserNotification: object({
    id: uuid, type: string, title: string, message: string, href: string, createdAt: timestamp, readAt: nullable(timestamp),
  }, ['id', 'type', 'title', 'message', 'href', 'createdAt', 'readAt']),
  Notifications: object({ unread: count, items: list(ref('UserNotification')) }, ['unread', 'items']),
  NotificationUpdates: object({ updated: count }, ['updated']),
  Pagination: object({ page: count, limit: count, total: count, totalPages: count }, ['page', 'limit', 'total', 'totalPages']),
  StatusInput: object({ active: { type: 'boolean' } }, ['active']),
  CatalogStatus: object({ id: uuid, active: { type: 'boolean' } }, ['id', 'active']),
  InputSector: object({ ...catalogInput, slug: catalogSlug }, ['name']),
  InputService: object({ ...catalogInput, slug: catalogSlug, sector_id: nullable(uuid) }, ['name']),
  InputStage: object(catalogInput, ['name']),
  InputTeam: object({ ...catalogInput, sector_id: nullable(uuid), service_id: nullable(uuid) }, ['name']),
  InputShift: object({
    ...catalogInput, name: { ...string, minLength: 1, maxLength: 50 },
    display_order: { ...count, maximum: 2147483647, default: 0 },
  }, ['name']),
  AdminSector: object({ ...catalogRecord, slug: nullable(string), updated_at: nullable(timestamp) }),
  AdminService: object({ ...catalogRecord, slug: nullable(string), sector_id: nullable(uuid), updated_at: nullable(timestamp) }),
  AdminStage: object(catalogRecord),
  AdminTeam: object({ ...catalogRecord, sector_id: nullable(uuid), service_id: nullable(uuid) }),
  AdminShift: object({ ...catalogRecord, display_order: nullable(count) }),
  AdminUser: object({ ...catalogBase, role_id: uuid, email, is_active: flag, updated_at: nullable(timestamp) }),
  AdminRole: object(catalogBase),
  AdminPermission: object({ ...catalogBase, description: nullable(string) }),
  QuestionContent: object({
    prompt: { ...string, minLength: 10, maxLength: 500 },
    type: questionType,
    required: { type: 'boolean', default: false },
    options: { type: 'array', items: { ...string, minLength: 1, maxLength: 100 }, minItems: 2, maxItems: 10, uniqueItems: true },
  }, ['prompt', 'type']),
  QuestionInput: { allOf: [ref('QuestionContent'), object({ serviceId: uuid }, ['serviceId'])] },
  QuestionEdit: {
    allOf: [ref('QuestionContent'), object({
      version: { type: 'integer', minimum: 1 }, changeReason: { ...string, minLength: 3, maxLength: 500 },
    }, ['version', 'changeReason'])],
  },
  QuestionService: object({ ...named, sectorName: string }, ['id', 'name', 'sectorName']),
  QuestionState: object({ id: uuid, status: { type: 'string', enum: ['pending', 'approved', 'active', 'inactive', 'rejected'] } }, ['id', 'status']),
  QuestionVersion: { allOf: [ref('QuestionState'), object({ version: { type: 'integer', minimum: 1 } }, ['version'])] },
  QuestionEntry: {
    allOf: [ref('QuestionVersion'), object({
      prompt: string, type: questionType, required: nullable(flag), createdAt: timestamp, services: nullable(string), canEdit: { type: 'boolean' },
    }, ['prompt', 'type', 'required', 'createdAt', 'services', 'canEdit'])],
  },
  QuestionDetail: { allOf: [ref('QuestionEntry'), object({ options: list(string) }, ['options'])] },
  QuestionReview: object({ justification: { ...string, minLength: 3, maxLength: 500 } }, ['justification']),
  TvOverview: object({ responses: count, averageRating: average }, ['responses', 'averageRating']),
  TvSector: {
    allOf: [ref('TvOverview'), object({ name: string }, ['name'])],
  },
};
