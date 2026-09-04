/**
 * api/services/authService.ts
 *
 * Authentication and authorization business logic.
 *
 * Performance optimisation (Task 2):
 *   createToken() previously called authorizePriorityChange() then
 *   authorizeDepartmentAction() sequentially — 2 separate DB lookups for
 *   the same username. The new authorizeTokenCreation() does both checks
 *   in a single findUserByUsername() call.
 */
import { findUserByUsername } from '../repositories/userRepository.js';
import { mapUser } from '../utils/mappers.js';
import { UserRole } from '../../src/types/index.js';

// ── Authenticate ──────────────────────────────────────────────────────────────

export async function authenticateUser(
  username: string,
  password: string | undefined,
  portal: 'admin' | 'reception' | undefined
): Promise<{ success: boolean; user?: any; message?: string }> {
  if (!username) {
    return { success: false, message: 'Username is required' };
  }

  const userRow = await findUserByUsername(username);
  if (!userRow) {
    return { success: false, message: 'Invalid username or password.' };
  }

  const user = mapUser(userRow);
  const userPass = user.password || 'password';

  if (password && userPass !== password) {
    return { success: false, message: 'Invalid username or password.' };
  }

  if (user.isActive === false) {
    return { success: false, message: 'This account is currently deactivated.' };
  }

  if (portal === 'reception' && user.role !== UserRole.RECEPTIONIST) {
    return { success: false, message: 'This account belongs to the Administrator Portal.' };
  }

  if (portal === 'admin' && user.role !== UserRole.ADMIN) {
    return { success: false, message: 'This account belongs to the Reception Portal.' };
  }

  return { success: true, user };
}

// ── Combined authorization (OPTIMISED — 1 DB call instead of 2) ──────────────

/**
 * Authorise a token-creation request.
 *
 * Before: createToken() called authorizePriorityChange() then
 *         authorizeDepartmentAction() — 2 × findUserByUsername → 2 DB hits.
 *
 * After:  A single findUserByUsername() resolves both checks.
 *
 * Returns:
 *   authorized      – whether the operator may create a token for this dept
 *   allowPriority   – whether the operator may set non-Normal priority
 *   message         – reason string when authorized = false
 */
export async function authorizeTokenCreation(
  departmentId: string,
  requestedPriority: string,
  operatorUsername?: string,
): Promise<{
  authorized:    boolean;
  allowPriority: boolean;
  message?:      string;
}> {
  // No username context → allow everything (dev / backward-compat path)
  if (!operatorUsername) {
    return { authorized: true, allowPriority: false };
  }

  const userRow = await findUserByUsername(operatorUsername); // exactly 1 DB call
  if (!userRow) {
    // Unknown user — allow creation, deny priority elevation
    return { authorized: true, allowPriority: false };
  }

  const user = mapUser(userRow);

  // Deactivated account
  if (user.isActive === false) {
    return { authorized: false, allowPriority: false, message: 'Account is deactivated.' };
  }

  // Admin can do everything
  if (user.role === UserRole.ADMIN) {
    return { authorized: true, allowPriority: true };
  }

  // Receptionist: check department assignment
  if (user.role === UserRole.RECEPTIONIST) {
    const assignedDepts =
      user.assignedDepartmentIds ||
      (user.departmentId ? [user.departmentId] : []);

    // Unassigned receptionist can work any department
    const deptOk = assignedDepts.length === 0 || assignedDepts.includes(departmentId);

    if (!deptOk) {
      return {
        authorized:    false,
        allowPriority: false,
        message: 'You are not authorized to manage tokens for this department.',
      };
    }

    const allowPriority = (user.permissions || []).includes('set_priority');
    return { authorized: true, allowPriority };
  }

  return { authorized: true, allowPriority: false };
}

// ── Single-purpose helpers (kept for backward compatibility) ──────────────────

/**
 * @deprecated Use authorizeTokenCreation() for createToken path.
 *             Kept for callToken / completeToken / skipToken / cancelToken
 *             where priority check is not needed.
 */
export async function authorizeDepartmentAction(
  tokenDepartmentId: string,
  operatorUsername?: string
): Promise<{ authorized: boolean; message?: string }> {
  if (!operatorUsername) {
    return { authorized: true };
  }

  const userRow = await findUserByUsername(operatorUsername);
  if (!userRow) {
    return { authorized: true };
  }

  const user = mapUser(userRow);

  if (user.role === UserRole.ADMIN) {
    return { authorized: true };
  }

  if (user.role === UserRole.RECEPTIONIST) {
    const assignedDepts =
      user.assignedDepartmentIds ||
      (user.departmentId ? [user.departmentId] : []);

    if (assignedDepts.length > 0 && !assignedDepts.includes(tokenDepartmentId)) {
      return {
        authorized: false,
        message: 'You are not authorized to manage tokens for this department.',
      };
    }
  }

  return { authorized: true };
}

/**
 * @deprecated Use authorizeTokenCreation() for createToken path.
 */
export async function authorizePriorityChange(
  operatorUsername: string | undefined
): Promise<boolean> {
  if (!operatorUsername) return false;

  const userRow = await findUserByUsername(operatorUsername);
  if (!userRow) return false;

  const user = mapUser(userRow);
  return user.role === UserRole.ADMIN || (user.permissions || []).includes('set_priority');
}
