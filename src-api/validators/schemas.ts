/**
 * api/validators/schemas.ts
 *
 * Validation schemas for all API endpoints.
 * Ensures type safety and input validation.
 */
import {
  validateUsername,
  validatePassword,
  validateEmail,
  validateUUID,
  validateInteger,
  validatePhoneNumber,
  validateEnum,
  validateBoolean,
  validateTextLength,
  validateObjectKeys,
  ValidationError,
} from '../utils/validation.js';

/**
 * Login request validation
 */
export interface LoginRequest {
  username: string;
  password: string;
  portal: 'admin' | 'reception';
}

export function validateLoginRequest(body: any): LoginRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('body', 'Request body must be a JSON object', 'INVALID_BODY');
  }
  
  validateObjectKeys(body, ['username', 'password', 'portal']);
  
  return {
    username: validateUsername(body.username),
    password: validatePassword(body.password),
    portal: validateEnum(body.portal, ['admin', 'reception'] as const, 'portal'),
  };
}

/**
 * Create patient request validation
 */
export interface CreatePatientRequest {
  name: string;
  age: number;
  gender?: string;
  phone?: string;
  departmentId: string;
  priority?: string;
}

export function validateCreatePatientRequest(body: any): CreatePatientRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('body', 'Request body must be a JSON object', 'INVALID_BODY');
  }
  
  const allowedKeys = ['name', 'age', 'gender', 'phone', 'departmentId', 'priority'];
  validateObjectKeys(body, allowedKeys);
  
  const validated: CreatePatientRequest = {
    name: validateTextLength(body.name, 1, 100, 'name'),
    age: validateInteger(body.age, 'age', 0, 150),
    departmentId: validateUUID(body.departmentId, 'departmentId'),
  };
  
  if (body.gender) {
    validated.gender = validateEnum(
      body.gender,
      ['male', 'female', 'other'] as const,
      'gender'
    );
  }
  
  if (body.phone) {
    validated.phone = validatePhoneNumber(body.phone);
  }
  
  if (body.priority) {
    validated.priority = validateEnum(
      body.priority,
      ['normal', 'urgent', 'emergency'] as const,
      'priority'
    );
  }
  
  return validated;
}

/**
 * Create token request validation
 */
export interface CreateTokenRequest {
  patientId: string;
  departmentId: string;
  doctorId?: string;
  priority?: string;
}

export function validateCreateTokenRequest(body: any): CreateTokenRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('body', 'Request body must be a JSON object', 'INVALID_BODY');
  }
  
  const allowedKeys = ['patientId', 'departmentId', 'doctorId', 'priority'];
  validateObjectKeys(body, allowedKeys);
  
  const validated: CreateTokenRequest = {
    patientId: validateUUID(body.patientId, 'patientId'),
    departmentId: validateUUID(body.departmentId, 'departmentId'),
  };
  
  if (body.doctorId) {
    validated.doctorId = validateUUID(body.doctorId, 'doctorId');
  }
  
  if (body.priority) {
    validated.priority = validateEnum(
      body.priority,
      ['normal', 'urgent', 'emergency'] as const,
      'priority'
    );
  }
  
  return validated;
}

/**
 * Create doctor request validation
 */
export interface CreateDoctorRequest {
  name: string;
  specialization: string;
  departmentId: string;
  consultationTime?: number;
  isActive?: boolean;
}

export function validateCreateDoctorRequest(body: any): CreateDoctorRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('body', 'Request body must be a JSON object', 'INVALID_BODY');
  }
  
  const allowedKeys = ['name', 'specialization', 'departmentId', 'consultationTime', 'isActive'];
  validateObjectKeys(body, allowedKeys);
  
  const validated: CreateDoctorRequest = {
    name: validateTextLength(body.name, 1, 100, 'name'),
    specialization: validateTextLength(body.specialization, 1, 100, 'specialization'),
    departmentId: validateUUID(body.departmentId, 'departmentId'),
  };
  
  if (body.consultationTime !== undefined) {
    validated.consultationTime = validateInteger(body.consultationTime, 'consultationTime', 1, 120);
  }
  
  if (body.isActive !== undefined) {
    validated.isActive = validateBoolean(body.isActive, 'isActive');
  }
  
  return validated;
}

/**
 * Create department request validation
 */
export interface CreateDepartmentRequest {
  name: string;
  description?: string;
  floor?: number;
  isActive?: boolean;
}

export function validateCreateDepartmentRequest(body: any): CreateDepartmentRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('body', 'Request body must be a JSON object', 'INVALID_BODY');
  }
  
  const allowedKeys = ['name', 'description', 'floor', 'isActive'];
  validateObjectKeys(body, allowedKeys);
  
  const validated: CreateDepartmentRequest = {
    name: validateTextLength(body.name, 1, 100, 'name'),
  };
  
  if (body.description) {
    validated.description = validateTextLength(body.description, 0, 500, 'description');
  }
  
  if (body.floor !== undefined) {
    validated.floor = validateInteger(body.floor, 'floor', -5, 100);
  }
  
  if (body.isActive !== undefined) {
    validated.isActive = validateBoolean(body.isActive, 'isActive');
  }
  
  return validated;
}

