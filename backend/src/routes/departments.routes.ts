import { Router, Response } from 'express';
import { pool } from '../config/postgres';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

// Get all departments — any authenticated user can view department list
router.get('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM departments ORDER BY name ASC');
    return res.json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching departments:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

export default router;
