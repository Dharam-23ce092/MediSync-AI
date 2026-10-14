import { Router, Response } from 'express';
import { pool } from '../config/postgres';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';
import { logAudit } from '../utils/audit';

const router = Router();

// Get all patients
router.get('/', authenticateJWT, authorizeRoles(['doctor', 'nurse', 'admin', 'pharmacist', 'lab']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const search = req.query.search as string;
    let query = 'SELECT * FROM patients WHERE hospital_id=$1 ORDER BY created_at DESC';
    let values: any[] = [req.user?.hospital_id];

    if (search) {
      query = 'SELECT * FROM patients WHERE hospital_id=$2 AND (name ILIKE $1 OR uhid ILIKE $1) ORDER BY created_at DESC';
      values = [`%${search}%`,req.user?.hospital_id];
    }

    const result = await pool.query(query, values);

    const formatted = result.rows.map(p => ({
      ...p,
      name_subtitle: p.allergies ? `Allergies: ${p.allergies}` : 'Allergies: None documented',
      bloodGroup: p.blood_group,
      emergencyContact: p.emergency_contact
    }));

    return res.json({
      success: true,
      data: formatted
    });
  } catch (error: any) {
    console.error('Error fetching patients:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Get patient by id or uhid
router.get('/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM patients WHERE (id = $1 OR uhid = $1) AND hospital_id=$2', [id,req.user?.hospital_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient not found', errorCode: 'PATIENT_NOT_FOUND' });
    }
    const p = result.rows[0];

    // Enforce patient ownership check
    if (req.user?.role === 'patient') {
      if (p.uhid !== req.user.uhid && p.id !== req.user.userId) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: You are not authorized to view another patient\'s record',
          errorCode: 'FORBIDDEN'
        });
      }
    }

    const formatted = {
      ...p,
      name_subtitle: p.allergies ? `Allergies: ${p.allergies}` : 'Allergies: None documented',
      bloodGroup: p.blood_group,
      emergencyContact: p.emergency_contact
    };
    return res.json({
      success: true,
      data: formatted
    });
  } catch (error: any) {
    console.error('Error fetching patient:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Create new patient
router.post('/', authenticateJWT, authorizeRoles(['admin', 'doctor', 'nurse']), async (req: AuthenticatedRequest, res: Response) => {
  const { name, age, gender, bloodGroup, emergencyContact, allergies, status } = req.body;

  if (!name || age === undefined || !gender || !bloodGroup || !emergencyContact) {
    return res.status(400).json({ success: false, message: 'Missing required patient fields', errorCode: 'VALIDATION_ERROR' });
  }

  try {
    const nextVal = Math.floor(100000 + Math.random() * 900000);
    const uhid = `UHID-2026-${nextVal}`;
    const id = `P${Date.now()}`;

    const insertResult = await pool.query(
      'INSERT INTO patients (hospital_id, id, uhid, name, age, gender, blood_group, emergency_contact, allergies, status) VALUES ($10, $1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [id, uhid, name, age, gender, bloodGroup, emergencyContact, allergies || null, status || 'OPD',req.user?.hospital_id]
    );

    const p = insertResult.rows[0];
    const formatted = {
      ...p,
      name_subtitle: p.allergies ? `Allergies: ${p.allergies}` : 'Allergies: None documented',
      bloodGroup: p.blood_group,
      emergencyContact: p.emergency_contact
    };

    await logAudit(req, `PATIENT_REGISTERED: ${uhid}`, 'patient', 'info');

    return res.status(201).json({
      success: true,
      message: 'Patient registered successfully',
      data: formatted
    });
  } catch (error: any) {
    console.error('Error creating patient:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Update patient
router.patch('/:id', authenticateJWT, authorizeRoles(['admin', 'doctor', 'nurse']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, age, gender, bloodGroup, emergencyContact, allergies, status } = req.body;

  try {
    const existing = await pool.query('SELECT * FROM patients WHERE (id = $1 OR uhid = $1) AND hospital_id=$2', [id,req.user?.hospital_id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Patient not found', errorCode: 'PATIENT_NOT_FOUND' });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
    if (age !== undefined) { updates.push(`age = $${idx++}`); values.push(age); }
    if (gender !== undefined) { updates.push(`gender = $${idx++}`); values.push(gender); }
    if (bloodGroup !== undefined) { updates.push(`blood_group = $${idx++}`); values.push(bloodGroup); }
    if (emergencyContact !== undefined) { updates.push(`emergency_contact = $${idx++}`); values.push(emergencyContact); }
    if (allergies !== undefined) { updates.push(`allergies = $${idx++}`); values.push(allergies); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields provided for update', errorCode: 'VALIDATION_ERROR' });
    }

    values.push(id);
    const query = `UPDATE patients SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await pool.query(query, values);

    const p = result.rows[0];
    const formatted = {
      ...p,
      name_subtitle: p.allergies ? `Allergies: ${p.allergies}` : 'Allergies: None documented',
      bloodGroup: p.blood_group,
      emergencyContact: p.emergency_contact
    };

    await logAudit(req, `PATIENT_UPDATED: ${p.uhid}`, 'patient', 'info');

    return res.json({
      success: true,
      message: 'Patient record updated successfully',
      data: formatted
    });
  } catch (error: any) {
    console.error('Error updating patient:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

export default router;
