import { z } from 'zod';

const identifier = z.string().uuid();
export const idSchema = identifier;
export const feedbackTypes = {
  praise: { column: 'praise_text', label: 'Elogio' },
  positive: { column: 'positive_text', label: 'Ponto positivo' },
  suggestion: { column: 'suggestion_text', label: 'Sugestão' },
  negative: { column: 'negative_text', label: 'Ponto de melhoria' },
};
const reportFilters = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  sectorId: identifier.optional(),
  serviceId: identifier.optional(),
  stageId: identifier.optional(),
  score: z.coerce.number().int().min(1).max(5).optional(),
  search: z.string().trim().max(120).default(''),
});
const pagination = {
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};
const validPeriod = (value, context) => {
  if (value.from && value.to && value.from > value.to) {
    context.addIssue({ code: 'custom', path: ['to'], message: 'A data final deve ser igual ou posterior à inicial.' });
  }
};
export const filtersSchema = reportFilters.superRefine(validPeriod);
export const evaluationListSchema = reportFilters.extend({
  ...pagination,
  sort: z.enum(['recent', 'oldest', 'highest', 'lowest']).default('recent'),
}).superRefine(validPeriod);
export const feedbackListSchema = reportFilters.extend({
  ...pagination,
  kind: z.enum(Object.keys(feedbackTypes)).optional(),
  sort: z.enum(['recent', 'oldest']).default('recent'),
}).superRefine(validPeriod);
export const returnStatuses = ['open', 'in_progress', 'closed'];
export const returnListSchema = z.object({
  ...pagination,
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  status: z.enum(returnStatuses).optional(),
}).superRefine(validPeriod);

