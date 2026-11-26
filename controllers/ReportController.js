import { withTransaction } from '../utils/withTransaction.js';
import { dimension, dimensions, distribution, feedbackSummary, filtersSchema, selections, summary } from '../services/EvaluationData.js';

const dateLabel = value => value?.split('-').reverse().join('/');
function periodLabel({ from, to }) {
  if (from && to) return dateLabel(from) + ' a ' + dateLabel(to);
  if (from) return 'Desde ' + dateLabel(from);
  if (to) return 'Até ' + dateLabel(to);
  return 'Todo o período';
}
async function criteriaLabel(connection, filters) {
  const labels = [];
  for (const [field, table, label] of [
    ['sectorId', 'sectors', 'Setor'], ['serviceId', 'services', 'Serviço'], ['stageId', 'stages', 'Etapa'],
  ]) {
    if (!filters[field]) continue;
    const [[record]] = await connection.execute('SELECT name FROM ' + table + ' WHERE id=?', [filters[field]]);
    labels.push(label + ': ' + (record?.name ?? 'sem correspondência'));
  }
  if (filters.score !== undefined) labels.push('Nota da resposta: ' + filters.score);
  // Search can contain personal text typed by an operator. Record its use, not its value.
  if (filters.search) labels.push('Busca aplicada');
  return labels.join(' / ') || 'Sem filtros adicionais';
}

export function exportReport(format) {
  return async (req, res) => {
    const filters = filtersSchema.parse(req.query);
    const selection = selections(filters, req.user);
    const model = await withTransaction(async conn => {
      const totals = await summary(conn, selection);
      const scores = await distribution(conn, selection);
      const feedback = await feedbackSummary(conn, selection);
      const groups = [];
      for (const [key, { label }] of Object.entries(dimensions)) {
        groups.push({ label, rows: await dimension(conn, selection, key) });
      }
      return { totals, scores, feedback, groups, period: periodLabel(filters), criteria: await criteriaLabel(conn, filters), generatedAt: new Date() };
    });
    const { excelBuffer, pdfBuffer } = await import('../services/ReportFiles.js');
    const pdf = format === 'pdf';
    const data = pdf ? await pdfBuffer(model) : await excelBuffer(model);
    const extension = pdf ? 'pdf' : 'xlsx';
    res.set('Content-Type', pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', 'attachment; filename="fhdod-satisfacao.' + extension + '"');
    res.send(Buffer.from(data));
  };
}
