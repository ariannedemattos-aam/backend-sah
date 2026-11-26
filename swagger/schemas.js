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

export const schemas = {
  Error: object({ success: { type: 'boolean', enum: [false] }, message: string, errors: list(object({ field: string, message: string }, ['field', 'message'])) }, ['success', 'message']),
  Health: object({ status: { type: 'string', enum: ['ok'] } }, ['status']),
  Login: object({ email, password: { type: 'string', minLength: 8, format: 'password' } }, ['email', 'password']),
  Refresh: object({ refreshToken: { ...token, minLength: 20 } }, ['refreshToken']),
  User: object({
    ...named, email, role: { type: 'string', example: 'userSetor' }, is_active: flag,
  }, ['id', 'name', 'email', 'role']),
  Identity: {
    allOf: [ref('User'), object({ permissions: list(string) }, ['permissions'])],
  },
  Session: object({ user: ref('User'), accessToken: token, refreshToken: token }, ['user', 'accessToken', 'refreshToken']),
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
  }, ['sectorId', 'serviceId', 'shiftId']),
  SurveyQuestion: object({
    ...questionKeys, options: list(object({ value: string, label: string }, ['value', 'label'])),
  }, Object.keys(questionKeys)),
  NextSurveyQuestion: object({
    id: uuid, attendance_id: nullable(uuid), prompt_snapshot: string, type_snapshot: questionType,
    required_snapshot: flag, display_order: count,
  }, ['id', 'attendance_id', 'prompt_snapshot', 'type_snapshot', 'required_snapshot', 'display_order']),
  Answer: object({
    value: nullable({ type: 'number', description: 'Nota armazenada em DECIMAL(5,2). O servidor não valida a escala por tipo.' }),
    textValue: nullable(string),
  }),
  Feedback: object({
    positive: nullable(string), negative: nullable(string), praise: nullable(string), suggestion: nullable(string),
  }),
  ReturnRequest: object({
    name: nullable({ ...string, maxLength: 150 }),
    contact: { ...string, minLength: 1, maxLength: 255 },
    preferredChannel: nullable({ ...string, maxLength: 30 }),
    message: nullable(string),
  }, ['contact']),
  Completion: object({ overallRating: { type: 'integer', minimum: 0, maximum: 10 } }),
  DashboardOverview: object({
    surveys: object({ total: count, completed: nullable({ type: 'string' }) }, ['total', 'completed']),
    answers: count,
    averageRating: average,
  }, ['surveys', 'answers', 'averageRating']),
  AdminCatalogInput: object({ name: { ...string, minLength: 1 }, description: nullable(string) }, ['name']),
  AdminCatalogInputWithSlug: {
    allOf: [ref('AdminCatalogInput'), object({ slug: nullable(string) })],
  },
  TvOverview: object({ responses: count, averageRating: average }, ['responses', 'averageRating']),
  TvSector: {
    allOf: [ref('TvOverview'), object({ name: string }, ['name'])],
  },
};
