import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import pool from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { ok } from '../utils/response.js';
import { withTransaction } from '../utils/withTransaction.js';
import { isSector, periodConditions, where } from '../services/EvaluationData.js';

const uuid = z.string().uuid();
const monthInput = z.object({ month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/), sectorId: uuid.optional() });
const staffInput = z.object({ sectorId: uuid, name: z.string().trim().min(2).max(120) });
const shiftInput = z.object({
  sectorId: uuid, date: z.iso.date(), shiftId: uuid, teamId: uuid,
  staffIds: z.array(uuid).max(50).refine(ids => new Set(ids).size === ids.length, 'Profissionais duplicados.'),
});
const sectorScope = (user, column) => isSector(user)
  ? ' AND EXISTS (SELECT 1 FROM user_sectors m WHERE m.sector_id=' + column + ' AND m.user_id=?)' : '';

async function requireSector(connection, user, sectorId) {
  const [[row]] = await connection.execute('SELECT s.id FROM sectors s WHERE s.id=? AND s.is_active=1'
    + sectorScope(user, 's.id') + ' FOR SHARE', [sectorId, ...(isSector(user) ? [user.sub] : [])]);
  if (!row) throw new AppError('Setor indisponível para este perfil.', 403);
}

export async function options(req, res) {
  const user = req.user;
  const params = isSector(user) ? [user.sub] : [];
  const [[sectors], [shifts], [teams], [staff]] = await Promise.all([
    pool.execute('SELECT s.id,s.name FROM sectors s WHERE s.is_active=1' + sectorScope(user, 's.id') + ' ORDER BY s.name', params),
    pool.execute('SELECT id,name FROM shifts WHERE is_active=1 ORDER BY display_order,name'),
    pool.execute('SELECT t.id,t.name,t.sector_id sectorId FROM teams t JOIN sectors s ON s.id=t.sector_id WHERE t.is_active=1 AND s.is_active=1'
      + sectorScope(user, 's.id') + ' ORDER BY t.name', params),
    pool.execute('SELECT p.id,p.name,p.sector_id sectorId FROM roster_staff p JOIN sectors s ON s.id=p.sector_id WHERE p.is_active=1 AND s.is_active=1'
      + sectorScope(user, 's.id') + ' ORDER BY p.name', params),
  ]);
  ok(res, { sectors, shifts, teams, staff });
}

export async function list(req, res) {
  const { month, sectorId } = monthInput.parse(req.query);
  if (sectorId) await withTransaction(conn => requireSector(conn, req.user, sectorId));
  const [rows] = await pool.execute(
    "SELECT r.sector_id sectorId,DATE_FORMAT(r.work_date,'%Y-%m-%d') date,r.shift_id shiftId,r.team_id teamId,s.name sector,t.name team,h.name shift,"
      + '(SELECT JSON_ARRAYAGG(JSON_OBJECT(\'id\',p.id,\'name\',p.name)) FROM roster_shift_staff a JOIN roster_staff p ON p.id=a.staff_id '
      + 'WHERE a.sector_id=r.sector_id AND a.work_date=r.work_date AND a.shift_id=r.shift_id AND a.is_assigned=1) staff '
      + 'FROM roster_shifts r JOIN sectors s ON s.id=r.sector_id JOIN teams t ON t.id=r.team_id JOIN shifts h ON h.id=r.shift_id '
      + 'WHERE r.work_date>=? AND r.work_date<DATE_ADD(?,INTERVAL 1 MONTH)' + (sectorId ? ' AND r.sector_id=?' : '')
      + sectorScope(req.user, 'r.sector_id') + ' ORDER BY r.work_date,h.display_order,s.name',
    [month + '-01', month + '-01', ...(sectorId ? [sectorId] : []), ...(isSector(req.user) ? [req.user.sub] : [])],
  );
  ok(res, rows.map(row => ({ ...row, staff: row.staff ?? [] })));
}

