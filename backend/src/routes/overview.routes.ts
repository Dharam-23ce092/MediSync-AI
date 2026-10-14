import { Router } from "express";
import { pool } from "../config/postgres";
import { authenticateJWT } from "../middleware/auth.middleware";
import { requireTenant, TenantRequest } from "../middleware/tenant.middleware";
const router = Router();
router.use(authenticateJWT, requireTenant);
router.get("/", async (req: TenantRequest, res, next) => {
  try {
    const role = req.user!.role,
      h = req.hospitalId,
      user = req.user!.userId;
    const q = async (sql: string, args: any[] = [h]) =>
      (await pool.query(sql, args)).rows;
    let cards: any[] = [],
      work: any[] = [],
      title = "Hospital overview",
      subtitle = "A clear view of what needs attention.",
      link = "/cases";
    const number = (rows: any[], key = "count") => Number(rows[0]?.[key] || 0);
    if (["admin", "receptionist", "doctor", "patient"].includes(role)) {
      const args: any[] = [h];
      let scope = "a.hospital_id=$1";
      if (role === "doctor") {
        args.push(user);
        scope += " AND a.doctor_id=$2";
      }
      if (role === "patient") {
        args.push(user);
        scope += " AND p.user_id=$2";
      }
      const counts = (
        await q(
          `SELECT COUNT(*) FILTER (WHERE a.status='Requested') AS requested,COUNT(*) FILTER (WHERE a.status='Confirmed') AS confirmed,COUNT(*) FILTER (WHERE a.appointment_time::date=CURRENT_DATE AND a.status IN ('Waiting','Checked-in','In Consultation')) AS queue,COUNT(*) FILTER (WHERE a.status='Completed') AS completed FROM appointments a JOIN patients p ON p.id=a.patient_id WHERE ${scope}`,
          args,
        )
      )[0];
      link =
        role === "patient"
          ? "/patient/appointments"
          : role === "doctor"
            ? "/doctor/appointments"
            : "/admin/appointments";
      cards = [
        {
          label: "Awaiting approval",
          value: Number(counts.requested),
          hint:
            role === "patient"
              ? "Your requests with the hospital"
              : "Requests that need a decision",
          link,
          tone: "amber",
        },
        {
          label: "Confirmed visits",
          value: Number(counts.confirmed),
          hint: "Accepted appointments",
          link,
          tone: "blue",
        },
        {
          label: "In today’s queue",
          value: Number(counts.queue),
          hint: "Checked in or in consultation",
          link,
          tone: "teal",
        },
        {
          label: "Completed visits",
          value: Number(counts.completed),
          hint: "Consultations completed",
          link,
          tone: "neutral",
        },
      ];
      work = await q(
        `SELECT a.id,p.name as title,p.uhid || ' · ' || u.name as detail,a.status,a.case_id as "caseId",a.appointment_time as date FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN users u ON u.id=a.doctor_id WHERE ${scope} AND a.status NOT IN ('Completed','Rejected','Cancelled') ORDER BY CASE WHEN a.status='Requested' THEN 0 ELSE 1 END,a.appointment_time LIMIT 8`,
        args,
      );
      if (role === "admin") {
        const beds = (
          await q(
            "SELECT COUNT(*) total,COUNT(*) FILTER(WHERE status='occupied') occupied,COUNT(*) FILTER(WHERE status='available') available FROM beds WHERE hospital_id=$1",
          )
        )[0];
        const bills = await q(
          "SELECT COALESCE(SUM(balance),0) total FROM billing WHERE hospital_id=$1",
        );
        cards[1] = {
          label: "Occupied beds",
          value: `${beds.occupied} / ${beds.total}`,
          hint: "Assigned inpatient beds",
          link: "/admin/beds.component",
          tone: "teal",
        };
        cards[2] = {
          label: "Available beds",
          value: Number(beds.available),
          hint: "Clean and ready for admission",
          link: "/admin/beds.component",
          tone: "blue",
        };
        cards[3] = {
          label: "Outstanding balance",
          value: number(bills, "total"),
          format: "currency",
          hint: "Recorded unpaid invoice balances",
          link: "/admin/billing",
          tone: "neutral",
        };
      }
      if (role === "patient") {
        title = "Your care, in one place";
        subtitle =
          "Track appointments, follow your care, and find your records.";
      }
      if (role === "doctor") {
        title = "Your clinical workspace";
        subtitle =
          "Review requests, see who has arrived, and continue patient care.";
      }
    } else if (role === "nurse") {
      title = "Ward & care overview";
      subtitle =
        "Current admissions and nursing tasks, connected to patient records.";
      link = "/nurse/patients.component";
      const bed = await q(
        "SELECT COUNT(*) FROM beds WHERE hospital_id=$1 AND status='occupied'",
      );
      const tasks = await q(
        "SELECT COUNT(*) FROM nurse_tasks WHERE hospital_id=$1 AND completed=false",
      );
      const high = await q(
        "SELECT COUNT(*) FROM nurse_tasks WHERE hospital_id=$1 AND completed=false AND priority='high'",
      );
      const done = await q(
        "SELECT COUNT(*) FROM nurse_tasks WHERE hospital_id=$1 AND completed=true",
      );
      cards = [
        {
          label: "Admitted patients",
          value: number(bed),
          hint: "Current occupied beds",
          link,
          tone: "teal",
        },
        {
          label: "Open care tasks",
          value: number(tasks),
          hint: "Nursing checklist",
          link: "/nurse/rounds",
          tone: "blue",
        },
        {
          label: "High priority tasks",
          value: number(high),
          hint: "Review these first",
          link: "/nurse/rounds",
          tone: "amber",
        },
        {
          label: "Completed tasks",
          value: number(done),
          hint: "Recorded task completions",
          link: "/nurse/rounds",
          tone: "neutral",
        },
      ];
      work = await q(
        `SELECT b.id,p.name as title,b.name || ' · ' || p.uhid as detail,b.status,b.case_id as "caseId",c.admission_date as date FROM beds b JOIN patients p ON p.id=b.patient_id LEFT JOIN cases c ON c.id=b.case_id WHERE b.hospital_id=$1 AND b.status='occupied' ORDER BY b.name LIMIT 8`,
      );
    } else if (role === "pharmacist") {
      title = "Pharmacy overview";
      subtitle = "Prescription requests and stock that need your attention.";
      link = "/pharmacist/dispensing";
      const rx = (
        await q(
          "SELECT COUNT(*) FILTER(WHERE status='Pending') pending,COUNT(*) FILTER(WHERE status='Dispensed') dispensed FROM prescriptions WHERE hospital_id=$1",
        )
      )[0];
      const inv = (
        await q(
          "SELECT COUNT(*) FILTER(WHERE qty<=reorder_level) low,COUNT(*) FILTER(WHERE expiry <= CURRENT_DATE+INTERVAL '30 days' AND qty>0) expiring FROM inventory WHERE hospital_id=$1",
        )
      )[0];
      cards = [
        {
          label: "Pending prescriptions",
          value: Number(rx.pending),
          hint: "Awaiting pharmacy review",
          link,
          tone: "amber",
        },
        {
          label: "Dispensed",
          value: Number(rx.dispensed),
          hint: "Completed dispensations",
          link,
          tone: "teal",
        },
        {
          label: "Low stock batches",
          value: Number(inv.low),
          hint: "At or below reorder level",
          link: "/pharmacist/inventory",
          tone: "blue",
        },
        {
          label: "Expiry attention",
          value: Number(inv.expiring),
          hint: "Expired or expiring within 30 days",
          link: "/pharmacist/inventory",
          tone: "neutral",
        },
      ];
      work = await q(
        `SELECT rx.id,p.name as title,p.uhid || ' · ' || rx.drug_details as detail,rx.status,rx.case_id as "caseId",rx.created_at as date FROM prescriptions rx JOIN patients p ON p.id=rx.patient_id WHERE rx.hospital_id=$1 AND rx.status='Pending' ORDER BY rx.created_at LIMIT 8`,
      );
    } else if (role === "lab") {
      title = "Laboratory overview";
      subtitle =
        "Follow every order from sample collection to published results.";
      link = "/lab/samples";
      const counts = (
        await q(
          "SELECT COUNT(*) FILTER(WHERE status='Received') received,COUNT(*) FILTER(WHERE status='Collected') collected,COUNT(*) FILTER(WHERE status='Completed') completed,COUNT(*) FILTER(WHERE status='Completed' AND results IS NOT NULL) published FROM lab_orders WHERE hospital_id=$1",
        )
      )[0];
      cards = [
        {
          label: "Awaiting sample",
          value: Number(counts.received),
          hint: "Orders received from providers",
          link,
          tone: "amber",
        },
        {
          label: "Ready for results",
          value: Number(counts.collected),
          hint: "Samples collected",
          link: "/lab/results",
          tone: "blue",
        },
        {
          label: "Completed orders",
          value: Number(counts.completed),
          hint: "Completed diagnostic work",
          link: "/lab/results",
          tone: "teal",
        },
        {
          label: "Reports available",
          value: Number(counts.published),
          hint: "Results saved to patient records",
          link: "/lab/results",
          tone: "neutral",
        },
      ];
      work = await q(
        `SELECT lo.id,p.name as title,p.uhid || ' · ' || lo.test_name as detail,lo.status,lo.case_id as "caseId",lo.created_at as date FROM lab_orders lo JOIN patients p ON p.id=lo.patient_id WHERE lo.hospital_id=$1 AND lo.status!='Completed' ORDER BY lo.created_at LIMIT 8`,
      );
    }
    let activityArgs: any[] = [h];
    let activityScope = "c.hospital_id=$1";
    if (role === "patient") {
      activityArgs.push(user);
      activityScope += " AND p.user_id=$2";
    }
    if (role === "doctor") {
      activityArgs.push(user);
      activityScope += " AND c.assigned_doctor=$2";
    }
    const activity = await q(
      `SELECT t.id,t.summary,t.created_at as date,c.id as "caseId",c.case_number as "caseNumber",p.name as "patientName" FROM case_timeline t JOIN cases c ON c.id=t.case_id JOIN patients p ON p.id=c.patient_id WHERE ${activityScope} ORDER BY t.created_at DESC LIMIT 6`,
      activityArgs,
    );
    res.json({
      success: true,
      data: {
        title,
        subtitle,
        cards,
        work,
        activity,
        workLink: link,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
});
export default router;
