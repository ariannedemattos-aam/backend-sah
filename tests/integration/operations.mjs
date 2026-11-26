import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import app from '../../app.js';
import pool from '../../config/database.js';
import { env } from '../../config/env.js';

const published = process.env.FHOOD_TEST_PUBLISHED === '1';
const slug = 'teste-b6-' + randomBytes(7).toString('hex');
const date = '2001-' + String(1 + (randomBytes(1)[0] % 12)).padStart(2, '0') + '-13';
const targets = { sector: randomUUID(), other: randomUUID(), service: randomUUID(), team: randomUUID(), stages: [randomUUID(),randomUUID()] };
const held = { users:[], sessions:[], surveys:[], questions:[] };
const server = published ? null : app.listen(0, '127.0.0.1');
if (server) await new Promise(resolve => server.once('listening', resolve));
const base = published ? 'https://fhdod-ouvidoria-demo.onrender.com/api/v1' : 'http://127.0.0.1:' + server.address().port + '/api/v1';
let step = 'destino';

async function request(method,path,status,body,jwt,surveyToken) {
  const r = await fetch(base+path, {
    method, signal: AbortSignal.timeout(30000),
    headers: { ...(body!==undefined&&{'Content-Type':'application/json'}), ...(jwt&&{Authorization:'Bearer '+jwt}),
      ...(surveyToken&&{'X-Survey-Token':surveyToken}) },
    body: body===undefined ? undefined : JSON.stringify(body),
  });
  if (r.status!==status) throw Error(method+' '+path.split('?')[0]+' HTTP '+r.status+' esperado '+status);
  return status===204 ? null : r.json();
}

async function login(email,password) {
  const r = (await request('POST','/auth/login',200,{email,password})).data;
  held.sessions.push(r.refreshToken);
  return r;
}

async function attendance(adminJwt,shiftId,stageIds) {
  const r = (await request('POST','/public/surveys',201,{})).data;
  held.surveys.push(r.id);
  const path='/public/surveys/'+r.id;
  const body={sectorId:targets.sector,serviceId:targets.service,shiftId,attendanceDate:date,attendanceKey:randomUUID(),stageIds};
  const add=()=>request('POST',path+'/attendances',201,body,null,r.surveyToken);
  await add();
  await add();
  await request('POST',path+'/start',200,{},null,r.surveyToken);
  const questions=async()=>(await request('GET',path+'/questions',200,undefined,null,r.surveyToken)).data;
  const answer=(id,value,status=200)=>request('PUT',path+'/answers/'+id,status,{value},null,r.surveyToken);
  return {...r,path,questions,answer,call:(verb,endpoint,status,body)=>request(verb,path+endpoint,status,body,adminJwt,r.surveyToken)};
}

