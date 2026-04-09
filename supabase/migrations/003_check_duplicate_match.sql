-- Replace the client-side N+1 duplicate check with a single server-side
-- function. Previously, the client ran 1 query to find matches on the
-- date, then 1 additional query per candidate match to fetch opponents,
-- then another per candidate to fetch sets. On tournament days with
-- several matches on the same date, this ballooned to 5-10+ round trips
-- just to answer "is this a duplicate?" — noticeable on cell connections.
--
-- The function takes the full match identity (user + date + opponent IDs
-- + sets) and returns a boolean in one trip. Matches are considered
-- duplicates only if:
--   1. Same user, same date, not soft-deleted
--   2. Exact same set of opponent player IDs (order-independent)
--   3. Same number of sets, with each set's games matching by set_number
--
-- SECURITY DEFINER bypasses RLS for speed, so we enforce the "only check
-- your own matches" rule manually via auth.uid() at the top of the body.

CREATE OR REPLACE FUNCTION check_duplicate_match(
  p_user_id UUID,
  p_date DATE,
  p_opponent_ids UUID[],
  p_sets JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Auth guard: never let a caller probe another user's match history
  -- by spoofing p_user_id. If the claim doesn't match the session, bail.
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN FALSE;
  END IF;

  -- Empty opponent list can't meaningfully identify a match — match the
  -- client's previous behavior of returning false in that case.
  IF array_length(p_opponent_ids, 1) IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM matches m
    WHERE m.user_id = p_user_id
      AND m.date = p_date
      AND m.deleted_at IS NULL
      -- Opponent set equality: sort both sides and compare arrays.
      -- This is order-independent and requires BOTH sides to have
      -- exactly the same elements (so 2-opponent doubles can't look
      -- like a dup of 1-opponent singles just because one name matches).
      AND (
        SELECT array_agg(mo.player_id ORDER BY mo.player_id)
        FROM match_opponents mo
        WHERE mo.match_id = m.id
      ) = (
        SELECT array_agg(x ORDER BY x)
        FROM unnest(p_opponent_ids) x
      )
      -- Set count must match exactly (prevents "won 6-4" from being
      -- considered a dup of "won 6-4, 6-3").
      AND jsonb_array_length(p_sets) = (
        SELECT COUNT(*) FROM match_sets WHERE match_id = m.id
      )
      -- Every input set must have an exact match in match_sets by
      -- set_number + games. The "NOT EXISTS (... WHERE NOT EXISTS ...)"
      -- is the SQL idiom for "for all input sets, there exists a
      -- matching row" — if any single input set can't find its pair,
      -- the outer NOT EXISTS fails and this candidate is ruled out.
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_sets) WITH ORDINALITY AS s(elem, idx)
        WHERE NOT EXISTS (
          SELECT 1
          FROM match_sets ms
          WHERE ms.match_id = m.id
            AND ms.set_number = s.idx::INT
            AND ms.my_games = (s.elem->>'my_games')::INT
            AND ms.opponent_games = (s.elem->>'opponent_games')::INT
        )
      )
  );
END;
$$;

-- Grant execute to authenticated users (matches the pattern used by
-- save_match_transaction in migration 001).
GRANT EXECUTE ON FUNCTION check_duplicate_match(UUID, DATE, UUID[], JSONB) TO authenticated;
