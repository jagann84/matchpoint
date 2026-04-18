import { supabase } from './supabase'
import type { ParsedMatch } from './anthropic'
import { enqueueMatch, claimPending, releasePending, removeFromQueue, getPendingCount } from './offlineQueue'
import { logEvent, toMatchTypeDim } from './analytics'

// Module-level lock: blocks same-tab concurrent sync calls (the common
// case: `online` event firing while a manual click is in flight, or a
// component unmount/remount during sync). Cross-tab safety is handled
// inside IndexedDB via claimPending's readwrite transaction.
let syncInProgress = false

interface SaveMatchResult {
  matchId: string
  newPlayers: string[]
  newLeagues: string[]
}

export async function saveMatch(
  userId: string,
  parsed: ParsedMatch,
  _existingPlayers: { id: string; name: string }[],
  _existingLeagues: { id: string; name: string }[],
  rawInput?: string,
): Promise<SaveMatchResult> {
  // Build a single JSONB payload — the Postgres function handles
  // player/league resolution, match insert, and all child rows
  // inside one atomic transaction.
  const payload = {
    user_id: userId,
    date: parsed.date,
    match_type: parsed.matchType,
    format: parsed.format,
    surface: parsed.surface,
    location: parsed.location,
    league_name: parsed.leagueName,
    result: parsed.result,
    is_competitive: parsed.isCompetitive,
    is_pro_set: parsed.isProSet,
    third_set_tiebreak: parsed.thirdSetTiebreak,
    retired: parsed.retired,
    notes: parsed.notes,
    raw_input: rawInput || null,
    partner_name: parsed.partnerName,
    opponent_names: parsed.opponentNames,
    sets: parsed.sets.map(s => ({
      my_games: s.myGames,
      opponent_games: s.opponentGames,
      is_tiebreak: s.isTiebreak,
      tiebreak_score: s.tiebreakScore,
    })),
    tags: parsed.tags,
  }

  if (!navigator.onLine) {
    await enqueueMatch(payload)
    logEvent({
      name: 'match_queued_offline',
      props: { match_type: toMatchTypeDim(parsed.matchType) },
    })
    return { matchId: 'pending-' + Date.now(), newPlayers: [], newLeagues: [] }
  }

  const { data, error } = await supabase.rpc('save_match_transaction', { payload })

  if (error || !data) {
    throw new Error('Failed to save match: ' + (error?.message || 'unknown error'))
  }

  return {
    matchId: data.match_id,
    newPlayers: data.new_players ?? [],
    newLeagues: data.new_leagues ?? [],
  }
}

export async function syncPendingMatches(): Promise<{ synced: number; failed: number; skipped?: boolean }> {
  // Layer 1: in-memory lock. Second caller in the same tab bails out
  // immediately — no toast, no error, caller sees synced=0.
  if (syncInProgress) {
    return { synced: 0, failed: 0, skipped: true }
  }
  syncInProgress = true

  let synced = 0
  let failed = 0
  // Snapshot queue depth *before* we drain it so the analytics event can
  // report backlog pressure. Reading after-the-fact would always show 0.
  const pendingBefore = await getPendingCount()

  try {
    // Layer 2: atomic IDB claim. In a multi-tab scenario, only one tab's
    // readwrite transaction will successfully mark these rows as 'syncing';
    // the other tab will get back an empty (or smaller) list.
    const pending = await claimPending()

    for (const item of pending) {
      let success = false
      // Retry up to 3 times with exponential backoff (500ms, 1s, 2s).
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error } = await supabase.rpc('save_match_transaction', { payload: item.payload })
        if (!error) {
          await removeFromQueue(item.id)
          synced++
          success = true
          break
        }
        if (attempt < 2) await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)))
      }
      if (!success) {
        // Release the claim so the next sync attempt (user click, next
        // `online` event) can retry this item instead of waiting 60s for
        // the stale-claim recovery timeout.
        await releasePending(item.id)
        failed++
      }
    }
  } finally {
    syncInProgress = false
  }

  // Only emit if we actually attempted work — skipping a no-op sync keeps
  // the dashboard signal clean (online events fire often even when queue empty).
  if (pendingBefore > 0) {
    logEvent({
      name: 'offline_sync_completed',
      props: { synced, failed, pending_before: pendingBefore },
    })
  }

  return { synced, failed }
}

// Post-match insights: contextual stats fetched in one DB round-trip
// right after a save. Fails silently (returns null) since insights
// are a nice-to-have — a broken insights query should never overshadow
// a successful save.
export interface PostMatchInsights {
  h2h_wins: number
  h2h_losses: number
  h2h_total: number
  streak_type: 'win' | 'loss' | 'none'
  streak_count: number
  surface: string
  surface_wins: number
  surface_total: number
  surface_win_rate: number
  total_matches: number
}

export async function fetchPostMatchInsights(
  userId: string,
  opponentIds: string[],
  surface: string,
): Promise<PostMatchInsights | null> {
  try {
    const { data, error } = await supabase.rpc('get_post_match_insights', {
      p_user_id: userId,
      p_opponent_ids: opponentIds,
      p_surface: surface,
    })
    if (error || !data) return null
    return data as PostMatchInsights
  } catch {
    return null
  }
}

export async function checkDuplicate(
  userId: string,
  date: string,
  opponentNames: string[],
  sets: { myGames: number; opponentGames: number }[],
  existingPlayers: { id: string; name: string }[],
): Promise<boolean> {
  // Resolve opponent names to IDs against the locally-known players list.
  // If an opponent name doesn't match an existing player, they're new —
  // which means this match can't be a duplicate of anything, so we bail
  // early before even touching the network.
  const oppIds = opponentNames
    .map(n => existingPlayers.find(p => p.name.toLowerCase() === n.toLowerCase())?.id)
    .filter(Boolean) as string[]

  if (oppIds.length === 0 || oppIds.length !== opponentNames.length) return false

  // Single RPC replaces the old N+1 pattern (find matches → fetch opponents
  // per match → fetch sets per match). The function handles opponent-set
  // equality and per-set score comparison server-side in one query.
  const { data, error } = await supabase.rpc('check_duplicate_match', {
    p_user_id: userId,
    p_date: date,
    p_opponent_ids: oppIds,
    p_sets: sets.map(s => ({ my_games: s.myGames, opponent_games: s.opponentGames })),
  })

  if (error) {
    // Fail open: a broken duplicate check should never block a legit save.
    // Worst case the user confirms a "duplicate" that isn't one.
    console.error('[checkDuplicate] RPC failed, falling through:', error)
    return false
  }

  return data === true
}
