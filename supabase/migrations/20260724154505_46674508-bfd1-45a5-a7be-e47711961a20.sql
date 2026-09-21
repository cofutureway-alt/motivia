-- Phase 58 Step 1: Add 'parent' value to the app_role enum in its own transaction
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'parent';