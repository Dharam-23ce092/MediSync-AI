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
              priority, completed
       FROM nurse_tasks
       ORDER BY
         completed ASC,
         CASE priority
           WHEN 'high' THEN 1
           WHEN 'medium' THEN 2
           WHEN 'low' THEN 3
           ELSE 4
         END,
         scheduled_time ASC`
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
      'UPDATE nurse_tasks SET completed = NOT completed WHERE id = $1 RETURNING id, completed',
      [id]
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
