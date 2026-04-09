-- Migration 004: scheduled purge of soft-deleted matches.
--
-- Soft deletes (deleted_at IS NOT NULL) accumulate forever otherwise,
-- producing "ghost data" that causes bugs like the phantom match count
-- we hit with player "Scott" (see commit e49012d). This migration:
--
--   1. Enables pg_cron (Supabase makes it available but not installed
--      on a fresh project).
--   2. Creates purge_soft_deleted_matches(): a SECURITY DEFINER function
--      that hard-deletes matches soft-deleted more than 7 days ago.
--      Cascade on match_opponents.match_id (and downstream sets/tags)
--      cleans up child rows automatically.
--   3. Schedules it to run daily at 03:00 UTC via pg_cron.
--
-- The 7-day retention is longer than the in-app undo window (seconds)
-- and gives any reasonable "wait, I didn't mean to delete that" case
-- plenty of time. Shorten at your peril; the user has already been
-- bitten by aggressive deletes once.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─── Purge function ──────────────────────────────────────────────────
-- Returns the number of rows deleted so pg_cron's job_run_details
-- captures it, and RAISE NOTICE writes it to the Postgres log for
-- easy ad-hoc inspection ("did the purge actually do anything last night?").
--
-- SECURITY DEFINER so pg_cron (which runs as the `postgres` superuser
-- anyway on Supabase) doesn't need RLS contortions. There is no user
-- input to this function, so there's no injection surface.

CREATE OR REPLACE FUNCTION purge_soft_deleted_matches()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  WITH purged AS (
    DELETE FROM matches
    WHERE deleted_at IS NOT NULL
      AND deleted_at < now() - interval '7 days'
    RETURNING 1
  )
  SELECT count(*) INTO deleted_count FROM purged;

  RAISE NOTICE '[purge_soft_deleted_matches] hard-deleted % match(es)', deleted_count;
  RETURN deleted_count;
END;
$$;

-- ─── Schedule ────────────────────────────────────────────────────────
-- Daily at 03:00 UTC. That's 23:00 ET / 20:00 PT — late enough that
-- the last evening matches have been logged, early enough that the
-- run completes well before morning traffic.
--
-- cron.schedule is NOT idempotent: calling it twice creates two jobs.
-- Unschedule any prior version first so this migration is safe to
-- re-run. The unschedule call is wrapped in a DO block because
-- cron.unschedule raises if the job doesn't exist.

DO $$
BEGIN
  PERFORM cron.unschedule('purge-soft-deleted-matches');
EXCEPTION WHEN OTHERS THEN
  -- No prior job to unschedule; this is fine on first run.
  NULL;
END $$;

SELECT cron.schedule(
  'purge-soft-deleted-matches',
  '0 3 * * *',
  $$SELECT purge_soft_deleted_matches();$$
);
