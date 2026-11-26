import { readFile } from 'node:fs/promises';

const indexes = [
  ['surveys', 'surveys_by_status_completion', 'status,completed_at,id'],
  ['return_requests', 'returns_by_status_date', 'status,created_at,id'],
  ['survey_questions', 'survey_questions_by_order', 'survey_id,display_order,id'],
  ['user_notifications', 'notifications_by_user_date', 'user_id,created_at,id'],
  ['notification_logs', 'logs_by_invite_date', 'invitation_id,created_at,id'],
  ['invitations', 'invitations_by_usage_validity', 'used_at,expires_at'],
  ['survey_attendances', 'attendance_survey_identity', 'id,survey_id', true],
  ['question_versions', 'version_question_identity', 'id,question_id', true],
];
const foreignKeys = [
  ['snapshot_attendance_survey_fk', 'attendance_id,survey_id', 'survey_attendances(id,survey_id)',
    'SELECT COUNT(*) total FROM survey_questions q LEFT JOIN survey_attendances a ON a.id=q.attendance_id AND a.survey_id=q.survey_id WHERE q.attendance_id IS NOT NULL AND a.id IS NULL'],
  ['snapshot_question_fk', 'question_id', 'questions(id)',
    'SELECT COUNT(*) total FROM survey_questions q LEFT JOIN questions p ON p.id=q.question_id WHERE q.question_id IS NOT NULL AND p.id IS NULL'],
  ['snapshot_version_question_fk', 'question_version_id,question_id', 'question_versions(id,question_id)',
    'SELECT COUNT(*) total FROM survey_questions q LEFT JOIN question_versions v ON v.id=q.question_version_id AND v.question_id=q.question_id WHERE q.question_version_id IS NOT NULL AND v.id IS NULL'],
];

export async function applySecuritySchema(connection, approvedDatabase) {
  const [[current]] = await connection.query('SELECT DATABASE() AS db');
  if (current.db !== approvedDatabase || approvedDatabase === 'defaultdb') throw Error('Banco fora do escopo da migration.');
  const [[lock]] = await connection.execute('SELECT GET_LOCK(?,15) acquired', [approvedDatabase + ':fhdod-migrations']);
  if (lock.acquired !== 1) throw Error('Outra migration está em andamento.');
  try {
    for (const [name, , , check] of foreignKeys) {
      const [[result]] = await connection.query(check);
      if (result.total) throw Error('Inconsistência preexistente impede a restrição ' + name);
    }
    await connection.query(await readFile(new URL('../database/migrations/002_auth_sessions.sql', import.meta.url), 'utf8'));
    for (const [table, name, columns, unique] of indexes) {
      const [found] = await connection.execute(
        'SELECT COLUMN_NAME,NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=? ORDER BY SEQ_IN_INDEX',
        [table, name],
      );
      if (found.length === 0) await connection.query('ALTER TABLE ' + table + ' ADD ' + (unique ? 'UNIQUE ' : '') + 'INDEX ' + name + ' (' + columns + ')');
      else if (found.map(row => row.COLUMN_NAME).join(',') !== columns || Boolean(found[0].NON_UNIQUE) === Boolean(unique)) {
        throw Error('Definição inesperada para o índice ' + name);
      }
    }
    for (const [name, columns, target] of foreignKeys) {
      const [found] = await connection.execute(
        "SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='survey_questions' AND CONSTRAINT_NAME=? AND CONSTRAINT_TYPE='FOREIGN KEY'",
        [name],
      );
      if (!found.length) await connection.query('ALTER TABLE survey_questions ADD CONSTRAINT ' + name + ' FOREIGN KEY (' + columns + ') REFERENCES ' + target);
    }
  } finally {
    await connection.execute('SELECT RELEASE_LOCK(?)', [approvedDatabase + ':fhdod-migrations']);
  }
}
