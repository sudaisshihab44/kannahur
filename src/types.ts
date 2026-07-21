export enum UserRole {
  RECEPTIONIST = 'receptionist',
  ADMIN = 'admin'
}

export enum TokenStatus {
  WAITING = 'waiting',
  CALLED = 'called',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
  CANCELLED = 'cancelled'
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other'
}

export interface Department {
  id: string;
  name: string;
  prefix: string;
  description?: string;
  isEnabled?: boolean;
  defaultConsultationTime?: number;
}

export interface Doctor {
  id: string;
  name: string;
  departmentId: string;
  specialization: string;
  status: 'active' | 'inactive' | 'available' | 'busy' | 'break' | 'leave' | 'offline';
  roomNumber?: string;
  avgConsultationTime?: number;
  startTime?: string;
  endTime?: string;
  maxPatientsPerDay?: number;
  isEnabled?: boolean;
}

export interface Patient {
  id: string;
  name: string;
  mobile: string;
  email?: string;
  age: number;
  gender: Gender;
  createdAt: string;
}

export interface Token {
  id: string;
  tokenNumber: string;
  patientName: string;
  patientMobile: string;
  patientEmail?: string;
  patientAge: number;
  patientGender: Gender;
  departmentId: string;
  departmentName: string;
  doctorId: string;
  doctorName: string;
  reasonForVisit?: string;
  status: TokenStatus;
  createdAt: string;
  calledAt?: string;
  completedAt?: string;
  isEmergency: boolean;
  priority?: string;
  notes?: string;
  position: number;
  estimatedConsultationTime?: number;
  estimatedWaitTime?: number;
  expectedConsultationStartTime?: string;
  lastNotifiedWaitTime?: number;
  notifiedTwoRemaining?: boolean;
  notifiedYourTurn?: boolean;
  deviceId?: string;
}

export enum DeviceStatus {
  AVAILABLE = 'available',
  IN_USE = 'in_use',
  OFFLINE = 'offline',
  CHARGING = 'charging'
}

export interface TrackingDevice {
  id: string;
  deviceCode: string;
  name?: string;
  status: DeviceStatus;
  assignedTokenId?: string;
  assignedTokenNumber?: string;
  batteryLevel?: number;
  lastSeenAt?: string;
}

export interface WhatsAppLog {
  id: string;
  tokenId: string;
  tokenNumber: string;
  patientName: string;
  patientMobile: string;
  message: string;
  timestamp: string;
  type: 'welcome' | 'update' | 'two_remaining' | 'your_turn';
}

export interface ConsultationRoom {
  id: string;
  roomNumber: string;
  roomName: string;
  assignedDoctorId?: string;
  departmentId?: string;
  status: 'available' | 'occupied' | 'maintenance' | 'inactive';
  displayScreenId?: string;
}

export interface QueueLog {
  id: string;
  tokenId: string;
  tokenNumber: string;
  action: 'created' | 'called' | 'completed' | 'skipped' | 'cancelled' | 'recalled' | 'assigned_depts';
  userId?: string;
  timestamp: string;
}

export interface ReceptionUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  departmentId?: string; // Optional assignment
  assignedDepartmentIds?: string[];
  permissions?: string[];
  password?: string;
  isActive?: boolean;
}

export interface HospitalInfo {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  logoColor: string;
  logoUrl?: string;
  workingHours?: string;
  queueOperatingHours?: string;
  registrationNumber?: string;
  email?: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
  website?: string;
  description?: string;
  emergencyContact?: string;
}

export interface QueueConfig {
  tokenPrefix?: string;
  dailyTokenReset?: boolean;
  queueStartNumber?: number;
  emergencyQueue?: boolean;
  walkInQueue?: boolean;
  maxQueueSize?: number;
  defaultWaitingTime?: number;
  numberFormat?: string;
  maxDailyTokens?: number;
  emergencyTokenPrefix?: string;
  vipTokenPrefix?: string;
  walkInTokenPrefix?: string;
  consultationStartTime?: string;
  consultationEndTime?: string;
  autoSkipTimeout?: number;
  maxWaitingTime?: number;
  minWaitTimeNotificationThreshold?: number;
  enableWhatsAppUpdates?: boolean;
}

export interface Announcement {
  id: string;
  text: string;
  createdAt: string;
}

export interface QueueSettings {
  isPaused: boolean;
  hospitalInfo: HospitalInfo;
  announcements: Announcement[];
  config?: QueueConfig;
}

export interface QueueStats {
  waitingCount: number;
  completedCount: number;
  skippedCount: number;
  emergencyCount: number;
  avgWaitMinutes: number;
  totalToday: number;
}
