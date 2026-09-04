/**
 * api/services/adminService.ts
 *
 * Business logic for admin CRUD operations: doctors, departments, rooms, users, settings.
 * Orchestrates repositories, validation, and audit logging.
 */
import {
  insertDoctor,
  updateDoctor,
  deleteDoctor,
  findDoctorById,
  insertDepartment,
  updateDepartment,
  deleteDepartment,
  isPrefixTaken,
  insertRoom,
  updateRoom,
  deleteRoom,
  insertUser,
  updateUser,
  deleteUser,
  isUsernameTaken,
  findUserById,
  findDepartmentNamesByIds,
} from '../repositories/userRepository.js';
import { getSettings, updateSettings } from '../repositories/settingsRepository.js';
import { addAuditLog } from './queueService.js';
import { mapDoctor, mapDept, mapRoom, mapUser } from '../utils/mappers.js';
import { UserRole } from '../../src/types/index.js';

// ── Doctors ───────────────────────────────────────────────────────────────────

export async function createDoctor(data: any) {
  const { name, departmentId, specialization, status, roomNumber, avgConsultationTime, startTime, endTime, maxPatientsPerDay, isEnabled } = data;
  if (!name || !departmentId) {
    return { success: false, message: 'Doctor name and department are required' };
  }
  const newDoc = {
    id: `doc-${Date.now()}`,
    name: name.trim(),
    department_id: departmentId,
    specialization: (specialization || 'General').trim(),
    status: status || 'active',
    room_number: (roomNumber || '').trim(),
    avg_consultation_time: parseInt(avgConsultationTime) || 15,
    start_time: startTime || '08:00',
    end_time: endTime || '17:00',
    max_patients_per_day: parseInt(maxPatientsPerDay) || 40,
    is_enabled: isEnabled !== undefined ? isEnabled : true,
  };
  const inserted = await insertDoctor(newDoc);
  if (!inserted) {
    return { success: false, message: 'Failed to create doctor' };
  }
  return { success: true, doctor: mapDoctor(inserted) };
}

export async function modifyDoctor(id: string, data: any) {
  const { name, departmentId, specialization, status, roomNumber, avgConsultationTime, startTime, endTime, maxPatientsPerDay, isEnabled } = data;
  const updates: any = {};
  if (name) updates.name = name.trim();
  if (departmentId) updates.department_id = departmentId;
  if (specialization) updates.specialization = specialization.trim();
  if (status) updates.status = status;
  if (roomNumber !== undefined) updates.room_number = roomNumber.trim();
  if (avgConsultationTime !== undefined) updates.avg_consultation_time = parseInt(avgConsultationTime) || 15;
  if (startTime !== undefined) updates.start_time = startTime;
  if (endTime !== undefined) updates.end_time = endTime;
  if (maxPatientsPerDay !== undefined) updates.max_patients_per_day = parseInt(maxPatientsPerDay) || 40;
  if (isEnabled !== undefined) updates.is_enabled = isEnabled;

  const updated = await updateDoctor(id, updates);
  if (!updated) {
    return { success: false, message: 'Doctor not found' };
  }
  return { success: true, doctor: mapDoctor(updated) };
}

export async function removeDoctor(id: string) {
  await deleteDoctor(id);
  return { success: true };
}

export async function toggleDoctorStatus(id: string) {
  const row = await findDoctorById(id);
  if (!row) {
    return { success: false, message: 'Doctor not found' };
  }
  const newStatus = row.status === 'active' ? 'inactive' : 'active';
  const updated = await updateDoctor(id, { status: newStatus });
  if (!updated) {
    return { success: false, message: 'Failed to toggle' };
  }
  return { success: true, doctor: mapDoctor(updated) };
}

// ── Departments ───────────────────────────────────────────────────────────────

export async function createDepartment(data: any) {
  const { name, prefix, description, isEnabled, defaultConsultationTime } = data;
  if (!name || !prefix) {
    return { success: false, message: 'Department name and prefix are required' };
  }
  const cleanPrefix = prefix.trim().toUpperCase();
  if (await isPrefixTaken(cleanPrefix)) {
    return { success: false, message: 'Department prefix already exists' };
  }
  const newDept = {
    id: `dep-${Date.now()}`,
    name: name.trim(),
    prefix: cleanPrefix,
    description: (description || '').trim(),
    is_enabled: isEnabled !== undefined ? isEnabled : true,
    default_consultation_time: defaultConsultationTime ? parseInt(defaultConsultationTime) : 15,
  };
  const inserted = await insertDepartment(newDept);
  if (!inserted) {
    return { success: false, message: 'Failed to create department' };
  }
  return { success: true, department: mapDept(inserted) };
}

