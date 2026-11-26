import { jest } from '@jest/globals';
import SwaggerParser from '@apidevtools/swagger-parser';
import app from '../../app.js';
import specification from '../../swagger/swagger.js';
import { dashboardFilters, redactFeedback, selections } from '../../services/EvaluationData.js';

jest.setTimeout(15000);
const normalize = path => path.replace(/\/$/,'').replace(/:[A-Za-z]+|\{[A-Za-z]+\}/g,'{}');
function routes(stack, prefix='') {
  return stack.flatMap(layer => {
    if (layer.route) {
      if (!layer.route.path.startsWith('/api-docs')) return Object.keys(layer.route.methods).map(method=>method+' '+normalize(prefix+layer.route.path));
      return [];
    }
    if (layer.name!=='router') return [];
    const path=layer.regexp.source.match(/^\^(.+?)\\\/\?\(\?=\\\/\|\$\)/)?.[1].replaceAll('\\/','/');
    if (!path) throw Error('Prefixo de rota desconhecido');
    return routes(layer.handle.stack,prefix+path);
  });
}

test('OpenAPI é válido e corresponde a todos os métodos HTTP montados', async () => {
  await SwaggerParser.validate(structuredClone(specification));
  const documented=Object.entries(specification.paths).flatMap(([path,m])=>Object.keys(m).map(method=>method+' '+normalize(path)));
  expect(new Set(documented)).toEqual(new Set(routes(app._router.stack)));
});

test('filtros de turno e equipe são parametrizados e relativos ao mesmo atendimento', () => {
  const shiftId='671ec25c-4015-4bce-a706-000000000001';
  const teamId='671ec25c-4015-4bce-a706-000000000002';
  const selection=selections(dashboardFilters.parse({shiftId,teamId}),{role:'gestao'});
  expect(selection.cte).toContain('a.shift_id=?');
  expect(selection.cte).toContain('rs.work_date=a.attendance_date');
  expect(selection.cte).not.toContain(teamId);
  expect(selection.params).toEqual([shiftId,teamId]);
  expect(dashboardFilters.safeParse({from:'2026-11-26',to:'2026-11-25'}).success).toBe(false);
});

test('os padrões de contato em texto livre são mascarados', () => {
  expect(redactFeedback('Teste contato@example.invalid ou (00) 99999-9999')).toBe('Teste [e-mail oculto] ou [telefone oculto]');
});
