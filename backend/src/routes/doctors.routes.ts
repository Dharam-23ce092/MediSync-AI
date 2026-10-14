import { Router, Response } from 'express';
import { pool } from '../config/postgres';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

// Get all doctors — any authenticated user can view the doctor directory
router.get('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.specialty, d.name as department_name, doc.availability_status
      FROM users u
      LEFT JOIN doctors doc ON doc.user_id = u.id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.role = 'doctor' AND u.hospital_id=$1 AND u.is_active=true
    `, [req.user?.hospital_id]);

    return res.json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching doctors:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Get doctor by ID — any authenticated user can view a specific doctor's profile
router.get('/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.specialty, d.name as department_name, doc.availability_status
      FROM users u
      LEFT JOIN doctors doc ON doc.user_id = u.id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.role = 'doctor' AND u.id = $1 AND u.hospital_id=$2 AND u.is_active=true
    `, [id, req.user?.hospital_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    return res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error fetching doctor details:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

export default router;
