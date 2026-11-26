import { AppError } from '../utils/errors.js';

export function matchesCondition(parent, expected) {
  if (!parent || !parent.visible) return false;
  if (parent.type === 'rating') return parent.rating != null && String(Number(parent.rating)) === expected;
  if (parent.type === 'single_choice') return parent.text === expected;
  if (parent.type !== 'multiple_choice' || !parent.text) return false;
  try { return JSON.parse(parent.text).includes(expected); }
  catch { return false; }
}

export function evaluateRules(rows) {
  const processed = new Map();
  for (const row of rows) {
    processed.set(row.id, { ...row, visible: row.expected == null || matchesCondition(processed.get(row.parent), row.expected) });
  }
  return [...processed.values()];
}

export async function updateVisibility(connection, surveyId) {
  const [rows] = await connection.execute(
    'SELECT q.id,q.type_snapshot type,c.prerequisite_id parent,c.expected_value expected,c.visible current, '
      + 'a.rating_value rating,a.text_value text FROM survey_questions q JOIN survey_question_context c ON c.question_id=q.id '
      + 'LEFT JOIN answers a ON a.survey_question_id=q.id WHERE q.survey_id=? ORDER BY q.display_order,q.id', [surveyId],
  );
  const changes = evaluateRules(rows).filter(row => row.visible !== Boolean(row.current));
  for (const visible of [false, true]) {
    const ids = changes.filter(row => row.visible === visible).map(row => row.id);
    if (ids.length) await connection.execute('UPDATE survey_question_context SET visible=? WHERE question_id IN ('
      + ids.map(() => '?').join(',') + ')', [visible, ...ids]);
  }
}

export async function snapshotContext(connection, surveyId) {
  await connection.execute(
    'INSERT INTO survey_question_context(question_id,stage_id,stage_name,prerequisite_id,expected_value,visible) '
      + 'SELECT q.id,p.stage_id,st.name,(SELECT MIN(prev.id) FROM survey_questions prev WHERE prev.survey_id=q.survey_id '
      + 'AND prev.attendance_id=q.attendance_id AND prev.question_id=r.prerequisite_id AND prev.display_order<q.display_order),'
      + 'r.expected_value,r.version_id IS NULL '
      + 'FROM survey_questions q JOIN questions p ON p.id=q.question_id LEFT JOIN stages st ON st.id=p.stage_id '
      + 'LEFT JOIN question_version_rules r ON r.version_id=q.question_version_id WHERE q.survey_id=?', [surveyId],
  );
}

export async function validStage(connection, serviceId, stageId) {
  if (!stageId) return;
  const [[stage]] = await connection.execute(
    'SELECT st.id FROM service_stages ss JOIN stages st ON st.id=ss.stage_id AND st.is_active=1 WHERE ss.service_id=? AND ss.stage_id=? AND ss.is_active=1',
    [serviceId, stageId],
  );
  if (!stage) throw new AppError('Etapa indisponível neste serviço.', 422);
}

export async function storeRule(connection, versionId, serviceId, order, stageId, rule) {
  if (!rule) return;
  const [[source]] = await connection.execute(
    'SELECT q.type,q.stage_id stageId,v.id versionId FROM question_assignments a JOIN questions q ON q.id=a.question_id '
      + 'JOIN question_versions v ON v.question_id=q.id AND v.version=q.current_version '
      + "WHERE a.service_id=? AND a.question_id=? AND a.is_active=1 AND q.status='active' AND a.display_order<? LIMIT 1",
    [serviceId, rule.questionId, order],
  );
  if (!source || (source.stageId && source.stageId !== stageId)) {
    throw new AppError('Escolha uma pergunta anterior ativa, geral ou da mesma etapa, neste serviço.', 422);
  }
  const [[option]] = await connection.execute(
    'SELECT 1 AS allowed FROM question_options WHERE question_version_id=? AND value=? AND BINARY value=BINARY ? LIMIT 1',
    [source.versionId, rule.value, rule.value],
  );
  if (!option) throw new AppError('A resposta escolhida não existe na pergunta anterior.', 422);
  await connection.execute('INSERT INTO question_version_rules(version_id,prerequisite_id,expected_value) VALUES (?,?,?)',
    [versionId, rule.questionId, rule.value]);
}
