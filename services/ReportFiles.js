import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const institution = 'Fundação Hospitalar Dr. Oswaldo Diesel';
const colors = { navy: '123B56', blue: '175A85', pale: 'EAF4FA', ink: '344054', muted: '526174', line: 'D9E2E8' };
const dateDisplay = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' });
const numberDisplay = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const rating = value => value == null ? null : Number(value);
const displayRating = value => value == null ? 'Sem notas' : numberDisplay.format(value) + '/5';

function reportRows(model) {
  const { totals, scores, groups, feedback } = model;
  return [
    {
      name: 'Resumo', headers: ['Indicador', 'Resultado'], widths: [35, 40],
      rows: [
        ['Período (UTC)', model.period],
        ['Filtros', model.criteria],
        ['Geração (UTC)', dateDisplay.format(model.generatedAt)],
        ['Avaliações concluídas', totals.total],
        ['Respostas registradas', totals.answers],
        ['Respostas com nota', totals.ratedAnswers],
        ['Média de satisfação (1 a 5)', rating(totals.averageRating)],
      ],
    },
    { name: 'Distribuição das notas', headers: ['Nota', 'Respostas'], widths: [20, 20], rows: scores.map(({ score, responses }) => [score, responses]) },
    ...groups.map(({ label, rows }) => ({
      name: label, headers: ['Grupo', 'Avaliações', 'Respostas', 'Média (1 a 5)'], widths: [38, 17, 18, 20],
      rows: rows.map(row => [row.label, row.evaluations, row.responses, rating(row.averageRating)]),
    })),
    {
      name: 'Elogios e sugestões', headers: ['Tipo', 'Quantidade'], widths: [33, 17],
      rows: feedback.map(({ label, count }) => [label, count]),
    },
  ];
}

export function excelBuffer(model) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = institution;
  workbook.created = model.generatedAt;
  for (const { name, headers, widths, rows } of reportRows(model)) {
    const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 4 }] });
    sheet.columns = widths.map(width => ({ width }));
    sheet.mergeCells(1, 1, 1, headers.length);
    const title = sheet.getCell('A1');
    title.value = institution;
    title.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colors.navy } };
    title.alignment = { vertical: 'middle', wrapText: true };
    sheet.getRow(1).height = 28;
    sheet.mergeCells(2, 1, 2, headers.length);
    sheet.getCell('A2').value = name + ' | Pesquisa de satisfação';
    const heading = sheet.getRow(4);
    heading.values = headers;
    heading.height = 21;
    heading.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colors.blue } };
      cell.alignment = { vertical: 'middle' };
    });
    for (const [index, values] of rows.entries()) {
      const row = sheet.addRow(values);
      row.alignment = { vertical: 'middle', wrapText: true };
      row.height = name === 'Resumo' && index === 1 ? 46 : 22;
      if (index % 2 === 0) row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colors.pale } }; });
    }
    sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, sheet.rowCount), column: headers.length } };
  }
  return workbook.xlsx.writeBuffer();
}

export function pdfBuffer(model) {
  return new Promise((resolve, reject) => {
    const margin = 40;
    const doc = new PDFDocument({
      size: 'A4', margin, bufferPages: true,
      info: { Title: 'Relatório de satisfação | FHDOD', Author: institution, CreationDate: model.generatedAt },
    });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const width = doc.page.width - margin * 2;
    const logoText = () => {
      doc.rect(0, 0, doc.page.width, 10).fill('#' + colors.navy);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#' + colors.blue).text(institution, margin, 26, { width });
      doc.y = 56;
    };
    function pageSpace(height) {
      if (doc.y + height <= doc.page.height - margin - 15) return false;
      doc.addPage();
      logoText();
      return true;
    }
    function header(label, x, y, w) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#FFFFFF').text(label, x, y, { width: w, lineBreak: false });
    }
    function table(headers, rows) {
      if (!rows.length) {
        doc.font('Helvetica').fontSize(9).fillColor('#' + colors.muted).text('Sem registros para os filtros selecionados.');
        doc.moveDown();
        return;
      }
      const proportions = headers.length === 4 ? [0.43, 0.17, 0.16, 0.24] : [0.45, 0.55];
      const columns = proportions.map(ratio => ratio * width);
      const drawHeader = () => {
        const y = doc.y;
        doc.rect(margin, y, width, 22).fill('#' + colors.blue);
        let x = margin;
        headers.forEach((label, index) => { header(label, x + 7, y + 7, columns[index] - 14); x += columns[index]; });
        doc.y = y + 22;
      };
      drawHeader();
      for (const [index, values] of rows.entries()) {
        doc.font('Helvetica').fontSize(9);
        const text = values.map(value => value == null ? 'Sem notas' : String(value));
        const height = Math.max(22, ...text.map((value, i) => doc.heightOfString(value, { width: columns[i] - 14 }) + 12));
        if (pageSpace(height)) drawHeader();
        const y = doc.y;
        if (index % 2 === 0) doc.rect(margin, y, width, height).fill('#' + colors.pale);
        let x = margin;
        text.forEach((value, i) => {
          doc.font('Helvetica').fontSize(9).fillColor('#' + colors.ink).text(value, x + 7, y + 6, { width: columns[i] - 14 });
          x += columns[i];
        });
        doc.y = y + height;
      }
      doc.x = margin;
      doc.moveDown();
    }
    logoText();
    doc.font('Helvetica-Bold').fontSize(24).fillColor('#' + colors.navy).text('Relatório de satisfação', margin, doc.y, { width });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(11).fillColor('#' + colors.muted)
      .text(model.period + ' (UTC)  |  Gerado em ' + dateDisplay.format(model.generatedAt) + ' UTC', margin, doc.y, { width });
    doc.moveDown();
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#' + colors.navy).text(
      numberDisplay.format(model.totals.total) + (model.totals.total === 1 ? ' avaliação concluída' : ' avaliações concluídas')
        + '  |  Média: ' + displayRating(model.totals.averageRating),
      margin, doc.y, { width },
    );
    doc.moveDown();
    for (const section of reportRows(model)) {
      pageSpace(65);
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#' + colors.navy).text(section.name, margin, doc.y, { width });
      doc.moveDown(0.35);
      table(section.headers, section.rows);
    }
    pageSpace(40);
    doc.font('Helvetica').fontSize(9).fillColor('#' + colors.muted).text(
      'Média calculada com as notas individuais de 1 a 5. Comentários são apresentados por tipo, sem texto livre ou dados de contato.',
      margin, doc.y, { width },
    );
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i += 1) {
      doc.switchToPage(pages.start + i);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.moveTo(margin, doc.page.height - 30).lineTo(doc.page.width - margin, doc.page.height - 30).stroke('#' + colors.line);
      doc.font('Helvetica').fontSize(8).fillColor('#' + colors.muted)
        .text('FHDOD | Ouvidoria', margin, doc.page.height - 23, { lineBreak: false, width });
      doc.text((i + 1) + ' / ' + pages.count, doc.page.width - margin - 44, doc.page.height - 23, { lineBreak: false, width: 44, align: 'right' });
      doc.page.margins.bottom = bottom;
    }
    doc.end();
  });
}
