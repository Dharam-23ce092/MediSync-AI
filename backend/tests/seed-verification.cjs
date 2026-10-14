/* Read-only workflow checks against the seeded data. Login writes audit entries. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const {pool} = require('../dist/config/postgres');
let server;
(async()=>{
 const directory=path.resolve(__dirname,'../../docs/seed');
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
 const lines=fs.readFileSync(path.join(directory,'ACCOUNTS.local.md'),'utf8').split('\n');
 const accounts=lines.filter(l=>l.startsWith('| ')&&l.includes('@zydus.com')).map(line=>{
  const [role,name,email,password,id,uhid]=line.split('|').slice(1,-1).map(s=>s.trim());
  return {role,name,email,password,id,uhid};
 });
 assert.equal(accounts.length,29);
 await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/medisync_logs');
 const app=require('../dist/app').default;
 server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port+'/api';
 const tokens=new Map();
 async function login(email,password){
  return fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
 }
 async function api(account,url){
  return fetch(base+url,{headers:{Authorization:'Bearer '+tokens.get(account.id)}});
 }
 for(const a of accounts){
  const response=await login(a.email,a.password);
  assert.equal(response.status,200,'Valid database account must authenticate: '+a.email);
  const data=(await response.json()).data;tokens.set(a.id,data.token);
  assert.equal(data.user.role,a.role);assert.equal(data.user.hospital_id,manifest.hospitalId);
  if(a.role==='patient')assert.equal(data.user.uhid,a.uhid);
 }
 const admin=accounts.find(a=>a.role==='admin');
 for(const password of ['wrong-password','medisync123','admin_medisync']){
  assert.equal((await login(admin.email,password)).status,401,'No master password may bypass bcrypt');
 }
 assert.equal((await login('admin@zydus.org','admin_medisync')).status,401);
 assert.equal((await login('admin@medisync.local','admin_medisync')).status,401);
 const old=jwt.sign({userId:'U1001',role:'admin',hospital_id:'H101'},process.env.JWT_SECRET,{expiresIn:'1h'});
 assert.equal((await fetch(base+'/overview',{headers:{Authorization:'Bearer '+old}})).status,401);
 for(const role of ['admin','doctor','nurse','patient','pharmacist','lab','receptionist']){
  const a=accounts.find(a=>a.role===role);
  assert.equal((await api(a,'/overview')).status,200,'Dashboard '+role);
 }
 for(const a of accounts.filter(a=>a.role==='patient')){
  const records=await (await api(a,'/cases')).json();
  assert(records.data.length>=2);
  assert(records.data.every(c=>c.patientUhid===a.uhid),'Only own cases');
  const history=await (await api(a,'/consultations/patient/'+a.uhid)).json();
  assert.equal(history.success,true);
  assert(history.data.length>=2);
 }
 const pat=accounts.find(a=>a.role==='patient');
 const otherCase=(await pool.query('SELECT id FROM cases WHERE patient_id<>$1 LIMIT 1',['ZYD-PAT-001'])).rows[0];
 assert.equal((await api(pat,'/cases/'+otherCase.id)).status,403);
 const bedData=await (await api(admin,'/beds')).json();
 assert.equal(bedData.data.length,16);
 assert.equal(bedData.data.filter(b=>b.status==='occupied'&&b.caseId&&b.uhid).length,4);
 const inconsistencies=await pool.query("SELECT id FROM billing WHERE total<>paid+balance UNION ALL SELECT id FROM inventory WHERE qty<0 UNION ALL SELECT b.id FROM beds b JOIN cases c ON c.id=b.case_id WHERE b.patient_id<>c.patient_id");
 assert.equal(inconsistencies.rowCount,0);
 const doctors=await (await api(pat,'/doctors')).json();
 assert.equal(doctors.data.length,4);
 const oldRows=await pool.query("SELECT id FROM users WHERE email NOT LIKE '%@zydus.com' OR hospital_id<>$1",[manifest.hospitalId]);
 assert.equal(oldRows.rowCount,0);
 const orphanVitals=await mongoose.connection.db.collection('vitalhistories').countDocuments({hospital_id:{$ne:manifest.hospitalId}});
 assert.equal(orphanVitals,0);
 assert.equal(await mongoose.connection.db.collection('consultationnotes').countDocuments(),0);
 const report={checkedAt:new Date().toISOString(),datasetId:manifest.datasetId,accountsVerified:29,rolesVerified:7,passwordBypassesRejected:true,patientIsolationVerified:true,bedsLinked:4,ledgerAndStockChecksPassed:true};
 fs.writeFileSync(path.join(directory,'verification.json'),JSON.stringify(report,null,2));
 console.log('PASS: 29 real logins, 7 role dashboards, old credentials/tokens rejected, patient ownership, four linked admissions, stock and billing consistency.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
 if(server)await new Promise(resolve=>server.close(resolve));
 await pool.end();await mongoose.disconnect();
});
