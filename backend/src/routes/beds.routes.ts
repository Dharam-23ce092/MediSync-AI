import { Router, Response } from 'express';
import { pool } from '../config/postgres';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';
import { logAudit } from '../utils/audit';

const router = Router();

// Get all beds with extended patient details
router.get('/', authenticateJWT, authorizeRoles(['admin', 'doctor', 'nurse']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = `
      SELECT b.id, b.name, b.type, b.status,
             p.name as "patientName", p.uhid,
             p.age, p.gender, p.blood_group as "bloodGroup", p.allergies,
             u.name as "assignedDoctor",
             c.case_number as "caseNumber", c.diagnosis, c.chief_complaint as "chiefComplaint"
      FROM beds b
      LEFT JOIN patients p ON p.id = b.patient_id
      LEFT JOIN users u ON u.id = b.assigned_doctor_id
      LEFT JOIN LATERAL (
        SELECT case_number, diagnosis, chief_complaint
        FROM cases
        WHERE patient_id = b.patient_id AND status != 'closed'
        ORDER BY created_at DESC
        LIMIT 1
      ) c ON true
      ORDER BY b.id::int ASC
    `;
    const result = await pool.query(query);
    return res.json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching beds:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Update bed status
router.patch('/:id', authenticateJWT, authorizeRoles(['admin', 'doctor', 'nurse']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { action, uhid, doctorName } = req.body;

  try {
    if (action === 'allocate') {
      if (!uhid || !doctorName) {
        return res.status(400).json({ success: false, message: 'Missing patient UHID or doctor name' });
      }

      const patRes = await pool.query('SELECT id, name FROM patients WHERE uhid = $1', [uhid]);
      if (patRes.rowCount === 0) {
        return res.status(404).json({ success: false, message: 'Patient not found' });
      }
      const patientId = patRes.rows[0].id;

      const docRes = await pool.query('SELECT id FROM users WHERE name = $1 AND role = $2', [doctorName, 'doctor']);
      if (docRes.rowCount === 0) {
        return res.status(404).json({ success: false, message: 'Doctor not found' });
      }
      const doctorId = docRes.rows[0].id;

      await pool.query(
        `UPDATE beds
         SET status = 'occupied', patient_id = $1, assigned_doctor_id = $2
         WHERE id = $3`,
        [patientId, doctorId, id]
      );

      // Also set patient status to IPD
      await pool.query(`UPDATE patients SET status = 'IPD' WHERE id = $1`, [patientId]);

      await logAudit(req, `BED_ALLOCATED: Bed ${id} to Patient ${uhid}`, 'bed', 'info');

      return res.json({
        success: true,
        message: 'Bed allocated successfully'
      });
    }

    if (action === 'discharge') {
      const currentBedRes = await pool.query('SELECT patient_id FROM beds WHERE id = $1', [id]);
      const currentPatientId = currentBedRes.rows[0]?.patient_id;

      await pool.query(
        `UPDATE beds
         SET status = 'cleaning', patient_id = NULL, assigned_doctor_id = NULL
         WHERE id = $1`,
        [id]
      );

      if (currentPatientId) {
        await pool.query(`UPDATE patients SET status = 'Discharged' WHERE id = $1`, [currentPatientId]);
      }

      await logAudit(req, `BED_DISCHARGED: Bed ${id} released for cleaning`, 'bed', 'info');

      return res.json({
        success: true,
        message: 'Bed discharged, sent to cleaning'
      });
    }

    if (action === 'ready') {
      await pool.query(
        `UPDATE beds
         SET status = 'available'
         WHERE id = $1`,
        [id]
      );

      await logAudit(req, `BED_CLEANED: Bed ${id} is available`, 'bed', 'info');

      return res.json({
        success: true,
        message: 'Bed is now available'
      });
    }

    return res.status(400).json({ success: false, message: 'Invalid action specified' });
  } catch (error: any) {
    console.error('Error updating bed:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

export default router;
