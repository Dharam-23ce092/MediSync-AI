import app from './app';
import { connectPostgres, pool } from './config/postgres';
import { connectMongo } from './config/mongo';
import mongoose from 'mongoose';
import { AuditLog } from './models/mongo/schemas';
import http from 'http';

const PORT = 3098;
let adminToken = '';
let doctorToken = '';
let nurseToken = '';
let patientToken = '';
let pharmacistToken = '';
let labToken = '';
let passed = 0;
let failed = 0;

const assert = (testName: string, condition: boolean) => {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName}`);
    failed++;
  }
};

const login = async (email: string, password: string): Promise<any> => {
  const res = await fetch(`http://localhost:${PORT}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return { status: res.status, body: await res.json() };
};

const get = async (path: string, token?: string): Promise<any> => {
  const headers: any = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`http://localhost:${PORT}/api${path}`, { headers });
  return { status: res.status, body: await res.json() };
};

const post = async (path: string, data: any, token?: string): Promise<any> => {
  const headers: any = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`http://localhost:${PORT}/api${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });
  return { status: res.status, body: await res.json() };
};

const runTests = async () => {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   MEDISYNC AI — PHASE 3B: ROLE-BASED ACCESS TESTS      ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  await connectPostgres();
  await connectMongo();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, () => resolve()));
  console.log(`Test server on port ${PORT}\n`);

  // Record initial audit log count
  const initialAuditCount = await AuditLog.countDocuments();

  // ═══════════════ LOGIN ALL ROLES ═══════════════
  console.log('── LOGIN ALL SEEDED ROLES ──');

  const adminLogin = await login('admin@medisync.local', 'admin_medisync');
  assert('Admin login succeeds (200)', adminLogin.status === 200 && adminLogin.body.success === true);
  adminToken = adminLogin.body.data?.token;

  const doctorLogin = await login('doctor@medisync.local', 'doctor_medisync');
  assert('Doctor login succeeds (200)', doctorLogin.status === 200);
  doctorToken = doctorLogin.body.data?.token;

  const nurseLogin = await login('nurse@medisync.local', 'nurse_medisync');
  assert('Nurse login succeeds (200)', nurseLogin.status === 200);
  nurseToken = nurseLogin.body.data?.token;

  const patientLogin = await login('patient@medisync.local', 'patient_medisync');
  assert('Patient login succeeds (200)', patientLogin.status === 200);
  patientToken = patientLogin.body.data?.token;

  const pharmacistLogin = await login('pharmacist@medisync.local', 'pharmacist_medisync');
  assert('Pharmacist login succeeds (200)', pharmacistLogin.status === 200);
  pharmacistToken = pharmacistLogin.body.data?.token;

  const labLogin = await login('lab@medisync.local', 'lab_medisync');
  assert('Lab login succeeds (200)', labLogin.status === 200);
  labToken = labLogin.body.data?.token;

  // ═══════════════ AUTH FAILURE CASES ═══════════════
  console.log('\n── AUTHENTICATION FAILURE CASES ──');

  const noJwt = await get('/patients');
  assert('Missing JWT → 401', noJwt.status === 401 && noJwt.body.errorCode === 'UNAUTHORIZED');

  const badJwt = await get('/patients', 'invalid.jwt.token');
  assert('Invalid JWT → 401', badJwt.status === 401 && badJwt.body.errorCode === 'INVALID_TOKEN');

  // ═══════════════ ADMIN ACCESS ═══════════════
  console.log('\n── ADMIN ACCESS ──');

  const adminPatients = await get('/patients', adminToken);
  assert('Admin can list patients', adminPatients.status === 200 && adminPatients.body.success === true);

  const adminDepts = await get('/departments', adminToken);
  assert('Admin can list departments', adminDepts.status === 200);

  const adminDoctors = await get('/doctors', adminToken);
  assert('Admin can list doctors', adminDoctors.status === 200);

  const adminAppointments = await get('/appointments', adminToken);
  assert('Admin can list appointments', adminAppointments.status === 200);

  const adminBeds = await get('/beds', adminToken);
  assert('Admin can list beds', adminBeds.status === 200);

  const adminPrescriptions = await get('/prescriptions', adminToken);
  assert('Admin can list prescriptions', adminPrescriptions.status === 200);

  const adminLabOrders = await get('/lab-orders', adminToken);
  assert('Admin can list lab orders', adminLabOrders.status === 200);

  const adminVitals = await get('/vitals', adminToken);
  assert('Admin can list vitals', adminVitals.status === 200);

  const adminBilling = await get('/billing', adminToken);
  assert('Admin can list billing', adminBilling.status === 200);

  const adminAudit = await get('/audit-logs', adminToken);
  assert('Admin can access audit logs', adminAudit.status === 200);

  // ═══════════════ DOCTOR ACCESS ═══════════════
  console.log('\n── DOCTOR ACCESS ──');

  const docPatients = await get('/patients', doctorToken);
  assert('Doctor can list patients', docPatients.status === 200);

  const docAppointments = await get('/appointments', doctorToken);
  assert('Doctor can list appointments', docAppointments.status === 200);

  const docBeds = await get('/beds', doctorToken);
  assert('Doctor can list beds', docBeds.status === 200);

  const docPrescriptions = await get('/prescriptions', doctorToken);
  assert('Doctor can list prescriptions', docPrescriptions.status === 200);

  const docLabOrders = await get('/lab-orders', doctorToken);
  assert('Doctor can list lab orders', docLabOrders.status === 200);

  const docVitals = await get('/vitals', doctorToken);
  assert('Doctor can list vitals', docVitals.status === 200);

  const docAuditDenied = await get('/audit-logs', doctorToken);
  assert('Doctor CANNOT access audit logs (403)', docAuditDenied.status === 403);

  const docBillingDenied = await get('/billing', doctorToken);
  assert('Doctor CANNOT access billing (403)', docBillingDenied.status === 403);

  // ═══════════════ NURSE ACCESS ═══════════════
  console.log('\n── NURSE ACCESS ──');

  const nursePatients = await get('/patients', nurseToken);
  assert('Nurse can list patients', nursePatients.status === 200);

  const nurseAppointments = await get('/appointments', nurseToken);
  assert('Nurse can list appointments', nurseAppointments.status === 200);

  const nurseBeds = await get('/beds', nurseToken);
  assert('Nurse can list beds', nurseBeds.status === 200);

  const nurseVitals = await get('/vitals', nurseToken);
  assert('Nurse can list vitals', nurseVitals.status === 200);

  const nurseAuditDenied = await get('/audit-logs', nurseToken);
  assert('Nurse CANNOT access audit logs (403)', nurseAuditDenied.status === 403);

  const nurseBillingDenied = await get('/billing', nurseToken);
  assert('Nurse CANNOT access billing (403)', nurseBillingDenied.status === 403);

  // ═══════════════ PATIENT ACCESS ═══════════════
  console.log('\n── PATIENT ACCESS ──');

  const patAllPatientsDenied = await get('/patients', patientToken);
  assert('Patient CANNOT list all patients (403)', patAllPatientsDenied.status === 403);

  // Patient can view own record (P1001 → Rahul Kumar Patel → UHID-2026-981240)
  const patOwnRecord = await get('/patients/UHID-2026-981240', patientToken);
  assert('Patient CAN view own record by UHID', patOwnRecord.status === 200 && patOwnRecord.body.success === true);

  // Patient CANNOT view another patient's record
  const patOtherRecord = await get('/patients/P1002', patientToken);
  assert('Patient CANNOT view another patient record (403)', patOtherRecord.status === 403 && patOtherRecord.body.errorCode === 'FORBIDDEN');

  const patBedsDenied = await get('/beds', patientToken);
  assert('Patient CANNOT access beds (403)', patBedsDenied.status === 403);

  const patVitalsDenied = await get('/vitals', patientToken);
  assert('Patient CANNOT access all vitals dashboard (403)', patVitalsDenied.status === 403);

  const patAuditDenied = await get('/audit-logs', patientToken);
  assert('Patient CANNOT access audit logs (403)', patAuditDenied.status === 403);

  // Patient can access own prescriptions, lab orders, billing (filtered by own UHID)
  const patPrescriptions = await get('/prescriptions', patientToken);
  assert('Patient can access prescriptions (own only)', patPrescriptions.status === 200);

  const patLabOrders = await get('/lab-orders', patientToken);
  assert('Patient can access lab orders (own only)', patLabOrders.status === 200);

  const patBilling = await get('/billing', patientToken);
  assert('Patient can access billing (own only)', patBilling.status === 200);

  // ═══════════════ PHARMACIST ACCESS ═══════════════
  console.log('\n── PHARMACIST ACCESS ──');

  const pharmPatients = await get('/patients', pharmacistToken);
  assert('Pharmacist can list patients', pharmPatients.status === 200);

  const pharmPrescriptions = await get('/prescriptions', pharmacistToken);
  assert('Pharmacist can list prescriptions', pharmPrescriptions.status === 200);

  const pharmBedsDenied = await get('/beds', pharmacistToken);
  assert('Pharmacist CANNOT access beds (403)', pharmBedsDenied.status === 403);

  const pharmVitalsDenied = await get('/vitals', pharmacistToken);
  assert('Pharmacist CANNOT access vitals dashboard (403)', pharmVitalsDenied.status === 403);

  const pharmAuditDenied = await get('/audit-logs', pharmacistToken);
  assert('Pharmacist CANNOT access audit logs (403)', pharmAuditDenied.status === 403);

  const pharmAiDenied = await post('/ai/chat', { message: 'test' }, pharmacistToken);
  assert('Pharmacist CANNOT access AI assistant (403)', pharmAiDenied.status === 403);

  // ═══════════════ LAB ACCESS ═══════════════
  console.log('\n── LAB ACCESS ──');

  const labLabOrders = await get('/lab-orders', labToken);
  assert('Lab can list lab orders', labLabOrders.status === 200);

  const labPatients = await get('/patients', labToken);
  assert('Lab can list patients', labPatients.status === 200);

  const labBedsDenied = await get('/beds', labToken);
  assert('Lab CANNOT access beds (403)', labBedsDenied.status === 403);

  const labVitalsDenied = await get('/vitals', labToken);
  assert('Lab CANNOT access vitals dashboard (403)', labVitalsDenied.status === 403);

  const labAuditDenied = await get('/audit-logs', labToken);
  assert('Lab CANNOT access audit logs (403)', labAuditDenied.status === 403);

  const labAiDenied = await post('/ai/chat', { message: 'test' }, labToken);
  assert('Lab CANNOT access AI assistant (403)', labAiDenied.status === 403);

  // ═══════════════ AI ASSISTANT ROLE CHECK ═══════════════
  console.log('\n── AI ASSISTANT ACCESS ──');

  const adminAi = await post('/ai/chat', { message: 'Check vitals' }, adminToken);
  assert('Admin CAN access AI assistant', adminAi.status === 200);

  const doctorAi = await post('/ai/chat', { message: 'Check vitals' }, doctorToken);
  assert('Doctor CAN access AI assistant', doctorAi.status === 200);

  const nurseAiDenied = await post('/ai/chat', { message: 'test' }, nurseToken);
  assert('Nurse CANNOT access AI assistant (403)', nurseAiDenied.status === 403);

  const patientAiDenied = await post('/ai/chat', { message: 'test' }, patientToken);
  assert('Patient CANNOT access AI assistant (403)', patientAiDenied.status === 403);

  // ═══════════════ AUDIT LOG GENERATION ═══════════════
  console.log('\n── AUDIT LOG GENERATION ──');

  const finalAuditCount = await AuditLog.countDocuments();
  assert(`Audit logs generated during tests (${finalAuditCount - initialAuditCount} new entries)`, finalAuditCount > initialAuditCount);

  // ═══════════════ SUMMARY ═══════════════
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║   RESULTS: ${passed} PASSED, ${failed} FAILED (${passed + failed} total)          ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  server.close();
  await pool.end();
  await mongoose.disconnect();
};

runTests().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
