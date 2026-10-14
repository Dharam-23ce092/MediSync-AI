import mongoose from "mongoose";
import { ConsultationNote, LabResult } from "../models/mongo/schemas";
import { pool } from "../config/postgres";
/** Preserve older Mongo records. Unresolved legacy tokens stay unlinked instead of guessing a visit. */
export async function importLegacyClinicalRecords() {
  if (mongoose.connection.readyState !== 1) return;
  const notes = await ConsultationNote.find().lean();
  for (const note of notes) {
    const owner = await pool.query(
      `SELECT p.id,p.hospital_id FROM patients p JOIN users u ON u.hospital_id=p.hospital_id WHERE p.uhid=$1 AND u.id=$2 AND u.role='doctor'`,
      [note.patientUhid, note.doctorId],
    );
    if (owner.rowCount !== 1) continue;
    const patient = owner.rows[0];
    const appt = (
      await pool.query(
        "SELECT id,case_id FROM appointments WHERE id=$1 AND patient_id=$2 AND doctor_id=$3 AND hospital_id=$4",
        [note.appointmentId, patient.id, note.doctorId, patient.hospital_id],
      )
    ).rows[0];
    await pool.query(
      `INSERT INTO consultation_notes(id,hospital_id,appointment_id,case_id,patient_id,doctor_id,chief_complaint,diagnosis,clinical_notes,created_at,source_reference)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
      [
        `LEGACY_${note._id}`,
        patient.hospital_id,
        appt?.id || null,
        appt?.case_id || null,
        patient.id,
        note.doctorId,
        note.chiefComplaint,
        note.diagnosis,
        note.clinicalNotes || "",
        note.createdAt,
        note.appointmentId,
      ],
    );
  }
  const reports = await LabResult.find().lean();
  for (const report of reports)
    await pool.query(
      `UPDATE lab_orders lo SET results=$1::jsonb FROM patients p WHERE lo.id=$2 AND lo.patient_id=p.id AND p.uhid=$3 AND lo.results IS NULL`,
      [JSON.stringify(report.results), report.labOrderId, report.patientUhid],
    );
}
