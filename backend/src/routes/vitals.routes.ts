import { Router, Response } from 'express';
import { pool } from '../config/postgres';
import { VitalHistory } from '../models/mongo/schemas';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';
import { logAudit } from '../utils/audit';

const router = Router();

// Get latest vitals for all active occupied beds
router.get('/', authenticateJWT, authorizeRoles(['admin', 'doctor', 'nurse']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const bedsRes = await pool.query(`
      SELECT b.name as bed, p.name, p.uhid, b.status as bed_status
      FROM beds b
      JOIN patients p ON p.id = b.patient_id
      WHERE b.status = 'occupied'
    `);

    const activeVitals = [];

    for (const row of bedsRes.rows) {
      const latestMongo = await VitalHistory.findOne({ uhid: row.uhid }).sort({ recordedAt: -1 });

      let status: 'normal' | 'warning' | 'critical' = 'normal';
      let hr = 72;
      let bp = '120/80';
      let temp = 98.6;
      let spo2 = 98;
      let notes = 'No notes';

      if (latestMongo) {
        status = latestMongo.status;
        hr = latestMongo.hr;
        bp = latestMongo.bp;
        temp = latestMongo.temp;
        spo2 = latestMongo.spo2;
        notes = latestMongo.notes || '';
      }

      activeVitals.push({
        bed: row.bed,
        name: row.name,
        uhid: row.uhid,
        hr,
        bp,
        temp,
        spo2,
        status,
        notes
      });
    }

    return res.json({
      success: true,
      data: activeVitals
    });
  } catch (error: any) {
    console.error('Error fetching latest active vitals:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Get latest vital for a specific patient uhid
router.get('/latest/:uhid', authenticateJWT, authorizeRoles(['admin', 'doctor', 'nurse', 'patient']), async (req: AuthenticatedRequest, res: Response) => {
  const { uhid } = req.params;

  if (req.user?.role === 'patient' && uhid !== req.user.uhid) {
    return res.status(403).json({
      success: false,
      message: 'Access Denied: You are not authorized to view another patient\'s vitals.',
      errorCode: 'FORBIDDEN'
    });
  }
  try {
    const latest = await VitalHistory.findOne({ uhid }).sort({ recordedAt: -1 });
    if (!latest) {
      return res.json({
        success: true,
        data: {
          uhid,
          hr: null,
          bp: null,
          temp: null,
          spo2: null,
          status: 'normal',
          notes: 'No vitals recorded yet.'
        }
      });
    }
    return res.json({
      success: true,
      data: latest
    });
  } catch (error: any) {
    console.error('Error fetching patient vitals:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Log new vitals
router.post('/', authenticateJWT, authorizeRoles(['admin', 'nurse']), async (req: AuthenticatedRequest, res: Response) => {
  const { bed, name, uhid, hr, bp, temp, spo2, notes } = req.body;

  if (!uhid || hr === undefined || !bp || temp === undefined || spo2 === undefined) {
    return res.status(400).json({ success: false, message: 'Missing fields', errorCode: 'VALIDATION_ERROR' });
  }

  try {
    let status: 'normal' | 'warning' | 'critical' = 'normal';
    if (spo2 < 90 || hr > 110) {
      status = 'critical';
    } else if (spo2 < 95 || hr > 95 || temp > 100.5) {
      status = 'warning';
    }

    const nurseName = req.user?.name || 'Unknown Nurse';

    const newVital = await VitalHistory.create({
      uhid,
      hr,
      bp,
      temp,
      spo2,
      status,
      notes: notes || '',
      recordedBy: nurseName,
      recordedAt: new Date()
    });

    await logAudit(req, `VITALS_RECORDED: Vitals logged for patient ${uhid} (${status})`, 'vitals', status === 'critical' ? 'critical' : 'info');

    return res.status(201).json({
      success: true,
      message: 'Vitals logged successfully',
      data: {
        bed: bed || 'General',
        name: name || 'Patient',
        uhid,
        hr,
        bp,
        temp,
        spo2,
        status,
        notes: notes || ''
      }
    });
  } catch (error: any) {
    console.error('Error logging vitals:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

export default router;
