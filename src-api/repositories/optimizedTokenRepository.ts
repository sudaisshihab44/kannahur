/**
 * api/repositories/optimizedTokenRepository.ts
 *
 * Optimized token repository using database functions for batch operations.
 * Use these functions instead of the original tokenRepository for better performance.
 */
import { supabase } from '../config/supabase.js';

/**
 * Batch update tokens using PostgreSQL RPC function.
 * Replaces N individual UPDATE queries with single batch operation.
 * 
 * @param updates Array of {id, updates} objects
 * @returns Number of rows updated
 * 
 * @example
 * await batchUpdateTokens([
 *   { id: 'tok-123', updates: { estimated_wait_time: 15, position: 1 } },
 *   { id: 'tok-456', updates: { notified_two_remaining: true } }
 * ]);
 */
export async function batchUpdateTokens(updates: Array<{ id: string; updates: Record<string, any> }>) {
  const { data, error } = await supabase.rpc('batch_update_tokens', {
    updates: JSON.stringify(updates),
  });
  
  if (error) {
    console.error('[batchUpdateTokens] Error:', error);
    throw error;
  }
  
  return data as number;
}

/**
 * Get waiting queue using optimized database function.
 * Returns queue with department and doctor info already joined.
 * 
 * @param departmentId Optional department filter
 * @param doctorId Optional doctor filter
 */
export async function getWaitingQueue(departmentId?: string, doctorId?: string) {
  const { data, error } = await supabase.rpc('get_waiting_queue', {
    p_department_id: departmentId || null,
    p_doctor_id: doctorId || null,
  });
  
  if (error) {
    console.error('[getWaitingQueue] Error:', error);
    throw error;
  }
  
  return data ?? [];
}

/**
 * Get today's token count for a department using database function.
 * Much faster than fetching all tokens and counting in JS.
 * 
 * @param departmentId Optional department filter
 */
export async function getTodayTokenCount(departmentId?: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_today_token_count', {
    p_department_id: departmentId || null,
  });
  
  if (error) {
    console.error('[getTodayTokenCount] Error:', error);
    throw error;
  }
  
  return data as number;
}

/**
 * Get paginated tokens with filters.
 * 
 * @param options Pagination and filter options
 */
export async function getTokensPaginated(options: {
  limit?: number;
  offset?: number;
  status?: string;
  departmentId?: string;
  doctorId?: string;
  fromDate?: Date;
  toDate?: Date;
  orderBy?: string;
  orderDir?: 'ASC' | 'DESC';
}) {
  const {
    limit = 50,
    offset = 0,
    status,
    departmentId,
    doctorId,
    fromDate,
    toDate,
    orderBy = 'created_at',
    orderDir = 'DESC',
  } = options;

  const { data, error } = await supabase.rpc('get_tokens_paginated', {
    p_limit: limit,
    p_offset: offset,
    p_status: status || null,
    p_department_id: departmentId || null,
    p_doctor_id: doctorId || null,
    p_from_date: fromDate ? fromDate.toISOString().split('T')[0] : null,
    p_to_date: toDate ? toDate.toISOString().split('T')[0] : null,
    p_order_by: orderBy,
    p_order_dir: orderDir,
  });

  if (error) {
    console.error('[getTokensPaginated] Error:', error);
    throw error;
  }

  const results = data ?? [];
  const totalCount = results.length > 0 ? results[0].total_count : 0;

  return {
    tokens: results,
    totalCount,
    hasMore: totalCount > offset + limit,
  };
}

/**
 * Get recent tokens (last N days).
 * More efficient than fetching all tokens and filtering.
 * 
 * @param days Number of days to look back (default: 7)
 */
export async function getRecentTokens(days = 7) {
  const { data, error } = await supabase.rpc('get_recent_tokens', {
    p_days: days,
  });

  if (error) {
    console.error('[getRecentTokens] Error:', error);
    throw error;
  }

  return data ?? [];
}

/**
 * Get dashboard statistics using optimized database function.
 * Returns aggregated stats without fetching all tokens.
 * 
 * @param departmentId Optional department filter
 */
export async function getDashboardStats(departmentId?: string) {
  const { data, error } = await supabase.rpc('get_dashboard_stats', {
    p_department_id: departmentId || null,
  });

  if (error) {
    console.error('[getDashboardStats] Error:', error);
    throw error;
  }

  return data?.[0] ?? null;
}

/**
 * Get active queue view (waiting + called tokens with joins).
 * Uses materialized view for faster querying.
 */
export async function getActiveQueue() {
  const { data, error } = await supabase
    .from('active_queue')
    .select('*');

  if (error) {
    console.error('[getActiveQueue] Error:', error);
    throw error;
  }

  return data ?? [];
}
