-- Migration 005: post-match insights RPC.
--
-- After saving a match, the app shows a quick insights card. Rather
-- than making 3-4 separate queries from the client (H2H record,
-- current streak, surface win rate), we compute everything in one
-- round-trip. The function is cheap: it scans the user's matches
-- (typically < 500 rows) with simple aggregates.

CREATE OR REPLACE FUNCTION get_post_match_insights(
  p_user_id UUID,
  p_opponent_ids UUID[],
  p_surface TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_h2h_wins    INT := 0;
  v_h2h_losses  INT := 0;
  v_h2h_total   INT := 0;
  v_streak_type TEXT := 'none';
  v_streak_count INT := 0;
  v_surface_wins INT := 0;
  v_surface_total INT := 0;
  v_total_matches INT := 0;
  v_match        RECORD;
BEGIN
  -- Auth guard: only the match owner can see their own insights.
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN '{}'::JSONB;
  END IF;

  -- 1. Head-to-head record vs these opponents (for singles, 1 opponent;
  --    for doubles, the specific opponent combination).
  --    We count matches where the opponent set matches exactly.
  IF array_length(p_opponent_ids, 1) > 0 THEN
    SELECT
      count(*) FILTER (WHERE m.result IN ('win', 'walkover')),
      count(*) FILTER (WHERE m.result = 'loss'),
      count(*)
    INTO v_h2h_wins, v_h2h_losses, v_h2h_total
    FROM matches m
    WHERE m.user_id = p_user_id
      AND m.deleted_at IS NULL
      AND EXISTS (
        -- Match has exactly the same set of opponents
        SELECT 1
        FROM (
          SELECT array_agg(mo.player_id ORDER BY mo.player_id) AS opp_ids
          FROM match_opponents mo
          WHERE mo.match_id = m.id
        ) sub
        WHERE sub.opp_ids = (SELECT array_agg(x ORDER BY x) FROM unnest(p_opponent_ids) x)
      );
  END IF;

  -- 2. Current streak (most recent consecutive wins or losses).
  FOR v_match IN
    SELECT m.result
    FROM matches m
    WHERE m.user_id = p_user_id
      AND m.deleted_at IS NULL
    ORDER BY m.date DESC, m.created_at DESC
  LOOP
    IF v_streak_count = 0 THEN
      -- First match sets the streak type
      IF v_match.result IN ('win', 'walkover') THEN
        v_streak_type := 'win';
        v_streak_count := 1;
      ELSIF v_match.result = 'loss' THEN
        v_streak_type := 'loss';
        v_streak_count := 1;
      END IF;
    ELSIF v_streak_type = 'win' AND v_match.result IN ('win', 'walkover') THEN
      v_streak_count := v_streak_count + 1;
    ELSIF v_streak_type = 'loss' AND v_match.result = 'loss' THEN
      v_streak_count := v_streak_count + 1;
    ELSE
      EXIT; -- streak broken
    END IF;
  END LOOP;

  -- 3. Surface win rate.
  SELECT
    count(*) FILTER (WHERE m.result IN ('win', 'walkover')),
    count(*)
  INTO v_surface_wins, v_surface_total
  FROM matches m
  WHERE m.user_id = p_user_id
    AND m.deleted_at IS NULL
    AND m.surface = p_surface;

  -- 4. Total match count.
  SELECT count(*) INTO v_total_matches
  FROM matches m
  WHERE m.user_id = p_user_id
    AND m.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'h2h_wins', v_h2h_wins,
    'h2h_losses', v_h2h_losses,
    'h2h_total', v_h2h_total,
    'streak_type', v_streak_type,
    'streak_count', v_streak_count,
    'surface', p_surface,
    'surface_wins', v_surface_wins,
    'surface_total', v_surface_total,
    'surface_win_rate', CASE WHEN v_surface_total > 0
      THEN round(v_surface_wins::NUMERIC / v_surface_total * 100)
      ELSE 0 END,
    'total_matches', v_total_matches
  );
END;
$$;
