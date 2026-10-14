import { Router } from "express";
import { pool } from "../config/postgres";
import { authenticateJWT } from "../middleware/auth.middleware";
import { requireTenant, TenantRequest } from "../middleware/tenant.middleware";
import { authorizeRoles } from "../middleware/role.middleware";
import { newId, requireValue, transaction } from "../utils/workflow";
const router = Router();
router.use(
  authenticateJWT,
  requireTenant,
  authorizeRoles(["admin", "doctor", "nurse", "receptionist"]),
);
router.get("/", async (req: TenantRequest, res, next) => {
  try {
    const result = await pool.query(
      `SELECT b.id,b.name,b.type,b.status,b.patient_id as "patientId",b.case_id as "caseId",
   p.name as "patientName",p.uhid,p.age,p.gender,p.blood_group as "bloodGroup",p.allergies,
   u.name as "assignedDoctor",c.case_number as "caseNumber",c.diagnosis,c.chief_complaint as "chiefComplaint",c.admission_date as "admissionDate"
   FROM beds b LEFT JOIN patients p ON p.id=b.patient_id LEFT JOIN users u ON u.id=b.assigned_doctor_id
   LEFT JOIN cases c ON c.id=b.case_id WHERE b.hospital_id=$1 ORDER BY b.name`,
      [req.hospitalId],
    );
    res.json({
      success: true,
      data: result.rows.map((b) => ({
        ...b,
        allergies: Array.isArray(b.allergies)
          ? b.allergies
          : (b.allergies || "")
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean),
      })),
    });
  } catch (error) {
    next(error);
  }
});
router.post(
  "/",
  authorizeRoles(["admin"]),
  async (req: TenantRequest, res, next) => {
    try {
      const { name, type } = req.body;
      requireValue(
        typeof name === "string" && name.trim() && name.trim().length <= 50,
        "Enter a bed name of up to 50 characters.",
      );
      requireValue(
        ["ICU", "General Ward", "Private Room"].includes(type),
        "Select a valid ward category.",
      );
      const bed = await transaction(async (client) => {
        await client.query("SELECT id FROM hospitals WHERE id=$1 FOR UPDATE", [
          req.hospitalId,
        ]);
        const existing = await client.query(
          "SELECT id FROM beds WHERE hospital_id=$1 AND lower(name)=lower($2)",
          [req.hospitalId, name.trim()],
        );
        requireValue(
          !existing.rowCount,
          "A bed with this name already exists.",
          409,
        );
        return (
          await client.query(
            "INSERT INTO beds(id,hospital_id,name,type,status) VALUES($1,$2,$3,$4,'available') RETURNING *",
            [newId("BED"), req.hospitalId, name.trim(), type],
          )
        ).rows[0];
      });
      res.status(201).json({ success: true, data: bed });
    } catch (error) {
      next(error);
    }
  },
);
router.patch("/:id", async (req: TenantRequest, res, next) => {
  try {
    await transaction(async (client) => {
      const { action, uhid, doctorName, doctorId } = req.body;
      const result = await client.query(
        "SELECT * FROM beds WHERE id=$1 AND hospital_id=$2 FOR UPDATE",
        [req.params.id, req.hospitalId],
      );
      requireValue(result.rowCount, "Bed not found.", 404);
      const bed = result.rows[0];
      if (action === "allocate") {
        requireValue(
          bed.status === "available",
          "Only an available bed can be allocated.",
          409,
        );
        const patient = await client.query(
          "SELECT * FROM patients WHERE uhid=$1 AND hospital_id=$2 FOR UPDATE",
          [uhid, req.hospitalId],
        );
        requireValue(patient.rowCount === 1, "Patient not found.", 404);
        const pat = patient.rows[0];
        const existing = await client.query(
          "SELECT id FROM beds WHERE patient_id=$1 AND status IN ('occupied','reserved')",
          [pat.id],
        );
        requireValue(
          !existing.rowCount,
          "Patient already has an assigned bed.",
          409,
        );
        const doctor = await client.query(
          "SELECT id FROM users WHERE hospital_id=$1 AND role='doctor' AND is_active=true AND (id=$2 OR ($2::text IS NULL AND name=$3))",
          [req.hospitalId, doctorId || null, doctorName],
        );
        requireValue(
          doctor.rowCount === 1,
          "Select an active doctor in this hospital.",
        );
        const caseId = newId("C"),
          caseNumber = `IPD-${new Date().getFullYear()}-${caseId.slice(2, 10).toUpperCase()}`;
        await client.query(
          `INSERT INTO cases (id,hospital_id,patient_id,case_number,type,status,assigned_doctor,chief_complaint) VALUES ($1,$2,$3,$4,'IPD','admitted',$5,$6)`,
          [
            caseId,
            req.hospitalId,
            pat.id,
            caseNumber,
            doctor.rows[0].id,
            req.body.chiefComplaint || "Inpatient admission",
          ],
        );
        await client.query(
          "UPDATE beds SET status='occupied',patient_id=$1,assigned_doctor_id=$2,case_id=$3 WHERE id=$4",
          [pat.id, doctor.rows[0].id, caseId, bed.id],
        );
        await client.query("UPDATE patients SET status='IPD' WHERE id=$1", [
          pat.id,
        ]);
        await client.query(
          `INSERT INTO nurse_tasks(id,hospital_id,case_id,patient_id,bed,patient_name,task,scheduled_time,priority) VALUES($1,$2,$3,$4,$5,$6,'Admission assessment and initial observations','On admission','high')`,
          [newId("TASK"), req.hospitalId, caseId, pat.id, bed.name, pat.name],
        );
        await client.query(
          "INSERT INTO case_timeline (id,case_id,event_type,actor_id,actor_role,summary) VALUES ($1,$2,$3,$4,$5,$6)",
          [
            newId("CT"),
            caseId,
            "admitted",
            req.user!.userId,
            req.user!.role,
            `Admitted to ${bed.name} (${bed.type})`,
          ],
        );
      } else if (action === "discharge") {
        requireValue(
          bed.status === "occupied",
          "Only an occupied bed can be discharged.",
          409,
        );
        if (bed.case_id) {
          await client.query(
            "UPDATE cases SET status='discharged',discharge_date=NOW(),updated_at=NOW() WHERE id=$1",
            [bed.case_id],
          );
          await client.query(
            "INSERT INTO case_timeline (id,case_id,event_type,actor_id,actor_role,summary) VALUES ($1,$2,$3,$4,$5,$6)",
            [
              newId("CT"),
              bed.case_id,
              "discharged",
              req.user!.userId,
              req.user!.role,
              `Discharged from ${bed.name}; bed awaiting cleaning.`,
            ],
          );
        }
        await client.query(
          "UPDATE patients SET status='Discharged' WHERE id=$1",
          [bed.patient_id],
        );
        await client.query(
          "UPDATE beds SET status='cleaning',patient_id=NULL,assigned_doctor_id=NULL,case_id=NULL WHERE id=$1",
          [bed.id],
        );
      } else if (action === "cancel-reservation") {
        requireValue(
          bed.status === "reserved",
          "Only a reserved bed can have its reservation released.",
          409,
        );
        await client.query(
          "UPDATE beds SET status='available',patient_id=NULL,assigned_doctor_id=NULL,case_id=NULL WHERE id=$1",
          [bed.id],
        );
      } else if (action === "ready") {
        requireValue(
          bed.status === "cleaning",
          "Only a cleaning bed can be marked ready.",
          409,
        );
        await client.query("UPDATE beds SET status='available' WHERE id=$1", [
          bed.id,
        ]);
      } else requireValue(false, "Invalid bed action.");
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
export default router;
