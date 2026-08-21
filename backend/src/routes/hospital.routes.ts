import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../config/postgres';
import { logAudit } from '../utils/audit';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireTenant, TenantRequest } from '../middleware/tenant.middleware';
import { authorizeRoles } from '../middleware/role.middleware';

const router = Router();

// Get all active hospitals (public)
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT id, name, slug FROM hospitals WHERE status = 'active'");
    return res.json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching hospitals:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch hospital listing',
      errorCode: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// Register new hospital and its administrator
router.post('/register', async (req: Request, res: Response) => {
  const {
    name,
    slug,
    domain,
    address,
    city,
    state,
    phone,
    licenseNo,
    logoUrl,
    adminName,
    adminEmail,
    adminPassword
  } = req.body;

  // Basic validation
  if (!name || !slug || !adminName || !adminEmail || !adminPassword) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields for hospital or administrator registration',
      errorCode: 'VALIDATION_ERROR'
    });
  }

  const slugRegex = /^[a-z0-9-]+$/;
  if (!slugRegex.test(slug)) {
    return res.status(400).json({
      success: false,
      message: 'Slug must contain only lowercase letters, numbers, and hyphens',
      errorCode: 'VALIDATION_ERROR'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Check if hospital slug is already taken
    const hospitalCheck = await client.query('SELECT id FROM hospitals WHERE slug = $1', [slug]);
    if (hospitalCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'A hospital with this slug already exists',
        errorCode: 'SLUG_TAKEN'
      });
    }

    // 2. Check if admin email is already registered in the system
    const userCheck = await client.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    if (userCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'This email is already registered',
        errorCode: 'EMAIL_TAKEN'
      });
    }

    // 3. Create Hospital
    const hospitalId = `H${Date.now()}`;
    const insertHospitalQuery = `
      INSERT INTO hospitals (
        id, name, slug, domain, address, city, state, phone, license_no, logo_url, status, plan
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    const hospitalResult = await client.query(insertHospitalQuery, [
      hospitalId,
      name,
      slug,
      domain || null,
      address || null,
      city || null,
      state || null,
      phone || null,
      licenseNo || null,
      logoUrl || null,
      'active',
      'professional' // Default setup
    ]);

    const newHospital = hospitalResult.rows[0];

    // 4. Create Admin User for this Hospital
    const userId = `U${Date.now() + 1}`;
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const insertUserQuery = `
      INSERT INTO users (
        id, hospital_id, email, password_hash, name, role, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, email, role
    `;
    const userResult = await client.query(insertUserQuery, [
      userId,
      hospitalId,
      adminEmail,
      passwordHash,
      adminName,
      'admin',
      true
    ]);

    const newAdmin = userResult.rows[0];

    await client.query('COMMIT');

    // Audit Log Creation
    const mockReq = req as AuthenticatedRequest;
    mockReq.user = {
      userId: newAdmin.id,
      email: newAdmin.email,
      name: newAdmin.name,
      role: 'admin',
      hospital_id: hospitalId
    };
    await logAudit(mockReq, 'HOSPITAL_REGISTERED', 'admin', 'info');

    return res.status(201).json({
      success: true,
      message: 'Hospital and administrator registered successfully',
      data: {
        hospital: newHospital,
        admin: newAdmin
      }
    });

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error registering hospital:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to register hospital due to a system error',
      errorCode: 'INTERNAL_SERVER_ERROR'
    });
  } finally {
    client.release();
  }
});

// Get hospital details
router.get('/:id', authenticateJWT, requireTenant, async (req: TenantRequest, res: Response) => {
  const { id } = req.params;

  // Security: users can only view their own hospital details unless they are super_admin
  if (req.user?.role !== 'super_admin' && req.hospitalId !== id) {
    return res.status(403).json({
      success: false,
      message: 'Access Denied: You cannot view another hospital\'s details',
      errorCode: 'FORBIDDEN'
    });
  }

  try {
    const result = await pool.query('SELECT * FROM hospitals WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found',
        errorCode: 'HOSPITAL_NOT_FOUND'
      });
    }

    return res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error fetching hospital details:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error'
    });
  }
});

// Update hospital details
router.put('/:id', authenticateJWT, requireTenant, authorizeRoles(['admin']), async (req: TenantRequest, res: Response) => {
  const { id } = req.params;
  const { name, address, city, state, phone, licenseNo, logoUrl } = req.body;

  if (req.hospitalId !== id) {
    return res.status(403).json({
      success: false,
      message: 'Access Denied: You cannot modify another hospital\'s details',
      errorCode: 'FORBIDDEN'
    });
  }

  try {
    const updateQuery = `
      UPDATE hospitals
      SET name = COALESCE($1, name),
          address = COALESCE($2, address),
          city = COALESCE($3, city),
          state = COALESCE($4, state),
          phone = COALESCE($5, phone),
          license_no = COALESCE($6, license_no),
          logo_url = COALESCE($7, logo_url),
          updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `;

    const result = await pool.query(updateQuery, [
      name,
      address,
      city,
      state,
      phone,
      licenseNo,
      logoUrl,
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found',
        errorCode: 'HOSPITAL_NOT_FOUND'
      });
    }

    await logAudit(req, 'HOSPITAL_UPDATED', 'admin', 'info');

    return res.json({
      success: true,
      message: 'Hospital details updated successfully',
      data: result.rows[0]
    });

  } catch (error: any) {
    console.error('Error updating hospital details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update hospital details due to a system error',
      errorCode: 'INTERNAL_SERVER_ERROR'
    });
  }
});

export default router;
