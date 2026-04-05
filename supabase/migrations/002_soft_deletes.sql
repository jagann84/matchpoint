-- Add soft delete column
ALTER TABLE matches ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_matches_deleted_at ON matches (deleted_at) WHERE deleted_at IS NULL;

-- Soft delete function
CREATE OR REPLACE FUNCTION delete_match_transaction(p_match_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE matches
  SET deleted_at = NOW()
  WHERE id = p_match_id
    AND user_id = auth.uid()
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found or already deleted';
  END IF;

  RETURN TRUE;
END;
$$;

-- Restore function for undo
CREATE OR REPLACE FUNCTION restore_match(p_match_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE matches
  SET deleted_at = NULL
  WHERE id = p_match_id
    AND user_id = auth.uid()
    AND deleted_at IS NOT NULL;

  RETURN FOUND;
END;
$$;
