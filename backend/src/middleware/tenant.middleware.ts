import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';

export interface TenantRequest extends AuthenticatedRequest {
  hospitalId?: string;
}

export const requireTenant = (req: TenantRequest, res: Response, next: NextFunction) => {
  // If user is super_admin, they might bypass hospital_id scoping depending on the resource
  if (req.user && req.user.role === 'admin') {
    // If hospital_id exists in user token, use it
    if (req.user.hospital_id) {
      req.hospitalId = req.user.hospital_id;
      return next();
    }
  }

  // Extract from decoded JWT token
  const hospitalId = req.user?.hospital_id;

  if (!hospitalId) {
    return res.status(403).json({
      success: false,
      message: 'Access Denied: Missing Hospital (Tenant) Scope',
      errorCode: 'TENANT_SCOPE_REQUIRED'
    });
  }

  req.hospitalId = hospitalId;
  next();
};
