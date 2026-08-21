import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

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

export const authenticateJWT = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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
