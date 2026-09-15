import { Pool } from 'pg';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

// Import Mongo models
import { VitalHistory, AuditLog, AIChatSession } from '../models/mongo/schemas';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectionString = process.env.DATABASE_URL || 'postgresql://medisync:medisync_secret@localhost:5432/medisync_db';
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/medisync_logs';

// Helper: get today's date string
const todayStr = () => new Date().toISOString().split('T')[0];

// Helper: get a Date for today at a specific hour
const todayAt = (hour: number, minute = 0) => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
};

const seed = async () => {
  console.log('Seeding databases...');

  // 1. Connect to PostgreSQL
  const pool = new Pool({ connectionString });
  let pgClient;

  try {
    pgClient = await pool.connect();

    // Clear PostgreSQL tables safely
    console.log('Cleaning PostgreSQL database...');
    await pgClient.query('TRUNCATE TABLE nurse_tasks, inventory, payments, invoice_items, billing, lab_orders, prescriptions, beds, appointments, case_timeline, cases, doctors, users, patients, departments, hospitals CASCADE');

    // 2. Clear MongoDB collections
    console.log('Cleaning MongoDB collections...');
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoURI);
    }
    await VitalHistory.deleteMany({});
    await AuditLog.deleteMany({});
    await AIChatSession.deleteMany({});

    // Hash passwords
    console.log('Generating password hashes...');
    const adminHash = await bcrypt.hash('admin_medisync', 10);
    const doctorHash = await bcrypt.hash('doctor_medisync', 10);
    const nurseHash = await bcrypt.hash('nurse_medisync', 10);
    const patientHash = await bcrypt.hash('patient_medisync', 10);
    const pharmacistHash = await bcrypt.hash('pharmacist_medisync', 10);
    const labHash = await bcrypt.hash('lab_medisync', 10);

    // 2.5 Seed Hospital
    console.log('Seeding default hospital...');
    const hospitalId = 'H101';
    await pgClient.query(
      'INSERT INTO hospitals (id, name, slug, domain, status, plan) VALUES ($1, $2, $3, $4, $5, $6)',
      [hospitalId, 'Zydus Hospital', 'zydus-hospital', '@zydus.org', 'active', 'professional']
    );

    // 3. Seed Departments
    console.log('Seeding departments...');
    const depts = [
      { id: 'D1', name: 'Cardiology', code: 'CARD', description: 'Heart and vascular care' },
      { id: 'D2', name: 'Pediatrics', code: 'PED', description: 'Child healthcare services' },
      { id: 'D3', name: 'General Medicine', code: 'GEN', description: 'Routine and general outpatient care' },
      { id: 'D4', name: 'Laboratory Services', code: 'LAB', description: 'Diagnostic pathology and testing' },
      { id: 'D5', name: 'Pharmacy', code: 'PHAR', description: 'Medication management and dispensing' },
      { id: 'D6', name: 'Nursing & Wards', code: 'NUR', description: 'Inpatient support and ICU care' }
    ];

    for (const d of depts) {
      await pgClient.query(
        'INSERT INTO departments (id, hospital_id, name, code, description) VALUES ($1, $2, $3, $4, $5)',
        [d.id, hospitalId, d.name, d.code, d.description]
      );
    }

    // 4. Seed Users (migrated to @zydus.org)
    console.log('Seeding users...');
    const users = [
      { id: 'U1001', email: 'admin@zydus.org', password_hash: adminHash, name: 'Rajesh Iyer', role: 'admin', specialty: 'Hospital Administration', department_id: 'D3', employee_id: 'EMP-001' },
      { id: 'U1002', email: 'doctor@zydus.org', password_hash: doctorHash, name: 'Dr. Devam Patel', role: 'doctor', specialty: 'Cardiology (MD, DM)', department_id: 'D1', employee_id: 'EMP-002' },
      { id: 'U1003', email: 'nurse@zydus.org', password_hash: nurseHash, name: 'Sister Ananya Sharma', role: 'nurse', specialty: 'ICU Critical Care', department_id: 'D6', employee_id: 'EMP-003' },
      { id: 'U1004', email: 'patient@zydus.org', password_hash: patientHash, name: 'Rahul Kumar Patel', role: 'patient', specialty: null, department_id: null, employee_id: null },
      { id: 'U1005', email: 'pharmacist@zydus.org', password_hash: pharmacistHash, name: 'Amit Verma', role: 'pharmacist', specialty: 'Pharmacology', department_id: 'D5', employee_id: 'EMP-004' },
      { id: 'U1006', email: 'lab@zydus.org', password_hash: labHash, name: 'Dr. Sunita Rao', role: 'lab', specialty: 'Clinical Pathology', department_id: 'D4', employee_id: 'EMP-005' },
      // Also seed named aliases so both formats work seamlessly
      { id: 'U1007', email: 'doctor.patel@zydus.org', password_hash: doctorHash, name: 'Dr. Devam Patel', role: 'doctor', specialty: 'Cardiology (MD, DM)', department_id: 'D1', employee_id: 'EMP-007' },
      { id: 'U1008', email: 'nurse.anita@zydus.org', password_hash: nurseHash, name: 'Sister Ananya Sharma', role: 'nurse', specialty: 'ICU Critical Care', department_id: 'D6', employee_id: 'EMP-008' },
      { id: 'U1009', email: 'pharmacist.rahul@zydus.org', password_hash: pharmacistHash, name: 'Amit Verma', role: 'pharmacist', specialty: 'Pharmacology', department_id: 'D5', employee_id: 'EMP-009' },
      { id: 'U1010', email: 'lab.priya@zydus.org', password_hash: labHash, name: 'Dr. Sunita Rao', role: 'lab', specialty: 'Clinical Pathology', department_id: 'D4', employee_id: 'EMP-010' },
      { id: 'U1011', email: 'patient.aarav@zydus.org', password_hash: patientHash, name: 'Aarav Mehta', role: 'patient', specialty: null, department_id: null, employee_id: null }
    ];

    for (const u of users) {
      await pgClient.query(
        'INSERT INTO users (id, hospital_id, email, password_hash, name, role, specialty, department_id, employee_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [u.id, hospitalId, u.email, u.password_hash, u.name, u.role, u.specialty, u.department_id, u.employee_id]
      );
    }

    // 5. Seed Doctors
    console.log('Seeding doctors table...');
    await pgClient.query(
      'INSERT INTO doctors (id, hospital_id, user_id, department_id, availability_status) VALUES ($1, $2, $3, $4, $5)',
      ['DOC001', hospitalId, 'U1002', 'D1', 'Available']
    );

    // 6. Seed Patients (Corresponds to patient.store.ts)
    console.log('Seeding patients...');
    const patients = [
      { id: 'P1001', user_id: 'U1004', uhid: 'UHID-2026-981240', name: 'Rahul Kumar Patel', age: 45, gender: 'Male', blood_group: 'B+ve', emergency_contact: '+91 98765 12345', allergies: 'Penicillin, Peanuts', status: 'OPD' },
      { id: 'P1002', user_id: 'U1011', uhid: 'UHID-2026-102', name: 'Aarav Mehta', age: 62, gender: 'Male', blood_group: 'O+ve', emergency_contact: '+91 98765 23456', allergies: null, status: 'IPD' },
      { id: 'P1003', user_id: null, uhid: 'UHID-2026-103', name: 'Priya Sharma', age: 31, gender: 'Female', blood_group: 'A-ve', emergency_contact: '+91 98765 34567', allergies: 'Sulfa drugs', status: 'OPD' },
      { id: 'P1004', user_id: null, uhid: 'UHID-2026-104', name: 'Meera Sen', age: 56, gender: 'Female', blood_group: 'B-ve', emergency_contact: '+91 98765 45678', allergies: null, status: 'OPD' },
      { id: 'P1005', user_id: null, uhid: 'UHID-2026-105', name: 'Vikram Singh', age: 28, gender: 'Male', blood_group: 'AB+ve', emergency_contact: '+91 98765 56789', allergies: 'Ibuprofen', status: 'Discharged' },
      { id: 'P1006', user_id: null, uhid: 'UHID-2026-106', name: 'Saira Banu', age: 67, gender: 'Female', blood_group: 'O-ve', emergency_contact: '+91 98765 67890', allergies: 'Latex', status: 'IPD' },
      { id: 'P1007', user_id: null, uhid: 'UHID-2026-107', name: 'John Doe', age: 40, gender: 'Male', blood_group: 'A+ve', emergency_contact: '+91 98765 78901', allergies: 'Shellfish', status: 'Discharged' }
    ];

    for (const p of patients) {
      await pgClient.query(
        'INSERT INTO patients (id, hospital_id, user_id, uhid, name, age, gender, blood_group, emergency_contact, allergies, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        [p.id, hospitalId, p.user_id, p.uhid, p.name, p.age, p.gender, p.blood_group, p.emergency_contact, p.allergies, p.status]
      );
    }

    // 6.5 Seed Cases (Patient Case Lifecycles)
    console.log('Seeding patient cases...');
    const today = todayStr();
    const cases = [
      { id: 'C101', patient_id: 'P1001', case_number: 'CASE-2026-001', type: 'OPD', status: 'prescription_issued', chief_complaint: 'Hypertension follow-up', diagnosis: 'Essential Hypertension' },
      { id: 'C102', patient_id: 'P1002', case_number: 'CASE-2026-002', type: 'IPD', status: 'lab_complete', chief_complaint: 'Chest pain and discomfort', diagnosis: 'Coronary Artery Disease' },
      { id: 'C103', patient_id: 'P1003', case_number: 'CASE-2026-003', type: 'OPD', status: 'in_consultation', chief_complaint: 'High fever and cold', diagnosis: 'Acute viral infection' },
      { id: 'C104', patient_id: 'P1004', case_number: 'CASE-2026-004', type: 'OPD', status: 'lab_pending', chief_complaint: 'Routine blood screening checkup', diagnosis: 'Hyperlipidemia' },
      { id: 'C105', patient_id: 'P1005', case_number: 'CASE-2026-005', type: 'OPD', status: 'closed', chief_complaint: 'Ankle sprain during running', diagnosis: 'Ankle Sprain Grade I' },
      { id: 'C106', patient_id: 'P1006', case_number: 'CASE-2026-006', type: 'IPD', status: 'in_consultation', chief_complaint: 'Breathlessness and fatigue', diagnosis: 'Congestive Heart Failure' },
      { id: 'C107', patient_id: 'P1004', case_number: 'CASE-2026-007', type: 'OPD', status: 'prescription_issued', chief_complaint: 'Persistent headaches', diagnosis: 'Tension-type Headache' }
    ];

    for (const c of cases) {
      await pgClient.query(
        'INSERT INTO cases (id, hospital_id, patient_id, case_number, type, status, assigned_doctor, chief_complaint, diagnosis) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [c.id, hospitalId, c.patient_id, c.case_number, c.type, c.status, 'U1002', c.chief_complaint, c.diagnosis]
      );

      // Seed timeline events for each case
      await pgClient.query(
        'INSERT INTO case_timeline (id, case_id, event_type, actor_id, actor_role, summary) VALUES ($1, $2, $3, $4, $5, $6)',
        [`CT_${c.id}_1`, c.id, 'appointment_booked', 'U1001', 'admin', 'Case registered and appointment scheduled']
      );
      if (c.status !== 'registered') {
        await pgClient.query(
          'INSERT INTO case_timeline (id, case_id, event_type, actor_id, actor_role, summary) VALUES ($1, $2, $3, $4, $5, $6)',
          [`CT_${c.id}_2`, c.id, 'consultation_started', 'U1002', 'doctor', 'Clinical assessment started by Dr. Devam Patel']
        );
      }
    }

    // 7. Seed Appointments (using today's date)
    console.log('Seeding appointments...');
    const appointments = [
      { id: 'A01', case_id: 'C103', patient_id: 'P1003', doctor_id: 'U1002', token: '20', appointment_time: todayAt(9, 45), type: 'Follow-up', status: 'In Consultation' },
      { id: 'A02', case_id: 'C101', patient_id: 'P1001', doctor_id: 'U1002', token: '21', appointment_time: todayAt(10, 0), type: 'New', status: 'Checked-in' },
      { id: 'A03', case_id: 'C102', patient_id: 'P1002', doctor_id: 'U1002', token: '22', appointment_time: todayAt(10, 15), type: 'Emergency', status: 'Checked-in' },
      { id: 'A04', case_id: 'C104', patient_id: 'P1004', doctor_id: 'U1002', token: '24', appointment_time: todayAt(10, 45), type: 'New', status: 'Waiting' },
      { id: 'A05', case_id: 'C105', patient_id: 'P1005', doctor_id: 'U1002', token: '25', appointment_time: todayAt(11, 0), type: 'Follow-up', status: 'Waiting' },
      { id: 'A06', case_id: 'C106', patient_id: 'P1006', doctor_id: 'U1002', token: '26', appointment_time: todayAt(11, 30), type: 'Emergency', status: 'Waiting' }
    ];

    for (const appt of appointments) {
      await pgClient.query(
        'INSERT INTO appointments (id, hospital_id, case_id, patient_id, doctor_id, token, appointment_time, type, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [appt.id, hospitalId, appt.case_id, appt.patient_id, appt.doctor_id, appt.token, appt.appointment_time, appt.type, appt.status]
      );
    }

    // 8. Seed Beds
    console.log('Seeding beds...');
    const beds = [
      { id: '1', name: 'ICU-Bed 01', type: 'ICU', status: 'occupied', patient_id: 'P1002', assigned_doctor_id: 'U1002' },
      { id: '2', name: 'ICU-Bed 02', type: 'ICU', status: 'occupied', patient_id: 'P1006', assigned_doctor_id: 'U1002' },
      { id: '3', name: 'ICU-Bed 03', type: 'ICU', status: 'available', patient_id: null, assigned_doctor_id: null },
      { id: '4', name: 'ICU-Bed 04', type: 'ICU', status: 'cleaning', patient_id: null, assigned_doctor_id: null },
      { id: '5', name: 'ICU-Bed 05', type: 'ICU', status: 'reserved', patient_id: 'P1001', assigned_doctor_id: null },
      { id: '6', name: 'Ward-A 101', type: 'General Ward', status: 'occupied', patient_id: 'P1004', assigned_doctor_id: 'U1002' },
      { id: '7', name: 'Ward-A 102', type: 'General Ward', status: 'available', patient_id: null, assigned_doctor_id: null },
      { id: '8', name: 'Ward-A 103', type: 'General Ward', status: 'available', patient_id: null, assigned_doctor_id: null },
      { id: '9', name: 'Room-204', type: 'Private Room', status: 'occupied', patient_id: 'P1003', assigned_doctor_id: 'U1002' },
      { id: '10', name: 'Room-205', type: 'Private Room', status: 'cleaning', patient_id: null, assigned_doctor_id: null },
      { id: '11', name: 'Room-206', type: 'Private Room', status: 'available', patient_id: null, assigned_doctor_id: null },
      { id: '12', name: 'Room-207', type: 'Private Room', status: 'available', patient_id: null, assigned_doctor_id: null }
    ];

    for (const b of beds) {
      await pgClient.query(
        'INSERT INTO beds (id, hospital_id, name, type, status, patient_id, assigned_doctor_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [b.id, hospitalId, b.name, b.type, b.status, b.patient_id, b.assigned_doctor_id]
      );
    }

    // 9. Seed Prescriptions (using today's date)
    console.log('Seeding prescriptions...');
    const prescriptions = [
      { id: 'O01', case_id: 'C101', patient_id: 'P1001', doctor_id: 'U1002', drug_details: 'Telmisartan 40mg + Metformin 500mg SR', status: 'Pending', date: today },
      { id: 'O02', case_id: 'C104', patient_id: 'P1004', doctor_id: 'U1002', drug_details: 'Tab. Atorvastatin 10mg dosage', status: 'Pending', date: today },
      { id: 'O03', case_id: 'C102', patient_id: 'P1002', doctor_id: 'U1002', drug_details: 'Tab. Paracetamol 650mg SOS', status: 'Dispensed', date: today },
      { id: 'O04', case_id: 'C106', patient_id: 'P1006', doctor_id: 'U1002', drug_details: 'Tab. Furosemide 40mg + Digoxin 0.25mg', status: 'Pending', date: today },
      { id: 'O05', case_id: 'C107', patient_id: 'P1004', doctor_id: 'U1002', drug_details: 'Tab. Sumatriptan 50mg SOS', status: 'Pending', date: today }
    ];

    for (const rx of prescriptions) {
      await pgClient.query(
        'INSERT INTO prescriptions (id, hospital_id, case_id, patient_id, doctor_id, drug_details, status, date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [rx.id, hospitalId, rx.case_id, rx.patient_id, rx.doctor_id, rx.drug_details, rx.status, rx.date]
      );
    }

    // 10. Seed Lab Orders (using today's date)
    console.log('Seeding lab orders...');
    const labOrders = [
      { id: 'L01', case_id: 'C101', patient_id: 'P1001', doctor_id: 'U1002', test_name: 'Complete Blood Count (CBC Panel)', specimen: 'Blood (EDTA Purple Vial)', status: 'Collected', date: today },
      { id: 'L02', case_id: 'C104', patient_id: 'P1004', doctor_id: 'U1002', test_name: 'Lipid Profile Screen', specimen: 'Blood (Gel Yellow Vial)', status: 'Collected', date: today },
      { id: 'L03', case_id: 'C102', patient_id: 'P1002', doctor_id: 'U1002', test_name: 'Complete Blood Count (CBC Panel)', specimen: 'Blood (EDTA Purple Vial)', status: 'Completed', date: today },
      { id: 'L04', case_id: 'C106', patient_id: 'P1006', doctor_id: 'U1002', test_name: 'Troponin-I Cardiac Marker', specimen: 'Blood (Gel Yellow Vial)', status: 'Received', date: today },
      { id: 'L05', case_id: 'C103', patient_id: 'P1003', doctor_id: 'U1002', test_name: 'Liver Function Test (LFT Panel)', specimen: 'Blood (Gel Yellow Vial)', status: 'Received', date: today }
    ];

    for (const lo of labOrders) {
      await pgClient.query(
        'INSERT INTO lab_orders (id, hospital_id, case_id, patient_id, doctor_id, test_name, specimen, status, date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [lo.id, hospitalId, lo.case_id, lo.patient_id, lo.doctor_id, lo.test_name, lo.specimen, lo.status, lo.date]
      );
    }

    // 11. Seed Billing / Invoices
    console.log('Seeding billing & invoices...');
    const bills = [
      { id: 'B001', case_id: 'C101', patient_id: 'P1001', invoice_number: 'INV-2026-001', subtotal: 1500.00, discount: 100.00, tax: 252.00, total: 1652.00, paid: 0.00, balance: 1652.00, status: 'PENDING' },
      { id: 'B002', case_id: 'C102', patient_id: 'P1002', invoice_number: 'INV-2026-002', subtotal: 4500.00, discount: 500.00, tax: 720.00, total: 4720.00, paid: 4720.00, balance: 0.00, status: 'PAID' },
      { id: 'B003', case_id: 'C103', patient_id: 'P1003', invoice_number: 'INV-2026-003', subtotal: 800.00, discount: 0.00, tax: 144.00, total: 944.00, paid: 500.00, balance: 444.00, status: 'PARTIAL' },
      { id: 'B004', case_id: 'C106', patient_id: 'P1006', invoice_number: 'INV-2026-004', subtotal: 8500.00, discount: 1000.00, tax: 1350.00, total: 8850.00, paid: 3000.00, balance: 5850.00, status: 'PARTIAL' }
    ];

    for (const b of bills) {
      await pgClient.query(
        'INSERT INTO billing (id, hospital_id, case_id, patient_id, invoice_number, subtotal, discount, tax, total, paid, balance, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
        [b.id, hospitalId, b.case_id, b.patient_id, b.invoice_number, b.subtotal, b.discount, b.tax, b.total, b.paid, b.balance, b.status]
      );

      // Add item details
      await pgClient.query(
        'INSERT INTO invoice_items (id, billing_id, description, quantity, unit_price, total_price) VALUES ($1, $2, $3, $4, $5, $6)',
        [`BI_${b.id}_1`, b.id, 'Doctor Consultation Fee', 1, b.subtotal, b.subtotal]
      );

      if (b.paid > 0) {
        await pgClient.query(
          'INSERT INTO payments (id, billing_id, amount, payment_method, transaction_reference, status) VALUES ($1, $2, $3, $4, $5, $6)',
          [`PAY_${b.id}_1`, b.id, b.paid, 'Cash', 'TXN-MOCK-12345', 'SUCCESS']
        );
      }
    }

    // 12. Seed Inventory (Pharmacy Stock)
    console.log('Seeding pharmacy inventory...');
    const inventoryItems = [
      { id: 'INV001', name: 'Tab. Paracetamol 650mg', category: 'Tablet', batch: 'BT-2026-001', qty: 500, unit: 'Tabs', reorder_level: 100, unit_price: 2.50, expiry: '2027-06-30', manufacturer: 'Cipla Ltd.', status: 'In Stock' },
      { id: 'INV002', name: 'Tab. Telmisartan 40mg', category: 'Tablet', batch: 'BT-2026-002', qty: 250, unit: 'Tabs', reorder_level: 50, unit_price: 8.00, expiry: '2027-09-15', manufacturer: 'Zydus Lifesciences', status: 'In Stock' },
      { id: 'INV003', name: 'Tab. Metformin 500mg SR', category: 'Tablet', batch: 'BT-2026-003', qty: 180, unit: 'Tabs', reorder_level: 50, unit_price: 5.50, expiry: '2027-03-31', manufacturer: 'Sun Pharma', status: 'In Stock' },
      { id: 'INV004', name: 'Tab. Atorvastatin 10mg', category: 'Tablet', batch: 'BT-2026-004', qty: 45, unit: 'Tabs', reorder_level: 50, unit_price: 12.00, expiry: '2027-08-20', manufacturer: 'Torrent Pharma', status: 'Low Stock' },
      { id: 'INV005', name: 'Tab. Amlodipine 5mg', category: 'Tablet', batch: 'BT-2026-005', qty: 18, unit: 'Tabs', reorder_level: 50, unit_price: 6.00, expiry: '2027-01-10', manufacturer: 'Cipla Ltd.', status: 'Low Stock' },
      { id: 'INV006', name: 'Inj. Ceftriaxone 1g', category: 'Injection', batch: 'BT-2026-006', qty: 0, unit: 'Vials', reorder_level: 20, unit_price: 85.00, expiry: '2027-04-15', manufacturer: 'Alkem Labs', status: 'Out of Stock' },
      { id: 'INV007', name: 'Tab. Furosemide 40mg', category: 'Tablet', batch: 'BT-2026-007', qty: 320, unit: 'Tabs', reorder_level: 60, unit_price: 3.50, expiry: '2027-11-30', manufacturer: 'Zydus Lifesciences', status: 'In Stock' },
      { id: 'INV008', name: 'Tab. Digoxin 0.25mg', category: 'Tablet', batch: 'BT-2026-008', qty: 90, unit: 'Tabs', reorder_level: 30, unit_price: 15.00, expiry: '2027-07-20', manufacturer: 'Sun Pharma', status: 'In Stock' },
      { id: 'INV009', name: 'Tab. Sumatriptan 50mg', category: 'Tablet', batch: 'BT-2026-009', qty: 40, unit: 'Tabs', reorder_level: 25, unit_price: 22.00, expiry: '2027-05-25', manufacturer: 'Dr. Reddys', status: 'In Stock' },
      { id: 'INV010', name: 'Syr. Amoxicillin 250mg/5ml', category: 'Syrup', batch: 'BT-2026-010', qty: 12, unit: 'Bottles', reorder_level: 20, unit_price: 65.00, expiry: '2026-12-31', manufacturer: 'GlaxoSmithKline', status: 'Low Stock' },
      { id: 'INV011', name: 'Cap. Omeprazole 20mg', category: 'Capsule', batch: 'BT-2026-011', qty: 400, unit: 'Caps', reorder_level: 80, unit_price: 4.00, expiry: '2027-10-15', manufacturer: 'Cipla Ltd.', status: 'In Stock' },
      { id: 'INV012', name: 'Tab. Aspirin 75mg', category: 'Tablet', batch: 'BT-2026-012', qty: 600, unit: 'Tabs', reorder_level: 100, unit_price: 1.50, expiry: '2027-12-31', manufacturer: 'Bayer', status: 'In Stock' }
    ];

    for (const inv of inventoryItems) {
      await pgClient.query(
        'INSERT INTO inventory (id, hospital_id, name, category, batch, qty, unit, reorder_level, unit_price, expiry, manufacturer, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
        [inv.id, hospitalId, inv.name, inv.category, inv.batch, inv.qty, inv.unit, inv.reorder_level, inv.unit_price, inv.expiry, inv.manufacturer, inv.status]
      );
    }

    // 13. Seed Nurse Tasks
    console.log('Seeding nurse tasks...');
    const nurseTasks = [
      { id: 'NT001', bed: 'ICU-Bed 01', patient_name: 'Aarav Mehta', task: 'Administer IV Ceftriaxone 1g — dosage schedule 08:00 hrs', scheduled_time: '08:00 AM', priority: 'high', completed: false },
      { id: 'NT002', bed: 'ICU-Bed 02', patient_name: 'Saira Banu', task: 'Record hourly vitals — SpO2 monitoring + BP check', scheduled_time: '09:00 AM', priority: 'high', completed: false },
      { id: 'NT003', bed: 'Ward-A 101', patient_name: 'Meera Sen', task: 'Oral medication round — Tab. Atorvastatin 10mg with water', scheduled_time: '09:30 AM', priority: 'medium', completed: false },
      { id: 'NT004', bed: 'ICU-Bed 01', patient_name: 'Aarav Mehta', task: 'Wound dressing change — chest catheter site inspection', scheduled_time: '10:00 AM', priority: 'high', completed: false },
      { id: 'NT005', bed: 'Room-204', patient_name: 'Priya Sharma', task: 'Fever monitoring — ensure hydration protocol is maintained', scheduled_time: '10:30 AM', priority: 'medium', completed: false },
      { id: 'NT006', bed: 'ICU-Bed 02', patient_name: 'Saira Banu', task: 'Nebulization therapy — Salbutamol + Ipratropium', scheduled_time: '11:00 AM', priority: 'medium', completed: false },
      { id: 'NT007', bed: 'Ward-A 101', patient_name: 'Meera Sen', task: 'Pre-discharge counselling — dietary guidelines review', scheduled_time: '02:00 PM', priority: 'low', completed: false }
    ];

    for (const nt of nurseTasks) {
      await pgClient.query(
        'INSERT INTO nurse_tasks (id, hospital_id, bed, patient_name, task, scheduled_time, priority, completed, assigned_nurse_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [nt.id, hospitalId, nt.bed, nt.patient_name, nt.task, nt.scheduled_time, nt.priority, nt.completed, 'U1003']
      );
    }

    // 14. Seed MongoDB Vitals
    console.log('Seeding MongoDB Vitals...');
    const vitalsList = [
      { uhid: 'UHID-2026-102', hr: 78, bp: '138/88', temp: 99.1, spo2: 97, status: 'normal', notes: 'Inpatient ICU round check', recordedBy: 'Sister Ananya Sharma' },
      { uhid: 'UHID-2026-106', hr: 84, bp: '124/80', temp: 98.4, spo2: 98, status: 'normal', notes: 'Routine checkup', recordedBy: 'Sister Ananya Sharma' },
      { uhid: 'UHID-2026-981240', hr: 72, bp: '118/76', temp: 98.2, spo2: 99, status: 'normal', notes: 'OPD follow-up checklist vital check', recordedBy: 'Sister Ananya Sharma' },
      { uhid: 'UHID-2026-103', hr: 95, bp: '142/90', temp: 101.3, spo2: 88, status: 'critical', notes: 'High fever and SpO2 drop', recordedBy: 'Sister Ananya Sharma' },
      { uhid: 'UHID-2026-104', hr: 104, bp: '148/92', temp: 100.5, spo2: 94, status: 'warning', notes: 'Elevated HR', recordedBy: 'Sister Ananya Sharma' }
    ];

    for (const v of vitalsList) {
      await VitalHistory.create({
        uhid: v.uhid,
        hr: v.hr,
        bp: v.bp,
        temp: v.temp,
        spo2: v.spo2,
        status: v.status,
        notes: v.notes,
        recordedBy: v.recordedBy,
        recordedAt: new Date()
      });
    }

    // 15. Seed MongoDB Audit Logs
    console.log('Seeding MongoDB Audit Logs...');
    const audits = [
      { userId: 'U1001', userName: 'Rajesh Iyer', role: 'admin', event: 'SYSTEM_INITIALIZATION', module: 'admin', ipAddress: '127.0.0.1', severity: 'info' },
      { userId: 'U1002', userName: 'Dr. Devam Patel', role: 'doctor', event: 'PRESCRIPTION_CREATED', module: 'pharmacy', ipAddress: '127.0.0.1', severity: 'info' }
    ];

    for (const a of audits) {
      await AuditLog.create({
        timestamp: new Date(),
        userId: a.userId,
        userName: a.userName,
        role: a.role,
        event: a.event,
        module: a.module,
        ipAddress: a.ipAddress,
        severity: a.severity
      });
    }

    console.log('Database seeding completed successfully!');
  } catch (err) {
    console.error('Error seeding database:', err);
  } finally {
    if (pgClient) {
      pgClient.release();
    }
    await pool.end();
    await mongoose.disconnect();
  }
};

seed();
