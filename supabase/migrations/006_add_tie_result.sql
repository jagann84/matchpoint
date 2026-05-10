-- Migration 006: add 'tie' as a valid match result.
-- The CHECK constraint was created at schema setup time with only
-- win/loss/walkover. We drop and recreate it to include 'tie'.
ALTER TABLE matches
  DROP CONSTRAINT matches_result_check,
  ADD CONSTRAINT matches_result_check
    CHECK (result = ANY (ARRAY['win','loss','walkover','tie']));
