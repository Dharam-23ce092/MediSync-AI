import { Response } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import bcrypt from 'bcryptjs';
import { pool } from '../config/postgres';
import { logAudit } from '../utils/audit';
import { authenticateJWT } from '../middleware/auth.middleware';
import { requireTenant, TenantRequest } from '../middleware/tenant.middleware';
import { authorizeRoles } from '../middleware/role.middleware';
import { Router } from 'express';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Get all staff members for the logged-in hospital
router.get('/', authenticateJWT, requireTenant, authorizeRoles(['admin']), async (req: TenantRequest, res: Response) => {
  const hospitalId = req.hospitalId;

  try {
    const query = `
      SELECT u.id, u.email, u.name, u.role, u.specialty, u.employee_id, u.is_active, u.created_at,
             u.department_id, d.name as department_name, d.code as department_code
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.hospital_id = $1 AND u.role != 'patient'
      ORDER BY u.created_at DESC
    `;

    const result = await pool.query(query, [hospitalId]);

    return res.json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching staff list:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch staff members',
      errorCode: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// Create single staff member manually
router.post('/', authenticateJWT, requireTenant, authorizeRoles(['admin']), async (req: TenantRequest, res: Response) => {
  const { name, email, password, role, department_id, specialty, employee_id } = req.body;
  const hospitalId = req.hospitalId;

  if (!name || !email || !role) {
    return res.status(400).json({
      success: false,
      message: 'Name, email, and role are required',
      errorCode: 'VALIDATION_ERROR'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if email is already taken
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'A user with this email address already exists',
        errorCode: 'EMAIL_EXISTS'
      });
    }

    const userId = `U${Date.now()}`;
    const rawPassword = password || `${role.toLowerCase()}_medisync`;
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    const userInsertQuery = `
      INSERT INTO users (
        id, hospital_id, email, password_hash, name, role, specialty, department_id, employee_id, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, name, email, role, specialty, department_id, employee_id, is_active, created_at
    `;

    const userResult = await client.query(userInsertQuery, [
      userId,
      hospitalId,
      email.trim().toLowerCase(),
      passwordHash,
      name.trim(),
      role.toLowerCase(),
      specialty?.trim() || null,
      department_id || null,
      employee_id?.trim() || null,
      true
    ]);

    const newUser = userResult.rows[0];

    // If user is a doctor, create doctor profile
    if (role.toLowerCase() === 'doctor') {
      const doctorId = `DOC${Date.now()}`;
      await client.query(
        'INSERT INTO doctors (id, hospital_id, user_id, department_id, availability_status) VALUES ($1, $2, $3, $4, $5)',
        [doctorId, hospitalId, userId, department_id || null, 'Available']
      );
    }

    await client.query('COMMIT');
    await logAudit(req, 'STAFF_MEMBER_CREATED', 'admin', 'info');

    // Fetch department details to return full object
    let deptName = null;
    let deptCode = null;
    if (department_id) {
      const deptRes = await pool.query('SELECT name, code FROM departments WHERE id = $1', [department_id]);
      if (deptRes.rows.length > 0) {
        deptName = deptRes.rows[0].name;
        deptCode = deptRes.rows[0].code;
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Staff member created successfully',
      data: {
        ...newUser,
        department_name: deptName,
        department_code: deptCode
      }
    });

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error creating staff member:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create staff member',
      errorCode: 'INTERNAL_SERVER_ERROR'
    });
  } finally {
    client.release();
  }
});

