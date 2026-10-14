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
      WHERE b.status = 'occupied' AND b.hospital_id=$1
    `, [req.user?.hospital_id]);

    const activeVitals = [];

    for (const row of bedsRes.rows) {
      const latestMongo = await VitalHistory.findOne({ uhid: row.uhid, hospital_id: req.user?.hospital_id }).sort({ recordedAt: -1 });

      let status: string = 'unknown';
      let hr: number | null = null;
      let bp: string | null = null;
      let temp: number | null = null;
      let spo2: number | null = null;
      let notes = 'No vitals recorded yet.';

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
    const patient = await pool.query('SELECT id FROM patients WHERE uhid=$1 AND hospital_id=$2', [uhid,req.user?.hospital_id]);
    if (!patient.rowCount) return res.status(404).json({success:false,message:'Patient not found.'});
    const latest = await VitalHistory.findOne({ uhid, hospital_id: req.user?.hospital_id }).sort({ recordedAt: -1 });
    if (!latest) {
      return res.json({
        success: true,
        data: {
          uhid,
          hr: null,
          bp: null,
          temp: null,
          spo2: null,
          status: 'unknown',
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
    const patient = await pool.query('SELECT id FROM patients WHERE uhid=$1 AND hospital_id=$2', [uhid,req.user?.hospital_id]);
    if (!patient.rowCount) return res.status(404).json({success:false,message:'Patient not found.'});
    if (![hr,temp,spo2].every(v=>typeof v === 'number' && Number.isFinite(v) && v>0) || spo2>100 || !/^\d{2,3}\/\d{2,3}$/.test(bp)) return res.status(400).json({success:false,message:'Enter valid measured vitals.'});
    let status: 'normal' | 'warning' | 'critical' = 'normal';
    if (spo2 < 90 || hr > 110) {
      status = 'critical';
    } else if (spo2 < 95 || hr > 95 || temp > 100.5) {
      status = 'warning';
    }

    const nurseName = req.user?.name || 'Unknown Nurse';

    const admission = await pool.query("SELECT case_id FROM beds WHERE patient_id=$1 AND hospital_id=$2 AND status='occupied'", [patient.rows[0].id, req.user?.hospital_id]);
    const newVital = await VitalHistory.create({
      hospital_id: req.user?.hospital_id,
      patient_id: patient.rows[0].id,
      case_id: admission.rows[0]?.case_id,
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
