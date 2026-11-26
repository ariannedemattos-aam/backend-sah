import { readFile } from 'node:fs/promises';
import { lowScoreMax, profilePermissions } from '../services/Profiles.js';

export async function applyOperationsSchema(connection, database) {
  const [[current]] = await connection.query('SELECT DATABASE() db');
  if (current.db !== database || ['defaultdb', 'fhdod_demo'].includes(database)) throw Error('Banco fora do escopo da migration.');
  const lockName = database + ':fhdod-migrations';
  const [[lock]] = await connection.execute('SELECT GET_LOCK(?,15) acquired', [lockName]);
  if (lock.acquired !== 1) throw Error('Outra migration está em andamento.');
  try {
    const sql = await readFile(new URL('../database/migrations/003_operational_workflows.sql', import.meta.url), 'utf8');
    for (const statement of sql.split(';').filter(value => value.trim())) await connection.query(statement);
    await connection.beginTransaction();
    try {
      for (const [profile, permissions] of Object.entries(profilePermissions)) {
        await connection.execute('INSERT IGNORE INTO roles(id,name) VALUES(UUID(),?)', [profile]);
        for (const permission of permissions) {
          await connection.execute('INSERT IGNORE INTO permissions(id,name) VALUES(UUID(),?)', [permission]);
          await connection.execute('INSERT IGNORE INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name=? AND p.name=?', [profile, permission]);
        }
      }
      await connection.execute(
        'INSERT INTO ombudsman_cases (id,survey_id,status,priority,created_at) '
          + "SELECT UUID(),s.id,COALESCE(r.status,'open'),IF(s.overall_rating<=? OR r.id IS NOT NULL,'high','normal'),s.completed_at "
          + 'FROM surveys s LEFT JOIN return_requests r ON r.survey_id=s.id LEFT JOIN feedback f ON f.survey_id=s.id '
          + "WHERE s.status='completed' AND s.completed_at IS NOT NULL AND (s.overall_rating<=? OR r.id IS NOT NULL OR NULLIF(TRIM(f.negative_text),'') IS NOT NULL) "
          + 'AND NOT EXISTS (SELECT 1 FROM ombudsman_cases c WHERE c.survey_id=s.id) ON DUPLICATE KEY UPDATE id=ombudsman_cases.id',
        [lowScoreMax, lowScoreMax],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]);
  }
}
