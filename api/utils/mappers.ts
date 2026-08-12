/**
 * api/utils/mappers.ts
 *
 * Database row → TypeScript type mappers.
 * Moved from api/_lib/mappers.ts during enterprise refactor.
 */
import type {
  Department, Doctor, Patient, Token, ConsultationRoom,
  ReceptionUser, QueueLog, TrackingDevice, QueueSettings,
} from "../../src/types/index.js";
import { TokenStatus, Gender, UserRole, DeviceStatus } from "../../src/types/index.js";

export function mapDept(r: any): Department {
  return {
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    description: r.description,
    isEnabled: r.is_enabled,
    defaultConsultationTime: r.default_consultation_time,
  };
}

export function mapDoctor(r: any): Doctor {
  return {
    id: r.id,
    name: r.name,
    departmentId: r.department_id,
    specialization: r.specialization,
    status: r.status,
    roomNumber: r.room_number,
    avgConsultationTime: r.avg_consultation_time,
    startTime: r.start_time,
    endTime: r.end_time,
    maxPatientsPerDay: r.max_patients_per_day,
    isEnabled: r.is_enabled,
  };
}

export function mapPatient(r: any): Patient {
  return {
    id: r.id,
    name: r.name,
    mobile: r.mobile,
    email: r.email,
    age: r.age,
    gender: r.gender as Gender,
    createdAt: r.created_at,
  };
}

export function mapToken(r: any): Token {
  return {
    id: r.id,
    tokenNumber: r.token_number,
    patientName: r.patient_name,
    patientMobile: r.patient_mobile,
    patientEmail: r.patient_email,
    patientAge: r.patient_age,
    patientGender: r.patient_gender as Gender,
    departmentId: r.department_id,
    departmentName: r.department_name,
    doctorId: r.doctor_id,
    doctorName: r.doctor_name,
    reasonForVisit: r.reason_for_visit,
    status: r.status as TokenStatus,
    createdAt: r.created_at,
    calledAt: r.called_at,
    completedAt: r.completed_at,
    isEmergency: r.is_emergency,
    priority: r.priority,
    notes: r.notes,
    position: r.position,
    estimatedConsultationTime: r.estimated_consultation_time,
    estimatedWaitTime: r.estimated_wait_time,
    expectedConsultationStartTime: r.expected_consultation_start_time,
    lastNotifiedWaitTime: r.last_notified_wait_time,
    notifiedTwoRemaining: r.notified_two_remaining,
    notifiedYourTurn: r.notified_your_turn,
    deviceId: r.device_id,
  };
}

export function mapRoom(r: any): ConsultationRoom {
  return {
    id: r.id,
    roomNumber: r.room_number,
    roomName: r.room_name,
    assignedDoctorId: r.assigned_doctor_id,
    departmentId: r.department_id,
    status: r.status,
    displayScreenId: r.display_screen_id,
  };
}

export function mapUser(r: any): ReceptionUser {
  return {
    id: r.id,
    username: r.username,
    name: r.name,
    role: r.role as UserRole,
    departmentId: r.department_id,
    assignedDepartmentIds: r.assigned_department_ids || [],
    permissions: r.permissions || [],
    password: r.password,
    isActive: r.is_active,
  };
}

export function mapQueueLog(r: any): QueueLog {
  return {
    id: r.id,
    tokenId: r.token_id,
    tokenNumber: r.token_number,
    action: r.action,
    userId: r.user_id,
    timestamp: r.timestamp,
  };
}

export function mapDevice(r: any): TrackingDevice {
  return {
    id: r.id,
    deviceCode: r.device_code,
    name: r.name,
    status: r.status as DeviceStatus,
    assignedTokenId: r.assigned_token_id,
    assignedTokenNumber: r.assigned_token_number,
    batteryLevel: r.battery_level,
    lastSeenAt: r.last_seen_at,
  };
}

export function mapSettings(r: any): QueueSettings {
  return {
    isPaused: r.is_paused,
    hospitalInfo: r.hospital_info,
    announcements: r.announcements || [],
    config: r.config,
  };
}
