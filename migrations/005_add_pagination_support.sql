-- ============================================================
-- Migration 005: Add Pagination Support Functions
-- ============================================================
-- Purpose: Enable efficient pagination for patients and tokens
-- Impact: Prevents unbounded data growth in API responses
-- Risk: Low (adds new functions only)
-- Estimated time: 30 seconds
-- ============================================================

-- ============================================================
-- FUNCTION: Get Patients with Pagination
-- ============================================================

CREATE OR REPLACE FUNCTION get_patients_paginated(
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_search TEXT DEFAULT NULL,
  p_order_by TEXT DEFAULT 'created_at',
  p_order_dir TEXT DEFAULT 'DESC'
)
RETURNS TABLE (
  id TEXT,
  name TEXT,
  mobile TEXT,
  email TEXT,
  age INTEGER,
  gender TEXT,
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  total_rows BIGINT;
BEGIN
  -- Get total count for pagination metadata
  SELECT COUNT(*)
  INTO total_rows
  FROM patients
  WHERE (p_search IS NULL 
    OR name ILIKE '%' || p_search || '%' 
    OR mobile ILIKE '%' || p_search || '%'
    OR email ILIKE '%' || p_search || '%');

  -- Return paginated results with total count
  RETURN QUERY EXECUTE format(
    'SELECT 
      p.id,
      p.name,
      p.mobile,
      p.email,
      p.age,
      p.gender,
      p.created_at,
      %L::bigint AS total_count
    FROM patients p
    WHERE ($1 IS NULL 
      OR p.name ILIKE ''%%'' || $1 || ''%%'' 
      OR p.mobile ILIKE ''%%'' || $1 || ''%%''
      OR p.email ILIKE ''%%'' || $1 || ''%%'')
    ORDER BY %I %s
    LIMIT $2 OFFSET $3',
    total_rows,
    p_order_by,
    CASE WHEN UPPER(p_order_dir) = 'DESC' THEN 'DESC' ELSE 'ASC' END
  ) USING p_search, p_limit, p_offset;
END;
$$;

-- ============================================================
-- FUNCTION: Get Tokens with Pagination and Filters
-- ============================================================

CREATE OR REPLACE FUNCTION get_tokens_paginated(
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_status TEXT DEFAULT NULL,
  p_department_id TEXT DEFAULT NULL,
  p_doctor_id TEXT DEFAULT NULL,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL,
  p_order_by TEXT DEFAULT 'created_at',
  p_order_dir TEXT DEFAULT 'DESC'
)
RETURNS TABLE (
  id TEXT,
  token_number TEXT,
  patient_name TEXT,
  patient_mobile TEXT,
  department_id TEXT,
  department_name TEXT,
  doctor_id TEXT,
  doctor_name TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  called_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  position INTEGER,
  estimated_wait_time INTEGER,
  total_count BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  total_rows BIGINT;
BEGIN
  -- Get total count for pagination metadata
  SELECT COUNT(*)
  INTO total_rows
  FROM tokens t
  WHERE (p_status IS NULL OR t.status = p_status)
    AND (p_department_id IS NULL OR t.department_id = p_department_id)
    AND (p_doctor_id IS NULL OR t.doctor_id = p_doctor_id)
    AND (p_from_date IS NULL OR DATE(t.created_at) >= p_from_date)
    AND (p_to_date IS NULL OR DATE(t.created_at) <= p_to_date);

  -- Return paginated results with total count
  RETURN QUERY EXECUTE format(
    'SELECT 
      t.id,
      t.token_number,
      t.patient_name,
      t.patient_mobile,
      t.department_id,
      t.department_name,
      t.doctor_id,
      t.doctor_name,
      t.status,
      t.created_at,
      t.called_at,
      t.completed_at,
      t.position,
      t.estimated_wait_time,
      %L::bigint AS total_count
    FROM tokens t
    WHERE ($1 IS NULL OR t.status = $1)
      AND ($2 IS NULL OR t.department_id = $2)
      AND ($3 IS NULL OR t.doctor_id = $3)
      AND ($4 IS NULL OR DATE(t.created_at) >= $4)
      AND ($5 IS NULL OR DATE(t.created_at) <= $5)
    ORDER BY %I %s
    LIMIT $6 OFFSET $7',
    total_rows,
    p_order_by,
    CASE WHEN UPPER(p_order_dir) = 'DESC' THEN 'DESC' ELSE 'ASC' END
  ) USING p_status, p_department_id, p_doctor_id, p_from_date, p_to_date, p_limit, p_offset;
END;
$$;

-- ============================================================
-- FUNCTION: Get Recent Tokens (Last N Days)
-- ============================================================

CREATE OR REPLACE FUNCTION get_recent_tokens(
  p_days INTEGER DEFAULT 7
)
RETURNS SETOF tokens
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM tokens
  WHERE created_at >= CURRENT_DATE - (p_days || ' days')::INTERVAL
  ORDER BY created_at DESC;
$$;

-- ============================================================
-- FUNCTION: Get Dashboard Statistics
-- ============================================================

CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_department_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_tokens_today INTEGER,
  waiting_count INTEGER,
  called_count INTEGER,
  completed_count INTEGER,
  cancelled_count INTEGER,
  avg_wait_time_minutes NUMERIC,
  active_doctors INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) FILTER (WHERE DATE(t.created_at) = CURRENT_DATE)::INTEGER AS total_tokens_today,
    COUNT(*) FILTER (WHERE t.status = 'waiting')::INTEGER AS waiting_count,
    COUNT(*) FILTER (WHERE t.status = 'called')::INTEGER AS called_count,
    COUNT(*) FILTER (WHERE t.status = 'completed' AND DATE(t.created_at) = CURRENT_DATE)::INTEGER AS completed_count,
    COUNT(*) FILTER (WHERE t.status = 'cancelled' AND DATE(t.created_at) = CURRENT_DATE)::INTEGER AS cancelled_count,
    ROUND(AVG(t.estimated_wait_time) FILTER (WHERE t.status = 'waiting'), 2) AS avg_wait_time_minutes,
    (SELECT COUNT(DISTINCT doctor_id) 
     FROM tokens 
     WHERE status IN ('waiting', 'called') 
       AND (p_department_id IS NULL OR department_id = p_department_id))::INTEGER AS active_doctors
  FROM tokens t
  WHERE (p_department_id IS NULL OR t.department_id = p_department_id);
END;
$$;

-- ============================================================
-- USAGE EXAMPLES
-- ============================================================

/*
-- Get first page of patients (50 per page)
SELECT * FROM get_patients_paginated(50, 0);

-- Search patients by name
SELECT * FROM get_patients_paginated(50, 0, 'John');

-- Get today's tokens only
SELECT * FROM get_tokens_paginated(
  p_limit := 100,
  p_from_date := CURRENT_DATE,
  p_to_date := CURRENT_DATE
);

-- Get waiting tokens for specific department
SELECT * FROM get_tokens_paginated(
  p_status := 'waiting',
  p_department_id := 'dep-1'
);

-- Get last 30 days tokens
SELECT * FROM get_recent_tokens(30);

-- Get dashboard stats for all departments
SELECT * FROM get_dashboard_stats();

-- Get dashboard stats for specific department
SELECT * FROM get_dashboard_stats('dep-1');
*/

-- ============================================================
-- VERIFICATION
-- ============================================================

-- List all pagination functions
SELECT 
  routine_name AS function_name,
  routine_type AS type,
  pg_get_function_arguments(p.oid) AS parameters
FROM information_schema.routines r
JOIN pg_proc p ON p.proname = r.routine_name
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_patients_paginated', 
    'get_tokens_paginated', 
    'get_recent_tokens',
    'get_dashboard_stats'
  )
ORDER BY routine_name;

-- ============================================================
-- ROLLBACK (if needed)
-- ============================================================

/*
DROP FUNCTION IF EXISTS get_patients_paginated(INTEGER, INTEGER, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS get_tokens_paginated(INTEGER, INTEGER, TEXT, TEXT, TEXT, DATE, DATE, TEXT, TEXT);
DROP FUNCTION IF EXISTS get_recent_tokens(INTEGER);
DROP FUNCTION IF EXISTS get_dashboard_stats(TEXT);
*/
