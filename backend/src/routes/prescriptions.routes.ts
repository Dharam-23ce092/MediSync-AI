import { Router, Response } from 'express';
import { pool } from '../config/postgres';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';
import { logAudit } from '../utils/audit';

const router = Router();

// Get all prescriptions
router.get('/', authenticateJWT, authorizeRoles(['admin', 'doctor', 'nurse', 'pharmacist', 'patient']), async (req: AuthenticatedRequest, res: Response) => {
  const { uhid } = req.query;
  try {
    let targetUhid = uhid;
    if (req.user?.role === 'patient') {
      targetUhid = req.user.uhid;
    }
    let query = `
      SELECT rx.id, rx.patient_id as "patientId", p.name,
             p.uhid as patient_uhid, u.name as doctor,
             rx.drug_details as "drugDetails", rx.status,
             to_char(rx.date, 'YYYY-MM-DD') as date
      FROM prescriptions rx
      JOIN patients p ON p.id = rx.patient_id
      JOIN users u ON u.id = rx.doctor_id
    `;
    const values: any[] = [];
    if (targetUhid) {
      query += ' WHERE p.uhid = $1';
      values.push(targetUhid);
    }
    query += ' ORDER BY rx.created_at DESC';

    const result = await pool.query(query, values);

    const formatted = result.rows.map(r => ({
      ...r,
      name_subtitle: r.patient_uhid
    }));

    return res.json({
      success: true,
      data: formatted
    });
  } catch (error: any) {
    console.error('Error fetching prescriptions:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Create prescription
router.post('/', authenticateJWT, authorizeRoles(['admin', 'doctor']), async (req: AuthenticatedRequest, res: Response) => {
  const { patientId, name_subtitle, doctor, drugDetails } = req.body;

  if (!patientId || !drugDetails) {
    return res.status(400).json({ success: false, message: 'Missing fields', errorCode: 'VALIDATION_ERROR' });
  }

  try {
    const patRes = await pool.query('SELECT id, name, uhid FROM patients WHERE id = $1 OR uhid = $1 OR uhid = $2', [patientId, name_subtitle]);
    if (patRes.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Patient not found', errorCode: 'PATIENT_NOT_FOUND' });
    }
    const targetPatient = patRes.rows[0];

    let doctorId = req.user?.userId;
    let doctorName = req.user?.name;

    if (doctor) {
      const docRes = await pool.query('SELECT id, name FROM users WHERE name = $1 AND role = $2', [doctor, 'doctor']);
      if (docRes.rows && docRes.rows.length > 0) {
        doctorId = docRes.rows[0].id;
        doctorName = docRes.rows[0].name;
      }
    }

    if (!doctorId) {
      return res.status(400).json({ success: false, message: 'Doctor session not verified', errorCode: 'VALIDATION_ERROR' });
    }

    const rxId = `O${Date.now()}`;
    const date = new Date().toISOString().split('T')[0];
    const hospitalId = req.user?.hospital_id;

    // Resolve active case ID for patient
    const caseRes = await pool.query(
      "SELECT id FROM cases WHERE patient_id = $1 AND status != 'closed' ORDER BY created_at DESC LIMIT 1",
      [targetPatient.id]
    );
    const caseId = caseRes.rows.length > 0 ? caseRes.rows[0].id : null;

    await pool.query(
      `INSERT INTO prescriptions (id, hospital_id, case_id, patient_id, doctor_id, drug_details, status, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [rxId, hospitalId, caseId, targetPatient.id, doctorId, drugDetails, 'Pending', date]
    );

    // Charge creation
    const invoiceNum = `INV-RX-${Date.now()}`;
    const billingId = `B_${Date.now()}`;
    await pool.query(
      `INSERT INTO billing (id, hospital_id, case_id, patient_id, invoice_number, subtotal, discount, tax, total, paid, balance, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [billingId, hospitalId, caseId, targetPatient.id, invoiceNum, 350.00, 0.00, 63.00, 413.00, 0.00, 413.00, 'PENDING']
    );

    await pool.query(
      `INSERT INTO invoice_items (id, billing_id, description, quantity, unit_price, total_price)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`BI_${billingId}_1`, billingId, `Pharmacy charges for Rx ${rxId}`, 1, 350.00, 350.00]
    );

    // Update Case status and timeline
    if (caseId) {
      await pool.query(
        "UPDATE cases SET status = 'prescription_issued', updated_at = NOW() WHERE id = $1",
        [caseId]
      );
      await pool.query(
        "INSERT INTO case_timeline (id, case_id, event_type, actor_id, actor_role, summary) VALUES ($1, $2, $3, $4, $5, $6)",
        [`CT_${Date.now()}`, caseId, 'prescription_created', req.user?.userId, req.user?.role, `Prescription issued by Dr. ${doctorName || 'Staff'}: ${drugDetails}`]
      );
    }

    await logAudit(req, `PRESCRIPTION_CREATED: Rx ${rxId} for Patient ${targetPatient.uhid}`, 'pharmacy', 'info');

    return res.status(201).json({
      success: true,
      message: 'Prescription created successfully',
      data: {
        id: rxId,
        patientId: targetPatient.id,
        name: targetPatient.name,
        name_subtitle: targetPatient.uhid,
        doctor: doctorName,
        drugDetails,
        status: 'Pending',
        date
      }
    });
  } catch (error: any) {
    console.error('Error creating prescription:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Dispense prescription
router.patch('/:id/dispense', authenticateJWT, authorizeRoles(['admin', 'pharmacist']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const updateResult = await pool.query(
      `UPDATE prescriptions
       SET status = 'Dispensed'
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Prescription not found', errorCode: 'PRESCRIPTION_NOT_FOUND' });
    }

    const rx = updateResult.rows[0];
    if (rx && rx.case_id) {
      await pool.query(
        "UPDATE cases SET status = 'pharmacy_dispensed', updated_at = NOW() WHERE id = $1",
        [rx.case_id]
      );
      await pool.query(
        "INSERT INTO case_timeline (id, case_id, event_type, actor_id, actor_role, summary) VALUES ($1, $2, $3, $4, $5, $6)",
        [`CT_${Date.now()}`, rx.case_id, 'drug_dispensed', req.user?.userId, req.user?.role, `Medications successfully dispensed by pharmacy`]
      );
    }

    await logAudit(req, `PRESCRIPTION_DISPENSED: Rx ${id} marked complete`, 'pharmacy', 'info');

    return res.json({
      success: true,
      message: 'Prescription marked as dispensed successfully'
    });
  } catch (error: any) {
    console.error('Error dispensing prescription:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

export default router;