/**
 * Create room request validation
 */
export interface CreateRoomRequest {
  name: string;
  departmentId: string;
  floor?: number;
  capacity?: number;
  isActive?: boolean;
}

export function validateCreateRoomRequest(body: any): CreateRoomRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('body', 'Request body must be a JSON object', 'INVALID_BODY');
  }
  
  const allowedKeys = ['name', 'departmentId', 'floor', 'capacity', 'isActive'];
  validateObjectKeys(body, allowedKeys);
  
  const validated: CreateRoomRequest = {
    name: validateTextLength(body.name, 1, 100, 'name'),
    departmentId: validateUUID(body.departmentId, 'departmentId'),
  };
  
  if (body.floor !== undefined) {
    validated.floor = validateInteger(body.floor, 'floor', -5, 100);
  }
  
  if (body.capacity !== undefined) {
    validated.capacity = validateInteger(body.capacity, 'capacity', 1, 1000);
  }
  
  if (body.isActive !== undefined) {
    validated.isActive = validateBoolean(body.isActive, 'isActive');
  }
  
  return validated;
}

/**
 * Create staff request validation
 */
export interface CreateStaffRequest {
  username: string;
  password: string;
  fullName: string;
  role: 'admin' | 'receptionist';
  email?: string;
  phone?: string;
}

export function validateCreateStaffRequest(body: any): CreateStaffRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('body', 'Request body must be a JSON object', 'INVALID_BODY');
  }
  
  const allowedKeys = ['username', 'password', 'fullName', 'role', 'email', 'phone'];
  validateObjectKeys(body, allowedKeys);
  
  const validated: CreateStaffRequest = {
    username: validateUsername(body.username),
    password: validatePassword(body.password),
    fullName: validateTextLength(body.fullName, 1, 100, 'fullName'),
    role: validateEnum(body.role, ['admin', 'receptionist'] as const, 'role'),
  };
  
  if (body.email) {
    validated.email = validateEmail(body.email);
  }
  
  if (body.phone) {
    validated.phone = validatePhoneNumber(body.phone);
  }
  
  return validated;
}

/**
 * Update queue config request validation
 */
export interface UpdateQueueConfigRequest {
  isPaused?: boolean;
  announcementMessage?: string;
  autoCallEnabled?: boolean;
  maxConcurrentTokens?: number;
}

export function validateUpdateQueueConfigRequest(body: any): UpdateQueueConfigRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('body', 'Request body must be a JSON object', 'INVALID_BODY');
  }
  
  const allowedKeys = ['isPaused', 'announcementMessage', 'autoCallEnabled', 'maxConcurrentTokens'];
  validateObjectKeys(body, allowedKeys);
  
  const validated: UpdateQueueConfigRequest = {};
  
  if (body.isPaused !== undefined) {
    validated.isPaused = validateBoolean(body.isPaused, 'isPaused');
  }
  
  if (body.announcementMessage !== undefined) {
    validated.announcementMessage = validateTextLength(body.announcementMessage, 0, 500, 'announcementMessage');
  }
  
  if (body.autoCallEnabled !== undefined) {
    validated.autoCallEnabled = validateBoolean(body.autoCallEnabled, 'autoCallEnabled');
  }
  
  if (body.maxConcurrentTokens !== undefined) {
    validated.maxConcurrentTokens = validateInteger(body.maxConcurrentTokens, 'maxConcurrentTokens', 1, 100);
  }
  
  return validated;
}

/**
 * Announcement request validation
 */
export interface AnnouncementRequest {
  message: string;
  type?: 'info' | 'warning' | 'success' | 'error';
  duration?: number;
}

export function validateAnnouncementRequest(body: any): AnnouncementRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('body', 'Request body must be a JSON object', 'INVALID_BODY');
  }
  
  const allowedKeys = ['message', 'type', 'duration'];
  validateObjectKeys(body, allowedKeys);
  
  const validated: AnnouncementRequest = {
    message: validateTextLength(body.message, 1, 500, 'message'),
  };
  
  if (body.type) {
    validated.type = validateEnum(
      body.type,
      ['info', 'warning', 'success', 'error'] as const,
      'type'
    );
  }
  
  if (body.duration !== undefined) {
    validated.duration = validateInteger(body.duration, 'duration', 1000, 60000);
  }
  
  return validated;
}

/**
 * Device assignment request validation
 */
export interface DeviceAssignmentRequest {
  deviceId: string;
  departmentId: string;
  displayType?: 'queue' | 'token' | 'both';
}

export function validateDeviceAssignmentRequest(body: any): DeviceAssignmentRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('body', 'Request body must be a JSON object', 'INVALID_BODY');
  }
  
  const allowedKeys = ['deviceId', 'departmentId', 'displayType'];
  validateObjectKeys(body, allowedKeys);
  
  const validated: DeviceAssignmentRequest = {
    deviceId: validateUUID(body.deviceId, 'deviceId'),
    departmentId: validateUUID(body.departmentId, 'departmentId'),
  };
  
  if (body.displayType) {
    validated.displayType = validateEnum(
      body.displayType,
      ['queue', 'token', 'both'] as const,
      'displayType'
    );
  }
  
  return validated;
}
