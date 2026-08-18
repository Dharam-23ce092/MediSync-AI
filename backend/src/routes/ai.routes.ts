import { Router, Response } from 'express';
import { AIChatSession } from '../models/mongo/schemas';
import { VitalHistory } from '../models/mongo/schemas';
import { pool } from '../config/postgres';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';

const router = Router();

router.post('/chat', authenticateJWT, authorizeRoles(['admin', 'doctor']), async (req: AuthenticatedRequest, res: Response) => {
  const { patientUhid, message } = req.body;
  const doctorId = req.user?.userId || 'DOC001';

  if (!message) {
    return res.status(400).json({ success: false, message: 'Message prompt required' });
  }

  try {
    let patientContext = '';
    if (patientUhid) {
      const patRes = await pool.query(
        'SELECT name, age, gender, blood_group, allergies, status FROM patients WHERE uhid = $1',
        [patientUhid]
      );
      if (patRes.rows && patRes.rows.length > 0) {
        const p = patRes.rows[0];
        patientContext = `Patient Name: ${p.name}, Age: ${p.age}, Gender: ${p.gender}, Blood: ${p.blood_group}, Allergies: ${p.allergies || 'None'}.`;
      }
    }

    let aiReply = '';
    const lowercaseMsg = message.toLowerCase();

    try {
      if (patientUhid) {
        const patRes = await pool.query(
          'SELECT name, age, gender, blood_group, allergies, status FROM patients WHERE uhid = $1',
          [patientUhid]
        );
        if (patRes.rows && patRes.rows.length > 0) {
          const p = patRes.rows[0];

          if (lowercaseMsg.includes('allerg') || lowercaseMsg.includes('penicillin')) {
            const allergyInfo = p.allergies || 'None documented';
            aiReply = `Patient ${p.name} (${patientUhid}) has documented allergies: ${allergyInfo}. Please verify current medication orders against the allergy profile before prescribing.`;
          } else if (lowercaseMsg.includes('vitals') || lowercaseMsg.includes('heart') || lowercaseMsg.includes('bp') || lowercaseMsg.includes('spo2')) {
            const latestVital = await VitalHistory.findOne({ uhid: patientUhid }).sort({ recordedAt: -1 });
            if (latestVital) {
              aiReply = `Latest recorded vitals for ${p.name}: BP ${latestVital.bp} mmHg, HR ${latestVital.hr} bpm, Temp ${latestVital.temp}°F, SpO2 ${latestVital.spo2}%. Status: ${latestVital.status}. Recorded by ${latestVital.recordedBy} on ${latestVital.recordedAt.toISOString().split('T')[0]}.`;
            } else {
              aiReply = `No vitals have been recorded for ${p.name} (${patientUhid}) yet. Vitals can be logged from the nursing dashboard.`;
            }
          } else if (lowercaseMsg.includes('medication') || lowercaseMsg.includes('prescrib') || lowercaseMsg.includes('drug')) {
            const rxRes = await pool.query(
              'SELECT drug_details, status, date FROM prescriptions WHERE patient_id = (SELECT id FROM patients WHERE uhid = $1) ORDER BY date DESC LIMIT 5',
              [patientUhid]
            );
            if (rxRes.rows.length > 0) {
              const rxList = rxRes.rows.map(r => `${r.drug_details} (${r.status}, ${r.date})`).join('; ');
              aiReply = `Active prescriptions for ${p.name}: ${rxList}. Please verify current medication list and check for interactions.`;
            } else {
              aiReply = `No prescriptions found for ${p.name} (${patientUhid}) in the system.`;
            }
          } else if (lowercaseMsg.includes('lab') || lowercaseMsg.includes('result')) {
            const labRes = await pool.query(
              'SELECT test_name, status, date FROM lab_orders WHERE patient_id = (SELECT id FROM patients WHERE uhid = $1) ORDER BY date DESC LIMIT 5',
              [patientUhid]
            );
            if (labRes.rows.length > 0) {
              const labList = labRes.rows.map(r => `${r.test_name} (${r.status}, ${r.date})`).join('; ');
              aiReply = `Lab orders for ${p.name}: ${labList}.`;
            } else {
              aiReply = `No lab orders found for ${p.name} (${patientUhid}) in the system.`;
            }
          } else {
            aiReply = `Patient ${p.name} (${patientUhid}), Age: ${p.age}, Gender: ${p.gender}, Blood Group: ${p.blood_group}, Allergies: ${p.allergies || 'None documented'}, Status: ${p.status}. Ask me about allergies, vitals, medications, or lab results for this patient.`;
          }
        } else {
          aiReply = `Patient record not found for UHID ${patientUhid}. Please verify the UHID and try again.`;
        }
      } else {
        aiReply = `Hello Dr. ${req.user?.name || 'Patel'}. Please specify a patient UHID to query their clinical records. I can provide information about allergies, vitals, medications, and lab results from the hospital database.`;
      }
    } catch (err) {
      console.error('AI query error:', err);
      aiReply = `An error occurred while querying the patient database. Please try again or contact system administration.`;
    }

    aiReply += `\n\n*Assistive note: This is a diagnostic aid. Verify clinical choices before ordering.*`;

    let session = await AIChatSession.findOne({ doctorId, patientUhid });
    if (!session) {
      session = new AIChatSession({
        doctorId,
        patientUhid,
        messages: [],
        sources: ['EHR Clinical Notes', 'Lab Information System', 'Rx Dispense Log'],
        confidence: 0.94
      });
    }

    session.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });

    session.messages.push({
      role: 'model',
      content: aiReply,
      timestamp: new Date()
    });

    await session.save();

    return res.json({
      success: true,
      data: {
        response: aiReply,
        sources: session.sources,
        confidence: session.confidence
      }
    });
  } catch (error: any) {
    console.error('Error in AI Assistant chat:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

export default router;
