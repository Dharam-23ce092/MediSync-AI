import { Router, Response } from 'express';
import { pool } from '../config/postgres';
import { LabResult } from '../models/mongo/schemas';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';
import { logAudit } from '../utils/audit';

const router = Router();

// Get all lab orders
router.get('/', authenticateJWT, authorizeRoles(['admin', 'doctor', 'nurse', 'lab', 'patient']), async (req: AuthenticatedRequest, res: Response) => {
  const { uhid } = req.query;
  try {
    let targetUhid = uhid;
    if (req.user?.role === 'patient') {
      targetUhid = req.user.uhid;
    }
    let query = `
      SELECT lo.id, p.name, p.uhid as patient_uhid,
             lo.test_name as "testName", u.name as doctor,
             lo.specimen, lo.status, to_char(lo.date, 'YYYY-MM-DD') as date
      FROM lab_orders lo
      JOIN patients p ON p.id = lo.patient_id
      JOIN users u ON u.id = lo.doctor_id
    `;
    const values: any[] = [];
    if (targetUhid) {
      query += ' WHERE p.uhid = $1';
      values.push(targetUhid);
    }
    query += ' ORDER BY lo.created_at DESC';

    const result = await pool.query(query, values);

    const formatted = [];

    for (const order of result.rows) {
      let resultsData = undefined;
      if (order.status === 'Completed') {
        const mongoRes = await LabResult.findOne({ labOrderId: order.id });
        if (mongoRes) {
          resultsData = mongoRes.results;
        }
      }
      formatted.push({
        id: order.id,
        name: order.name,
        name_subtitle: order.patient_uhid,
        testName: order.testName,
        doctor: order.doctor,
        specimen: order.specimen,
        status: order.status,
        date: order.date,
        results: resultsData
      });
    }

    return res.json({
      success: true,
      data: formatted
    });
  } catch (error: any) {
    console.error('Error fetching lab orders:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Create lab order
router.post('/', authenticateJWT, authorizeRoles(['admin', 'doctor']), async (req: AuthenticatedRequest, res: Response) => {
  const { name_subtitle, testName, doctor, specimen } = req.body;

  if (!name_subtitle || !testName || !specimen) {
    return res.status(400).json({ success: false, message: 'Missing fields', errorCode: 'VALIDATION_ERROR' });
  }

  try {
    const patRes = await pool.query('SELECT id, name, uhid FROM patients WHERE uhid = $1 OR id = $1', [name_subtitle]);
    if (patRes.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Patient not found', errorCode: 'PATIENT_NOT_FOUND' });
    }
    const targetPatient = patRes.rows[0];

    let doctorId = req.user?.userId;
    let doctorName = req.user?.name;

    if (doctor) {
      const docRes = await pool.query('SELECT id, name FROM users WHERE name = $1 AND role = $2', [doctor, 'doctor']);
      if (docRes.rows && docRes.rows.length > 0) {
        doctorId = docRes.rows[0].id;
        doctorName = docRes.rows[0].name;
      }
    }

    if (!doctorId) {
      return res.status(400).json({ success: false, message: 'Doctor session not verified', errorCode: 'VALIDATION_ERROR' });
    }

    const loId = `L${Date.now()}`;
    const date = new Date().toISOString().split('T')[0];

    await pool.query(
      `INSERT INTO lab_orders (id, patient_id, doctor_id, test_name, specimen, status, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [loId, targetPatient.id, doctorId, testName, specimen, 'Received', date]
    );

    // Charge creation
    const invoiceNum = `INV-LAB-${Date.now()}`;
    const billingId = `B_LAB_${Date.now()}`;
    await pool.query(
      `INSERT INTO billing (id, patient_id, invoice_number, subtotal, discount, tax, total, paid, balance, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [billingId, targetPatient.id, invoiceNum, 450.00, 0.00, 81.00, 531.00, 0.00, 531.00, 'PENDING']
    );

    await pool.query(
      `INSERT INTO invoice_items (id, billing_id, description, quantity, unit_price, total_price)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`BI_${billingId}_1`, billingId, `Laboratory charges for test: ${testName}`, 1, 450.00, 450.00]
    );

    await logAudit(req, `LAB_ORDER_CREATED: ${testName} for Patient ${targetPatient.uhid}`, 'lab', 'info');

    return res.status(201).json({
      success: true,
      message: 'Lab order created successfully',
      data: {
        id: loId,
        name: targetPatient.name,
        name_subtitle: targetPatient.uhid,
        testName,
        doctor: doctorName,
        specimen,
        status: 'Received',
        date
      }
    });
  } catch (error: any) {
    console.error('Error creating lab order:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Collect specimen sample
router.post('/:id/collect', authenticateJWT, authorizeRoles(['admin', 'nurse', 'lab']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const updateResult = await pool.query(
      `UPDATE lab_orders SET status = 'Collected' WHERE id = $1 RETURNING *`,
      [id]
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Lab order not found' });
    }

    await logAudit(req, `LAB_SAMPLE_COLLECTED: Order ${id}`, 'lab', 'info');

    return res.json({ success: true, message: 'Sample collection logged successfully' });
  } catch (error: any) {
    console.error('Error collecting lab sample:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Submit results
router.post('/:id/results', authenticateJWT, authorizeRoles(['admin', 'lab']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { results } = req.body;

  if (!results) {
    return res.status(400).json({ success: false, message: 'Results payload required' });
  }

  try {
    const orderRes = await pool.query(
      `SELECT lo.id, p.uhid
       FROM lab_orders lo
       JOIN patients p ON p.id = lo.patient_id
       WHERE lo.id = $1`,
      [id]
    );

    if (orderRes.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Lab order not found' });
    }
    const patientUhid = orderRes.rows[0].uhid;

    await LabResult.findOneAndUpdate(
      { labOrderId: id },
      { labOrderId: id, patientUhid, results, completedAt: new Date() },
      { upsert: true, new: true }
    );

    await pool.query(`UPDATE lab_orders SET status = 'Completed' WHERE id = $1`, [id]);

    await logAudit(req, `LAB_RESULTS_ENTERED: Completed results for order ${id}`, 'lab', 'info');

    return res.json({
      success: true,
      message: 'Lab results saved successfully'
    });
  } catch (error: any) {
    console.error('Error submitting lab results:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

export default router;
