import { Router, Response } from 'express';
import { pool } from '../config/postgres';
import { VitalHistory } from '../models/mongo/schemas';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';

const router = Router();

// Admin dashboard aggregates
router.get('/admin', authenticateJWT, authorizeRoles(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [patientsToday, appointmentsToday, occupiedBeds, availableBeds, totalBeds, icuOccupied, icuTotal, outstandingBilling, prescriptionsToday] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM patients WHERE DATE(created_at) = $1", [today]),
      pool.query("SELECT COUNT(*) as count FROM appointments WHERE DATE(appointment_time) = $1", [today]),
      pool.query("SELECT COUNT(*) as count FROM beds WHERE status = 'occupied'"),
      pool.query("SELECT COUNT(*) as count FROM beds WHERE status = 'available'"),
      pool.query("SELECT COUNT(*) as count FROM beds"),
      pool.query("SELECT COUNT(*) as count FROM beds WHERE status = 'occupied' AND type = 'ICU'"),
      pool.query("SELECT COUNT(*) as count FROM beds WHERE type = 'ICU'"),
      pool.query("SELECT COALESCE(SUM(balance), 0) as total FROM billing WHERE status != 'PAID'"),
      pool.query("SELECT COUNT(*) as count FROM prescriptions WHERE DATE(date) = $1", [today])
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

    const [appointmentsToday, waitingCount] = await Promise.all([
      pool.query(
        "SELECT COUNT(*) as count FROM appointments WHERE doctor_id = $1 AND DATE(appointment_time) = $2",
        [user.userId, today]
      ),
      pool.query(
        "SELECT COUNT(*) as count FROM appointments WHERE doctor_id = $1 AND DATE(appointment_time) = $2 AND status = 'Waiting'",
        [user.userId, today]
      )
    ]);

    // Count critical vitals from MongoDB
    let criticalVitalsCount = 0;
    try {
      criticalVitalsCount = await VitalHistory.countDocuments({ status: 'critical' });
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
        inConsultation: totalToday - waiting,
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
      const pipeline = [
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
    const [pending, dispensedToday, lowStock] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM prescriptions WHERE status = 'Pending'"),
      pool.query("SELECT COUNT(*) as count FROM prescriptions WHERE status = 'Dispensed' AND DATE(date) = CURRENT_DATE"),
      pool.query("SELECT COUNT(*) as count FROM inventory WHERE status IN ('Low Stock', 'Out of Stock')")
    ]);

    return res.json({
      success: true,
      data: {
        pendingDispensations: parseInt(pending.rows[0].count) || 0,
        dispensedToday: parseInt(dispensedToday.rows[0].count) || 0,
        lowStockAlarms: parseInt(lowStock.rows[0].count) || 0
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
      pool.query("SELECT COUNT(*) as count FROM lab_orders WHERE status = 'Received'"),
      pool.query("SELECT COUNT(*) as count FROM lab_orders WHERE status = 'Collected'"),
      pool.query("SELECT COUNT(*) as count FROM lab_orders WHERE status = 'Completed'"),
      pool.query("SELECT COUNT(*) as count FROM lab_orders WHERE status = 'Completed' AND results IS NOT NULL AND results->>'status' = 'critical'")
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