export async function createStaff(req, res) {
  const input = staffInput.parse(req.body);
  const id = randomUUID();
  await withTransaction(async conn => {
    await requireSector(conn, req.user, input.sectorId);
    await conn.execute('INSERT INTO roster_staff (id,sector_id,name) VALUES (?,?,?)', [id, input.sectorId, input.name])
      .catch(error => { if (error.code === 'ER_DUP_ENTRY') throw new AppError('Já existe profissional com esse nome no setor.', 409); throw error; });
  });
  ok(res, { id, ...input }, 'Profissional incluído no setor.', 201);
}

export async function saveShift(req, res) {
  const input = shiftInput.parse(req.body);
  const { sectorId, date, shiftId, teamId, staffIds } = input;
  await withTransaction(async conn => {
    await requireSector(conn, req.user, sectorId);
    const [[valid]] = await conn.execute(
      'SELECT t.id FROM teams t JOIN shifts h ON h.id=? AND h.is_active=1 WHERE t.id=? AND t.sector_id=? AND t.is_active=1 FOR SHARE',
      [shiftId, teamId, sectorId],
    );
    if (!valid) throw new AppError('Selecione um turno ativo e uma equipe ativa do mesmo setor.', 422);
    if (staffIds.length) {
      const [staff] = await conn.execute('SELECT id FROM roster_staff WHERE sector_id=? AND is_active=1 AND id IN ('
        + staffIds.map(() => '?').join(',') + ') FOR SHARE', [sectorId, ...staffIds]);
      if (staff.length !== staffIds.length) throw new AppError('Todos os profissionais devem pertencer ao setor.', 422);
    }
    const key = [sectorId, date, shiftId];
    await conn.execute('INSERT INTO roster_shifts (sector_id,work_date,shift_id,team_id,updated_by) VALUES (?,?,?,?,?) AS draft '
      + 'ON DUPLICATE KEY UPDATE team_id=draft.team_id,updated_by=draft.updated_by', [...key, teamId, req.user.sub]);
    await conn.execute('UPDATE roster_shift_staff SET is_assigned=0 WHERE sector_id=? AND work_date=? AND shift_id=? AND is_assigned=1', key);
    for (const staffId of staffIds) await conn.execute('INSERT INTO roster_shift_staff (sector_id,work_date,shift_id,staff_id) VALUES (?,?,?,?) '
      + 'ON DUPLICATE KEY UPDATE is_assigned=1', [...key, staffId]);
    await conn.execute("INSERT INTO audit_logs (id,user_id,action,entity,entity_id,metadata) VALUES (UUID(),?,'roster.saved','team',?,?)",
      [req.user.sub, teamId, JSON.stringify({ sectorId, date, shiftId, professionals: staffIds.length })]);
  });
  ok(res, input, 'Escala atualizada.');
}

export async function teamIndicators(req, res) {
  const filters = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional(), sectorId: uuid.optional() }).parse(req.query);
  if (filters.from && filters.to && filters.from > filters.to) throw new AppError('Período inválido.', 422);
  const clauses = ["s.status='completed'", 's.overall_rating IS NOT NULL'], params = [];
  periodConditions(filters, 'a.attendance_date', clauses, params);
  if (filters.sectorId) { clauses.push('a.sector_id=?'); params.push(filters.sectorId); }
  const [rows] = await pool.execute(
    'WITH linked AS (SELECT DISTINCT s.id,s.overall_rating,rs.team_id FROM survey_attendances a '
      + 'JOIN surveys s ON s.id=a.survey_id JOIN roster_shifts rs ON rs.sector_id=a.sector_id AND rs.shift_id=a.shift_id AND rs.work_date=a.attendance_date'
      + where(clauses) + ') SELECT tm.id,tm.name label,COUNT(*) evaluations,'
      + 'CASE WHEN COUNT(*)>=3 THEN ROUND(AVG(l.overall_rating),2) END averageOverall '
      + 'FROM linked l JOIN teams tm ON tm.id=l.team_id GROUP BY tm.id,tm.name ORDER BY evaluations DESC,tm.name,tm.id', params,
  );
  ok(res, rows);
}
