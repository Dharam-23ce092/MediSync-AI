import { Client, Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectionString = process.env.DATABASE_URL || 'postgresql://medisync:medisync_secret@localhost:5432/medisync_db';

const setup = async () => {
  if (process.env.RESET_DATABASE !== 'true') {
    console.error('Setup resets all data. Use npm run migrate for an existing database. Set RESET_DATABASE=true only for an intentional reset.');
    process.exitCode = 1;
    return;
  }
  console.log('Starting MediSync AI Database Setup...');

  // 1. Try to connect to postgres root to ensure database exists
  const dbNameMatch = connectionString.match(/\/([a-zA-Z0-9_\-]+)(?:\?.*)?$/);
  const targetDbName = dbNameMatch ? dbNameMatch[1] : 'medisync_db';

  const rootConnectionString = connectionString.replace(new RegExp(`/${targetDbName}(?:\\?.*)?$`), '/postgres');

  console.log(`Checking if database "${targetDbName}" exists...`);
  const rootClient = new Client({ connectionString: rootConnectionString });
  try {
    await rootClient.connect();
    const res = await rootClient.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [targetDbName]);
    if (res.rowCount === 0) {
      console.log(`Database "${targetDbName}" does not exist. Creating it...`);
      await rootClient.query(`CREATE DATABASE ${targetDbName}`);
      console.log(`Database "${targetDbName}" created successfully.`);
    } else {
      console.log(`Database "${targetDbName}" already exists.`);
    }
  } catch (err: any) {
    console.error(`Could not connect to root PostgreSQL server to verify/create target database.`);
    console.error(`Please ensure PostgreSQL is running and your connection details in .env are correct.`);
    console.error(`Error details: ${err.message}`);
  } finally {
    await rootClient.end().catch(() => {});
  }

  // 2. Connect to the target database and create the schema
  console.log(`Connecting to target database "${targetDbName}" to build schema...`);
  const pool = new Pool({ connectionString });

  try {
    const client = await pool.connect();

    // Drop existing tables to ensure clean schema rebuild
    console.log('Dropping existing tables...');
    await client.query('DROP TABLE IF EXISTS nurse_tasks, inventory, payments, invoice_items, billing, lab_orders, prescriptions, beds, appointments, case_timeline, cases, doctors, users, patients, departments, hospitals CASCADE');

    // Create Tables
    console.log('Creating hospitals table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS hospitals (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        domain VARCHAR(100),
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(100),
        phone VARCHAR(20),
        license_no VARCHAR(100),
        logo_url TEXT,
        status VARCHAR(20) DEFAULT 'active',
        plan VARCHAR(20) DEFAULT 'basic',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating departments table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id VARCHAR(50) PRIMARY KEY,
        hospital_id VARCHAR(50) REFERENCES hospitals(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(20) UNIQUE NOT NULL,
        description TEXT
      )
    `);

    console.log('Creating users table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        hospital_id VARCHAR(50) REFERENCES hospitals(id) ON DELETE SET NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        role VARCHAR(30) NOT NULL,
        specialty VARCHAR(100),
        department_id VARCHAR(50) REFERENCES departments(id) ON DELETE SET NULL,
        employee_id VARCHAR(50),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating patients table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id VARCHAR(50) PRIMARY KEY,
        hospital_id VARCHAR(50) REFERENCES hospitals(id) ON DELETE CASCADE,
        user_id VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
        uhid VARCHAR(50) NOT NULL,
        name VARCHAR(100) NOT NULL,
        age INT NOT NULL,
        gender VARCHAR(20) NOT NULL,
        blood_group VARCHAR(10) NOT NULL,
        emergency_contact VARCHAR(50) NOT NULL,
        allergies TEXT,
        status VARCHAR(20) DEFAULT 'OPD',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(hospital_id, uhid)
      )
    `);

    console.log('Creating doctors table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS doctors (
        id VARCHAR(50) PRIMARY KEY,
        hospital_id VARCHAR(50) REFERENCES hospitals(id) ON DELETE CASCADE,
        user_id VARCHAR(50) UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        department_id VARCHAR(50) REFERENCES departments(id) ON DELETE SET NULL,
        availability_status VARCHAR(20) DEFAULT 'Available',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating cases table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS cases (
        id VARCHAR(50) PRIMARY KEY,
        hospital_id VARCHAR(50) NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
        patient_id VARCHAR(50) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        case_number VARCHAR(50) NOT NULL,
        type VARCHAR(20) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'registered',
        assigned_doctor VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
        chief_complaint TEXT,
        diagnosis TEXT,
        admission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        discharge_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(hospital_id, case_number)
      )
    `);

    console.log('Creating case_timeline table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS case_timeline (
        id VARCHAR(50) PRIMARY KEY,
        case_id VARCHAR(50) NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        actor_id VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
        actor_role VARCHAR(30),
        summary TEXT NOT NULL,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating appointments table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id VARCHAR(50) PRIMARY KEY,
        hospital_id VARCHAR(50) REFERENCES hospitals(id) ON DELETE CASCADE,
        case_id VARCHAR(50) REFERENCES cases(id) ON DELETE SET NULL,
        patient_id VARCHAR(50) REFERENCES patients(id) ON DELETE CASCADE,
        doctor_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(20) NOT NULL,
        appointment_time TIMESTAMP NOT NULL,
        type VARCHAR(20) NOT NULL,
        status VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating beds table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS beds (
        id VARCHAR(50) PRIMARY KEY,
        hospital_id VARCHAR(50) REFERENCES hospitals(id) ON DELETE CASCADE,
        name VARCHAR(50) NOT NULL,
        type VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'available',
        patient_id VARCHAR(50) REFERENCES patients(id) ON DELETE SET NULL,
        assigned_doctor_id VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    console.log('Creating prescriptions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS prescriptions (
        id VARCHAR(50) PRIMARY KEY,
        hospital_id VARCHAR(50) REFERENCES hospitals(id) ON DELETE CASCADE,
        case_id VARCHAR(50) REFERENCES cases(id) ON DELETE SET NULL,
        patient_id VARCHAR(50) REFERENCES patients(id) ON DELETE CASCADE,
        doctor_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
        drug_details TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'Pending',
        date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating lab_orders table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS lab_orders (
        id VARCHAR(50) PRIMARY KEY,
        hospital_id VARCHAR(50) REFERENCES hospitals(id) ON DELETE CASCADE,
        case_id VARCHAR(50) REFERENCES cases(id) ON DELETE SET NULL,
        patient_id VARCHAR(50) REFERENCES patients(id) ON DELETE CASCADE,
        doctor_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
        test_name VARCHAR(100) NOT NULL,
        specimen VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'Received',
        results JSONB,
        date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating billing table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS billing (
        id VARCHAR(50) PRIMARY KEY,
        hospital_id VARCHAR(50) REFERENCES hospitals(id) ON DELETE CASCADE,
        case_id VARCHAR(50) REFERENCES cases(id) ON DELETE SET NULL,
        patient_id VARCHAR(50) REFERENCES patients(id) ON DELETE CASCADE,
        invoice_number VARCHAR(50) UNIQUE NOT NULL,
        subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        discount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        tax DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        total DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        paid DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        balance DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating invoice_items table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id VARCHAR(50) PRIMARY KEY,
        billing_id VARCHAR(50) REFERENCES billing(id) ON DELETE CASCADE,
        description VARCHAR(255) NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        unit_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        total_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00
      )
    `);

    console.log('Creating payments table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id VARCHAR(50) PRIMARY KEY,
        billing_id VARCHAR(50) REFERENCES billing(id) ON DELETE CASCADE,
        amount DECIMAL(10, 2) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        transaction_reference VARCHAR(100),
        status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Creating inventory table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory (
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
      )
    `);

    console.log('Creating nurse_tasks table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS nurse_tasks (
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
      )
    `);

    // Create Indexes
    console.log('Creating indexes...');
    await client.query(`CREATE INDEX IF NOT EXISTS idx_patients_uhid ON patients(uhid)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(name)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_beds_status ON beds(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lab_orders_patient ON lab_orders(patient_id)`);

    console.log('All relational tables and indexes created successfully!');
    client.release();
  } catch (err: any) {
    console.error('Error establishing PostgreSQL schema:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

setup();
