import { evaluateRules } from '../../services/QuestionJourney.js';
import { profilePermissions } from '../../services/Profiles.js';

test('cinco perfis têm permissões distintas e o setor não recebe acesso a contatos', () => {
  const profiles = Object.values(profilePermissions);
  expect(profiles).toHaveLength(5);
  expect(new Set(profiles.map(profile => [...profile].sort().join(','))).size).toBe(5);
  expect(profilePermissions.userSetor).not.toContain('return_requests.manage');
  expect(profilePermissions.gestao).not.toContain('ombudsman.manage');
  expect(profilePermissions.ouvidoria).toContain('return_requests.manage');
  expect(profilePermissions.visualizador).toEqual(['dashboard.read']);
});

test('uma cadeia de condições é visível somente quando o pré-requisito visível corresponde', () => {
  const parent = { id:'a', type:'rating', rating:'3.00' };
  const child = { id:'b', parent:'a', expected:'3', type:'multiple_choice', text:'["2","4"]' };
  const grandchild = { id:'c', parent:'b', expected:'4', type:'text' };
  const orphan = { id:'d', parent:null, expected:'1' };
  const states = rows => evaluateRules(rows).map(row => row.visible);
  expect(states([parent,child,grandchild,orphan])).toEqual([true,true,true,false]);
  expect(states([{ ...parent,rating:5 },child,grandchild,orphan])).toEqual([true,false,false,false]);
});
