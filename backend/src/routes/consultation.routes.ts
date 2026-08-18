import { Router, Response } from 'express';
import { ConsultationNote } from '../models/mongo/schemas';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/role.middleware';
import { logAudit } from '../utils/audit';

const router = Router();

// Create consultation note
router.post('/', authenticateJWT, authorizeRoles(['admin', 'doctor', 'nurse']), async (req: AuthenticatedRequest, res: Response) => {
  const { appointmentId, patientUhid, doctorId, chiefComplaint, diagnosis, clinicalNotes } = req.body;

  if (!patientUhid || !doctorId || !chiefComplaint || !diagnosis) {
    return res.status(400).json({ success: false, message: 'Missing required consultation fields', errorCode: 'VALIDATION_ERROR' });
  }

  try {
    const note = await ConsultationNote.create({
      appointmentId: appointmentId || `APPT-${Date.now()}`,
      patientUhid,
      doctorId,
      chiefComplaint,
      diagnosis,
      clinicalNotes: clinicalNotes || '',
      createdAt: new Date()
    });

    await logAudit(req, `CONSULTATION_SAVED: Patient ${patientUhid}`, 'ehr', 'info');

    return res.status(201).json({
      success: true,
      message: 'Consultation note saved successfully',
      data: {
        id: note._id,
        appointmentId: note.appointmentId,
        patientUhid: note.patientUhid,
        doctorId: note.doctorId,
        chiefComplaint: note.chiefComplaint,
        diagnosis: note.diagnosis,
        clinicalNotes: note.clinicalNotes,
        createdAt: note.createdAt
      }
    });
  } catch (error: any) {
    console.error('Error saving consultation note:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Get consultation history for a patient
router.get('/patient/:uhid', authenticateJWT, authorizeRoles(['admin', 'doctor', 'nurse', 'patient']), async (req: AuthenticatedRequest, res: Response) => {
  const { uhid } = req.params;

  if (req.user?.role === 'patient' && uhid !== req.user.uhid) {
    return res.status(403).json({
      success: false,
      message: 'Access Denied: You are not authorized to view another patient\'s consultation history.',
      errorCode: 'FORBIDDEN'
    });
  }

  try {
    const notes = await ConsultationNote.find({ patientUhid: uhid })
      .sort({ createdAt: -1 })
      .limit(50);

    return res.json({
      success: true,
      data: notes.map(n => ({
        id: n._id,
        appointmentId: n.appointmentId,
        patientUhid: n.patientUhid,
        doctorId: n.doctorId,
        chiefComplaint: n.chiefComplaint,
        diagnosis: n.diagnosis,
        clinicalNotes: n.clinicalNotes,
        createdAt: n.createdAt
      }))
    });
  } catch (error: any) {
    console.error('Error fetching consultation history:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

export default router;
