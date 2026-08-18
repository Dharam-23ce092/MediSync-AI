import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Ensure env variables are loaded
dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectionString = process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString,
});

export const connectPostgres = async (): Promise<void> => {
  try {
    const client = await pool.connect();
    console.log('PostgreSQL: Connected successfully.');
    client.release();
  } catch (error: any) {
    console.error('PostgreSQL: Connection failed.');
    console.error(`Please ensure PostgreSQL is running and you have run the setup script: 'npm run setup-db'`);
    console.error(error.message);
    // Don't kill process immediately on start in dev mode to allow running setup scripts
  }
};
