import { Router } from "express";
import { pool } from "../config/postgres";
import { authenticateJWT } from "../middleware/auth.middleware";
import { requireTenant, TenantRequest } from "../middleware/tenant.middleware";
import { authorizeRoles } from "../middleware/role.middleware";
import { newId, requireValue, transaction } from "../utils/workflow";
const router = Router();
router.use(authenticateJWT, requireTenant);
router.post(
  "/",
  authorizeRoles(["admin", "doctor"]),
  async (req: TenantRequest, res, next) => {
    try {
      const {
        appointmentId,
        chiefComplaint,
        diagnosis,
        clinicalNotes,
        medications,
      } = req.body;
      requireValue(
        appointmentId &&
          typeof chiefComplaint === "string" &&
          chiefComplaint.trim() &&
          typeof diagnosis === "string" &&
          diagnosis.trim(),
        "Appointment, chief complaint and diagnosis are required.",
      );
      requireValue(
        medications === undefined ||
          (Array.isArray(medications) &&
            medications.every(
              (m: any) =>
                typeof m.name === "string" &&
                m.name.trim() &&
                typeof m.dosage === "string" &&
                m.dosage.trim() &&
                Number(m.duration) > 0,
            )),
        "Complete the name, dosage and duration of each medication.",
      );
      const data = await transaction(async (client) => {
        const result = await client.query(
          `SELECT a.*,p.uhid FROM appointments a JOIN patients p ON p.id=a.patient_id WHERE a.id=$1 AND a.hospital_id=$2 FOR UPDATE OF a`,
          [appointmentId, req.hospitalId],
        );
        requireValue(result.rowCount, "Appointment not found.", 404);
        const a = result.rows[0];
        requireValue(
          req.user!.role === "admin" || a.doctor_id === req.user!.userId,
          "This appointment belongs to another provider.",
          403,
        );
        const existing = await client.query(
          "SELECT * FROM consultation_notes WHERE appointment_id=$1",
          [a.id],
        );
        if (existing.rowCount) return existing.rows[0];
        requireValue(
          a.status === "In Consultation",
          "Start this consultation from the checked-in queue first.",
          409,
        );
        const id = newId("NOTE");
        await client.query(
          `INSERT INTO consultation_notes (id,hospital_id,appointment_id,case_id,patient_id,doctor_id,chief_complaint,diagnosis,clinical_notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            id,
            req.hospitalId,
            a.id,
            a.case_id,
            a.patient_id,
            a.doctor_id,
            chiefComplaint.trim(),
            diagnosis.trim(),
            clinicalNotes || "",
          ],
        );
        if (medications?.length) {
          const details = medications
            .map(
              (m: any) =>
                `${m.name.trim()} (${m.dosage.trim()}) for ${m.duration} days`,
            )
            .join(" + ");
          await client.query(
            `INSERT INTO prescriptions (id,hospital_id,case_id,patient_id,doctor_id,drug_details,status,date) VALUES ($1,$2,$3,$4,$5,$6,'Pending',CURRENT_DATE)`,
            [
              newId("RX"),
              req.hospitalId,
              a.case_id,
              a.patient_id,
              a.doctor_id,
              details,
            ],
          );
        }
        await client.query(
          "UPDATE appointments SET status='Completed' WHERE id=$1",
          [a.id],
        );
        await client.query(
          "UPDATE cases SET status='consultation_complete',diagnosis=$1,chief_complaint=$2,updated_at=NOW() WHERE id=$3",
          [diagnosis, chiefComplaint, a.case_id],
        );
        await client.query(
          "INSERT INTO case_timeline (id,case_id,event_type,actor_id,actor_role,summary) VALUES ($1,$2,$3,$4,$5,$6)",
          [
            newId("CT"),
            a.case_id,
            "consultation_completed",
            req.user!.userId,
            req.user!.role,
            `Consultation completed${medications?.length ? "; prescription queued for pharmacy" : "; no medication prescribed"}.`,
          ],
        );
        return (
          await client.query("SELECT * FROM consultation_notes WHERE id=$1", [
            id,
          ])
        ).rows[0];
      });
      res.status(201).json({ success: true, data: format(data) });
    } catch (error) {
      next(error);
    }
  },
);
function format(n: any) {
  return {
    id: n.id,
    appointmentId: n.appointment_id || n.source_reference,
    caseId: n.case_id,
    patientUhid: n.uhid,
    doctorId: n.doctor_id,
    chiefComplaint: n.chief_complaint,
    diagnosis: n.diagnosis,
    clinicalNotes: n.clinical_notes,
    createdAt: n.created_at,
  };
}
router.get(
  "/patient/:uhid",
  authorizeRoles(["admin", "doctor", "nurse", "patient"]),
  async (req: TenantRequest, res, next) => {
    try {
      const patient = await pool.query(
        "SELECT id,user_id FROM patients WHERE uhid=$1 AND hospital_id=$2",
        [req.params.uhid, req.hospitalId],
      );
      requireValue(patient.rowCount, "Patient not found.", 404);
      requireValue(
        req.user!.role !== "patient" ||
          patient.rows[0].user_id === req.user!.userId,
        "Access denied.",
        403,
      );
      const result = await pool.query(
        "SELECT n.*,p.uhid FROM consultation_notes n JOIN patients p ON p.id=n.patient_id WHERE n.patient_id=$1 AND n.hospital_id=$2 ORDER BY n.created_at DESC",
        [patient.rows[0].id, req.hospitalId],
      );
      res.json({ success: true, data: result.rows.map(format) });
    } catch (error) {
      next(error);
    }
  },
);
export default router;