try {
  if (env.db.database!=='fhdod_ouvidoria' || !env.db.ssl?.verifyIdentity || !env.db.host.endsWith('.aivencloud.com')) throw Error('Teste exige banco de demonstração com TLS.');
  const [[tls]]=await pool.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  assert.ok(tls.Value);
  step='catálogos fictícios';
  const admin=await login('admin@fhdod.example',process.env.ADMIN_PASSWORD), jwt=admin.accessToken;
  assert.equal(admin.user.role,'userAdmin');
  const shiftId=(await request('GET','/public/shifts',200)).data[0].id;
  await pool.execute('INSERT INTO sectors(id,name,slug) VALUES (?,?,?),(?,?,?)',[targets.sector,slug,slug,targets.other,slug+'-outro',slug+'-outro']);
  await pool.execute('INSERT INTO services(id,sector_id,name,slug) VALUES (?,?,?,?)',[targets.service,targets.sector,slug,slug]);
  await pool.execute('INSERT INTO teams(id,sector_id,name) VALUES (?,?,?)',[targets.team,targets.sector,slug]);
  for(const [index,id] of targets.stages.entries()){
    await pool.execute('INSERT INTO stages(id,name) VALUES (?,?)',[id,slug+'-etapa-'+index]);
    await pool.execute('INSERT INTO service_stages(id,service_id,stage_id,display_order) VALUES(UUID(),?,?,?)',[targets.service,id,index]);
  }
  const configured='/admin/services/'+targets.service+'/stages';
  if(process.env.FHOOD_TEST_SERVICE_STAGE_EDITOR==='1'){
    await request('PUT',configured,422,{stageIds:[targets.stages[0],targets.stages[0]]},jwt);
    await request('PUT',configured,200,{stageIds:[targets.stages[0],targets.stages[1]]},jwt);
  }
  step='perfis e escopo';
  const accounts={userAdmin:admin};
  for (const role of ['userSetor','gestao','ouvidoria','visualizador']) {
    const input={name:'Fictício '+role,email:slug+'-'+role+'@example.invalid',password:randomBytes(24).toString('hex'),
      role,sectorIds:role==='userSetor'?[targets.sector]:[]};
    const created=await request('POST','/admin/users/accounts',201,input,jwt);
    held.users.push(created.data.id);
    const profile=(await request('GET','/admin/users/'+created.data.id+'/access',200,undefined,jwt)).data;
    assert.equal(profile.role,role);
    assert.deepEqual(profile.sectorIds,input.sectorIds);
    accounts[role]=await login(input.email,input.password);
  }
  const matrix=[
    ['/admin/dashboard/overview',['userAdmin','gestao','visualizador']],
    ['/admin/roster/options',['userAdmin','gestao','userSetor']],
    ['/admin/ombudsman',['userAdmin','ouvidoria']],
    ['/admin/return-requests',['userAdmin','ouvidoria']],
    ['/admin/users',['userAdmin']],
    ['/admin/feedback',['userAdmin','gestao','userSetor']],
    ['/questions',['userAdmin','userSetor']],
  ];
  for(const [route,allowed] of matrix) await Promise.all(Object.entries(accounts).map(([role,session])=>
    request('GET',route,allowed.includes(role)?200:403,undefined,session.accessToken)));
  if(process.env.FHOOD_TEST_SERVICE_STAGE_EDITOR==='1'){
    await request('PUT',configured,403,{stageIds:[]},accounts.userSetor.accessToken);
    const ordered=(await request('GET','/public/services/'+targets.service+'/stages',200)).data;
    assert.deepEqual(ordered.map(item=>item.id),targets.stages);
  }
  const first=accounts.userSetor.accessToken, occ=accounts.ouvidoria.accessToken, manager=accounts.gestao.accessToken;
  await request('GET','/admin/roster?month='+date.slice(0,7)+'&sectorId='+targets.other,403,undefined,first);
  await request('POST','/admin/roster/staff',403,{sectorId:targets.other,name:'Fictício de outro setor'},first);
  await request('POST','/admin/roster/staff',403,{sectorId:targets.sector,name:'Fictício de outro perfil'},occ);
  await request('POST','/questions',403,{prompt:'Pergunta não permitida para a Ouvidoria',type:'rating',serviceId:targets.service},occ);
  step='escala e equipe';
  const person=(await request('POST','/admin/roster/staff',201,{sectorId:targets.sector,name:'Profissional fictício '+slug},first)).data;
  const roster={sectorId:targets.sector,date,shiftId,teamId:targets.team,staffIds:[person.id]};
  await request('PUT','/admin/roster/shifts',200,roster,manager);
  await request('PUT','/admin/roster/shifts',200,roster,first);
  const shifts=(await request('GET','/admin/roster?month='+date.slice(0,7)+'&sectorId='+targets.sector,200,undefined,first)).data;
  assert.equal(shifts.length,1);
  assert.equal(shifts[0].staff[0].id,person.id);
  step='criação e aprovação de perguntas condicionais';
  async function propose(text,stageId,rule) {
    const row=(await request('POST','/questions',201,{prompt:text+slug,type:'rating',serviceId:targets.service,stageId,rule},first)).data;
    held.questions.push(row.id);
    await request('POST','/questions/'+row.id+'/approve',403,{justification:'Não autorizado'},first);
    await request('POST','/questions/'+row.id+'/approve',200,{justification:'Validação de dados fictícios'},jwt);
    return row;
  }
  const parent=await propose('Pergunta inicial fictícia ',targets.stages[0]);
  const detail=await propose('Pergunta condicional fictícia ',targets.stages[0],{questionId:parent.id,value:'4'});
  await propose('Pergunta em etapa não realizada ',targets.stages[1]);
  const config=(await request('GET','/questions/services/'+targets.service+'/configuration',200,undefined,first)).data;
  assert.equal(config.stages.length,2);
  assert.ok(config.questions.some(q=>q.id===parent.id));
  assert.equal((await request('GET','/questions/'+detail.id,200,undefined,first)).data.rule.value,'4');
  step='pesquisa e preservação de versões';
  const survey=await attendance(jwt,shiftId,[targets.stages[0]]);
  let questions=await survey.questions();
  assert.equal(questions.filter(q=>q.text.endsWith(slug)).length,1);
  const parentSnapshot=questions.find(q=>q.text.startsWith('Pergunta inicial fictícia'));
  assert.ok(parentSnapshot);
  await request('PUT','/questions/'+detail.id,200,{prompt:'Enunciado novo '+slug,type:'rating',version:1,changeReason:'Teste de preservação do snapshot',rule:null},jwt);
  await survey.answer(parentSnapshot.id,4);
  questions=await survey.questions();
  const child=questions.find(q=>q.text.startsWith('Pergunta condicional fictícia'));
  assert.ok(child);
  assert.ok(!questions.some(q=>q.text.startsWith('Pergunta em etapa não realizada')));
  await survey.answer(child.id,3);
  await survey.answer(parentSnapshot.id,2);
  assert.ok(!(await survey.questions()).some(q=>q.id===child.id));
  await survey.answer(child.id,3,404);
  await survey.call('POST','/complete',422,{});
  await survey.call('PUT','/feedback',200,{negative:'Reclamação fictícia '+slug});
  await survey.call('POST','/complete',200,{overallRating:2});
  await survey.call('POST','/complete',200,{overallRating:9});
  step='fila e retorno';
  const savedDetail=(await request('GET','/admin/evaluations/'+survey.id,200,undefined,manager)).data;
  assert.ok(!savedDetail.answers.some(row=>row.id===child.id));
  const anonymous=(await request('GET','/admin/ombudsman?priority=high&sectorId='+targets.sector,200,undefined,occ)).data[0];
  assert.equal(anonymous.overallRating,2);
  assert.equal(anonymous.returnId,null);
  assert.equal((await request('GET','/admin/ombudsman/'+anonymous.id,200,undefined,occ)).data.complaint,'Reclamação fictícia '+slug);
  await request('POST','/admin/ombudsman/'+anonymous.id+'/actions',409,{status:'closed',priority:'normal',note:'Teste de estado'},occ);
  await request('POST','/admin/ombudsman/'+anonymous.id+'/actions',201,{status:'in_progress',priority:'normal',note:'Encaminhamento fictício'},occ);
  await request('POST','/admin/ombudsman/'+anonymous.id+'/actions',201,{status:'closed',priority:'normal',note:'Atendimento fictício concluído'},occ);
  assert.equal((await request('GET','/admin/ombudsman/'+anonymous.id,200,undefined,occ)).data.history.length,2);
  const optIn=await attendance(jwt,shiftId,[]);
  assert.ok(!(await optIn.questions()).some(q=>q.text.endsWith(slug)));
  await optIn.call('PUT','/return-request',200,{ contact:'retorno-teste@example.invalid' });
  await optIn.call('POST','/complete',200,{overallRating:8});
  const caseWithReturn=(await request('GET','/admin/ombudsman?priority=high&sectorId='+targets.sector,200,undefined,occ)).data[0];
  assert.ok(caseWithReturn.returnId);
  await request('POST','/admin/ombudsman/'+caseWithReturn.id+'/actions',201,{status:'in_progress',priority:'high',note:'Contato fictício registrado'},occ);
  await request('POST','/admin/ombudsman/'+caseWithReturn.id+'/actions',409,{status:'closed',priority:'high',note:'Retorno pendente'},occ);
  const returned='/admin/return-requests/'+caseWithReturn.returnId;
  await request('GET',returned+'/contact',403,undefined,manager);
  assert.equal((await request('GET',returned+'/contact',200,undefined,occ)).data.contact,'retorno-teste@example.invalid');
  await request('PATCH',returned+'/status',200,{status:'in_progress'},occ);
  await request('PATCH',returned+'/status',200,{status:'closed'},occ);
  await request('POST','/admin/ombudsman/'+caseWithReturn.id+'/actions',201,{status:'closed',priority:'high',note:'Retorno concluído sem envio de mensagens'},occ);
  step='agregação por equipe e revogação';
  const query='/admin/dashboard/roster-teams?sectorId='+targets.sector+'&from='+date+'&to='+date;
  const small=(await request('GET',query,200,undefined,manager)).data[0];
  assert.equal(small.evaluations,2);
  assert.equal(small.averageOverall,null);
  const third=await attendance(jwt,shiftId,[]);
  await third.call('POST','/complete',200,{overallRating:8});
  const aggregate=(await request('GET',query,200,undefined,accounts.visualizador.accessToken)).data[0];
  assert.equal(aggregate.evaluations,3);
  assert.equal(Number(aggregate.averageOverall),6);
  assert.deepEqual(Object.keys(aggregate).sort(),['averageOverall','evaluations','id','label']);
  await request('PUT','/admin/users/'+accounts.visualizador.user.id+'/access',200,{role:'gestao',sectorIds:[]},jwt);
  await request('GET','/auth/me',401,undefined,accounts.visualizador.accessToken);
  console.log(JSON.stringify({target:published?'publicado':'API local',profiles:5,permissionChecks:matrix.length*5,questionVersions:true,roster:true,caseHistory:true,anonymous:true,teamAggregate:6,tls:true}));
} catch(error) {
  console.error('Falha em '+step+': '+error.message);
  process.exitCode=1;
} finally {
  await Promise.allSettled(held.sessions.map(refreshToken=>request('POST','/auth/logout',204,{refreshToken})));
  const cleanup=await Promise.allSettled([
    ...held.surveys.map(id=>pool.execute("UPDATE surveys SET status='expired' WHERE id=?",[id])),
    ...held.questions.map(id=>pool.execute("UPDATE questions SET status='inactive' WHERE id=?",[id])),
    ...held.users.map(id=>pool.execute('UPDATE users SET is_active=0 WHERE id=?',[id])),
    pool.execute('UPDATE roster_staff SET is_active=0 WHERE sector_id=?',[targets.sector]),
    pool.execute('UPDATE sectors SET is_active=0 WHERE id IN (?,?)',[targets.sector,targets.other]),
    pool.execute('UPDATE stages SET is_active=0 WHERE id IN (?,?)',targets.stages),
    pool.execute('UPDATE teams SET is_active=0 WHERE id=?',[targets.team]),
    pool.execute('UPDATE services SET is_active=0 WHERE id=?',[targets.service]),
  ]);
  if(cleanup.some(x=>x.status!=='fulfilled')) { console.error('Limpeza de fixtures incompleta'); process.exitCode=1; }
  await pool.end();
  if(server) await new Promise(resolve=>server.close(resolve));
}
