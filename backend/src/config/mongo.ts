import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/medisync_logs';

export const connectMongo = async (): Promise<void> => {
  try {
    await mongoose.connect(mongoURI);
    console.log('MongoDB: Connected successfully.');
  } catch (error: any) {
    console.error('MongoDB: Connection failed.');
    console.error('Ensure MongoDB is running locally via: brew services start mongodb-community');
    console.error(error.message);
  }
};
