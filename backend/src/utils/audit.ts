import { AuditLog } from '../models/mongo/schemas';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export const logAudit = async (
  req: AuthenticatedRequest,
  event: string,
  module: string,
  severity: 'info' | 'warning' | 'critical' = 'info'
) => {
  try {
    const userId = req.user?.userId || 'SYSTEM';
    const userName = req.user?.name || 'System Auto';
    const role = req.user?.role || 'system';

    // Get clean IP address
    let ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';
    if (ipAddress.startsWith('::ffff:')) {
      ipAddress = ipAddress.substring(7);
    }

    await AuditLog.create({
      hospital_id: req.user?.hospital_id,
      timestamp: new Date(),
      userId,
      userName,
      role,
      event,
      module,
      ipAddress,
      severity
    });
  } catch (error) {
    console.error('Failed to log audit event to MongoDB:', error);
  }
};
