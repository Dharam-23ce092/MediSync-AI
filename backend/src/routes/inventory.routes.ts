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
  authorizeRoles(["pharmacist", "admin"]),
);
router.get("/", async (req: TenantRequest, res, next) => {
  try {
    const r = await pool.query(
      `SELECT i.*,EXISTS(SELECT 1 FROM inventory_requests r WHERE r.inventory_id=i.id AND r.status='Requested') as "reorderPending" FROM inventory i WHERE i.hospital_id=$1 ORDER BY i.name,i.expiry`,
      [req.hospitalId],
    );
    res.json({ success: true, data: r.rows });
  } catch (error) {
    next(error);
  }
});
router.post("/", async (req: TenantRequest, res, next) => {
  try {
    const {
      name,
      category,
      batch,
      qty,
      unit,
      reorder_level,
      unit_price,
      expiry,
      manufacturer,
    } = req.body;
    requireValue(
      typeof name === "string" &&
        name.trim() &&
        typeof batch === "string" &&
        batch.trim() &&
        typeof unit === "string" &&
        unit.trim(),
      "Medicine name, batch and unit are required.",
    );
    requireValue(
      Number.isInteger(qty) &&
        qty > 0 &&
        Number.isInteger(reorder_level) &&
        reorder_level >= 0 &&
        typeof unit_price === "number" &&
        Number.isFinite(unit_price) &&
        unit_price >= 0,
      "Enter valid quantity, reorder level and unit price.",
    );
    requireValue(
      typeof expiry === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(expiry) &&
        Number.isFinite(new Date(expiry).getTime()) &&
        new Date(expiry) >= new Date(new Date().toDateString()),
      "Enter an unexpired batch date.",
    );
    const data = await transaction(async (client) => {
      await client.query("SELECT id FROM hospitals WHERE id=$1 FOR UPDATE", [
        req.hospitalId,
      ]);
      const duplicate = await client.query(
        "SELECT id FROM inventory WHERE hospital_id=$1 AND lower(name)=lower($2) AND lower(batch)=lower($3)",
        [req.hospitalId, name.trim(), batch.trim()],
      );
      requireValue(
        !duplicate.rowCount,
        "This batch already exists. Use Receive stock on that batch.",
        409,
      );
      return (
        await client.query(
          `INSERT INTO inventory(id,hospital_id,name,category,batch,qty,unit,reorder_level,unit_price,expiry,manufacturer,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [
            newId("INV"),
            req.hospitalId,
            name.trim(),
            category || "Medicine",
            batch.trim(),
            qty,
            unit.trim(),
            reorder_level,
            unit_price,
            expiry,
            manufacturer || "",
            qty <= reorder_level ? "Low Stock" : "In Stock",
          ],
        )
      ).rows[0];
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
router.patch("/:id/reorder", async (req: TenantRequest, res, next) => {
  try {
    await transaction(async (client) => {
      const item = (
        await client.query(
          "SELECT * FROM inventory WHERE id=$1 AND hospital_id=$2 FOR UPDATE",
          [req.params.id, req.hospitalId],
        )
      ).rows[0];
      requireValue(item, "Inventory item not found.", 404);
      const pending = await client.query(
        "SELECT id FROM inventory_requests WHERE inventory_id=$1 AND status='Requested'",
        [item.id],
      );
      if (!pending.rowCount)
        await client.query(
          "INSERT INTO inventory_requests(id,hospital_id,inventory_id,requested_by) VALUES($1,$2,$3,$4)",
          [newId("REQ"), req.hospitalId, item.id, req.user!.userId],
        );
    });
    res.json({
      success: true,
      message:
        "Internal replenishment request recorded. No order has been sent to a supplier.",
    });
  } catch (error) {
    next(error);
  }
});
router.patch("/:id/receive", async (req: TenantRequest, res, next) => {
  try {
    requireValue(
      Number.isInteger(req.body.quantity) && req.body.quantity > 0,
      "Enter the quantity physically received.",
    );
    await transaction(async (client) => {
      const item = (
        await client.query(
          "SELECT * FROM inventory WHERE id=$1 AND hospital_id=$2 FOR UPDATE",
          [req.params.id, req.hospitalId],
        )
      ).rows[0];
      requireValue(item, "Inventory item not found.", 404);
      requireValue(
        new Date(item.expiry) >= new Date(new Date().toDateString()),
        "This batch has expired. Create the new received batch instead.",
      );
      await client.query(
        "UPDATE inventory SET qty=qty+$1,status=CASE WHEN qty+$1<=reorder_level THEN 'Low Stock' ELSE 'In Stock' END WHERE id=$2",
        [req.body.quantity, item.id],
      );
      await client.query(
        "UPDATE inventory_requests SET status='Received' WHERE inventory_id=$1 AND status='Requested'",
        [item.id],
      );
    });
    res.json({ success: true, message: "Received stock recorded." });
  } catch (error) {
    next(error);
  }
});
export default router;
