import { Router } from "express";
import { pool } from "../config/postgres";
import { authenticateJWT } from "../middleware/auth.middleware";
import { requireTenant, TenantRequest } from "../middleware/tenant.middleware";
import { authorizeRoles } from "../middleware/role.middleware";
import {
  appointmentTransitions,
  newId,
  requireValue,
  transaction,
} from "../utils/workflow";
const router = Router();
router.use(authenticateJWT, requireTenant);
const selection = `SELECT a.id as appointment_db_id, a.patient_id as id, a.case_id as "caseId",
 c.case_number as "caseNumber", a.appointment_time as "appointmentTime", a.doctor_id as "doctorId",
 a.token, p.name, p.gender || ', ' || p.age || ' yrs' as name_subtitle,
 p.uhid, to_char(a.appointment_time, 'HH12:MI AM') as time, a.type, a.status, u.name as "doctorName"
 FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN users u ON u.id=a.doctor_id
 LEFT JOIN cases c ON c.id=a.case_id`;
router.get("/", async (req: TenantRequest, res, next) => {
  try {
    const values: any[] = [req.hospitalId];
    let query = selection + " WHERE a.hospital_id=$1";
    if (req.user!.role === "patient") {
      values.push(req.user!.userId);
      query += ` AND p.user_id=$${values.length}`;
    }
    if (req.user!.role === "doctor") {
      values.push(req.user!.userId);
      query += ` AND a.doctor_id=$${values.length}`;
    }
    if (req.query.uhid && req.user!.role !== "patient") {
      values.push(req.query.uhid);
      query += ` AND p.uhid=$${values.length}`;
    }
    const result = await pool.query(
      query + " ORDER BY a.appointment_time ASC",
      values,
    );
    res.json({
      success: true,
      data: result.rows.map((row) => ({
        ...row,
        waitTime:
          row.status === "Requested" ? "Awaiting approval" : "Not estimated",
      })),
    });
  } catch (error) {
    next(error);
  }
});
router.get("/slots", async (req: TenantRequest, res, next) => {
  try {
    const { doctorId, date } = req.query;
    requireValue(
      typeof doctorId === "string" &&
        typeof date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(date),
      "Select a doctor and date.",
    );
    const doctor = await pool.query(
      "SELECT u.id,COALESCE(d.availability_status,'Available') availability FROM users u LEFT JOIN doctors d ON d.user_id=u.id WHERE u.id=$1 AND u.hospital_id=$2 AND u.role='doctor' AND u.is_active=true",
      [doctorId, req.hospitalId],
    );
    requireValue(doctor.rowCount, "Doctor not found.", 404);
    const taken = await pool.query(
      "SELECT appointment_time FROM appointments WHERE doctor_id=$1 AND hospital_id=$2 AND appointment_time::date=$3::date AND status NOT IN ('Cancelled','Rejected')",
      [doctorId, req.hospitalId, date],
    );
    const occupied = new Set(
      taken.rows.map((r) => new Date(r.appointment_time).getTime()),
    );
    const slots = [];
    if (doctor.rows[0].availability === "Available")
      for (let hour = 9; hour < 17; hour++)
        for (const minute of [0, 30]) {
          const time = new Date(
            `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`,
          );
          if (time.getTime() > Date.now())
            slots.push({
              time: time.toISOString(),
              available: !occupied.has(time.getTime()),
            });
        }
    res.json({ success: true, data: slots });
  } catch (error) {
    next(error);
  }
});
router.post(
  "/",
  authorizeRoles(["patient", "admin", "doctor", "receptionist"]),
  async (req: TenantRequest, res, next) => {
    try {
      const { doctorId, appointmentTime, type, chiefComplaint } = req.body;
      const date = new Date(appointmentTime);
      requireValue(
        doctorId &&
          Number.isFinite(date.getTime()) &&
          date.getTime() > Date.now(),
        "Select a doctor and a future appointment date and time.",
      );
      requireValue(
        ["New", "Follow-up", "Emergency"].includes(type),
        "Invalid appointment type.",
      );
      const result = await transaction(async (client) => {
        const doctor = await client.query(
          "SELECT id FROM users WHERE id=$1 AND hospital_id=$2 AND role='doctor' AND is_active=true FOR UPDATE",
          [doctorId, req.hospitalId],
        );
        requireValue(
          doctor.rowCount,
          "Doctor not found in this hospital.",
          404,
        );
        const availability = await client.query(
          "SELECT availability_status FROM doctors WHERE user_id=$1",
          [doctorId],
        );
        requireValue(
          !availability.rowCount ||
            availability.rows[0].availability_status === "Available",
          "This provider is not accepting bookings.",
          409,
        );
        requireValue(
          date.getHours() >= 9 &&
            date.getHours() < 17 &&
            [0, 30].includes(date.getMinutes()) &&
            date.getSeconds() === 0,
          "Select one of the offered consultation slots.",
        );
        const patient = await client.query(
          req.user!.role === "patient"
            ? "SELECT * FROM patients WHERE user_id=$1 AND hospital_id=$2"
            : "SELECT * FROM patients WHERE id=$1 AND hospital_id=$2",
          [
            req.user!.role === "patient" ? req.user!.userId : req.body.id,
            req.hospitalId,
          ],
        );
        requireValue(
          patient.rowCount === 1,
          "Patient not found in this hospital.",
          404,
        );
        const conflict = await client.query(
          "SELECT id FROM appointments WHERE doctor_id=$1 AND appointment_time=$2 AND status NOT IN ('Rejected','Cancelled')",
          [doctorId, date],
        );
        requireValue(
          !conflict.rowCount,
          "This slot has already been requested. Choose another time.",
          409,
        );
        const count = await client.query(
          "SELECT COUNT(*) FROM appointments WHERE doctor_id=$1 AND appointment_time::date=$2::date",
          [doctorId, date],
        );
        const token = String(Number(count.rows[0].count) + 1),
          caseId = newId("C"),
          id = newId("A");
        const caseNumber = `CASE-${date.getFullYear()}-${caseId.slice(2, 10).toUpperCase()}`;
        await client.query(
          `INSERT INTO cases (id,hospital_id,patient_id,case_number,type,status,assigned_doctor,chief_complaint) VALUES ($1,$2,$3,$4,'OPD','requested',$5,$6)`,
          [
            caseId,
            req.hospitalId,
            patient.rows[0].id,
            caseNumber,
            doctorId,
            chiefComplaint || "Consultation requested",
          ],
        );
        await client.query(
          `INSERT INTO appointments (id,hospital_id,case_id,patient_id,doctor_id,token,appointment_time,type,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Requested')`,
          [
            id,
            req.hospitalId,
            caseId,
            patient.rows[0].id,
            doctorId,
            token,
            date,
            type,
          ],
        );
        await client.query(
          "INSERT INTO case_timeline (id,case_id,event_type,actor_id,actor_role,summary) VALUES ($1,$2,$3,$4,$5,$6)",
          [
            newId("CT"),
            caseId,
            "appointment_requested",
            req.user!.userId,
            req.user!.role,
            "Appointment requested; awaiting provider or reception approval.",
          ],
        );
        return (await client.query(selection + " WHERE a.id=$1", [id])).rows[0];
      });
      res
        .status(201)
        .json({
          success: true,
          data: { ...result, waitTime: "Awaiting approval" },
        });
    } catch (error) {
      next(error);
    }
  },
);
router.patch("/status", async (req: TenantRequest, res, next) => {
  try {
    const { appointmentId, status } = req.body;
    requireValue(
      appointmentId && status,
      "Appointment ID and status are required.",
    );
    requireValue(
      status !== "Completed",
      "Complete the clinical note to finish a consultation.",
      409,
    );
    await transaction(async (client) => {
      const result = await client.query(
        "SELECT a.*, p.user_id FROM appointments a JOIN patients p ON p.id=a.patient_id WHERE a.id=$1 AND a.hospital_id=$2 FOR UPDATE OF a",
        [appointmentId, req.hospitalId],
      );
      requireValue(result.rowCount, "Appointment not found.", 404);
      const appt = result.rows[0],
        role = req.user!.role;
      requireValue(
        ["admin", "doctor", "nurse", "receptionist", "patient"].includes(role),
        "Access denied.",
        403,
      );
      if (role === "patient")
        requireValue(
          appt.user_id === req.user!.userId && status === "Cancelled",
          "You can only cancel your own appointment.",
          403,
        );
      if (role === "doctor")
        requireValue(
          appt.doctor_id === req.user!.userId,
          "This appointment belongs to another doctor.",
          403,
        );
      if (["Confirmed", "Rejected"].includes(status))
        requireValue(
          ["admin", "doctor", "receptionist"].includes(role),
          "Approval requires a provider or reception user.",
          403,
        );
      if (["In Consultation", "Completed"].includes(status))
        requireValue(
          ["admin", "doctor"].includes(role),
          "A provider must perform this action.",
          403,
        );
      requireValue(
        appointmentTransitions[appt.status]?.includes(status),
        `Cannot change ${appt.status} to ${status}.`,
        409,
      );
      if (["Checked-in", "In Consultation"].includes(status))
        requireValue(
          new Date(appt.appointment_time).toDateString() ===
            new Date().toDateString(),
          "This appointment is not scheduled for today.",
          409,
        );
      await client.query("UPDATE appointments SET status=$1 WHERE id=$2", [
        status,
        appointmentId,
      ]);
      const states: Record<string, string> = {
        Confirmed: "scheduled",
        Rejected: "cancelled",
        Cancelled: "cancelled",
        "Checked-in": "waiting",
        "In Consultation": "in_consultation",
        Completed: "consultation_complete",
      };
      if (appt.case_id) {
        await client.query(
          "UPDATE cases SET status=$1,updated_at=NOW() WHERE id=$2",
          [states[status], appt.case_id],
        );
        await client.query(
          "INSERT INTO case_timeline (id,case_id,event_type,actor_id,actor_role,summary) VALUES ($1,$2,$3,$4,$5,$6)",
          [
            newId("CT"),
            appt.case_id,
            "appointment_updated",
            req.user!.userId,
            role,
            `Appointment ${status}`,
          ],
        );
      }
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
export default router;