export async function modifyDepartment(id: string, data: any) {
  const { name, prefix, description, isEnabled, defaultConsultationTime } = data;
  const updates: any = {};
  if (name) updates.name = name.trim();
  if (prefix) {
    const cleanPrefix = prefix.trim().toUpperCase();
    if (await isPrefixTaken(cleanPrefix, id)) {
      return { success: false, message: 'Department prefix already exists' };
    }
    updates.prefix = cleanPrefix;
  }
  if (description !== undefined) updates.description = description.trim();
  if (isEnabled !== undefined) updates.is_enabled = isEnabled;
  if (defaultConsultationTime !== undefined) updates.default_consultation_time = defaultConsultationTime ? parseInt(defaultConsultationTime) : 15;

  const updated = await updateDepartment(id, updates);
  if (!updated) {
    return { success: false, message: 'Department not found' };
  }
  return { success: true, department: mapDept(updated) };
}

export async function removeDepartment(id: string) {
  await deleteDepartment(id);
  return { success: true };
}

// ── Rooms ─────────────────────────────────────────────────────────────────────

export async function createRoom(data: any) {
  const { roomNumber, roomName, assignedDoctorId, departmentId, status, displayScreenId } = data;
  if (!roomNumber || !roomName) {
    return { success: false, message: 'Room number and name are required' };
  }
  const newRoom = {
    id: `rm-${Date.now()}`,
    room_number: roomNumber.trim(),
    room_name: roomName.trim(),
    assigned_doctor_id: assignedDoctorId || null,
    department_id: departmentId || null,
    status: status || 'available',
    display_screen_id: (displayScreenId || '').trim(),
  };
  const inserted = await insertRoom(newRoom);
  if (!inserted) {
    return { success: false, message: 'Failed to create room' };
  }
  return { success: true, room: mapRoom(inserted) };
}

export async function modifyRoom(id: string, data: any) {
  const { roomNumber, roomName, assignedDoctorId, departmentId, status, displayScreenId } = data;
  const updates: any = {};
  if (roomNumber) updates.room_number = roomNumber.trim();
  if (roomName) updates.room_name = roomName.trim();
  if (assignedDoctorId !== undefined) updates.assigned_doctor_id = assignedDoctorId;
  if (departmentId !== undefined) updates.department_id = departmentId;
  if (status) updates.status = status;
  if (displayScreenId !== undefined) updates.display_screen_id = displayScreenId.trim();

  const updated = await updateRoom(id, updates);
  if (!updated) {
    return { success: false, message: 'Room not found' };
  }
  return { success: true, room: mapRoom(updated) };
}

export async function removeRoom(id: string) {
  await deleteRoom(id);
  return { success: true };
}

// ── Users / Staff ─────────────────────────────────────────────────────────────

export async function createStaff(data: any, operatorUsername?: string) {
  const { username, name, role, departmentId, assignedDepartmentIds, permissions, password, isActive } = data;
  if (!username || !name || !role) {
    return { success: false, message: 'Username, name, and role are required' };
  }

  if (await isUsernameTaken(username.trim())) {
    return { success: false, message: 'Username already exists' };
  }

  const defaultPerms = role === UserRole.ADMIN
    ? ['manage_hospital', 'manage_doctors', 'manage_departments', 'manage_rooms', 'manage_staff', 'manage_config']
    : ['register_patient', 'generate_token', 'call_token', 'complete_token', 'skip_token', 'cancel_token', 'pause_queue'];

  const newUser = {
    id: `usr-${Date.now()}`,
    username: username.trim().toLowerCase(),
    name: name.trim(),
    role,
    department_id: departmentId || null,
    assigned_department_ids: assignedDepartmentIds || (departmentId ? [departmentId] : []),
    permissions: permissions || defaultPerms,
    password: password || 'password',
    is_active: isActive !== undefined ? isActive : true,
  };
  const inserted = await insertUser(newUser);
  if (!inserted) {
    return { success: false, message: 'Failed to create user' };
  }

  const user = mapUser(inserted);
  if (user.role === UserRole.RECEPTIONIST) {
    const depts = user.assignedDepartmentIds || [];
    const deptNames = (await findDepartmentNamesByIds(depts)).join(', ');
    await addAuditLog('assigned_depts', `Assigned Receptionist "${user.name}" to Departments: ${deptNames || 'None'}`, operatorUsername || 'admin');
  }
  return { success: true, user };
}

