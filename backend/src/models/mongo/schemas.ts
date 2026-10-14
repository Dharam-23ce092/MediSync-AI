import mongoose, { Schema, Document } from 'mongoose';

// Audit Log Model
export interface IAuditLog extends Document {
  timestamp: Date;
  userId: string;
  userName: string;
  role: string;
  event: string;
  module: string;
  ipAddress: string;
  severity: 'info' | 'warning' | 'critical';
}

const AuditLogSchema: Schema = new Schema({
  hospital_id: { type: String, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  role: { type: String, required: true },
  event: { type: String, required: true },
  module: { type: String, required: true },
  ipAddress: { type: String, required: true },
  severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' }
});

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

// System Log Model
export interface ISystemLog extends Document {
  timestamp: Date;
  level: string;
  message: string;
  errorDetails?: string;
  stackTrace?: string;
}

const SystemLogSchema: Schema = new Schema({
  timestamp: { type: Date, default: Date.now, index: true },
  level: { type: String, required: true },
  message: { type: String, required: true },
  errorDetails: { type: String },
  stackTrace: { type: String }
});

export const SystemLog = mongoose.model<ISystemLog>('SystemLog', SystemLogSchema);

// Vital History Model
export interface IVitalHistory extends Document {
  uhid: string;
  hr: number;
  bp: string;
  temp: number;
  spo2: number;
  status: 'normal' | 'warning' | 'critical';
  notes?: string;
  recordedBy: string;
  recordedAt: Date;
}

const VitalHistorySchema: Schema = new Schema({
  hospital_id: { type: String, index: true },
  patient_id: { type: String, index: true },
  case_id: { type: String, index: true },
  uhid: { type: String, required: true, index: true },
  hr: { type: Number, required: true },
  bp: { type: String, required: true },
  temp: { type: Number, required: true },
  spo2: { type: Number, required: true },
  status: { type: String, enum: ['normal', 'warning', 'critical'], required: true },
  notes: { type: String },
  recordedBy: { type: String, required: true },
  recordedAt: { type: Date, default: Date.now, index: true }
});

export const VitalHistory = mongoose.model<IVitalHistory>('VitalHistory', VitalHistorySchema);

// Consultation Note Model
export interface IConsultationNote extends Document {
  appointmentId: string;
  patientUhid: string;
  doctorId: string;
  chiefComplaint: string;
  diagnosis: string;
  clinicalNotes: string;
  createdAt: Date;
}

const ConsultationNoteSchema: Schema = new Schema({
  appointmentId: { type: String, required: true, index: true },
  patientUhid: { type: String, required: true, index: true },
  doctorId: { type: String, required: true },
  chiefComplaint: { type: String, required: true },
  diagnosis: { type: String, required: true },
  clinicalNotes: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

export const ConsultationNote = mongoose.model<IConsultationNote>('ConsultationNote', ConsultationNoteSchema);

// Lab Result Model
export interface ILabResult extends Document {
  labOrderId: string;
  patientUhid: string;
  results: {
    hb?: number;
    wbc?: number;
    chol?: number;
    trig?: number;
    [key: string]: any;
  };
  completedAt: Date;
}

const LabResultSchema: Schema = new Schema({
  labOrderId: { type: String, required: true, unique: true },
  patientUhid: { type: String, required: true, index: true },
  results: { type: Schema.Types.Mixed, required: true },
  completedAt: { type: Date, default: Date.now }
});

export const LabResult = mongoose.model<ILabResult>('LabResult', LabResultSchema);

// AI Chat Session Model
export interface IChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
}

export interface IAIChatSession extends Document {
  doctorId: string;
  patientUhid?: string;
  messages: IChatMessage[];
  sources?: string[];
  confidence?: number;
  createdAt: Date;
}

const AIChatSessionSchema: Schema = new Schema({
  doctorId: { type: String, required: true, index: true },
  patientUhid: { type: String, index: true },
  messages: [{
    role: { type: String, enum: ['user', 'model'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
  }],
  sources: [{ type: String }],
  confidence: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

export const AIChatSession = mongoose.model<IAIChatSession>('AIChatSession', AIChatSessionSchema);
