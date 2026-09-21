-- Phase 71a: Add 'instructor' role to app_role enum.
-- Must run in its own transaction BEFORE any statement that uses the new value
-- (PostgreSQL forbids using a newly added enum value in the same transaction).
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'instructor';
