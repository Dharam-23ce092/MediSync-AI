import { Router, Response } from 'express';
import { pool } from '../config/postgres';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireTenant, TenantRequest } from '../middleware/tenant.middleware';
import { authorizeRoles } from '../middleware/role.middleware';
import { logAudit } from '../utils/audit';

const router = Router();

// Get all departments — enriched with staff count, doctors count, and beds count
router.get('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const hospitalId = req.user?.hospital_id;

  try {
    const query = `
      SELECT 
        d.id, 
        d.hospital_id, 
        d.name, 
        d.code, 
        d.description,
        COUNT(DISTINCT u.id) as staff_count,
        COUNT(DISTINCT doc.id) as doctors_count,
        0 as beds_count,
        0 as occupied_beds_count
      FROM departments d
      LEFT JOIN users u ON u.department_id = d.id AND u.is_active = true
      LEFT JOIN doctors doc ON doc.department_id = d.id
      WHERE d.hospital_id = $1 OR d.hospital_id IS NULL
      GROUP BY d.id, d.hospital_id, d.name, d.code, d.description
      ORDER BY d.name ASC
    `;

    const result = await pool.query(query, [hospitalId || 'H101']);
    return res.json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching departments:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Create new department
router.post('/', authenticateJWT, requireTenant, authorizeRoles(['admin']), async (req: TenantRequest, res: Response) => {
  const { name, code, description } = req.body;
  const hospitalId = req.hospitalId;

  if (!name || !code) {
    return res.status(400).json({
      success: false,
      message: 'Department name and code are required'
    });
  }

  try {
    const deptId = `D${Date.now()}`;
    const cleanCode = code.trim().toUpperCase();

    // Check code uniqueness
    const existing = await pool.query('SELECT id FROM departments WHERE (code = $1 OR name = $2) AND (hospital_id = $3 OR hospital_id IS NULL)', [cleanCode, name.trim(), hospitalId]);
    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'A department with this name or code already exists'
      });
    }

    const insertQuery = `
      INSERT INTO departments (id, hospital_id, name, code, description)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, hospital_id, name, code, description
    `;

    const result = await pool.query(insertQuery, [deptId, hospitalId, name.trim(), cleanCode, description || null]);
    await logAudit(req, 'DEPARTMENT_CREATED', 'admin', 'info');

    return res.status(201).json({
      success: true,
      message: 'Department created successfully',
      data: {
        ...result.rows[0],
        staff_count: '0',
        doctors_count: '0',
        beds_count: '0',
        occupied_beds_count: '0'
      }
    });
  } catch (error: any) {
    console.error('Error creating department:', error);
    return res.status(500).json({ success: false, message: 'Failed to create department' });
  }
});

// Update department
router.put('/:id', authenticateJWT, requireTenant, authorizeRoles(['admin']), async (req: TenantRequest, res: Response) => {
  const { id } = req.params;
  const { name, code, description } = req.body;
  const hospitalId = req.hospitalId;

  if (!name || !code) {
    return res.status(400).json({
      success: false,
      message: 'Department name and code are required'
    });
  }

  try {
    const cleanCode = code.trim().toUpperCase();

    const updateQuery = `
      UPDATE departments
      SET name = $1, code = $2, description = $3
      WHERE id = $4 AND (hospital_id = $5 OR hospital_id IS NULL)
      RETURNING id, hospital_id, name, code, description
    `;

    const result = await pool.query(updateQuery, [name.trim(), cleanCode, description || null, id, hospitalId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    await logAudit(req, 'DEPARTMENT_UPDATED', 'admin', 'info');

    return res.json({
      success: true,
      message: 'Department updated successfully',
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error updating department:', error);
    return res.status(500).json({ success: false, message: 'Failed to update department' });
  }
});

// Delete department
router.delete('/:id', authenticateJWT, requireTenant, authorizeRoles(['admin']), async (req: TenantRequest, res: Response) => {
  const { id } = req.params;
  const hospitalId = req.hospitalId;

  try {
    // Check if staff are assigned
    const userCheck = await pool.query('SELECT id FROM users WHERE department_id = $1 LIMIT 1', [id]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete department with assigned active staff. Please reassign staff first.'
      });
    }

    const deleteQuery = 'DELETE FROM departments WHERE id = $1 AND (hospital_id = $2 OR hospital_id IS NULL) RETURNING id';
    const result = await pool.query(deleteQuery, [id, hospitalId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    await logAudit(req, 'DEPARTMENT_DELETED', 'admin', 'warning');

    return res.json({
      success: true,
      message: 'Department deleted successfully',
      data: { id }
    });
  } catch (error: any) {
    console.error('Error deleting department:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete department' });
  }
});

export default router;
