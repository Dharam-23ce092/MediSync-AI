import app from './app';
import { connectPostgres } from './config/postgres';
import { connectMongo } from './config/mongo';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  console.log('Starting MediSync AI Backend Services...');

  // Connect Databases
  await connectPostgres();
  await connectMongo();

  app.listen(PORT, () => {
    console.log(`MediSync AI Backend is running on port ${PORT}`);
  });
};

startServer();