// Update an existing staff member
router.put('/:id', authenticateJWT, requireTenant, authorizeRoles(['admin']), async (req: TenantRequest, res: Response) => {
  const { id } = req.params;
  const { name, role, department_id, specialty, employee_id, is_active } = req.body;
  const hospitalId = req.hospitalId;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const checkUser = await client.query('SELECT id, role, is_active FROM users WHERE id = $1 AND hospital_id = $2', [id, hospitalId]);
    if (checkUser.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Staff member not found',
        errorCode: 'NOT_FOUND'
      });
    }

    const prevRole = checkUser.rows[0].role;

    const updateQuery = `
      UPDATE users
      SET name = COALESCE($1, name),
          role = COALESCE($2, role),
          department_id = $3,
          specialty = $4,
          employee_id = $5,
          is_active = COALESCE($6, is_active)
      WHERE id = $7 AND hospital_id = $8
      RETURNING id, name, email, role, specialty, department_id, employee_id, is_active, created_at
    `;

    const updateResult = await client.query(updateQuery, [
      name?.trim(),
      role?.toLowerCase(),
      department_id || null,
      specialty?.trim() || null,
      employee_id?.trim() || null,
      is_active !== undefined ? is_active : null,
      id,
      hospitalId
    ]);

    const updatedUser = updateResult.rows[0];

    // Handle doctor role changes
    const newRole = role ? role.toLowerCase() : prevRole;
    if (newRole === 'doctor' && prevRole !== 'doctor') {
      const docCheck = await client.query('SELECT id FROM doctors WHERE user_id = $1', [id]);
      if (docCheck.rows.length === 0) {
        const doctorId = `DOC${Date.now()}`;
        await client.query(
          'INSERT INTO doctors (id, hospital_id, user_id, department_id, availability_status) VALUES ($1, $2, $3, $4, $5)',
          [doctorId, hospitalId, id, department_id || null, 'Available']
        );
      }
    } else if (newRole !== 'doctor' && prevRole === 'doctor') {
      await client.query('DELETE FROM doctors WHERE user_id = $1', [id]);
    } else if (newRole === 'doctor') {
      await client.query('UPDATE doctors SET department_id = $1 WHERE user_id = $2', [department_id || null, id]);
    }

    await client.query('COMMIT');
    await logAudit(req, 'STAFF_MEMBER_UPDATED', 'admin', 'info');

    // Fetch department details
    let deptName = null;
    let deptCode = null;
    if (updatedUser.department_id) {
      const deptRes = await pool.query('SELECT name, code FROM departments WHERE id = $1', [updatedUser.department_id]);
      if (deptRes.rows.length > 0) {
        deptName = deptRes.rows[0].name;
        deptCode = deptRes.rows[0].code;
      }
    }

    return res.json({
      success: true,
      message: 'Staff member updated successfully',
      data: {
        ...updatedUser,
        department_name: deptName,
        department_code: deptCode
      }
    });

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error updating staff member:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update staff member',
      errorCode: 'INTERNAL_SERVER_ERROR'
    });
  } finally {
    client.release();
  }
});

// Delete staff member
router.delete('/:id', authenticateJWT, requireTenant, authorizeRoles(['admin']), async (req: TenantRequest, res: Response) => {
  const { id } = req.params;
  const hospitalId = req.hospitalId;

  if (id === req.user?.userId) {
    return res.status(400).json({
      success: false,
      message: 'You cannot delete your own administrator account',
      errorCode: 'CANNOT_DELETE_SELF'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Delete doctor record if exists
    await client.query('DELETE FROM doctors WHERE user_id = $1 AND hospital_id = $2', [id, hospitalId]);

    // Delete user
    const deleteResult = await client.query('DELETE FROM users WHERE id = $1 AND hospital_id = $2 RETURNING id, name, email', [id, hospitalId]);

    if (deleteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Staff member not found',
        errorCode: 'NOT_FOUND'
      });
    }

    await client.query('COMMIT');
    await logAudit(req, 'STAFF_MEMBER_DELETED', 'admin', 'warning');

    return res.json({
      success: true,
      message: 'Staff member deleted successfully',
      data: deleteResult.rows[0]
    });

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error deleting staff member:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete staff member',
      errorCode: 'INTERNAL_SERVER_ERROR'
    });
  } finally {
    client.release();
  }
});