export async function modifyStaff(id: string, data: any, operatorUsername?: string) {
  const { username, name, role, departmentId, assignedDepartmentIds, permissions, password, isActive } = data;

  const existing = await findUserById(id);
  if (!existing) {
    return { success: false, message: 'Staff user not found' };
  }

  const oldUser = mapUser(existing);
  const updates: any = {};

  if (username) {
    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername !== oldUser.username) {
      if (await isUsernameTaken(cleanUsername, id)) {
        return { success: false, message: 'Username already exists' };
      }
    }
    updates.username = cleanUsername;
  }
  if (name) updates.name = name.trim();
  if (role) updates.role = role;
  if (departmentId !== undefined) updates.department_id = departmentId;
  if (assignedDepartmentIds !== undefined) updates.assigned_department_ids = assignedDepartmentIds;
  if (permissions !== undefined) updates.permissions = permissions;
  if (password) updates.password = password;
  if (isActive !== undefined) updates.is_active = isActive;

  const updated = await updateUser(id, updates);
  if (!updated) {
    return { success: false, message: 'Update failed' };
  }

  const user = mapUser(updated);
  if (user.role === UserRole.RECEPTIONIST && assignedDepartmentIds !== undefined) {
    const deptNames = (await findDepartmentNamesByIds(assignedDepartmentIds)).join(', ');
    await addAuditLog('assigned_depts', `Assigned Receptionist "${user.name}" to Departments: ${deptNames || 'None'}`, operatorUsername || 'admin');
  }
  return { success: true, user };
}

export async function removeStaff(id: string) {
  await deleteUser(id);
  return { success: true };
}

// ── Queue Config ──────────────────────────────────────────────────────────────

export async function updateQueueConfig(config: any) {
  const sanitized = { ...config };
  if (sanitized.tokenPrefix !== undefined) sanitized.tokenPrefix = sanitized.tokenPrefix.trim();
  if (sanitized.dailyTokenReset !== undefined) sanitized.dailyTokenReset = !!sanitized.dailyTokenReset;
  if (sanitized.queueStartNumber !== undefined) sanitized.queueStartNumber = parseInt(sanitized.queueStartNumber) || 1;
  if (sanitized.emergencyQueue !== undefined) sanitized.emergencyQueue = !!sanitized.emergencyQueue;
  if (sanitized.walkInQueue !== undefined) sanitized.walkInQueue = !!sanitized.walkInQueue;
  if (sanitized.maxQueueSize !== undefined) sanitized.maxQueueSize = parseInt(sanitized.maxQueueSize) || 100;
  if (sanitized.defaultWaitingTime !== undefined) sanitized.defaultWaitingTime = parseInt(sanitized.defaultWaitingTime) || 15;
  if (sanitized.maxDailyTokens !== undefined) sanitized.maxDailyTokens = parseInt(sanitized.maxDailyTokens) || 500;
  if (sanitized.autoSkipTimeout !== undefined) sanitized.autoSkipTimeout = parseInt(sanitized.autoSkipTimeout) || 180;
  if (sanitized.maxWaitingTime !== undefined) sanitized.maxWaitingTime = parseInt(sanitized.maxWaitingTime) || 120;
  if (sanitized.minWaitTimeNotificationThreshold !== undefined) sanitized.minWaitTimeNotificationThreshold = parseInt(sanitized.minWaitTimeNotificationThreshold) || 5;
  if (sanitized.enableWhatsAppUpdates !== undefined) sanitized.enableWhatsAppUpdates = !!sanitized.enableWhatsAppUpdates;

  await updateSettings({ config: sanitized });
  return { success: true, config: sanitized };
}

// ── Hospital Info ─────────────────────────────────────────────────────────────

export async function updateHospitalInfo(data: any) {
  const settings = await getSettings();
  const hospitalInfo = { ...(settings?.hospital_info || {}) };

  if (data.name !== undefined) hospitalInfo.name = data.name.trim();
  if (data.tagline !== undefined) hospitalInfo.tagline = data.tagline.trim();
  if (data.address !== undefined) hospitalInfo.address = data.address.trim();
  if (data.phone !== undefined) hospitalInfo.phone = data.phone.trim();
  if (data.logoUrl !== undefined) hospitalInfo.logoUrl = data.logoUrl ? data.logoUrl.trim() : '';
  if (data.logoColor !== undefined) hospitalInfo.logoColor = data.logoColor.trim();
  if (data.workingHours !== undefined) hospitalInfo.workingHours = data.workingHours.trim();
  if (data.queueOperatingHours !== undefined) hospitalInfo.queueOperatingHours = data.queueOperatingHours.trim();
  if (data.registrationNumber !== undefined) hospitalInfo.registrationNumber = data.registrationNumber.trim();
  if (data.email !== undefined) hospitalInfo.email = data.email.trim();
  if (data.city !== undefined) hospitalInfo.city = data.city.trim();
  if (data.state !== undefined) hospitalInfo.state = data.state.trim();
  if (data.country !== undefined) hospitalInfo.country = data.country.trim();
  if (data.pincode !== undefined) hospitalInfo.pincode = data.pincode.trim();
  if (data.website !== undefined) hospitalInfo.website = data.website.trim();
  if (data.description !== undefined) hospitalInfo.description = data.description.trim();
  if (data.emergencyContact !== undefined) hospitalInfo.emergencyContact = data.emergencyContact.trim();

  await updateSettings({ hospital_info: hospitalInfo });
  return { success: true, hospitalInfo };
}
