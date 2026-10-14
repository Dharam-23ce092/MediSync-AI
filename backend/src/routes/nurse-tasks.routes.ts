import { Router, Response } from 'express';
import { pool } from '../config/postgres';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';

const router = Router();

// Get all nurse tasks for current hospital
router.get('/', authenticateJWT, authorizeRoles(['nurse', 'admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, bed, patient_name as "patientName", task, scheduled_time as "scheduledTime",
              priority, completed, case_id as "caseId", patient_id as "patientId"
       FROM nurse_tasks
       WHERE hospital_id=$1 AND (case_id IS NULL OR completed=true OR case_id IN (SELECT id FROM cases WHERE status NOT IN ('discharged','closed','cancelled')))
       ORDER BY
         completed ASC,
         CASE priority
           WHEN 'high' THEN 1
           WHEN 'medium' THEN 2
           WHEN 'low' THEN 3
           ELSE 4
         END,
         scheduled_time ASC`, [req.user?.hospital_id]
    );

    return res.json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching nurse tasks:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Toggle task completion
router.patch('/:id/toggle', authenticateJWT, authorizeRoles(['nurse', 'admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'UPDATE nurse_tasks SET completed = NOT completed WHERE id = $1 AND hospital_id=$2 RETURNING id, completed',
      [id,req.user?.hospital_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    return res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error toggling task:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

export default router;
