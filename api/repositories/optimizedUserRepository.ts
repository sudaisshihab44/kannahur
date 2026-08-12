/**
 * api/repositories/optimizedUserRepository.ts
 *
 * Optimized user/patient repository with pagination support.
 */
import { supabase } from '../config/supabase.js';

/**
 * Get paginated patients with search and sorting.
 * 
 * @param options Pagination, search, and sort options
 */
export async function getPatientsPaginated(options: {
  limit?: number;
  offset?: number;
  search?: string;
  orderBy?: string;
  orderDir?: 'ASC' | 'DESC';
}) {
  const {
    limit = 50,
    offset = 0,
    search,
    orderBy = 'created_at',
    orderDir = 'DESC',
  } = options;

  const { data, error } = await supabase.rpc('get_patients_paginated', {
    p_limit: limit,
    p_offset: offset,
    p_search: search || null,
    p_order_by: orderBy,
    p_order_dir: orderDir,
  });

  if (error) {
    console.error('[getPatientsPaginated] Error:', error);
    throw error;
  }

  const results = data ?? [];
  const totalCount = results.length > 0 ? results[0].total_count : 0;

  return {
    patients: results,
    totalCount,
    hasMore: totalCount > offset + limit,
  };
}

/**
 * Get recent patients (last N days).
 * 
 * @param days Number of days to look back (default: 30)
 */
export async function getRecentPatients(days = 30) {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);

  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .gte('created_at', fromDate.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getRecentPatients] Error:', error);
    throw error;
  }

  return data ?? [];
}
