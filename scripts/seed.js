import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import pool from '../config/database.js';

const named = async (table, name, fields = {}) => {
  const [found] = await pool.execute(`SELECT id FROM ${table} WHERE name=? LIMIT 1`, [name]);
  if (found[0]) return found[0].id;
  const id = crypto.randomUUID(), keys = ['id', 'name', ...Object.keys(fields)];
  await pool.execute(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, [id, name, ...Object.values(fields)]);
  return id;
};
const requireSecret = (name) => { if (!process.env[name]) throw new Error(`Defina ${name} no .env antes do seed.`); return process.env[name]; };
try {
  const adminPassword = requireSecret('ADMIN_PASSWORD'), sectorPassword = requireSecret('SECTOR_PASSWORD');
  for (const role of ['user','userSetor','userAdmin']) await pool.execute('INSERT IGNORE INTO roles(id,name) VALUES(UUID(),?)', [role]);
  const [[adminRole]] = await pool.execute("SELECT id FROM roles WHERE name='userAdmin'");
  const [[sectorRole]] = await pool.execute("SELECT id FROM roles WHERE name='userSetor'");
  const permissions = ['questions.read','questions.propose','questions.create','questions.approve','questions.reject','questions.update','dashboard.read','surveys.read','reports.export','users.manage','sectors.manage','invitations.manage','return_requests.manage','tvwall.read'];
  for (const p of permissions) { await pool.execute('INSERT IGNORE INTO permissions(id,name) VALUES(UUID(),?)', [p]); await pool.execute('INSERT IGNORE INTO role_permissions(role_id,permission_id) SELECT ?,id FROM permissions WHERE name=?', [adminRole.id,p]); }
  for (const p of ['questions.read','questions.propose']) await pool.execute('INSERT IGNORE INTO role_permissions(role_id,permission_id) SELECT ?,id FROM permissions WHERE name=?', [sectorRole.id,p]);
  const pronto = await named('sectors','Pronto Atendimento',{slug:'pronto-atendimento',is_active:1});
  await named('sectors','Internação',{slug:'internacao',is_active:1}); await named('sectors','Bloco Cirúrgico',{slug:'bloco-cirurgico',is_active:1});
  const urgencia = await named('services','Atendimento de Urgência',{sector_id:pronto,slug:'atendimento-urgencia',is_active:1});
  const raioX = await named('services','Raio X',{sector_id:pronto,slug:'raio-x',is_active:1});
  for (const [i,name] of ['Manhã','Tarde','Noite'].entries()) await named('shifts',name,{display_order:i,is_active:1});
  const stages={}; for(const name of ['Recepção','Triagem','Enfermagem','Atendimento médico','Ambiente e conforto','Realização do exame']) stages[name]=await named('stages',name,{is_active:1});
  for(const [i,name] of ['Recepção','Triagem','Enfermagem','Atendimento médico','Ambiente e conforto'].entries()) await pool.execute('INSERT IGNORE INTO service_stages(id,service_id,stage_id,display_order,is_required,is_active) VALUES(UUID(),?,?,?,?,1)',[urgencia,stages[name],i+1,1]);
  for(const [i,name] of ['Recepção','Realização do exame'].entries()) await pool.execute('INSERT IGNORE INTO service_stages(id,service_id,stage_id,display_order,is_required,is_active) VALUES(UUID(),?,?,?,?,1)',[raioX,stages[name],i+1,1]);
  const user = async (name,email,role,password) => { const hash=await bcrypt.hash(password,12); await pool.execute('INSERT INTO users(id,role_id,name,email,password_hash,is_active) VALUES(UUID(),?,?,?,?,1) ON DUPLICATE KEY UPDATE role_id=VALUES(role_id),name=VALUES(name),password_hash=VALUES(password_hash),is_active=1',[role,name,email,hash]); return (await pool.execute('SELECT id FROM users WHERE email=?',[email]))[0][0].id; };
  const admin=await user('Administrador de Demonstração','admin@fhdod.example',adminRole.id,adminPassword);
  const setor=await user('Responsável pelo Pronto Atendimento','setor.pa@fhdod.example',sectorRole.id,sectorPassword); await pool.execute('INSERT IGNORE INTO user_sectors(user_id,sector_id) VALUES(?,?)',[setor,pronto]);
  const questions=[['Recepção','Como você avalia o atendimento recebido na recepção?',1],['Triagem','Como você avalia o atendimento recebido durante a triagem?',1],['Enfermagem','Como você avalia o atendimento da equipe de enfermagem?',1],['Atendimento médico','Como você avalia o atendimento médico recebido?',1],['Ambiente e conforto','Como você avalia o conforto do ambiente durante o atendimento?',1]];
  for(const [index,[stage,prompt,required]] of questions.entries()){const [exists]=await pool.execute('SELECT q.id FROM questions q JOIN question_versions qv ON qv.question_id=q.id WHERE qv.prompt=?',[prompt]);if(exists[0])continue;const q=crypto.randomUUID(),v=crypto.randomUUID();await pool.execute("INSERT INTO questions(id,created_by,stage_id,type,status,is_required) VALUES(?,?,?,'rating','active',?)",[q,admin,stages[stage],required]);await pool.execute('INSERT INTO question_versions(id,question_id,version,prompt,created_by) VALUES(?,?,1,?,?)',[v,q,prompt,admin]);for(const [i,label] of ['Muito insatisfeito','Insatisfeito','Neutro','Satisfeito','Muito satisfeito'].entries())await pool.execute('INSERT INTO question_options(id,question_version_id,label,value,display_order) VALUES(UUID(),?,?,?,?)',[v,label,String(i+1),i+1]);await pool.execute('INSERT INTO question_assignments(id,question_id,sector_id,service_id,stage_id,display_order) VALUES(UUID(),?,?,?,?,?)',[q,pronto,urgencia,stages[stage],index+1]);}
  console.log('Dados essenciais de demonstração aplicados.');
} finally { await pool.end(); }
