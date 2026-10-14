import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/postgres';

const JWT_SECRET = process.env.JWT_SECRET;

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    name: string;
    role: 'super_admin' | 'admin' | 'doctor' | 'nurse' | 'patient' | 'pharmacist' | 'lab' | 'receptionist';
    hospital_id?: string;
    uhid?: string;
    specialty?: string;
  };
}

export const authenticateJWT = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!JWT_SECRET) {
    console.error('CRITICAL: JWT_SECRET environment variable is missing.');
    return res.status(500).json({
      success: false,
      message: 'Authentication service configuration error.',
      errorCode: 'CONFIG_ERROR'
    });
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access Denied: No Token Provided',
      errorCode: 'UNAUTHORIZED'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const account = await pool.query('SELECT role,hospital_id,is_active,created_at FROM users WHERE id=$1', [decoded.userId]);
    const current = account.rows[0];
    if (!current?.is_active || current.role !== decoded.role || current.hospital_id !== decoded.hospital_id || !decoded.iat || decoded.iat < Math.floor(new Date(current.created_at).getTime()/1000)) {
      return res.status(401).json({success:false,message:'Account or access has changed. Sign in again.',errorCode:'INVALID_TOKEN'});
    }
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Access Denied: Invalid or Expired Token',
      errorCode: 'INVALID_TOKEN'
    });
  }
};