// Bulk import staff via CSV
router.post('/import', authenticateJWT, requireTenant, authorizeRoles(['admin']), upload.single('file'), async (req: TenantRequest, res: Response) => {
  const reqAny = req as any;
  if (!reqAny.file) {
    return res.status(400).json({
      success: false,
      message: 'No CSV file uploaded',
      errorCode: 'FILE_REQUIRED'
    });
  }

  const hospitalId = req.hospitalId;
  const client = await pool.connect();

  try {
    const records = parse(reqAny.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    if (records.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'CSV file is empty',
        errorCode: 'EMPTY_FILE'
      });
    }

    await client.query('BEGIN');

    const createdUsers: any[] = [];
    const skippedUsers: any[] = [];

    const deptResult = await client.query('SELECT id, name, code FROM departments WHERE hospital_id = $1 OR hospital_id IS NULL', [hospitalId]);
    const departments = deptResult.rows;

    for (const record of records) {
      const { name, email, role, department, specialty, employee_id } = record;

      if (!name || !email || !role) {
        skippedUsers.push({ email, reason: 'Missing name, email, or role' });
        continue;
      }

      const userCheck = await client.query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
      if (userCheck.rows.length > 0) {
        skippedUsers.push({ email, reason: 'Email already registered' });
        continue;
      }

      let resolvedDeptId = null;
      if (department) {
        const matchedDept = departments.find(
          d => d.name.toLowerCase() === department.toLowerCase() || d.code.toLowerCase() === department.toLowerCase()
        );
        if (matchedDept) {
          resolvedDeptId = matchedDept.id;
        }
      }

      const userId: string = `U${Date.now() + createdUsers.length}`;
      const defaultPassword = `${role.toLowerCase()}_medisync`;
      const passwordHash = await bcrypt.hash(defaultPassword, 10);

      const userInsertQuery = `
        INSERT INTO users (
          id, hospital_id, email, password_hash, name, role, specialty, department_id, employee_id, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, name, email, role, specialty, department_id, employee_id, is_active
      `;

      const userResult: any = await client.query(userInsertQuery, [
        userId,
        hospitalId,
        email.trim().toLowerCase(),
        passwordHash,
        name.trim(),
        role.toLowerCase(),
        specialty || null,
        resolvedDeptId,
        employee_id || null,
        true
      ]);

      const newUser: any = userResult.rows[0];

      if (role.toLowerCase() === 'doctor') {
        const doctorId = `DOC${Date.now() + createdUsers.length}`;
        await client.query(
          'INSERT INTO doctors (id, hospital_id, user_id, department_id, availability_status) VALUES ($1, $2, $3, $4, $5)',
          [doctorId, hospitalId, userId, resolvedDeptId, 'Available']
        );
      }

      createdUsers.push(newUser);
    }

    await client.query('COMMIT');
    await logAudit(req, 'STAFF_BULK_IMPORTED', 'admin', 'info');

    return res.status(201).json({
      success: true,
      message: `Successfully imported ${createdUsers.length} staff members. Skipped ${skippedUsers.length} due to duplicates/validation.`,
      data: {
        importedCount: createdUsers.length,
        skippedCount: skippedUsers.length,
        imported: createdUsers,
        skipped: skippedUsers
      }
    });

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error importing staff CSV:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to import staff due to a system error',
      errorCode: 'INTERNAL_SERVER_ERROR'
    });
  } finally {
    client.release();
  }
});

// Toggle staff activation status (activate/deactivate)
router.patch('/:id/toggle', authenticateJWT, requireTenant, authorizeRoles(['admin']), async (req: TenantRequest, res: Response) => {
  const { id } = req.params;
  const hospitalId = req.hospitalId;

  try {
    const userResult = await pool.query('SELECT id, is_active, role FROM users WHERE id = $1 AND hospital_id = $2', [id, hospitalId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Staff member not found or does not belong to your hospital',
        errorCode: 'STAFF_NOT_FOUND'
      });
    }

    const staffMember = userResult.rows[0];

    if (staffMember.id === req.user?.userId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own account',
        errorCode: 'CANNOT_DEACTIVATE_SELF'
      });
    }

    const newStatus = !staffMember.is_active;
    await pool.query('UPDATE users SET is_active = $1 WHERE id = $2', [newStatus, id]);

    const event = newStatus ? 'STAFF_ACTIVATED' : 'STAFF_DEACTIVATED';
    await logAudit(req, event, 'admin', 'info');

    return res.json({
      success: true,
      message: `Staff member successfully ${newStatus ? 'activated' : 'deactivated'}`,
      data: {
        id,
        is_active: newStatus
      }
    });

  } catch (error: any) {
    console.error('Error toggling staff status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update staff status',
      errorCode: 'INTERNAL_SERVER_ERROR'
    });
  }
});

export default router;
