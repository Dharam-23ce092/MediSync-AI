import { pool } from "../config/postgres";
import { newId, transaction } from "../utils/workflow";
/** Additive migration: never resets or reseeds existing hospital records. */
export async function migrateWorkflows() {
  await transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(734621)");
    await client.query(`CREATE TABLE IF NOT EXISTS inventory (
        id VARCHAR(50) PRIMARY KEY,
        hospital_id VARCHAR(50) REFERENCES hospitals(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        category VARCHAR(50) NOT NULL DEFAULT 'Tablet',
        batch VARCHAR(50) NOT NULL,
        qty INT NOT NULL DEFAULT 0,
        unit VARCHAR(20) NOT NULL DEFAULT 'Tabs',
        reorder_level INT NOT NULL DEFAULT 50,
        unit_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        expiry DATE NOT NULL,
        manufacturer VARCHAR(200),
        status VARCHAR(30) NOT NULL DEFAULT 'In Stock',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await client.query(`CREATE TABLE IF NOT EXISTS nurse_tasks (
        id VARCHAR(50) PRIMARY KEY,
        hospital_id VARCHAR(50) REFERENCES hospitals(id) ON DELETE CASCADE,
        bed VARCHAR(50) NOT NULL,
        patient_name VARCHAR(100) NOT NULL,
        task TEXT NOT NULL,
        scheduled_time VARCHAR(20) NOT NULL,
        priority VARCHAR(10) NOT NULL DEFAULT 'medium',
        completed BOOLEAN NOT NULL DEFAULT false,
        assigned_nurse_id VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
    await client.query(
      "ALTER TABLE nurse_tasks ADD COLUMN IF NOT EXISTS case_id VARCHAR(50) REFERENCES cases(id)",
    );
    await client.query(
      "ALTER TABLE nurse_tasks ADD COLUMN IF NOT EXISTS patient_id VARCHAR(50) REFERENCES patients(id)",
    );
    await client.query(
      `CREATE TABLE IF NOT EXISTS inventory_requests (id VARCHAR(50) PRIMARY KEY, hospital_id VARCHAR(50) NOT NULL REFERENCES hospitals(id), inventory_id VARCHAR(50) NOT NULL REFERENCES inventory(id), requested_by VARCHAR(50) REFERENCES users(id), status VARCHAR(20) NOT NULL DEFAULT 'Requested', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    );
    await client.query(
      "ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS dispensed_at TIMESTAMP",
    );
    await client.query(
      "ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS results JSONB",
    );
    await client.query(
      "ALTER TABLE beds ADD COLUMN IF NOT EXISTS case_id VARCHAR(50) REFERENCES cases(id) ON DELETE SET NULL",
    );
    const beds = await client.query(
      "SELECT * FROM beds WHERE status='occupied' AND patient_id IS NOT NULL AND case_id IS NULL FOR UPDATE",
    );
    for (const bed of beds.rows) {
      const id = newId("C");
      await client.query(
        `INSERT INTO cases (id,hospital_id,patient_id,case_number,type,status,assigned_doctor,chief_complaint) VALUES ($1,$2,$3,$4,'IPD','admitted',$5,'Existing admission imported; admission date and clinical details require review')`,
        [
          id,
          bed.hospital_id,
          bed.patient_id,
          `IPD-IMPORT-${id.slice(2, 10)}`,
          bed.assigned_doctor_id,
        ],
      );
      await client.query("UPDATE beds SET case_id=$1 WHERE id=$2", [
        id,
        bed.id,
      ]);
      await client.query(
        `INSERT INTO case_timeline (id,case_id,event_type,summary) VALUES ($1,$2,'migration','Existing occupied bed linked to an explicit admission. Original admission date is unknown.')`,
        [newId("CT"), id],
      );
    }
    await client.query(`CREATE TABLE IF NOT EXISTS consultation_notes (
    id VARCHAR(50) PRIMARY KEY, hospital_id VARCHAR(50) NOT NULL REFERENCES hospitals(id),
    appointment_id VARCHAR(50) UNIQUE REFERENCES appointments(id),
    case_id VARCHAR(50) REFERENCES cases(id), patient_id VARCHAR(50) NOT NULL REFERENCES patients(id),
    doctor_id VARCHAR(50) NOT NULL REFERENCES users(id), chief_complaint TEXT NOT NULL,
    diagnosis TEXT NOT NULL, clinical_notes TEXT NOT NULL DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
    await client.query(
      "ALTER TABLE consultation_notes ALTER COLUMN appointment_id DROP NOT NULL",
    );
    await client.query(
      "ALTER TABLE consultation_notes ADD COLUMN IF NOT EXISTS source_reference TEXT",
    );
    await client.query(
      `CREATE TABLE IF NOT EXISTS dispense_items (id VARCHAR(50) PRIMARY KEY, prescription_id VARCHAR(50) NOT NULL REFERENCES prescriptions(id), inventory_id VARCHAR(50) NOT NULL REFERENCES inventory(id), quantity INTEGER NOT NULL CHECK(quantity>0), unit_price NUMERIC(10,2) NOT NULL CHECK(unit_price>=0))`,
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_beds_case ON beds(case_id)",
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_appointments_hospital_time ON appointments(hospital_id,appointment_time)",
    );
  });
}
if (require.main === module)
  migrateWorkflows()
    .then(() => console.log("Workflow migration complete."))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
