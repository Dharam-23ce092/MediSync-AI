/* Integration tests use a disposable schema in the configured database; public data is untouched. */
const assert = require("node:assert/strict");
require("dotenv").config();
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");
const schema = `workflow_test_${Date.now()}`;
const control = new Pool({ connectionString: process.env.DATABASE_URL });
let pool, server;
(async () => {
  await control.query(`CREATE SCHEMA "${schema}"`);
  const tables = await control.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public'",
  );
  for (const { tablename } of tables.rows) {
    if (!/^[a-z_]+$/.test(tablename)) continue;
    await control.query(
      `CREATE TABLE "${schema}"."${tablename}" (LIKE public."${tablename}" INCLUDING ALL)`,
    );
  }
  process.env.PGOPTIONS = `-c search_path=${schema}`;
  process.env.JWT_SECRET = "isolated-workflow-test-secret";
  ({ pool } = require("../dist/config/postgres"));
  await require("../dist/data/migrate-workflows").migrateWorkflows();
  await pool.query(
    "INSERT INTO hospitals (id,name,slug) VALUES ('h1','Test Hospital','test-h1'),('h2','Other Hospital','test-h2')",
  );
  const roles = [
    ["admin", "admin", "h1"],
    ["doctor", "doctor", "h1"],
    ["patient", "patient", "h1"],
    ["other", "admin", "h2"],
    ["lab", "lab", "h1"],
    ["pharmacist", "pharmacist", "h1"],
    ["nurse", "nurse", "h1"],
  ];
  for (const [id, role, hospital] of roles)
    await pool.query(
      "INSERT INTO users (id,hospital_id,email,password_hash,name,role) VALUES ($1,$2,$3,$4,$5,$6)",
      [id, hospital, `${id}@test.invalid`, "unused", id, role],
    );
  await pool.query(
    "INSERT INTO patients (id,hospital_id,user_id,uhid,name,age,gender,blood_group,emergency_contact) VALUES ('p1','h1','patient','TEST-UHID','Test Patient',30,'Other','O+','000')",
  );
  await pool.query(
    "INSERT INTO beds (id,hospital_id,name,type,status) VALUES ('bed-a','h1','Ward A','General Ward','available'),('bed-b','h1','Ward B','General Ward','available')",
  );
  // SQL workflows are isolated here; Mongo audit persistence is covered by live smoke checks.
  require("../dist/utils/audit").logAudit = async () => {};
  const app = require("../dist/app").default;
  server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function api(role, path, method = "GET", body) {
    const token = jwt.sign(
      {
        userId: role,
        role: role === "other" ? "admin" : role,
        hospital_id: role === "other" ? "h2" : "h1",
        uhid: role === "patient" ? "TEST-UHID" : undefined,
        name: role,
      },
      process.env.JWT_SECRET,
    );
    const r = await fetch(base + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, ...(await r.json()) };
  }
  const visit = new Date();
  visit.setDate(visit.getDate() + 1);
  visit.setHours(10, 0, 0, 0);
  const date = visit.toISOString();
  const booking = { doctorId: "doctor", appointmentTime: date, type: "New" };
  const booked = await api("patient", "/appointments", "POST", booking);
  assert.equal(booked.status, 201);
  const a = booked.data;
  assert.equal(a.status, "Requested");
  assert.equal(new Date(a.appointmentTime).getTime(), new Date(date).getTime());
  assert.ok(a.caseId);
  assert.equal(
    (await api("patient", "/appointments", "POST", booking)).status,
    409,
  );
  assert.equal(
    (
      await api("patient", "/appointments/status", "PATCH", {
        appointmentId: a.appointment_db_id,
        status: "Confirmed",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api("other", "/appointments/status", "PATCH", {
        appointmentId: a.appointment_db_id,
        status: "Confirmed",
      })
    ).status,
    404,
  );
  assert.deepEqual((await api("other", "/appointments")).data, []);
  assert.equal(
    (
      await api("admin", "/appointments/status", "PATCH", {
        appointmentId: a.appointment_db_id,
        status: "Confirmed",
      })
    ).status,
    200,
  );
  // Use database clock's current time to make check-in independent of midnight.
  await pool.query(
    "UPDATE appointments SET appointment_time=NOW() WHERE id=$1",
    [a.appointment_db_id],
  );
  assert.equal(
    (
      await api("admin", "/appointments/status", "PATCH", {
        appointmentId: a.appointment_db_id,
        status: "Checked-in",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api("doctor", "/appointments/status", "PATCH", {
        appointmentId: a.appointment_db_id,
        status: "In Consultation",
      })
    ).status,
    200,
  );
  const order = await api("doctor", "/lab-orders", "POST", {
    caseId: a.caseId,
    testName: "Test panel",
    specimen: "Blood",
  });
  assert.equal(order.status, 201);
  assert.equal(
    (
      await api("lab", `/lab-orders/${order.data.id}/results`, "POST", {
        results: { hb: 12 },
      })
    ).status,
    409,
  );
  assert.equal(
    (await api("lab", `/lab-orders/${order.data.id}/collect`, "PATCH")).status,
    200,
  );
  assert.equal(
    (
      await api("lab", `/lab-orders/${order.data.id}/results`, "POST", {
        results: { hb: 12 },
      })
    ).status,
    200,
  );
  const note = {
    appointmentId: a.appointment_db_id,
    chiefComplaint: "Test complaint",
    diagnosis: "Test diagnosis",
    clinicalNotes: "Test note",
    medications: [
      { name: "Test medicine", dosage: "Test instructions", duration: "3" },
    ],
  };
  assert.equal(
    (await api("doctor", "/consultations", "POST", note)).status,
    201,
  );
  assert.equal(
    (await api("doctor", "/consultations", "POST", note)).status,
    201,
  );
  assert.equal(
    Number(
      (await pool.query("SELECT count(*) FROM prescriptions")).rows[0].count,
    ),
    1,
  );
  assert.equal(
    (await api("patient", "/appointments")).data[0].status,
    "Completed",
  );
  await pool.query(
    "INSERT INTO inventory (id,hospital_id,name,batch,qty,unit_price,expiry) VALUES ('stock1','h1','Test medicine','batch1',20,5,'2099-01-01')",
  );
  const rxId = (await pool.query("SELECT id FROM prescriptions")).rows[0].id;
  assert.equal(
    (
      await api("pharmacist", `/prescriptions/${rxId}/dispense`, "PATCH", {
        items: [{ inventoryId: "stock1", quantity: 25 }],
      })
    ).status,
    409,
  );
  assert.equal(
    Number(
      (await pool.query("SELECT qty FROM inventory WHERE id='stock1'")).rows[0]
        .qty,
    ),
    20,
  );
  const dispensed = await api(
    "pharmacist",
    `/prescriptions/${rxId}/dispense`,
    "PATCH",
    { items: [{ inventoryId: "stock1", quantity: 6 }] },
  );
  assert.equal(dispensed.status, 200);
  assert.equal(dispensed.data.total, 30);
  assert.equal(
    Number(
      (await pool.query("SELECT qty FROM inventory WHERE id='stock1'")).rows[0]
        .qty,
    ),
    14,
  );
  assert.equal((await api("patient", "/billing")).data.length, 1);
  assert.equal(
    (
      await api("pharmacist", `/prescriptions/${rxId}/dispense`, "PATCH", {
        items: [{ inventoryId: "stock1", quantity: 6 }],
      })
    ).status,
    409,
  );
  assert.equal((await api("admin", "/overview")).status, 200);
  assert.equal((await api("patient", "/overview")).status, 200);
  assert.equal((await api("lab", "/overview")).status, 200);
  assert.equal((await api("doctor", "/overview")).status, 200);
  assert.equal((await api("pharmacist", "/overview")).status, 200);

  assert.equal(
    (
      await api("doctor", "/appointments/status", "PATCH", {
        appointmentId: a.appointment_db_id,
        status: "In Consultation",
      })
    ).status,
    409,
  );
  assert.equal(
    (await api("patient", "/consultations/patient/TEST-UHID")).data.length,
    1,
  );
  assert.equal(
    (
      await api("admin", "/beds/bed-a", "PATCH", {
        action: "allocate",
        uhid: "TEST-UHID",
        doctorId: "doctor",
      })
    ).status,
    200,
  );
  assert.equal((await api("nurse", "/nurse-tasks")).data.length, 1);
  assert.equal((await api("nurse", "/overview")).status, 200);
  assert.equal(
    (
      await api("admin", "/beds/bed-b", "PATCH", {
        action: "allocate",
        uhid: "TEST-UHID",
        doctorId: "doctor",
      })
    ).status,
    409,
  );
  const bed = (await api("admin", "/beds")).data.find((b) => b.id === "bed-a");
  assert.ok(bed.caseId);
  assert.equal(bed.patientName, "Test Patient");
  assert.ok(Array.isArray(bed.allergies));
  assert.equal(
    (await api("other", "/beds/bed-a", "PATCH", { action: "discharge" }))
      .status,
    404,
  );
  assert.equal(
    (await api("admin", "/beds/bed-a", "PATCH", { action: "ready" })).status,
    409,
  );
  assert.equal(
    (await api("admin", "/beds/bed-a", "PATCH", { action: "discharge" }))
      .status,
    200,
  );
  assert.equal(
    (await api("admin", `/cases/${bed.caseId}`)).data.status,
    "discharged",
  );
  assert.equal(
    (await api("admin", "/beds/bed-a", "PATCH", { action: "ready" })).status,
    200,
  );
  assert.equal((await api("admin", "/dashboard/admin")).data.occupiedBeds, 0);
  assert.equal(
    (
      await api("patient", "/billing/missing/pay", "POST", {
        amount: 10,
        paymentMethod: "Cash",
      })
    ).status,
    403,
  );
  // Concurrent duplicate slot requests must produce one appointment and one case only.
  const results = await Promise.all([
    api("patient", "/appointments", "POST", booking),
    api("patient", "/appointments", "POST", booking),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(
    (await api("admin", "/beds", "POST", { name: "New Test Bed", type: "ICU" }))
      .status,
    201,
  );
  assert.equal(
    (await api("admin", "/beds", "POST", { name: "New Test Bed", type: "ICU" }))
      .status,
    409,
  );
  const invoice = await api("admin", "/billing", "POST", {
    caseId: a.caseId,
    items: [{ description: "Test fee", quantity: 2, unitPrice: 12.5 }],
  });
  assert.equal(invoice.status, 201);
  assert.equal(invoice.data.total, 25);
  assert.equal(
    (
      await api("admin", `/billing/${invoice.data.id}/pay`, "POST", {
        amount: 25,
        paymentMethod: "Cash",
        transactionReference: "TEST-RECEIPT",
      })
    ).status,
    200,
  );
  assert.equal(
    (await api("patient", `/cases/${a.caseId}`)).data.status,
    "consultation_complete",
  );
  console.log(
    "PASS: booking, approval, isolation, duplicate slots, clinical completion, lab transitions, admission, discharge and payment permissions.",
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (pool) await pool.end();
    if (/^workflow_test_\d+$/.test(schema))
      await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await control.end();
  });
