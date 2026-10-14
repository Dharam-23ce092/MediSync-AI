import { Router, Response } from 'express';
import { pool } from '../config/postgres';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';
import {newId,requireValue,transaction} from '../utils/workflow';
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
      WHERE b.hospital_id=$1
    `;
    const values: any[] = [req.user?.hospital_id];
    if (targetUhid) {
      query += ' AND p.uhid = $2';
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

// Create explicit itemized charges for a known hospital case.
router.post('/',authenticateJWT,authorizeRoles(['admin']),async(req:AuthenticatedRequest,res,next)=>{
 try{
  const {caseId,items}=req.body;
  requireValue(caseId && Array.isArray(items) && items.length>0,'Select a case and add at least one charge.');
  requireValue(items.every((i:any)=>typeof i.description==='string'&&i.description.trim()&&Number.isInteger(i.quantity)&&i.quantity>0&&typeof i.unitPrice==='number'&&Number.isFinite(i.unitPrice)&&i.unitPrice>=0&&Math.abs(i.unitPrice*100-Math.round(i.unitPrice*100))<0.000001),'Enter valid item descriptions, quantities and prices.');
  const data=await transaction(async client=>{
   const c=(await client.query('SELECT * FROM cases WHERE id=$1 AND hospital_id=$2 FOR UPDATE',[caseId,req.user?.hospital_id])).rows[0];requireValue(c,'Case not found.',404);
   const total=items.reduce((sum:number,i:any)=>sum+Math.round(i.quantity*i.unitPrice*100),0)/100;
   requireValue(total<=99999999.99,'Invoice total exceeds the supported limit.');
   const id=newId('B'),invoiceNumber=`INV-${id.slice(2,10).toUpperCase()}`;
   await client.query('INSERT INTO billing(id,hospital_id,case_id,patient_id,invoice_number,subtotal,total,balance,status) VALUES($1,$2,$3,$4,$5,$6,$6,$6,$7)',[id,req.user?.hospital_id,c.id,c.patient_id,invoiceNumber,total,total===0?'PAID':'PENDING']);
   for(const i of items)await client.query('INSERT INTO invoice_items(id,billing_id,description,quantity,unit_price,total_price) VALUES($1,$2,$3,$4,$5,$6)',[newId('BI'),id,i.description.trim(),i.quantity,i.unitPrice,Math.round(i.quantity*i.unitPrice*100)/100]);
   await client.query('INSERT INTO case_timeline(id,case_id,event_type,actor_id,actor_role,summary) VALUES($1,$2,$3,$4,$5,$6)',[newId('CT'),c.id,'invoice_created',req.user?.userId,req.user?.role,`Itemized invoice ${invoiceNumber} created.`]);return{id,invoiceNumber,total};
  });res.status(201).json({success:true,data});
 }catch(error){next(error);}
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
       WHERE b.id = $1 AND b.hospital_id=$2`,
      [id,req.user?.hospital_id]
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
router.post('/:id/pay', authenticateJWT, authorizeRoles(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { amount, paymentMethod, transactionReference } = req.body;

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || Math.abs(Math.round(amount*100)-amount*100)>0.000001 || !paymentMethod) {
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
      'SELECT total, paid, balance, status, patient_id FROM billing WHERE id = $1 AND hospital_id=$2 FOR UPDATE',
      [id,req.user?.hospital_id]
    );

    if (billRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const bill = billRes.rows[0];
    const newPaid = Math.round((Number(bill.paid) + Number(amount))*100)/100;
    const newBalance = Math.round((Number(bill.total) - newPaid)*100)/100;

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

    if (transactionReference) {
      const duplicate=await client.query('SELECT id FROM payments WHERE billing_id=$1 AND transaction_reference=$2',[id,transactionReference]);
      if(duplicate.rowCount){await client.query('ROLLBACK');return res.status(409).json({success:false,message:'This receipt reference has already been recorded.'});}
    }
    const paymentId = newId('PAY');
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

    // Propagate Case Lifecycle Completion
    const billInfo = await client.query('SELECT case_id FROM billing WHERE id = $1', [id]);
    const caseId = billInfo.rows[0]?.case_id;
    if (caseId) {
      if (newStatus === 'PAID') {

        await client.query(
          "INSERT INTO case_timeline (id, case_id, event_type, actor_id, actor_role, summary) VALUES ($1, $2, $3, $4, $5, $6)",
          [`CT_${Date.now()}`, caseId, 'payment_received', req.user?.userId, req.user?.role, `Invoice fully settled via ${paymentMethod}. Clinical case status unchanged.`]
        );
      } else {
        await client.query(
          "INSERT INTO case_timeline (id, case_id, event_type, actor_id, actor_role, summary) VALUES ($1, $2, $3, $4, $5, $6)",
          [`CT_${Date.now()}`, caseId, 'payment_received', req.user?.userId, req.user?.role, `Partial payment of ₹${amount} received via ${paymentMethod}.`]
        );
      }
    }

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
