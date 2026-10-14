import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { pool } from '../config/postgres';

/** Explicit preparation only. No credentials, embeddings or external uploads. */
async function exportRetrieval() {
 const directory=path.resolve(__dirname,'../../../docs/seed');
 const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
 const client=await pool.connect();
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const notes=await client.query("SELECT n.id,n.hospital_id,n.patient_id,n.case_id,n.doctor_id,n.created_at,p.uhid,p.name,n.chief_complaint,n.diagnosis,n.clinical_notes FROM consultation_notes n JOIN patients p ON p.id=n.patient_id WHERE n.hospital_id=$1 ORDER BY n.created_at,n.id",[manifest.hospitalId]);
  const labs=await client.query("SELECT l.id,l.hospital_id,l.patient_id,l.case_id,l.doctor_id,l.created_at,p.uhid,p.name,l.test_name,l.specimen,l.results FROM lab_orders l JOIN patients p ON p.id=l.patient_id WHERE l.hospital_id=$1 AND l.status='Completed' AND l.results IS NOT NULL ORDER BY l.created_at,l.id",[manifest.hospitalId]);
  const profiles=await client.query('SELECT id,hospital_id,user_id,uhid,name,age,gender,blood_group,allergies,created_at FROM patients WHERE hospital_id=$1 ORDER BY id',[manifest.hospitalId]);
  const output:any[]=[];
  const append=(type:string,row:any,record:object,roles:string[])=>output.push({
   document_id:type+':'+row.id,source_table:type,source_id:row.id,dataset_id:manifest.datasetId,
   hospital_id:row.hospital_id,patient_id:row.patient_id||row.id,patient_uhid:row.uhid,
   case_id:row.case_id||null,doctor_id:row.doctor_id||null,patient_user_id:row.user_id||profiles.rows.find(p=>p.id===row.patient_id)?.user_id,
   created_at:row.created_at,exported_at:new Date().toISOString(),synthetic:true,
   sensitivity:'patient-confidential',eligible_roles:roles,requires_server_authorization:true,
   text:JSON.stringify(record)
  });
  for(const p of profiles.rows)append('patients',p,{name:p.name,uhid:p.uhid,age:p.age,gender:p.gender,bloodGroup:p.blood_group,allergies:p.allergies},['patient','doctor','nurse']);
  for(const n of notes.rows)append('consultation_notes',n,{patient:n.name,chiefComplaint:n.chief_complaint,diagnosis:n.diagnosis,clinicalNotes:n.clinical_notes},['patient','doctor','nurse']);
  for(const l of labs.rows)append('lab_orders',l,{patient:l.name,test:l.test_name,specimen:l.specimen,results:l.results},['patient','doctor','nurse','lab']);
  const catalog:string[]=['# Current operational records','', 'Generated '+new Date().toISOString()+'. Dataset '+manifest.datasetId+'. All records are synthetic.',''];
  const sections:[string,string][]=[
   ['Staff directory',"SELECT id,name,email,role,department_id,employee_id,is_active FROM users WHERE hospital_id=$1 AND role<>'patient' ORDER BY id"],
   ['Appointments',"SELECT id,case_id,patient_id,doctor_id,token,to_char(appointment_time,'YYYY-MM-DD HH24:MI') AS scheduled_time,type,status FROM appointments WHERE hospital_id=$1 ORDER BY appointment_time,id"],
   ['Beds',"SELECT id,name,type,status,patient_id,assigned_doctor_id,case_id FROM beds WHERE hospital_id=$1 ORDER BY name"],
   ['Prescriptions',"SELECT id,case_id,patient_id,doctor_id,drug_details,status,date,dispensed_at FROM prescriptions WHERE hospital_id=$1 ORDER BY id"],
   ['Laboratory orders',"SELECT id,case_id,patient_id,test_name,specimen,status,results,date FROM lab_orders WHERE hospital_id=$1 ORDER BY id"],
   ['Current stock',"SELECT id,name,batch,qty,unit,reorder_level,unit_price,expiry,status FROM inventory WHERE hospital_id=$1 ORDER BY id"],
   ['Dispensed batches',"SELECT di.* FROM dispense_items di JOIN prescriptions p ON p.id=di.prescription_id WHERE p.hospital_id=$1 ORDER BY di.id"],
   ['Invoices',"SELECT id,case_id,patient_id,invoice_number,total,paid,balance,status FROM billing WHERE hospital_id=$1 ORDER BY id"],
   ['Invoice charges',"SELECT i.* FROM invoice_items i JOIN billing b ON b.id=i.billing_id WHERE b.hospital_id=$1 ORDER BY i.id"],
   ['Receipts',"SELECT p.* FROM payments p JOIN billing b ON b.id=p.billing_id WHERE b.hospital_id=$1 ORDER BY p.id"],
   ['Nursing tasks',"SELECT id,case_id,patient_id,bed,task,scheduled_time,priority,completed,assigned_nurse_id FROM nurse_tasks WHERE hospital_id=$1 ORDER BY id"],
   ['Stock requests',"SELECT id,inventory_id,requested_by,status FROM inventory_requests WHERE hospital_id=$1 ORDER BY id"],
  ];
  const cell=(value:any)=>value==null?'—':(value instanceof Date?value.toISOString():typeof value==='object'?JSON.stringify(value):String(value)).replace(/\|/g,' / ').replace(/[\r\n]+/g,' ');
  for(const [title,query] of sections){
   const result=await client.query(query,[manifest.hospitalId]);catalog.push('## '+title,'');
   if(!result.rows.length){catalog.push('No records.','');continue;}
   const columns=result.fields.map(f=>f.name);
   catalog.push('| '+columns.join(' | ')+' |','| '+columns.map(()=> '---').join(' | ')+' |');
   for(const row of result.rows)catalog.push('| '+columns.map(c=>cell(row[c])).join(' | ')+' |');
   catalog.push('');
  }
  await client.query('COMMIT');
  await writeFile(path.join(directory,'OPERATIONAL-RECORDS.md'),catalog.join('\n'));
  await writeFile(path.join(directory,'retrieval.local.jsonl'),output.map(r=>JSON.stringify(r)).join('\n')+'\n');
  console.log('Exported '+output.length+' source-linked documents to docs/seed/retrieval.local.jsonl. No embeddings created.');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
exportRetrieval().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>pool.end());
