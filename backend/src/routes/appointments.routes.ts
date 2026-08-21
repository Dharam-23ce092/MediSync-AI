import { Router, Response } from 'express';
import { pool } from '../config/postgres';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';
import { logAudit } from '../utils/audit';

const router = Router();

// Get all appointments
router.get('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { uhid, doctorName } = req.query;
    let targetUhid = uhid;
    if (req.user?.role === 'patient') {
      targetUhid = req.user.uhid;
    }
    let query = `
      SELECT a.id as appointment_db_id, a.patient_id as id, a.token, p.name,
             p.gender || ', ' || p.age || ' yrs • ' || p.blood_group as name_subtitle,
             p.uhid, to_char(a.appointment_time, 'HH12:MI AM') as time, a.type,
             a.status, u.name as doctorName
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      JOIN users u ON u.id = a.doctor_id
    `;
    const conditions: string[] = [];
    const values: any[] = [];

    if (targetUhid) {
      conditions.push('p.uhid = $' + (conditions.length + 1));
      values.push(targetUhid);
    }
    if (doctorName) {
      conditions.push('u.name = $' + (conditions.length + 1));
      values.push(doctorName);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY a.appointment_time ASC';

    const result = await pool.query(query, values);

    // Calculate wait times
    const formatted = result.rows.map((row, idx) => {
      let waitTime = '0 min';
      if (row.status === 'Waiting') {
        waitTime = `${(idx + 1) * 10} min`;
      } else if (row.status === 'In Consultation') {
        waitTime = '0 min (Consulting)';
      } else if (row.status === 'Completed') {
        waitTime = 'Completed';
      }
      return {
        ...row,
        waitTime
      };
    });

    return res.json({
      success: true,
      data: formatted
    });
  } catch (error: any) {
    console.error('Error fetching appointments:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Book appointment
router.post('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { id, name, uhid, time, type, doctorName } = req.body;

  if (!id || !type || !doctorName) {
    return res.status(400).json({ success: false, message: 'Missing fields', errorCode: 'VALIDATION_ERROR' });
  }

  let targetPatientId = id;
  let targetPatientUhid = uhid;
  if (req.user?.role === 'patient') {
    targetPatientId = req.user.userId;
    targetPatientUhid = req.user.uhid;
  }

  try {
    // 1. Resolve doctor ID from name
    const docRes = await pool.query('SELECT id FROM users WHERE name = $1 AND role = $2', [doctorName, 'doctor']);
    if (docRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Doctor not found', errorCode: 'DOCTOR_NOT_FOUND' });
    }
    const doctorId = docRes.rows[0].id;

    // 2. Resolve patient ID
    const patRes = await pool.query('SELECT id, name, gender, age, blood_group, uhid FROM patients WHERE id = $1 OR uhid = $2', [targetPatientId, targetPatientUhid]);
    if (patRes.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Patient not found', errorCode: 'PATIENT_NOT_FOUND' });
    }
    const patient = patRes.rows[0];

    // 3. Generate token
    const tokenRes = await pool.query('SELECT count(*) FROM appointments WHERE doctor_id = $1 AND appointment_time::date = CURRENT_DATE', [doctorId]);
    const nextTokenNum = parseInt(tokenRes.rows[0].count) + 20;

    // 4. Create appointment time
    const appointmentTime = new Date();
    const apptId = `A${Date.now()}`;
    const hospitalId = req.user?.hospital_id;
    const caseId = `C${Date.now()}`;
    const caseNumber = `CASE-2026-${Math.floor(10000 + Math.random() * 90000)}`;

    // Create Case Transactionally
    await pool.query(
      `INSERT INTO cases (id, hospital_id, patient_id, case_number, type, status, assigned_doctor, chief_complaint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [caseId, hospitalId, patient.id, caseNumber, 'OPD', 'registered', doctorId, 'EHR appointment registration']
    );

    // Create Timeline Event
    await pool.query(
      `INSERT INTO case_timeline (id, case_id, event_type, actor_id, actor_role, summary)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`CT_${Date.now()}`, caseId, 'appointment_booked', req.user?.userId, req.user?.role, `OPD appointment scheduled with token #${nextTokenNum}`]
    );

    // Create Appointment
    await pool.query(
      `INSERT INTO appointments (id, hospital_id, case_id, patient_id, doctor_id, token, appointment_time, type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [apptId, hospitalId, caseId, patient.id, doctorId, String(nextTokenNum), appointmentTime, type, 'Waiting']
    );

    await logAudit(req, `APPOINTMENT_BOOKED: Patient ${patient.uhid} with Doctor ${doctorName}`, 'appointment', 'info');

    return res.status(201).json({
      success: true,
      message: 'Appointment booked successfully',
      data: {
        id: patient.id,
        token: String(nextTokenNum),
        name: patient.name,
        name_subtitle: `${patient.gender}, ${patient.age} yrs • ${patient.blood_group}`,
        uhid: patient.uhid,
        time: time || '10:00 AM',
        type,
        waitTime: '20 min',
        status: 'Waiting',
        doctorName
      }
    });
  } catch (error: any) {
    console.error('Error booking appointment:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Update appointment status
router.patch('/status', authenticateJWT, authorizeRoles(['admin', 'doctor', 'nurse']), async (req: AuthenticatedRequest, res: Response) => {
  const { patientId, status } = req.body;

  if (!patientId || !status) {
    return res.status(400).json({ success: false, message: 'Missing fields', errorCode: 'VALIDATION_ERROR' });
  }

  try {
    let appt: any = null;
    const updateResult = await pool.query(
      `UPDATE appointments
       SET status = $1
       WHERE patient_id = $2 AND status != 'Completed'
       RETURNING *`,
      [status, patientId]
    );

    if (updateResult.rowCount === 0) {
      const fallbackResult = await pool.query(
        `UPDATE appointments
         SET status = $1
         WHERE patient_id = $2
         RETURNING *`,
        [status, patientId]
      );
      if (fallbackResult.rowCount === 0) {
        return res.status(404).json({ success: false, message: 'Active appointment not found', errorCode: 'APPOINTMENT_NOT_FOUND' });
      }
      appt = fallbackResult.rows[0];
    } else {
      appt = updateResult.rows[0];
    }

    // Propagate case status & timeline update
    if (appt && appt.case_id) {
      let caseStatus = 'registered';
      let eventType = 'appointment_updated';
      let summary = `Appointment status updated to ${status}`;

      if (status === 'Checked-in' || status === 'Checked-out') {
        caseStatus = 'waiting';
        eventType = 'patient_checked_in';
        summary = 'Patient checked in at reception desk';
      } else if (status === 'In Consultation') {
        caseStatus = 'in_consultation';
        eventType = 'consultation_started';
        summary = 'Clinical consultation started by physician';
      } else if (status === 'Completed') {
        caseStatus = 'prescription_pending';
        eventType = 'consultation_completed';
        summary = 'Clinical consultation finalized';
      }

      await pool.query(
        'UPDATE cases SET status = $1, updated_at = NOW() WHERE id = $2',
        [caseStatus, appt.case_id]
      );

      await pool.query(
        'INSERT INTO case_timeline (id, case_id, event_type, actor_id, actor_role, summary) VALUES ($1, $2, $3, $4, $5, $6)',
        [`CT_${Date.now()}`, appt.case_id, eventType, req.user?.userId, req.user?.role, summary]
      );
    }

    await logAudit(req, `APPOINTMENT_STATUS_UPDATED: Patient ${patientId} to ${status}`, 'appointment', 'info');

    return res.json({
      success: true,
      message: `Appointment status updated to ${status}`
    });
  } catch (error: any) {
    console.error('Error updating appointment status:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

export default router;
