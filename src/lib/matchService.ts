import { supabase } from './supabase'
import type { ParsedMatch } from './anthropic'
import { enqueueMatch, dequeueAll, removeFromQueue } from './offlineQueue'

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

export async function syncPendingMatches(): Promise<{ synced: number; failed: number }> {
  const pending = await dequeueAll()
  let synced = 0
  let failed = 0
  for (const item of pending) {
    let success = false
    // Retry up to 3 times with backoff
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase.rpc('save_match_transaction', { payload: item.payload })
      if (!error) {
        await removeFromQueue(item.id)
        synced++
        success = true
        break
      }
      // Wait before retry (500ms, 1s, 2s)
      if (attempt < 2) await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)))
    }
    if (!success) failed++
  }
  return { synced, failed }
}

export async function checkDuplicate(
  userId: string,
  date: string,
  opponentNames: string[],
  sets: { myGames: number; opponentGames: number }[],
  existingPlayers: { id: string; name: string }[],
): Promise<boolean> {
  // Find opponent IDs
  const oppIds = opponentNames
    .map(n => existingPlayers.find(p => p.name.toLowerCase() === n.toLowerCase())?.id)
    .filter(Boolean) as string[]

  if (oppIds.length === 0) return false

  // Find matches on same date
  const { data: matches } = await supabase
    .from('matches')
    .select('id')
    .eq('user_id', userId)
    .eq('date', date)

  if (!matches || matches.length === 0) return false

  // Check if any match has the same opponents
  for (const match of matches) {
    const { data: opponents } = await supabase
      .from('match_opponents')
      .select('player_id')
      .eq('match_id', match.id)

    if (!opponents) continue

    const matchOppIds = opponents.map(o => o.player_id)
    const sameOpponents = oppIds.length === matchOppIds.length &&
      oppIds.every(id => matchOppIds.includes(id))

    if (sameOpponents) {
      // Check if score also matches
      const { data: matchSets } = await supabase
        .from('match_sets')
        .select('my_games, opponent_games')
        .eq('match_id', match.id)
        .order('set_number')

      if (matchSets && matchSets.length === sets.length) {
        const sameScore = matchSets.every(
          (ms, i) => ms.my_games === sets[i].myGames && ms.opponent_games === sets[i].opponentGames
        )
        if (sameScore) return true
      }
    }
  }

  return false
}
