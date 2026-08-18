import { Router, Response } from 'express';
import { pool } from '../config/postgres';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';
import { logAudit } from '../utils/audit';

const router = Router();

// Get all bills
router.get('/', authenticateJWT, authorizeRoles(['admin', 'patient']), async (req: AuthenticatedRequest, res: Response) => {
  const { uhid } = req.query;
  try {
    let targetUhid = uhid;
    if (req.user?.role === 'patient') {
      targetUhid = req.user.uhid;
    }
    let query = `
      SELECT b.id, p.name, p.uhid, b.invoice_number as "invoiceNumber",
             b.subtotal, b.discount, b.tax, b.total, b.paid, b.balance, b.status,
             to_char(b.created_at, 'YYYY-MM-DD') as date
      FROM billing b
      JOIN patients p ON p.id = b.patient_id
    `;
    const values: any[] = [];
    if (targetUhid) {
      query += ' WHERE p.uhid = $1';
      values.push(targetUhid);
    }
    query += ' ORDER BY b.created_at DESC';

    const result = await pool.query(query, values);
    return res.json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching billing records:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Get detailed invoice
router.get('/:id', authenticateJWT, authorizeRoles(['admin', 'patient']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const invoiceRes = await pool.query(
      `SELECT b.id, p.name, p.uhid, b.invoice_number as "invoiceNumber",
              b.subtotal, b.discount, b.tax, b.total, b.paid, b.balance, b.status,
              to_char(b.created_at, 'YYYY-MM-DD') as date
       FROM billing b
       JOIN patients p ON p.id = b.patient_id
       WHERE b.id = $1`,
      [id]
    );

    if (invoiceRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const invoice = invoiceRes.rows[0];

    // Enforce patient ownership check
    if (req.user?.role === 'patient' && invoice.uhid !== req.user.uhid) {
      return res.status(403).json({
        success: false,
        message: 'Access Denied: You are not authorized to view this invoice.',
        errorCode: 'FORBIDDEN'
      });
    }

    const itemsRes = await pool.query(
      `SELECT id, description, quantity, unit_price as "unitPrice", total_price as "totalPrice"
       FROM invoice_items
       WHERE billing_id = $1`,
      [id]
    );

    const paymentsRes = await pool.query(
      `SELECT id, amount, payment_method as "paymentMethod", transaction_reference as "transactionReference",
              to_char(created_at, 'YYYY-MM-DD HH:MI AM') as date
       FROM payments
       WHERE billing_id = $1`,
      [id]
    );

    return res.json({
      success: true,
      data: {
        ...invoice,
        items: itemsRes.rows,
        payments: paymentsRes.rows
      }
    });
  } catch (error: any) {
    console.error('Error fetching invoice details:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Process payment with PostgreSQL transaction
router.post('/:id/pay', authenticateJWT, authorizeRoles(['admin', 'patient']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { amount, paymentMethod, transactionReference } = req.body;

  if (amount === undefined || amount <= 0 || !paymentMethod) {
    return res.status(400).json({ success: false, message: 'Invalid payment details', errorCode: 'VALIDATION_ERROR' });
  }

  // Enforce patient invoice ownership check
  if (req.user?.role === 'patient') {
    try {
      const checkBill = await pool.query(
        'SELECT p.uhid FROM billing b JOIN patients p ON p.id = b.patient_id WHERE b.id = $1',
        [id]
      );
      if (checkBill.rows.length === 0 || checkBill.rows[0].uhid !== req.user.uhid) {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: You are not authorized to pay this invoice.',
          errorCode: 'FORBIDDEN'
        });
      }
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const billRes = await client.query(
      'SELECT total, paid, balance, status, patient_id FROM billing WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (billRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const bill = billRes.rows[0];
    const newPaid = Number(bill.paid) + Number(amount);
    const newBalance = Number(bill.total) - newPaid;

    if (newBalance < -0.01) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Overpayment: Cannot pay ${amount}. Current balance outstanding is ${bill.balance}`,
        errorCode: 'OVERPAYMENT_ERROR'
      });
    }

    let newStatus = 'PARTIAL';
    if (newBalance <= 0.01) {
      newStatus = 'PAID';
    }

    const paymentId = `PAY_${Date.now()}`;
    await client.query(
      `INSERT INTO payments (id, billing_id, amount, payment_method, transaction_reference)
       VALUES ($1, $2, $3, $4, $5)`,
      [paymentId, id, amount, paymentMethod, transactionReference || `TXN-${Date.now()}`]
    );

    await client.query(
      `UPDATE billing
       SET paid = $1, balance = $2, status = $3
       WHERE id = $4`,
      [newPaid, newBalance, newStatus, id]
    );

    await client.query('COMMIT');

    await logAudit(req, `PAYMENT_PROCESSED: Paid ${amount} via ${paymentMethod} on Invoice ${id}`, 'billing', 'info');

    return res.json({
      success: true,
      message: 'Payment recorded successfully',
      data: {
        paymentId,
        newPaid,
        newBalance,
        newStatus
      }
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Payment transaction failed, rolled back:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  } finally {
    client.release();
  }
});

export default router;