export function periodConditions(filters, column, conditions, params) {
  if (filters.from) {
    conditions.push(column + '>=?');
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push(column + '<DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(filters.to);
  }
}

export const isSector = (user) => ['userSetor', 'UserSetor'].includes(user?.role);

export function attendanceFilter(filters, user) {
  const conditions = [], params = [];
  if (filters.sectorId) { conditions.push('a.sector_id=?'); params.push(filters.sectorId); }
  if (filters.serviceId) { conditions.push('a.service_id=?'); params.push(filters.serviceId); }
  if (isSector(user)) {
    conditions.push('EXISTS (SELECT 1 FROM user_sectors us WHERE us.sector_id=a.sector_id AND us.user_id=?)');
    params.push(user.sub);
  }
  return { conditions, params };
}

function ratingFilter(filters) {
  const conditions = [], params = [];
  if (filters.stageId) { conditions.push('qq.stage_id=?'); params.push(filters.stageId); }
  if (filters.score !== undefined) { conditions.push('x.rating_value=?'); params.push(filters.score); }
  return { conditions, params };
}

const answerJoin = 'JOIN survey_questions q ON q.attendance_id=a.id JOIN answers x ON x.survey_question_id=q.id LEFT JOIN questions qq ON qq.id=q.question_id';
const catalogJoin = ' JOIN sectors se ON se.id=a.sector_id JOIN services sv ON sv.id=a.service_id';
const and = (conditions) => conditions.length ? ' AND ' + conditions.join(' AND ') : '';

export function selections(filters, user, { exclusive = false } = {}) {
  const attendance = attendanceFilter(filters, user);
  const rating = ratingFilter(filters);
  const conditions = ["s.status='completed'"], params = [];
  periodConditions(filters, 's.completed_at', conditions, params);
  if (attendance.conditions.length || rating.conditions.length) {
    conditions.push('EXISTS (SELECT 1 FROM survey_attendances a '
      + (rating.conditions.length ? answerJoin : '')
      + ' WHERE a.survey_id=s.id' + and([...attendance.conditions, ...rating.conditions]) + ')');
    params.push(...attendance.params, ...rating.params);
  }
  if (filters.search) {
    conditions.push('(LOCATE(?,s.id)>0 OR EXISTS (SELECT 1 FROM survey_attendances a' + catalogJoin
      + ' WHERE a.survey_id=s.id AND (LOCATE(?,se.name)>0 OR LOCATE(?,sv.name)>0)' + and(attendance.conditions) + '))');
    params.push(filters.search, filters.search, filters.search, ...attendance.params);
  }
  if (exclusive && isSector(user)) {
    conditions.push('NOT EXISTS (SELECT 1 FROM survey_attendances oa WHERE oa.survey_id=s.id '
      + 'AND NOT EXISTS (SELECT 1 FROM user_sectors us WHERE us.sector_id=oa.sector_id AND us.user_id=?))');
    params.push(user.sub);
  }
  const cte = 'WITH selected AS (SELECT s.id,s.completed_at,s.overall_rating FROM surveys s WHERE ' + conditions.join(' AND ') + ')';
  const answerContext = ' FROM selected m JOIN survey_attendances a ON a.survey_id=m.id ' + answerJoin;
  const answerConditions = [...attendance.conditions, ...rating.conditions];
  return {
    cte, params, attendance, rating, answerContext, answerConditions,
    answerParams: [...params, ...attendance.params, ...rating.params],
  };
}

export const dimensions = {
  sectors: { column: 'se', label: 'Setores', join: 'JOIN sectors se ON se.id=a.sector_id' },
  services: { column: 'sv', label: 'Serviços', join: 'JOIN services sv ON sv.id=a.service_id' },
  teams: { column: 'tm', label: 'Equipes', join: 'JOIN teams tm ON tm.id=qq.team_id' },
  stages: { column: 'st', label: 'Etapas', join: 'JOIN stages st ON st.id=qq.stage_id' },
  shifts: { column: 'sh', label: 'Turnos', join: 'JOIN shifts sh ON sh.id=a.shift_id' },
};
export const where = (conditions) => conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';

export async function summary(connection, selection) {
  const { cte, answerContext, answerConditions, answerParams } = selection;
  const aggregate = await connection.execute(cte + ' SELECT (SELECT COUNT(*) FROM selected) total, COUNT(*) answers, '
    + 'ROUND(AVG(x.rating_value),2) averageRating, COUNT(CASE WHEN x.rating_value>=4 THEN 1 END) positiveAnswers, COUNT(x.rating_value) ratedAnswers'
    + answerContext + where(answerConditions), answerParams);
  const [[data]] = aggregate;
  return { ...data, surveys: { total: data.total, completed: String(data.total) } };
}

export async function dimension(connection, selection, key) {
  const d = dimensions[key];
  const [rows] = await connection.execute(
    selection.cte + ' SELECT ' + d.column + '.name label, COUNT(DISTINCT m.id) evaluations, COUNT(x.id) responses, '
      + 'ROUND(AVG(x.rating_value),2) averageRating' + selection.answerContext + ' ' + d.join
      + where(selection.answerConditions) + ' GROUP BY ' + d.column + '.id,' + d.column + '.name ORDER BY responses DESC,label',
    selection.answerParams,
  );
  return rows;
}

export async function distribution(connection, selection) {
  const [rows] = await connection.execute(
    selection.cte + ' SELECT x.rating_value score,COUNT(*) responses' + selection.answerContext
      + where([...selection.answerConditions, 'x.rating_value IS NOT NULL'])
      + ' GROUP BY x.rating_value ORDER BY x.rating_value',
    selection.answerParams,
  );
  const counts = new Map(rows.map(row => [Number(row.score), row.responses]));
  const declared = [1, 2, 3, 4, 5];
  return [...declared, ...Array.from(counts.keys()).filter(score => !declared.includes(score))]
    .map(score => ({ score, responses: counts.get(score) || 0 }));
}

// Only fixed labels and counts are ever sent to report builders.
export async function feedbackSummary(connection, selection) {
  const columns = Object.entries(feedbackTypes).map(([kind, { column }]) =>
    'COUNT(CASE WHEN NULLIF(TRIM(f.' + column + "), '') IS NOT NULL THEN 1 END) AS " + kind);
  const [[data]] = await connection.execute(
    selection.cte + ' SELECT ' + columns.join(',') + ' FROM selected m JOIN feedback f ON f.survey_id=m.id',
    selection.params,
  );
  return Object.entries(feedbackTypes).map(([kind, { label }]) => ({ kind, label, count: data[kind] }));
}

export function redactFeedback(content) {
  return content
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[e-mail oculto]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[documento oculto]')
    .replace(/(?:\+?55[\s.-]*)?(?:\(\d{2}\)[\s.-]*|\b\d{2}[\s.-]*)?\b\d{4,5}[-\s.]?\d{4}\b/g, '[telefone oculto]');
}
