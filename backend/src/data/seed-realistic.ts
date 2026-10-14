import { randomBytes, randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { pool } from '../config/postgres';
import { migrateWorkflows } from './migrate-workflows';
import { VitalHistory, AuditLog } from '../models/mongo/schemas';

process.env.TZ = 'Asia/Kolkata';
const runId=randomUUID(), hospital='ZYD-AHD';
const docs=path.resolve(__dirname,'../../../docs/seed');
const at=(offset:number,hour=9,minute=0)=>{const d=new Date();d.setDate(d.getDate()+offset);d.setHours(hour,minute,0,0);return d;};
const date=(offset:number)=>at(offset).toLocaleDateString('en-CA');
const id=(kind:string,n:number)=>'ZYD-'+kind+'-'+String(n).padStart(3,'0');
type Row=Record<string,any>;
const staff=[
 ['Kavita Shah','admin','administration','Hospital Administration'],
 ['Tirth Desai','receptionist','administration','Patient Services'],
 ['Dr. Devam Patel','doctor','cardiology','Cardiology'],
 ['Dr. Ananya Joshi','doctor','medicine','General Medicine'],
 ['Dr. Rohan Mehta','doctor','orthopaedics','Orthopaedics'],
 ['Dr. Nidhi Rao','doctor','dermatology','Dermatology'],
 ['Anita Parmar','nurse','nursing','Critical Care Nursing'],
 ['Pooja Nair','nurse','nursing','Ward Nursing'],
 ['Bhavika Trivedi','nurse','nursing','Inpatient Nursing'],
 ['Dharmit Fadadu','pharmacist','pharmacy','Pharmacy'],
 ['Amit Verma','pharmacist','pharmacy','Pharmacy'],
 ['Priya Iyer','lab','laboratory','Clinical Laboratory'],
 ['Sunita Rao','lab','laboratory','Clinical Laboratory'],
];
// Name, age, gender, blood group, allergies, complaint, diagnosis, longitudinal note.
const patients=[
 ['Rahul Patel',45,'Male','B+','None reported','Hypertension follow-up','Hypertension','Home BP log reviewed. No new symptoms reported. Follow-up arranged.'],
 ['Meera Shah',58,'Female','O+','Penicillin','Diabetes review','Type 2 diabetes mellitus','Previous glucose results reviewed. Adherence and follow-up discussed.'],
 ['Arjun Desai',34,'Male','A+','None reported','Knee pain review','Mechanical knee pain','Previous injury and mobility history recorded. Physiotherapy follow-up planned.'],
 ['Kavya Joshi',27,'Female','AB+','Nickel','Skin rash review','Contact dermatitis','Trigger history reviewed. Avoidance advice documented and review arranged.'],
 ['Suresh Trivedi',67,'Male','O+','None reported','Blood pressure review','Hypertension','Longitudinal BP trend reviewed; patient reports taking prescribed medicines.'],
 ['Nisha Nair',39,'Female','B+','Sulfonamides','Fatigue review','Iron deficiency anaemia','Prior blood count reviewed. No medication changes documented at this encounter.'],
 ['Vivek Mehta',52,'Male','A+','None reported','Shoulder stiffness','Shoulder pain','Functional limitation and prior physiotherapy sessions documented.'],
 ['Pooja Shah',31,'Female','O+','None reported','Itching follow-up','Eczema','Skin symptom history and prior treatment response documented.'],
 ['Harsh Patel',29,'Male','B+','None reported','Routine follow-up','Elevated blood pressure under review','Monitoring visit; no confirmed chronic diagnosis added.'],
 ['Bhavna Desai',61,'Female','A+','None reported','Diabetes follow-up','Type 2 diabetes mellitus','Patient brings previous reports and medication list for review.'],
 ['Manish Rao',48,'Male','O+','None reported','Back pain follow-up','Mechanical back pain','Pain and mobility history reviewed. No new neurological symptoms reported.'],
 ['Ishita Shah',24,'Female','AB+','Fragrance','Rash follow-up','Contact dermatitis','Exposure history and skin findings documented for longitudinal review.'],
 ['Prakash Parmar',70,'Male','B+','None reported','Observation admission','Blood pressure observation','Admitted for clinician-directed observation. Nursing observations recorded.'],
 ['Rupal Iyer',54,'Female','O+','Penicillin','Medical observation','Glucose monitoring','Inpatient monitoring plan documented; treating team to review observations.'],
 ['Deepak Joshi',43,'Male','A+','None reported','Post-procedure observation','Orthopaedic observation','Mobility and wound review documented. No discharge yet recorded.'],
 ['Neha Trivedi',36,'Female','B+','None reported','Short-stay observation','Dermatology observation','Admitted for observation following assessment; daily review planned.'],
];
// Name, category, unit, opening quantity, reorder level, unit price, expiry offset.
const stock=[
 ['Amlodipine 5 mg','Tablet','Tabs',280,50,3.5,365],
 ['Metformin 500 mg','Tablet','Tabs',460,100,2,420],
 ['Paracetamol 500 mg','Tablet','Tabs',320,60,1.5,300],
 ['Cetirizine 10 mg','Tablet','Tabs',180,40,2.5,270],
 ['Ferrous ascorbate','Tablet','Tabs',160,40,5,240],
 ['Atorvastatin 10 mg','Tablet','Tabs',24,50,6,210],
 ['Sterile gauze pack','Consumable','Packs',80,20,18,540],
 ['Examination gloves','Consumable','Boxes',36,10,220,480],
 ['Normal saline 500 ml','IV Fluid','Bottles',60,20,45,120],
 ['Oral rehydration salts','Sachet','Sachets',0,30,12,330],
 ['Paracetamol 500 mg','Tablet','Tabs',40,20,1.5,-30],
 ['Cetirizine 10 mg','Tablet','Tabs',35,20,2.5,20],
];
const accounts:Row[]=[],cases:Row[]=[],visits:Row[]=[],vitals:Row[]=[];
let timeline=0,invoice=0,prescription=0,lab=0;
async function seed(){
 if(!process.argv.includes('--reset'))throw new Error('Intentional local reset required: npm run seed -- --reset');
 if(process.env.NODE_ENV==='production')throw new Error('Synthetic reseeding is disabled in production.');
 await mkdir(docs,{recursive:true});
 await migrateWorkflows();
 await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/medisync_logs');
 const client=await pool.connect();
 const insert=async(table:string,row:Row)=>{const keys=Object.keys(row);await client.query('INSERT INTO '+table+' ('+keys.join(',')+') VALUES ('+keys.map((_,i)=>'$'+(i+1)).join(',')+')',Object.values(row));};
 const event=async(c:string,type:string,actor:string,role:string,summary:string,when:Date)=>insert('case_timeline',{id:id('EVT',++timeline),case_id:c,event_type:type,actor_id:actor,actor_role:role,summary,metadata:JSON.stringify({seed_run_id:runId,synthetic:true}),created_at:when});
 const createCase=async(p:number,doctor:number,offset:number,kind:string,status:string,scenario:string,hour=9,minute=0)=>{
  const spec=patients[p-1],row={id:id('CASE',cases.length+1),hospital_id:hospital,patient_id:id('PAT',p),case_number:'ZYD-'+kind+'-'+String(cases.length+1).padStart(4,'0'),type:kind,status,assigned_doctor:id('STAFF',doctor),chief_complaint:spec[5],diagnosis:['requested','scheduled'].includes(status)?'':spec[6],admission_date:kind==='IPD'?at(offset,hour,minute):null,created_at:at(offset,hour,minute),updated_at:at(offset,hour,minute)};
  await insert('cases',row);cases.push({...row,scenario});await event(row.id,'case_registered',id('STAFF',2),'receptionist',kind+' encounter registered for '+spec[0]+'.',at(offset,hour,minute));return row;
 };
 const visit=async(p:number,d:number,offset:number,h:number,m:number,status:string,scenario:string)=>{
  const states:Row={Requested:'requested',Confirmed:'scheduled','Checked-in':'waiting','In Consultation':'in_consultation',Completed:'consultation_complete',Cancelled:'cancelled',Rejected:'cancelled'};
  const c=await createCase(p,d,offset,'OPD',states[status],scenario,h,m);
  const a={id:id('APT',visits.length+1),hospital_id:hospital,case_id:c.id,patient_id:c.patient_id,doctor_id:c.assigned_doctor,token:String(visits.filter(v=>v.doctor_id===c.assigned_doctor&&new Date(v.appointment_time).toDateString()===at(offset).toDateString()).length+1),appointment_time:at(offset,h,m),type:offset<0?'Follow-up':'New',status,created_at:at(offset-1,10)};
  await insert('appointments',a);visits.push(a);await event(c.id,'appointment_updated',c.assigned_doctor,'doctor','Appointment '+status+'.',at(offset,h,m));
  if(status==='Completed'){const spec=patients[p-1];await insert('consultation_notes',{id:id('NOTE',visits.length),hospital_id:hospital,appointment_id:a.id,case_id:c.id,patient_id:c.patient_id,doctor_id:c.assigned_doctor,chief_complaint:spec[5],diagnosis:spec[6],clinical_notes:(offset===-60?'Initial assessment: ':'Follow-up comparison with prior encounter: ')+spec[7]+' Synthetic training encounter; not treatment guidance.',created_at:at(offset,h,m+20)});}
  return c;
 };
 const charge=async(c:Row,description:string,qty:number,price:number,paid:number,offset:number)=>{
  const n=++invoice,total=Math.round(qty*price*100)/100;
  await insert('billing',{id:id('INV',n),hospital_id:hospital,case_id:c.id,patient_id:c.patient_id,invoice_number:'ZYD-INV-'+String(n).padStart(4,'0'),subtotal:total,discount:0,tax:0,total,paid,balance:total-paid,status:paid===total?'PAID':paid>0?'PARTIAL':'PENDING',created_at:at(offset,13)});
  await insert('invoice_items',{id:id('ITEM',n),billing_id:id('INV',n),description,quantity:qty,unit_price:price,total_price:total});
  if(paid>0)await insert('payments',{id:id('PAY',n),billing_id:id('INV',n),amount:paid,payment_method:'Cash',transaction_reference:'SYNTHETIC-RECEIPT-'+n,status:'SUCCESS',created_at:at(offset,13,30)});
  await event(c.id,'invoice_created',id('STAFF',1),'admin','Invoice '+id('INV',n)+' total INR '+total+', receipt INR '+paid+'.',at(offset,13,30));
 };
 const rx=async(c:Row,batch:number,qty:number,offset:number,dispensed:boolean)=>{
  const n=++prescription,item=stock[batch-1],price=Number(item[5]);
  await insert('prescriptions',{id:id('RX',n),hospital_id:hospital,case_id:c.id,patient_id:c.patient_id,doctor_id:c.assigned_doctor,drug_details:item[0]+' | Synthetic order: one unit daily for '+qty+' days. Verify clinical order before dispensing.',status:dispensed?'Dispensed':'Pending',date:date(offset),created_at:at(offset,12,30),dispensed_at:dispensed?at(offset,13):null});
  if(dispensed){await client.query('UPDATE inventory SET qty=qty-$1 WHERE id=$2',[qty,id('STOCK',batch)]);await insert('dispense_items',{id:id('DISP',n),prescription_id:id('RX',n),inventory_id:id('STOCK',batch),quantity:qty,unit_price:price});await charge(c,String(item[0])+' · batch ZYD-B'+batch,qty,price,qty*price,offset);}
  await event(c.id,dispensed?'prescription_dispensed':'prescription_created',dispensed?id('STAFF',10):c.assigned_doctor,dispensed?'pharmacist':'doctor',id('RX',n)+(dispensed?' dispensed from recorded batch.':' awaiting pharmacy review.'),at(offset,13));
 };
 const order=async(c:Row,offset:number,status:string)=>{
  const n=++lab;await insert('lab_orders',{id:id('LAB',n),hospital_id:hospital,case_id:c.id,patient_id:c.patient_id,doctor_id:c.assigned_doctor,test_name:'Complete Blood Count',specimen:'EDTA whole blood',status,results:status==='Completed'?JSON.stringify({hb:13.2,wbc:7200,status:'normal'}):null,date:date(offset),created_at:at(offset,13)});
  await event(c.id,'lab_updated',id('STAFF',12),'lab',id('LAB',n)+' Complete Blood Count: '+status+'.',at(offset,14));
 };
 try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(734621)');
  await client.query('TRUNCATE TABLE dispense_items, inventory_requests, consultation_notes, nurse_tasks, inventory, payments, invoice_items, billing, lab_orders, prescriptions, beds, appointments, case_timeline, cases, doctors, patients, users, departments, hospitals CASCADE');
  await insert('hospitals',{id:hospital,name:'Zydus Ahmedabad — Training Hospital',slug:'zydus-ahmedabad-training',domain:'zydus.com',address:'Synthetic training campus, Ahmedabad',city:'Ahmedabad',state:'Gujarat',phone:'0000000000',license_no:'SYNTHETIC-NOT-A-LICENSE',status:'active',plan:'professional'});
  for(const [key,name] of [['administration','Administration'],['cardiology','Cardiology'],['medicine','General Medicine'],['orthopaedics','Orthopaedics'],['dermatology','Dermatology'],['nursing','Nursing and Wards'],['pharmacy','Pharmacy'],['laboratory','Laboratory']])await insert('departments',{id:'ZYD-DEP-'+key,hospital_id:hospital,name,code:'ZYD-'+key.toUpperCase(),description:name+' training service'});
  for(let i=0;i<staff.length;i++){
   const [name,role,department,specialty]=staff[i],email=name.replace(/^Dr\. /,'').toLowerCase().replace(/ /g,'.')+'@zydus.com',password='Zy!'+randomBytes(9).toString('base64url')+'7';
   const a={id:id('STAFF',i+1),name,role,email,password};accounts.push(a);
   await insert('users',{id:a.id,hospital_id:hospital,email,password_hash:await bcrypt.hash(password,12),name,role,specialty,department_id:'ZYD-DEP-'+department,employee_id:id('EMP',i+1),is_active:true});
   if(role==='doctor')await insert('doctors',{id:id('DOC',i+1),hospital_id:hospital,user_id:a.id,department_id:'ZYD-DEP-'+department,availability_status:'Available'});
  }
  for(let i=0;i<patients.length;i++){
   const [name,age,gender,blood,allergies]=patients[i],n=i+1,email=String(name).toLowerCase().replace(/ /g,'.')+'.patient@zydus.com',password='Zy!'+randomBytes(9).toString('base64url')+'7';
   const a={id:id('USER',n),name,role:'patient',email,password,patientId:id('PAT',n),uhid:'ZYD-AHD-'+String(n).padStart(6,'0')};accounts.push(a);
   await insert('users',{id:a.id,hospital_id:hospital,email,password_hash:await bcrypt.hash(password,12),name,role:'patient',is_active:true});
   await insert('patients',{id:a.patientId,hospital_id:hospital,user_id:a.id,uhid:a.uhid,name,age,gender,blood_group:blood,emergency_contact:'0000000000',allergies,status:n>12?'IPD':'OPD',created_at:at(-100)});
  }
  for(let i=0;i<stock.length;i++){const [name,category,unit,qty,reorder,price,expiry]=stock[i];await insert('inventory',{id:id('STOCK',i+1),hospital_id:hospital,name,category,batch:'ZYD-B'+(i+1),qty,unit,reorder_level:reorder,unit_price:price,expiry:date(Number(expiry)),manufacturer:'Synthetic Training Supplies',status:Number(qty)<=Number(reorder)?'Low Stock':'In Stock'});}
  for(let p=1;p<=16;p++){
   const doctor=3+(p-1)%4,c1=await visit(p,doctor,-60,9+Math.floor((p-1)/4),0,'Completed','Earlier history');
   await order(c1,-60,'Completed');await charge(c1,'Outpatient consultation',1,600,600,-60);
   const c2=await visit(p,doctor,-14,9+Math.floor((p-1)/4),0,'Completed','Recent follow-up');
   await rx(c2,p===6?5:1+(p-1)%4,7,-14,true);await charge(c2,'Follow-up consultation',1,400,p%3===0?200:400,-14);
  }
  const states=['Requested','Confirmed','Checked-in','In Consultation','Confirmed','Requested','Checked-in','Confirmed'];
  for(let p=1;p<=8;p++){const c=await visit(p,3+(p-1)%4,0,9+Math.floor((p-1)/4),0,states[p-1],'Today: '+states[p-1]);if(p===4)await order(c,0,'Received');}
  const finished=await visit(9,3,0,11,0,'Completed','Ready for pharmacy');await rx(finished,1,7,0,false);await charge(finished,'Outpatient consultation',1,600,0,0);
  for(let p=1;p<=8;p++)await visit(p,3+(p-1)%4,1,9+Math.floor((p-1)/4),30,p%2?'Requested':'Confirmed','Tomorrow booking review');
  await visit(10,4,-2,14,0,'Cancelled','Cancelled visit history');await visit(11,5,-2,14,0,'Rejected','Declined request history');
  for(let b=1;b<=16;b++){
   const type=b===1?'ICU':b===4||b>12?'Private Room':'General Ward',name=(type==='ICU'?'ICU-':type==='General Ward'?'WARD-A-':'PRIVATE-')+String(b).padStart(2,'0');let c:Row|null=null;
   if(b<=4){
    const p=12+b;c=await createCase(p,2+b,-2,'IPD','admitted','Active admission',14);
    await order(c,-1,b%2?'Collected':'Received');await rx(c,b,7,0,false);await charge(c,'Recorded accommodation charge (2 days)',2,type==='ICU'?2500:type==='Private Room'?1800:1200,b%2?1200:0,-1);
    for(let t=1;t<=3;t++)await insert('nurse_tasks',{id:id('TASK',(b-1)*3+t),hospital_id:hospital,case_id:c.id,patient_id:c.patient_id,bed:name,patient_name:patients[p-1][0],task:['Admission assessment','Record scheduled observations','Review care plan with treating provider'][t-1],scheduled_time:['On admission','09:00','14:00'][t-1],priority:t===2?'high':'medium',completed:t===1,assigned_nurse_id:id('STAFF',7+(b-1)%3),created_at:at(-2,14)});
    for(let day=-2;day<=0;day++)vitals.push({hospital_id:hospital,patient_id:c.patient_id,case_id:c.id,uhid:'ZYD-AHD-'+String(p).padStart(6,'0'),hr:76+b+day,bp:'128/82',temp:98.4,spo2:97,status:'normal',notes:'Synthetic bedside observation; temperature in degrees F.',recordedBy:staff[6+(b-1)%3][0],recordedAt:at(day,day===-2?16:8)});
   }
   await insert('beds',{id:id('BED',b),hospital_id:hospital,name,type,status:c?'occupied':b===5?'cleaning':'available',patient_id:c?.patient_id||null,assigned_doctor_id:c?.assigned_doctor||null,case_id:c?.id||null});
  }
  const discharged=await createCase(12,6,-7,'IPD','discharged','Discharged admission',14);
  await client.query('UPDATE cases SET discharge_date=$1 WHERE id=$2',[at(-5,11),discharged.id]);await event(discharged.id,'discharged',id('STAFF',6),'doctor','Discharged after observation; no current bed assignment.',at(-5,11));
  await insert('inventory_requests',{id:'ZYD-REORDER-001',hospital_id:hospital,inventory_id:id('STOCK',6),requested_by:id('STAFF',10),status:'Requested'});
  await client.query("UPDATE inventory SET status=CASE WHEN qty<=reorder_level THEN 'Low Stock' ELSE 'In Stock' END");
  const bad=await client.query("SELECT id FROM billing WHERE balance<>total-paid OR subtotal-discount+tax<>total UNION ALL SELECT id FROM inventory WHERE qty<0");if(bad.rowCount)throw new Error('Seed accounting/stock consistency failed.');
  await writeFile(path.join(docs,'ACCOUNTS.local.md'),[
   '# Local training accounts — do not publish','',
   'Dataset '+runId+' generated '+new Date().toISOString()+'.',
   'Fictional identities. @zydus.com addresses are local login identifiers only. No emails are sent and no real hospital affiliation is claimed.',
   'Random per-account passwords are bcrypt-hashed in PostgreSQL. This local credentials file is git-ignored. No quick-login or master-password bypass exists.','',
   '| Role | Name | Login email | Password | User ID | Patient UHID |','| --- | --- | --- | --- | --- | --- |',
   ...accounts.map(a=>'| '+[a.role,a.name,a.email,a.password,a.id,a.uhid||'—'].join(' | ')+' |')
  ].join('\n'));
  // Remove stale clinical documents too, so startup cannot reimport deleted data.
  for(const collection of ['vitalhistories','auditlogs','aichatsessions','consultationnotes','labresults','systemlogs'])await mongoose.connection.db!.collection(collection).deleteMany({});
  await VitalHistory.insertMany(vitals);
  await AuditLog.create({hospital_id:hospital,userId:id('STAFF',1),userName:staff[0][0],role:'admin',event:'SYNTHETIC_DATASET_RESET '+runId,module:'seed',ipAddress:'127.0.0.1',severity:'info'});
  await client.query('COMMIT');
  await writeFile(path.join(docs,'manifest.json'),JSON.stringify({datasetId:runId,synthetic:true,timezone:'Asia/Kolkata',seedDate:date(0),hospitalId:hospital,users:accounts.length,patients:16,cases:cases.length,appointments:visits.length,prescriptions:prescription,invoices:invoice,labOrders:lab,inventoryBatches:stock.length,beds:16,nurseTasks:12},null,2));
  await writeFile(path.join(docs,'RECORD-MAP.md'),[
   '# Seed record map','',
   'Dataset '+runId+'; seed date '+date(0)+' (Asia/Kolkata). Fictional local training data.',
   'Credentials: ACCOUNTS.local.md. Scenarios and retrieval rules: WORKFLOW-GUIDE.md.','',
   '| Patient | Patient ID | UHID | Primary doctor ID |','| --- | --- | --- | --- |',
   ...accounts.filter(a=>a.role==='patient').map((a,i)=>'| '+[a.name,a.patientId,a.uhid,id('STAFF',3+i%4)].join(' | ')+' |'),'',
   '| Case ID | Reference | Patient ID | Doctor ID | Scenario |','| --- | --- | --- | --- | --- |',
   ...cases.map(c=>'| '+[c.id,c.case_number,c.patient_id,c.assigned_doctor,c.scenario].join(' | ')+' |'),'',
   '| Inventory ID | Name | Batch | Opening quantity | Unit price | Expiry |','| --- | --- | --- | --- | --- | --- |',
   ...stock.map((s,i)=>'| '+[id('STOCK',i+1),s[0],'ZYD-B'+(i+1),s[3],s[5],date(Number(s[6]))].join(' | ')+' |'),
   'Current stock is opening quantity less linked historical dispense_items. All balances equal invoice total minus recorded receipts.'
  ].join('\n'));
  console.log('Seed complete: '+accounts.length+' accounts, '+cases.length+' cases, '+visits.length+' appointments. See docs/seed/.');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
seed().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await pool.end();await mongoose.disconnect();});
