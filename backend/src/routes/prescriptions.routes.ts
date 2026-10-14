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
  authorizeRoles(["admin", "doctor", "nurse", "pharmacist", "patient"]),
  async (req: TenantRequest, res, next) => {
    try {
      const args: any[] = [req.hospitalId];
      let filter = "rx.hospital_id=$1";
      if (req.user!.role === "patient") {
        args.push(req.user!.userId);
        filter += " AND p.user_id=$2";
      } else if (req.query.uhid) {
        args.push(req.query.uhid);
        filter += " AND p.uhid=$2";
      }
      const rows = await pool.query(
        `SELECT rx.id,rx.case_id as "caseId",rx.patient_id as "patientId",p.name,p.uhid as name_subtitle,u.name as doctor,rx.drug_details as "drugDetails",rx.status,to_char(rx.date,'YYYY-MM-DD') as date FROM prescriptions rx JOIN patients p ON p.id=rx.patient_id JOIN users u ON u.id=rx.doctor_id WHERE ${filter} ORDER BY rx.created_at DESC`,
        args,
      );
      res.json({ success: true, data: rows.rows });
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
      const { caseId, drugDetails } = req.body;
      requireValue(
        caseId && typeof drugDetails === "string" && drugDetails.trim(),
        "A case and prescription details are required.",
      );
      const data = await transaction(async (client) => {
        const c = (
          await client.query(
            "SELECT * FROM cases WHERE id=$1 AND hospital_id=$2 FOR UPDATE",
            [caseId, req.hospitalId],
          )
        ).rows[0];
        requireValue(c, "Case not found.", 404);
        requireValue(
          req.user!.role === "admin" || c.assigned_doctor === req.user!.userId,
          "Access denied.",
          403,
        );
        requireValue(
          !["cancelled", "closed", "discharged", "requested"].includes(
            c.status,
          ),
          "Case is not open for prescribing.",
          409,
        );
        const id = newId("RX");
        await client.query(
          `INSERT INTO prescriptions (id,hospital_id,case_id,patient_id,doctor_id,drug_details,status,date) VALUES($1,$2,$3,$4,$5,$6,'Pending',CURRENT_DATE)`,
          [
            id,
            req.hospitalId,
            c.id,
            c.patient_id,
            c.assigned_doctor,
            drugDetails,
          ],
        );
        await client.query(
          "INSERT INTO case_timeline(id,case_id,event_type,actor_id,actor_role,summary) VALUES($1,$2,$3,$4,$5,$6)",
          [
            newId("CT"),
            c.id,
            "prescription_created",
            req.user!.userId,
            req.user!.role,
            "Prescription issued for pharmacy review.",
          ],
        );
        return { id };
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);
router.patch(
  "/:id/dispense",
  authorizeRoles(["admin", "pharmacist"]),
  async (req: TenantRequest, res, next) => {
    try {
      const items = req.body.items;
      requireValue(
        Array.isArray(items) && items.length > 0,
        "Select inventory batches and quantities before dispensing.",
      );
      requireValue(
        items.every(
          (i: any) =>
            typeof i.inventoryId === "string" &&
            Number.isInteger(i.quantity) &&
            i.quantity > 0,
        ),
        "Each item needs a valid batch and quantity.",
      );
      requireValue(
        new Set(items.map((i: any) => i.inventoryId)).size === items.length,
        "Select each batch only once.",
      );
      const data = await transaction(async (client) => {
        const rx = (
          await client.query(
            "SELECT * FROM prescriptions WHERE id=$1 AND hospital_id=$2 FOR UPDATE",
            [req.params.id, req.hospitalId],
          )
        ).rows[0];
        requireValue(rx, "Prescription not found.", 404);
        requireValue(
          rx.status === "Pending",
          "This prescription is already dispensed.",
          409,
        );
        const lines = [];
        let subtotal = 0;
        for (const item of [...items].sort((a, b) =>
          a.inventoryId.localeCompare(b.inventoryId),
        )) {
          const stock = (
            await client.query(
              "SELECT * FROM inventory WHERE id=$1 AND hospital_id=$2 FOR UPDATE",
              [item.inventoryId, req.hospitalId],
            )
          ).rows[0];
          requireValue(stock, "Inventory batch not found.", 404);
          requireValue(
            Number(stock.qty) >= item.quantity,
            `Insufficient stock for ${stock.name}.`,
            409,
          );
          requireValue(
            new Date(stock.expiry).getTime() >=
              new Date(new Date().toDateString()).getTime(),
            `Batch ${stock.batch} has expired.`,
            409,
          );
          const price = Number(stock.unit_price);
          requireValue(
            Number.isFinite(price) && price >= 0,
            "Inventory price is invalid.",
          );
          const total = Math.round(price * item.quantity * 100) / 100;
          subtotal += total;
          await client.query(
            "UPDATE inventory SET qty=qty-$1,status=CASE WHEN qty-$1=0 THEN 'Out of Stock' WHEN qty-$1<=reorder_level THEN 'Low Stock' ELSE 'In Stock' END WHERE id=$2",
            [item.quantity, stock.id],
          );
          await client.query(
            "INSERT INTO dispense_items(id,prescription_id,inventory_id,quantity,unit_price) VALUES($1,$2,$3,$4,$5)",
            [newId("DI"), rx.id, stock.id, item.quantity, price],
          );
          lines.push({
            description: `${stock.name} · Batch ${stock.batch}`,
            quantity: item.quantity,
            price,
            total,
          });
        }
        subtotal = Math.round(subtotal * 100) / 100;
        const billingId = newId("B"),
          invoiceNumber = `INV-${billingId.slice(2, 10).toUpperCase()}`;
        await client.query(
          `INSERT INTO billing(id,hospital_id,case_id,patient_id,invoice_number,subtotal,total,paid,balance,status) VALUES($1,$2,$3,$4,$5,$6,$6,0,$6,$7)`,
          [
            billingId,
            req.hospitalId,
            rx.case_id,
            rx.patient_id,
            invoiceNumber,
            subtotal,
            subtotal === 0 ? "PAID" : "PENDING",
          ],
        );
        for (const line of lines)
          await client.query(
            "INSERT INTO invoice_items(id,billing_id,description,quantity,unit_price,total_price) VALUES($1,$2,$3,$4,$5,$6)",
            [
              newId("BI"),
              billingId,
              line.description,
              line.quantity,
              line.price,
              line.total,
            ],
          );
        await client.query(
          "UPDATE prescriptions SET status='Dispensed',dispensed_at=NOW() WHERE id=$1",
          [rx.id],
        );
        if (rx.case_id)
          await client.query(
            "INSERT INTO case_timeline(id,case_id,event_type,actor_id,actor_role,summary) VALUES($1,$2,$3,$4,$5,$6)",
            [
              newId("CT"),
              rx.case_id,
              "drug_dispensed",
              req.user!.userId,
              req.user!.role,
              `Prescription dispensed. Stock updated and itemized invoice ${invoiceNumber} created.`,
            ],
          );
        return { invoiceNumber, billingId, total: subtotal };
      });
      res.json({
        success: true,
        message: "Prescription dispensed and invoice created.",
        data,
      });
    } catch (error) {
      next(error);
    }
  },
);
export default router;
