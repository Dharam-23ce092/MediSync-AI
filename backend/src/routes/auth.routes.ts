import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/postgres';
import { logAudit } from '../utils/audit';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!JWT_SECRET) {
    console.error('CRITICAL: JWT_SECRET environment variable is missing.');
    return res.status(500).json({
      success: false,
      message: 'Authentication service configuration error.',
      errorCode: 'CONFIG_ERROR'
    });
  }

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required',
      errorCode: 'VALIDATION_ERROR'
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid email address format',
      errorCode: 'VALIDATION_ERROR'
    });
  }

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        errorCode: 'INVALID_CREDENTIALS'
      });
    }

    const user = userResult.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        errorCode: 'INVALID_CREDENTIALS'
      });
    }

    // Look up patient UHID and hospital if role is patient
    let uhid = undefined;
    let hospital_id = user.hospital_id;
    if (user.role === 'patient') {
      const patientResult = await pool.query('SELECT uhid, hospital_id FROM patients WHERE user_id = $1', [user.id]);
      if (patientResult.rows.length > 0) {
        uhid = patientResult.rows[0].uhid;
        hospital_id = patientResult.rows[0].hospital_id;
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        hospital_id,
        uhid,
        specialty: user.specialty
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Create a temporary mock request user field for the audit logger
    const authReq = req as AuthenticatedRequest;
    authReq.user = {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      hospital_id,
      uhid,
      specialty: user.specialty
    };

    await logAudit(authReq, 'USER_LOGIN_SUCCESS', 'auth', 'info');

    return res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          name: user.name,
          email: user.email,
          role: user.role,
          hospital_id,
          uhid,
          specialty: user.specialty
        }
      }
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Login failed due to a system error',
      errorCode: 'INTERNAL_SERVER_ERROR'
    });
  }
});

router.post('/logout', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  if (authReq.user) {
    await logAudit(authReq, 'USER_LOGOUT', 'auth', 'info');
  }
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// Patient Self-Registration
router.post('/register-patient', async (req: Request, res: Response) => {
  const {
    name,
    email,
    password,
    age,
    gender,
    bloodGroup,
    emergencyContact,
    allergies,
    hospitalId
  } = req.body;

  if (!name || !email || !password || age === undefined || !gender || !bloodGroup || !emergencyContact || !hospitalId) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields for patient registration',
      errorCode: 'VALIDATION_ERROR'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Check if email is already taken
    const userCheck = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'This email is already registered',
        errorCode: 'EMAIL_TAKEN'
      });
    }

    // 2. Check if hospital exists
    const hospitalCheck = await client.query('SELECT id FROM hospitals WHERE id = $1', [hospitalId]);
    if (hospitalCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'The selected hospital does not exist',
        errorCode: 'HOSPITAL_INVALID'
      });
    }

    // 3. Create User Account
    const userId = `U${Date.now()}`;
    const passwordHash = await bcrypt.hash(password, 10);
    
    await client.query(
      'INSERT INTO users (id, hospital_id, email, password_hash, name, role, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [userId, hospitalId, email, passwordHash, name, 'patient', true]
    );

    // 4. Create Patient Profile
    const patientId = `P${Date.now()}`;
    const nextVal = Math.floor(100000 + Math.random() * 900000);
    const uhid = `UHID-2026-${nextVal}`;

    await client.query(
      'INSERT INTO patients (id, hospital_id, user_id, uhid, name, age, gender, blood_group, emergency_contact, allergies, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
      [
        patientId,
        hospitalId,
        userId,
        uhid,
        name,
        age,
        gender,
        bloodGroup,
        emergencyContact,
        allergies || null,
        'OPD'
      ]
    );

    await client.query('COMMIT');

    // Create Audit Log
    const mockReq = req as AuthenticatedRequest;
    mockReq.user = {
      userId,
      email,
      name,
      role: 'patient',
      hospital_id: hospitalId
    };
    await logAudit(mockReq, 'PATIENT_REGISTERED', 'auth', 'info');

    return res.status(201).json({
      success: true,
      message: 'Patient registered successfully',
      data: {
        userId,
        uhid,
        name,
        email
      }
    });

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error during patient registration:', error);
    return res.status(500).json({
      success: false,
      message: 'Registration failed due to a system error',
      errorCode: 'INTERNAL_SERVER_ERROR'
    });
  } finally {
    client.release();
  }
});

export default router;
