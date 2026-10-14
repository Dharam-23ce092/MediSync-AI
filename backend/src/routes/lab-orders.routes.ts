import { Router } from "express";
import { pool } from "../config/postgres";
import { authenticateJWT } from "../middleware/auth.middleware";
import { requireTenant, TenantRequest } from "../middleware/tenant.middleware";
import { authorizeRoles } from "../middleware/role.middleware";
import { newId, requireValue, transaction } from "../utils/workflow";
const router = Router();
router.use(authenticateJWT, requireTenant);
router.get(
  "/",
  authorizeRoles(["admin", "doctor", "nurse", "lab", "patient"]),
  async (req: TenantRequest, res, next) => {
    try {
      const values: any[] = [req.hospitalId];
      let filter = "lo.hospital_id=$1";
      if (req.user!.role === "patient") {
        values.push(req.user!.userId);
        filter += " AND p.user_id=$2";
      } else if (req.query.uhid) {
        values.push(req.query.uhid);
        filter += " AND p.uhid=$2";
      }
      const result = await pool.query(
        `SELECT lo.id,lo.case_id as "caseId",p.name,p.uhid as name_subtitle,lo.test_name as "testName",u.name as doctor,lo.specimen,lo.status,to_char(lo.date,'YYYY-MM-DD') as date,lo.results FROM lab_orders lo JOIN patients p ON p.id=lo.patient_id JOIN users u ON u.id=lo.doctor_id WHERE ${filter} ORDER BY lo.created_at DESC`,
        values,
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      next(error);
    }
  },
);
router.post(
  "/",
  authorizeRoles(["admin", "doctor"]),
  async (req: TenantRequest, res, next) => {
    try {
      const { caseId, testName, specimen } = req.body;
      requireValue(
        caseId &&
          typeof testName === "string" &&
          testName.trim() &&
          typeof specimen === "string" &&
          specimen.trim(),
        "Select a case, test name and specimen.",
      );
      const data = await transaction(async (client) => {
        const result = await client.query(
          "SELECT * FROM cases WHERE id=$1 AND hospital_id=$2 FOR UPDATE",
          [caseId, req.hospitalId],
        );
        requireValue(result.rowCount, "Case not found.", 404);
        const c = result.rows[0];
        requireValue(
          req.user!.role === "admin" || c.assigned_doctor === req.user!.userId,
          "This case belongs to another provider.",
          403,
        );
        requireValue(
          !["closed", "cancelled", "discharged", "requested"].includes(
            c.status,
          ),
          "This case is not open for clinical orders.",
          409,
        );
        const id = newId("LAB");
        await client.query(
          `INSERT INTO lab_orders (id,hospital_id,case_id,patient_id,doctor_id,test_name,specimen,status,date) VALUES ($1,$2,$3,$4,$5,$6,$7,'Received',CURRENT_DATE)`,
          [
            id,
            req.hospitalId,
            c.id,
            c.patient_id,
            c.assigned_doctor,
            testName,
            specimen,
          ],
        );
        await client.query(
          "INSERT INTO case_timeline (id,case_id,event_type,actor_id,actor_role,summary) VALUES ($1,$2,$3,$4,$5,$6)",
          [
            newId("CT"),
            c.id,
            "lab_ordered",
            req.user!.userId,
            req.user!.role,
            `Lab test ordered: ${testName}`,
          ],
        );
        return (
          await client.query(
            `SELECT lo.id,lo.case_id as "caseId",p.name,p.uhid as name_subtitle,lo.test_name as "testName",u.name as doctor,lo.specimen,lo.status,to_char(lo.date,'YYYY-MM-DD') as date FROM lab_orders lo JOIN patients p ON p.id=lo.patient_id JOIN users u ON u.id=lo.doctor_id WHERE lo.id=$1`,
            [id],
          )
        ).rows[0];
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);
async function update(req: TenantRequest, status: string, results?: any) {
  return transaction(async (client) => {
    const row = await client.query(
      "SELECT * FROM lab_orders WHERE id=$1 AND hospital_id=$2 FOR UPDATE",
      [req.params.id, req.hospitalId],
    );
    requireValue(row.rowCount, "Lab order not found.", 404);
    const lo = row.rows[0];
    requireValue(
      status === "Collected"
        ? lo.status === "Received"
        : ["Collected", "Analysis"].includes(lo.status),
      "Invalid lab status transition.",
      409,
    );
    await client.query(
      "UPDATE lab_orders SET status=$1,results=COALESCE($2::jsonb,results) WHERE id=$3",
      [status, results ? JSON.stringify(results) : null, lo.id],
    );
    if (lo.case_id)
      await client.query(
        "INSERT INTO case_timeline (id,case_id,event_type,actor_id,actor_role,summary) VALUES ($1,$2,$3,$4,$5,$6)",
        [
          newId("CT"),
          lo.case_id,
          "lab_updated",
          req.user!.userId,
          req.user!.role,
          `${lo.test_name}: ${status}`,
        ],
      );
  });
}
router.patch(
  "/:id/collect",
  authorizeRoles(["admin", "lab", "nurse"]),
  async (req: TenantRequest, res, next) => {
    try {
      await update(req, "Collected");
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);
router.post(
  "/:id/results",
  authorizeRoles(["admin", "lab"]),
  async (req: TenantRequest, res, next) => {
    try {
      const results = req.body.results;
      requireValue(
        results &&
          typeof results === "object" &&
          !Array.isArray(results) &&
          Object.keys(results).length,
        "Results are required.",
      );
      requireValue(
        Object.entries(results).every(([key, value]) =>
          key === "status"
            ? ["normal", "warning", "critical"].includes(String(value))
            : typeof value === "number" && Number.isFinite(value) && value >= 0,
        ),
        "Results must contain valid numeric measurements.",
      );
      await update(req, "Completed", results);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);
export default router;
