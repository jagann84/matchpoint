import { supabase } from './supabase'
import type { ParsedMatch } from './anthropic'

interface SaveMatchResult {
  matchId: string
  newPlayers: string[]
  newLeagues: string[]
}

export async function saveMatch(
  userId: string,
  parsed: ParsedMatch,
  existingPlayers: { id: string; name: string }[],
  existingLeagues: { id: string; name: string }[],
  rawInput?: string,
): Promise<SaveMatchResult> {
  const newPlayers: string[] = []
  const newLeagues: string[] = []

  // Resolve opponent IDs (create if new)
  const opponentIds: string[] = []
  for (const name of parsed.opponentNames) {
    const existing = existingPlayers.find(
      p => p.name.toLowerCase() === name.toLowerCase()
    )
    if (existing) {
      opponentIds.push(existing.id)
    } else {
      const { data } = await supabase
        .from('players')
        .insert({ user_id: userId, name, auto_created: true })
        .select('id')
        .single()
      if (data) {
        opponentIds.push(data.id)
        newPlayers.push(name)
      }
    }
  }

  // Resolve partner ID (create if new)
  let partnerId: string | null = null
  if (parsed.partnerName) {
    const existing = existingPlayers.find(
      p => p.name.toLowerCase() === parsed.partnerName!.toLowerCase()
    )
    if (existing) {
      partnerId = existing.id
    } else {
      const { data } = await supabase
        .from('players')
        .insert({ user_id: userId, name: parsed.partnerName, auto_created: true })
        .select('id')
        .single()
      if (data) {
        partnerId = data.id
        newPlayers.push(parsed.partnerName)
      }
    }
  }

  // Resolve league ID (create if new)
  let leagueId: string | null = null
  if (parsed.leagueName) {
    const existing = existingLeagues.find(
      l => l.name.toLowerCase() === parsed.leagueName!.toLowerCase()
    )
    if (existing) {
      leagueId = existing.id
    } else {
      const leagueType = parsed.matchType === 'tournament' ? 'tournament' : 'league'
      const { data } = await supabase
        .from('leagues')
        .insert({ user_id: userId, name: parsed.leagueName, type: leagueType, auto_created: true })
        .select('id')
        .single()
      if (data) {
        leagueId = data.id
        newLeagues.push(parsed.leagueName)
      }
    }
  }

  // Insert match
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .insert({
      user_id: userId,
      date: parsed.date,
      match_type: parsed.matchType,
      format: parsed.format,
      surface: parsed.surface,
      location: parsed.location,
      league_id: leagueId,
      result: parsed.result,
      is_competitive: parsed.isCompetitive,
      is_pro_set: parsed.isProSet,
      third_set_tiebreak: parsed.thirdSetTiebreak,
      retired: parsed.retired,
      notes: parsed.notes,
      raw_input: rawInput || null,
      partner_id: partnerId,
    })
    .select('id')
    .single()

  if (matchError || !match) {
    throw new Error('Failed to save match: ' + (matchError?.message || 'unknown error'))
  }

  // Insert opponents
  if (opponentIds.length > 0) {
    await supabase.from('match_opponents').insert(
      opponentIds.map(pid => ({ match_id: match.id, player_id: pid }))
    )
  }

  // Insert sets
  if (parsed.sets.length > 0) {
    await supabase.from('match_sets').insert(
      parsed.sets.map((s, i) => ({
        match_id: match.id,
        set_number: i + 1,
        my_games: s.myGames,
        opponent_games: s.opponentGames,
        is_tiebreak: s.isTiebreak,
        tiebreak_score: s.tiebreakScore,
      }))
    )
  }

  // Insert tags
  if (parsed.tags.length > 0) {
    await supabase.from('match_tags').insert(
      parsed.tags.map(tag => ({ match_id: match.id, tag_id: tag }))
    )
  }

  return { matchId: match.id, newPlayers, newLeagues }
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
    const sameOpponents = oppIds.every(id => matchOppIds.includes(id))

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
