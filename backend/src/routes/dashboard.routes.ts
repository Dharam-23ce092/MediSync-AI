import { Router, Response } from 'express';
import { pool } from '../config/postgres';
import { VitalHistory } from '../models/mongo/schemas';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireTenant } from '../middleware/tenant.middleware';
import { authorizeRoles } from '../middleware/role.middleware';

const router = Router();
router.use(authenticateJWT, requireTenant);
// All aggregate SQL is scoped to the authenticated hospital.
const scopedQuery = (hospitalId: string | undefined, sql: string, params: any[] = []) => {
 const clause = `hospital_id = $${params.length + 1}`;
 const scoped = /\bWHERE\b/i.test(sql) ? sql.replace(/\bWHERE\b/i, `WHERE ${clause} AND`) : `${sql} WHERE ${clause}`;
 return pool.query(scoped, [...params, hospitalId]);
};

// Admin dashboard aggregates
router.get('/admin', authenticateJWT, authorizeRoles(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [patientsToday, appointmentsToday, occupiedBeds, availableBeds, totalBeds, icuOccupied, icuTotal, outstandingBilling, prescriptionsToday] = await Promise.all([
      scopedQuery(req.user?.hospital_id, "SELECT COUNT(*) as count FROM patients WHERE DATE(created_at) = $1", [today]),
      scopedQuery(req.user?.hospital_id, "SELECT COUNT(*) as count FROM appointments WHERE DATE(appointment_time) = $1", [today]),
      scopedQuery(req.user?.hospital_id, "SELECT COUNT(*) as count FROM beds WHERE status = 'occupied'"),
      scopedQuery(req.user?.hospital_id, "SELECT COUNT(*) as count FROM beds WHERE status = 'available'"),
      scopedQuery(req.user?.hospital_id, "SELECT COUNT(*) as count FROM beds"),
      scopedQuery(req.user?.hospital_id, "SELECT COUNT(*) as count FROM beds WHERE status = 'occupied' AND type = 'ICU'"),
      scopedQuery(req.user?.hospital_id, "SELECT COUNT(*) as count FROM beds WHERE type = 'ICU'"),
      scopedQuery(req.user?.hospital_id, "SELECT COALESCE(SUM(balance), 0) as total FROM billing WHERE status != 'PAID'"),
      scopedQuery(req.user?.hospital_id, "SELECT COUNT(*) as count FROM prescriptions WHERE DATE(date) = $1", [today])
    ]);

    const icuTotalNum = parseInt(icuTotal.rows[0].count) || 0;
    const icuOccupiedNum = parseInt(icuOccupied.rows[0].count) || 0;
    const icuOccupancy = icuTotalNum > 0 ? Math.round((icuOccupiedNum / icuTotalNum) * 100) : 0;

    return res.json({
      success: true,
      data: {
        patientsToday: parseInt(patientsToday.rows[0].count),
        appointmentsToday: parseInt(appointmentsToday.rows[0].count),
        occupiedBeds: parseInt(occupiedBeds.rows[0].count),
        availableBeds: parseInt(availableBeds.rows[0].count),
        totalBeds: parseInt(totalBeds.rows[0].count),
        icuOccupancyPercent: icuOccupancy,
        outstandingBilling: parseFloat(outstandingBilling.rows[0].total).toFixed(2),
        prescriptionsToday: parseInt(prescriptionsToday.rows[0].count)
      }
    });
  } catch (error: any) {
    console.error('Error fetching admin dashboard:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Doctor dashboard aggregates
router.get('/doctor', authenticateJWT, authorizeRoles(['doctor']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const today = new Date().toISOString().split('T')[0];

    const [appointmentsToday, waitingCount, consultingCount] = await Promise.all([
      scopedQuery(req.user?.hospital_id,
        "SELECT COUNT(*) as count FROM appointments WHERE doctor_id = $1 AND DATE(appointment_time) = $2",
        [user.userId, today]
      ),
      scopedQuery(req.user?.hospital_id,
        "SELECT COUNT(*) as count FROM appointments WHERE doctor_id = $1 AND DATE(appointment_time) = $2 AND status = 'Waiting'",
        [user.userId, today]
      ),
      scopedQuery(req.user?.hospital_id, "SELECT COUNT(*) as count FROM appointments WHERE doctor_id=$1 AND DATE(appointment_time)=$2 AND status='In Consultation'", [user.userId,today])
    ]);

    // Count critical vitals from MongoDB
    let criticalVitalsCount = 0;
    try {
      const patients = await scopedQuery(req.user?.hospital_id, 'SELECT DISTINCT p.uhid FROM patients p JOIN cases c ON c.patient_id=p.id WHERE c.assigned_doctor=$1'.replace('SELECT DISTINCT p.uhid FROM patients p JOIN cases c ON c.patient_id=p.id WHERE c.assigned_doctor=$1', 'SELECT uhid FROM patients WHERE id IN (SELECT patient_id FROM cases WHERE assigned_doctor=$1)'), [user.userId]);
      criticalVitalsCount = await VitalHistory.countDocuments({ uhid: { $in: patients.rows.map(p=>p.uhid) }, status: 'critical' });
    } catch {
      // MongoDB may not be available
    }

    const totalToday = parseInt(appointmentsToday.rows[0].count) || 0;
    const waiting = parseInt(waitingCount.rows[0].count) || 0;

    return res.json({
      success: true,
      data: {
        appointmentsToday: totalToday,
        waitingPatients: waiting,
        inConsultation: Number(consultingCount.rows[0].count),
        criticalVitals: criticalVitalsCount
      }
    });
  } catch (error: any) {
    console.error('Error fetching doctor dashboard:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Nurse dashboard aggregates (vitals from MongoDB)
router.get('/nurse', authenticateJWT, authorizeRoles(['nurse', 'admin', 'doctor']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    let criticalCount = 0;
    let warningCount = 0;
    let totalCount = 0;

    try {
      const patients = await scopedQuery(req.user?.hospital_id, 'SELECT uhid FROM patients');
      const pipeline = [
        { $match: { uhid: { $in: patients.rows.map(p=>p.uhid) } } },
        {
          $sort: { uhid: 1, recordedAt: -1 as const }
        },
        {
          $group: {
            _id: '$uhid',
            latestStatus: { $first: '$status' }
          }
        }
      ];

      const latestVitals = await VitalHistory.aggregate(pipeline as any);
      totalCount = latestVitals.length;
      criticalCount = latestVitals.filter((v: any) => v.latestStatus === 'critical').length;
      warningCount = latestVitals.filter((v: any) => v.latestStatus === 'warning').length;
    } catch {
      // MongoDB may not be available
    }

    return res.json({
      success: true,
      data: {
        criticalVitals: criticalCount,
        warningVitals: warningCount,
        totalVitals: totalCount
      }
    });
  } catch (error: any) {
    console.error('Error fetching nurse dashboard:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Pharmacist dashboard aggregates (real inventory table)
router.get('/pharmacist', authenticateJWT, authorizeRoles(['pharmacist', 'admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [pending, dispensedToday, lowStock, expiring] = await Promise.all([
      scopedQuery(req.user?.hospital_id, "SELECT COUNT(*) as count FROM prescriptions WHERE status = 'Pending'"),
      scopedQuery(req.user?.hospital_id, "SELECT COUNT(*) as count FROM prescriptions WHERE status = 'Dispensed' AND DATE(date) = CURRENT_DATE"),
      scopedQuery(req.user?.hospital_id, "SELECT COUNT(*) as count FROM inventory WHERE qty <= reorder_level"),
      scopedQuery(req.user?.hospital_id, "SELECT COUNT(*) as count FROM inventory WHERE expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days' AND qty > 0")
    ]);

    return res.json({
      success: true,
      data: {
        pendingDispensations: parseInt(pending.rows[0].count) || 0,
        dispensedToday: parseInt(dispensedToday.rows[0].count) || 0,
        lowStockAlarms: parseInt(lowStock.rows[0].count) || 0,
        expiringBatches: Number(expiring.rows[0].count)
      }
    });
  } catch (error: any) {
    console.error('Error fetching pharmacist dashboard:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Lab dashboard aggregates
router.get('/lab', authenticateJWT, authorizeRoles(['lab', 'admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [pending, collected, completed, critical] = await Promise.all([
      scopedQuery(req.user?.hospital_id, "SELECT COUNT(*) as count FROM lab_orders WHERE status = 'Received'"),
      scopedQuery(req.user?.hospital_id, "SELECT COUNT(*) as count FROM lab_orders WHERE status = 'Collected'"),
      scopedQuery(req.user?.hospital_id, "SELECT COUNT(*) as count FROM lab_orders WHERE status = 'Completed'"),
      scopedQuery(req.user?.hospital_id, "SELECT COUNT(*) as count FROM lab_orders WHERE status = 'Completed' AND results IS NOT NULL AND results->>'status' = 'critical'")
    ]);

    return res.json({
      success: true,
      data: {
        pendingOrders: parseInt(pending.rows[0].count) || 0,
        samplesCollected: parseInt(collected.rows[0].count) || 0,
        completedOrders: parseInt(completed.rows[0].count) || 0,
        criticalResults: parseInt(critical.rows[0].count) || 0
      }
    });
  } catch (error: any) {
    console.error('Error fetching lab dashboard:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

export default router;
