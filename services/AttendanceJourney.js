import { AppError } from '../utils/errors.js';

export async function saveJourney(connection, attendanceId, serviceId, stages) {
  if (stages === undefined) return;
  if (stages.length) {
    const [valid] = await connection.execute(
      'SELECT ss.stage_id FROM service_stages ss JOIN stages st ON st.id=ss.stage_id AND st.is_active=1 '
        + 'WHERE ss.service_id=? AND ss.is_active=1 AND ss.stage_id IN (' + stages.map(() => '?').join(',') + ') FOR SHARE',
      [serviceId, ...stages],
    );
    if (valid.length !== stages.length) throw new AppError('Selecione apenas etapas ativas do serviço informado.', 422);
  }
  await connection.execute('INSERT INTO attendance_journeys (attendance_id) VALUES (?)', [attendanceId]);
  for (const stageId of stages) await connection.execute(
    'INSERT INTO attendance_journey_stages (attendance_id,stage_id) VALUES (?,?)', [attendanceId, stageId],
  );
}

export async function unchangedJourney(connection, attendanceId, stages) {
  const [[marker]] = await connection.execute('SELECT 1 present FROM attendance_journeys WHERE attendance_id=?', [attendanceId]);
  if (!marker || stages === undefined) return !marker && stages === undefined;
  const [existing] = await connection.execute('SELECT stage_id id FROM attendance_journey_stages WHERE attendance_id=?', [attendanceId]);
  return existing.length === stages.length && existing.every(row => stages.includes(row.id));
}
