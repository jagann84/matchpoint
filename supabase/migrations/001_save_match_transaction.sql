-- Transactional match save function
-- Wraps all match-related inserts (match, opponents, sets, tags, players, leagues)
-- in a single atomic transaction called via supabase.rpc('save_match_transaction', { payload }).

CREATE OR REPLACE FUNCTION save_match_transaction(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id       UUID;
  v_match_id      UUID;
  v_league_id     UUID;
  v_partner_id    UUID;
  v_opponent_id   UUID;
  v_player_id     UUID;
  v_opponent_ids  UUID[] := '{}';
  v_new_players   TEXT[] := '{}';
  v_new_leagues   TEXT[] := '{}';
  v_opp           TEXT;
  v_set           JSONB;
  v_tag           TEXT;
  v_set_number    INT;
  v_league_type   TEXT;
BEGIN
  -- Extract and verify user_id
  v_user_id := (payload->>'user_id')::UUID;

  IF v_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'user_id does not match authenticated user';
  END IF;

  -- -------------------------------------------------------
  -- Resolve opponent players (create if new)
  -- -------------------------------------------------------
  IF payload->'opponent_names' IS NOT NULL THEN
    FOR v_opp IN SELECT jsonb_array_elements_text(payload->'opponent_names')
    LOOP
      SELECT id INTO v_opponent_id
        FROM players
       WHERE user_id = v_user_id
         AND lower(name) = lower(v_opp)
       LIMIT 1;

      IF v_opponent_id IS NULL THEN
        INSERT INTO players (user_id, name, auto_created)
        VALUES (v_user_id, v_opp, true)
        RETURNING id INTO v_opponent_id;

        v_new_players := array_append(v_new_players, v_opp);
      END IF;

      v_opponent_ids := array_append(v_opponent_ids, v_opponent_id);
    END LOOP;
  END IF;

  -- -------------------------------------------------------
  -- Resolve partner player (create if new)
  -- -------------------------------------------------------
  v_partner_id := NULL;
  IF payload->>'partner_name' IS NOT NULL THEN
    SELECT id INTO v_partner_id
      FROM players
     WHERE user_id = v_user_id
       AND lower(name) = lower(payload->>'partner_name')
     LIMIT 1;

    IF v_partner_id IS NULL THEN
      INSERT INTO players (user_id, name, auto_created)
      VALUES (v_user_id, payload->>'partner_name', true)
      RETURNING id INTO v_partner_id;

      v_new_players := array_append(v_new_players, payload->>'partner_name');
    END IF;
  END IF;

  -- -------------------------------------------------------
  -- Resolve league (create if new)
  -- -------------------------------------------------------
  v_league_id := NULL;
  IF payload->>'league_name' IS NOT NULL THEN
    SELECT id INTO v_league_id
      FROM leagues
     WHERE user_id = v_user_id
       AND lower(name) = lower(payload->>'league_name')
     LIMIT 1;

    IF v_league_id IS NULL THEN
      -- Mirror the TS logic: tournament match type → 'tournament', else 'league'
      IF payload->>'match_type' = 'tournament' THEN
        v_league_type := 'tournament';
      ELSE
        v_league_type := 'league';
      END IF;

      INSERT INTO leagues (user_id, name, type, auto_created)
      VALUES (v_user_id, payload->>'league_name', v_league_type, true)
      RETURNING id INTO v_league_id;

      v_new_leagues := array_append(v_new_leagues, payload->>'league_name');
    END IF;
  END IF;

  -- -------------------------------------------------------
  -- Insert match
  -- -------------------------------------------------------
  INSERT INTO matches (
    user_id,
    date,
    match_type,
    format,
    surface,
    location,
    league_id,
    result,
    is_competitive,
    is_pro_set,
    third_set_tiebreak,
    retired,
    notes,
    raw_input,
    partner_id
  ) VALUES (
    v_user_id,
    (payload->>'date')::DATE,
    payload->>'match_type',
    payload->>'format',
    payload->>'surface',
    payload->>'location',
    v_league_id,
    payload->>'result',
    (payload->>'is_competitive')::BOOLEAN,
    (payload->>'is_pro_set')::BOOLEAN,
    (payload->>'third_set_tiebreak')::BOOLEAN,
    (payload->>'retired')::BOOLEAN,
    payload->>'notes',
    payload->>'raw_input',
    v_partner_id
  )
  RETURNING id INTO v_match_id;

  -- -------------------------------------------------------
  -- Insert match_opponents
  -- -------------------------------------------------------
  IF array_length(v_opponent_ids, 1) > 0 THEN
    FOREACH v_player_id IN ARRAY v_opponent_ids
    LOOP
      INSERT INTO match_opponents (match_id, player_id)
      VALUES (v_match_id, v_player_id);
    END LOOP;
  END IF;

  -- -------------------------------------------------------
  -- Insert match_sets
  -- -------------------------------------------------------
  v_set_number := 0;
  IF payload->'sets' IS NOT NULL THEN
    FOR v_set IN SELECT jsonb_array_elements(payload->'sets')
    LOOP
      v_set_number := v_set_number + 1;
      INSERT INTO match_sets (match_id, set_number, my_games, opponent_games, is_tiebreak, tiebreak_score)
      VALUES (
        v_match_id,
        v_set_number,
        (v_set->>'my_games')::INT,
        (v_set->>'opponent_games')::INT,
        (v_set->>'is_tiebreak')::BOOLEAN,
        v_set->>'tiebreak_score'
      );
    END LOOP;
  END IF;

  -- -------------------------------------------------------
  -- Insert match_tags
  -- -------------------------------------------------------
  IF payload->'tags' IS NOT NULL THEN
    FOR v_tag IN SELECT jsonb_array_elements_text(payload->'tags')
    LOOP
      INSERT INTO match_tags (match_id, tag_id)
      VALUES (v_match_id, v_tag);
    END LOOP;
  END IF;

  -- -------------------------------------------------------
  -- Return result
  -- -------------------------------------------------------
  RETURN jsonb_build_object(
    'match_id',    v_match_id,
    'new_players', to_jsonb(v_new_players),
    'new_leagues', to_jsonb(v_new_leagues)
  );
END;
$$;
