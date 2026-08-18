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

    // Look up patient UHID if role is patient
    let uhid = undefined;
    if (user.role === 'patient') {
      const patientResult = await pool.query('SELECT uhid FROM patients WHERE name = $1', [user.name]);
      if (patientResult.rows.length > 0) {
        uhid = patientResult.rows[0].uhid;
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
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

export default router;
