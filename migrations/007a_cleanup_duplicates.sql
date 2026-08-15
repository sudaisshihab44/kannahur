-- ============================================================
-- Migration 007a: Clean up duplicate token numbers
-- ============================================================
-- Run this FIRST in Supabase SQL Editor.
-- Removes older duplicate (token_number, department_id) rows,
-- keeping only the most recently created one per pair.
-- Safe to run multiple times (idempotent).
-- ============================================================

DELETE FROM tokens
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY token_number, department_id
             ORDER BY created_at DESC
           ) AS rn
    FROM tokens
  ) ranked
  WHERE rn > 1
);
