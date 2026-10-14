import { Response } from 'express';
import { pool } from '../config/postgres';
import { authenticateJWT } from '../middleware/auth.middleware';
import { requireTenant, TenantRequest } from '../middleware/tenant.middleware';
import { Router } from 'express';

const router = Router();

// Get all cases for the logged-in hospital
router.get('/', authenticateJWT, requireTenant, async (req: TenantRequest, res: Response) => {
  const hospitalId = req.hospitalId;

  try {
    let query = `
      SELECT c.id, c.case_number as "caseNumber", c.type, c.status, 
             c.chief_complaint as "chiefComplaint", c.diagnosis, 
             to_char(c.created_at, 'YYYY-MM-DD HH:MI AM') as date,
             p.name as "patientName", p.uhid as "patientUhid",
             u.name as "doctorName"
      FROM cases c
      JOIN patients p ON p.id = c.patient_id
      LEFT JOIN users u ON u.id = c.assigned_doctor
      WHERE c.hospital_id = $1
    `;
    const values: any[] = [hospitalId];

    // If user is a patient, restrict to their own cases
    if (req.user?.role === 'patient') {
      query += ' AND p.user_id = $2';
      values.push(req.user.userId);
    }

    query += ' ORDER BY c.created_at DESC';

    const result = await pool.query(query, values);

    return res.json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching cases:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve patient cases',
      errorCode: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// Get detailed case + case timeline logs
router.get('/:id', authenticateJWT, requireTenant, async (req: TenantRequest, res: Response) => {
  const { id } = req.params;
  const hospitalId = req.hospitalId;

  try {
    // 1. Fetch Case details
    const caseQuery = `
      SELECT c.id, c.case_number as "caseNumber", c.type, c.status, 
             c.chief_complaint as "chiefComplaint", c.diagnosis, 
             to_char(c.admission_date, 'YYYY-MM-DD HH:MI AM') as "admissionDate",
             to_char(c.discharge_date, 'YYYY-MM-DD HH:MI AM') as "dischargeDate",
             p.id as "patientId", p.name as "patientName", p.uhid as "patientUhid",
             p.gender, p.age, p.blood_group as "bloodGroup",
             u.name as "doctorName"
      FROM cases c
      JOIN patients p ON p.id = c.patient_id
      LEFT JOIN users u ON u.id = c.assigned_doctor
      WHERE c.id = $1 AND c.hospital_id = $2
    `;
    const caseResult = await pool.query(caseQuery, [id, hospitalId]);

    if (caseResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Case not found or access denied',
        errorCode: 'CASE_NOT_FOUND'
      });
    }

    const caseData = caseResult.rows[0];

    // Enforce patient ownership check
    if (req.user?.role === 'patient') {
      const patientCheck = await pool.query('SELECT user_id FROM patients WHERE id = $1', [caseData.patientId]);
      if (patientCheck.rows.length === 0 || patientCheck.rows[0].user_id !== req.user.userId) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: You cannot view this case file',
          errorCode: 'FORBIDDEN'
        });
      }
    }

    // 2. Fetch Timeline events
    const timelineQuery = `
      SELECT id, event_type as "eventType", actor_role as "actorRole", summary,
             to_char(created_at, 'YYYY-MM-DD HH:MI AM') as date,
             (SELECT name FROM users WHERE id = actor_id) as "actorName"
      FROM case_timeline
      WHERE case_id = $1
      ORDER BY created_at ASC
    `;
    const timelineResult = await pool.query(timelineQuery, [id]);
    const [appointments, prescriptions, labs, invoices, beds, notes] = await Promise.all([
      pool.query('SELECT id,token,status,appointment_time as "appointmentTime" FROM appointments WHERE case_id=$1 AND hospital_id=$2 ORDER BY appointment_time',[id,hospitalId]),
      pool.query('SELECT id,drug_details as "drugDetails",status,date FROM prescriptions WHERE case_id=$1 AND hospital_id=$2',[id,hospitalId]),
      pool.query('SELECT id,test_name as "testName",specimen,status,results FROM lab_orders WHERE case_id=$1 AND hospital_id=$2',[id,hospitalId]),
      pool.query('SELECT id,invoice_number as "invoiceNumber",total,paid,balance,status FROM billing WHERE case_id=$1 AND hospital_id=$2',[id,hospitalId]),
      pool.query('SELECT id,name,type,status FROM beds WHERE case_id=$1 AND hospital_id=$2',[id,hospitalId]),
      pool.query('SELECT id,chief_complaint as "chiefComplaint",diagnosis,clinical_notes as "clinicalNotes",created_at as "createdAt" FROM consultation_notes WHERE case_id=$1 AND hospital_id=$2',[id,hospitalId])
    ]);

    return res.json({
      success: true,
      data: {
        ...caseData,
        timeline: timelineResult.rows,
        appointments: appointments.rows, prescriptions: prescriptions.rows, labs: labs.rows, invoices: invoices.rows, beds: beds.rows, notes: notes.rows
      }
    });

  } catch (error: any) {
    console.error('Error fetching case details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve case details',
      errorCode: 'INTERNAL_SERVER_ERROR'
    });
  }
});

export default router;
