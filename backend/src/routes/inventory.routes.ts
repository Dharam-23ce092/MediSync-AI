import { Router, Response } from 'express';
import { pool } from '../config/postgres';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';
import { logAudit } from '../utils/audit';

const router = Router();

// Get all inventory items
router.get('/', authenticateJWT, authorizeRoles(['pharmacist', 'admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, name, category, batch, qty, unit, reorder_level, unit_price, expiry, manufacturer, status
       FROM inventory
       ORDER BY
         CASE status
           WHEN 'Out of Stock' THEN 1
           WHEN 'Low Stock' THEN 2
           ELSE 3
         END,
         name ASC`
    );

    return res.json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching inventory:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Reorder request for an inventory item
router.patch('/:id/reorder', authenticateJWT, authorizeRoles(['pharmacist', 'admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const itemRes = await pool.query('SELECT id, name, qty FROM inventory WHERE id = $1', [id]);
    if (itemRes.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Inventory item not found' });
    }

    // In a real system this would trigger a purchase order. For now, log the audit.
    await logAudit(req, `INVENTORY_REORDER: Reorder requested for ${itemRes.rows[0].name} (current qty: ${itemRes.rows[0].qty})`, 'inventory', 'info');

    return res.json({
      success: true,
      message: `Reorder request submitted for ${itemRes.rows[0].name}`
    });
  } catch (error: any) {
    console.error('Error processing reorder:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

export default router;
