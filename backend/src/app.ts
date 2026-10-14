import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Import routes
import authRouter from './routes/auth.routes';
import patientsRouter from './routes/patients.routes';
import doctorsRouter from './routes/doctors.routes';
import departmentsRouter from './routes/departments.routes';
import appointmentsRouter from './routes/appointments.routes';
import bedsRouter from './routes/beds.routes';
import prescriptionsRouter from './routes/prescriptions.routes';
import labOrdersRouter from './routes/lab-orders.routes';
import vitalsRouter from './routes/vitals.routes';
import billingRouter from './routes/billing.routes';
import auditRouter from './routes/audit.routes';
import aiRouter from './routes/ai.routes';
import consultationRouter from './routes/consultation.routes';
import dashboardRouter from './routes/dashboard.routes';
import overviewRouter from './routes/overview.routes';
import hospitalRouter from './routes/hospital.routes';
import staffRouter from './routes/staff.routes';
import casesRouter from './routes/case.routes';
import inventoryRouter from './routes/inventory.routes';
import nurseTasksRouter from './routes/nurse-tasks.routes';

dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();

// Configure CORS
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:4200';
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:') || origin === corsOrigin) {
      return callback(null, true);
    }
    const ipPattern = /^http:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/;
    if (ipPattern.test(origin)) {
      return callback(null, true);
    }
    callback(null, true);
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Register routes
app.use('/api/auth', authRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/doctors', doctorsRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/beds', bedsRouter);
app.use('/api/prescriptions', prescriptionsRouter);
app.use('/api/lab-orders', labOrdersRouter);
app.use('/api/vitals', vitalsRouter);
app.use('/api/billing', billingRouter);
app.use('/api/audit-logs', auditRouter);
app.use('/api/ai', aiRouter);
app.use('/api/consultations', consultationRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/overview', overviewRouter);
app.use('/api/hospitals', hospitalRouter);
app.use('/api/staff', staffRouter);
app.use('/api/cases', casesRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/nurse-tasks', nurseTasksRouter);

// Health Check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'MediSync AI Backend is healthy.',
    timestamp: new Date()
  });
});

// Centralized Error Handling Middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (!err.status || err.status >= 500) console.error('Express Error Handler caught:', err);
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({
    success: false,
    message,
    errorCode: err.code || 'INTERNAL_SERVER_ERROR'
  });
});

export default app;
