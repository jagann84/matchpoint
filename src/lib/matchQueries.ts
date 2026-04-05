import { supabase } from './supabase'

export interface MatchWithDetails {
  id: string
  date: string
  match_type: string
  format: string
  surface: string
  location: string | null
  league_id: string | null
  league_name: string | null
  result: string
  is_competitive: boolean
  is_pro_set: boolean
  third_set_tiebreak: boolean
  retired: boolean
  notes: string | null
  raw_input: string | null
  partner_id: string | null
  partner_name: string | null
  created_at: string
  updated_at: string
  opponents: { id: string; name: string }[]
  sets: { set_number: number; my_games: number; opponent_games: number; is_tiebreak: boolean; tiebreak_score: string | null }[]
  tags: string[]
}

export async function fetchMatchesWithDetails(userId: string): Promise<MatchWithDetails[]> {
  // Fetch all data in parallel
  const [matchesRes, opponentsRes, setsRes, tagsRes, playersRes, leaguesRes] = await Promise.all([
    supabase.from('matches').select('*').eq('user_id', userId).order('date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('match_opponents').select('match_id, player_id'),
    supabase.from('match_sets').select('match_id, set_number, my_games, opponent_games, is_tiebreak, tiebreak_score').order('set_number'),
    supabase.from('match_tags').select('match_id, tag_id'),
    supabase.from('players').select('id, name').eq('user_id', userId),
    supabase.from('leagues').select('id, name').eq('user_id', userId),
  ])

  const matches = matchesRes.data || []
  const opponents = opponentsRes.data || []
  const sets = setsRes.data || []
  const tags = tagsRes.data || []
  const playerMap = new Map((playersRes.data || []).map(p => [p.id, p.name]))
  const leagueMap = new Map((leaguesRes.data || []).map(l => [l.id, l.name]))

  return matches.map(m => ({
    ...m,
    league_name: m.league_id ? leagueMap.get(m.league_id) || null : null,
    partner_name: m.partner_id ? playerMap.get(m.partner_id) || null : null,
    opponents: opponents
      .filter(o => o.match_id === m.id)
      .map(o => ({ id: o.player_id, name: playerMap.get(o.player_id) || 'Unknown' })),
    sets: sets
      .filter(s => s.match_id === m.id)
      .map(s => ({ set_number: s.set_number, my_games: s.my_games, opponent_games: s.opponent_games, is_tiebreak: s.is_tiebreak, tiebreak_score: s.tiebreak_score })),
    tags: tags.filter(t => t.match_id === m.id).map(t => t.tag_id),
  }))
}

export async function fetchSingleMatch(matchId: string): Promise<MatchWithDetails | null> {
  const { data: m } = await supabase.from('matches').select('*').eq('id', matchId).single()
  if (!m) return null

  const [opponentsRes, setsRes, tagsRes, playersRes, leaguesRes] = await Promise.all([
    supabase.from('match_opponents').select('player_id').eq('match_id', matchId),
    supabase.from('match_sets').select('set_number, my_games, opponent_games, is_tiebreak, tiebreak_score').eq('match_id', matchId).order('set_number'),
    supabase.from('match_tags').select('tag_id').eq('match_id', matchId),
    supabase.from('players').select('id, name').eq('user_id', m.user_id),
    supabase.from('leagues').select('id, name').eq('user_id', m.user_id),
  ])

  const playerMap = new Map((playersRes.data || []).map(p => [p.id, p.name]))
  const leagueMap = new Map((leaguesRes.data || []).map(l => [l.id, l.name]))

  return {
    ...m,
    league_name: m.league_id ? leagueMap.get(m.league_id) || null : null,
    partner_name: m.partner_id ? playerMap.get(m.partner_id) || null : null,
    opponents: (opponentsRes.data || []).map(o => ({ id: o.player_id, name: playerMap.get(o.player_id) || 'Unknown' })),
    sets: (setsRes.data || []).map(s => ({ set_number: s.set_number, my_games: s.my_games, opponent_games: s.opponent_games, is_tiebreak: s.is_tiebreak, tiebreak_score: s.tiebreak_score })),
    tags: (tagsRes.data || []).map(t => t.tag_id),
  }
}

export async function deleteMatch(matchId: string): Promise<boolean> {
  const { error } = await supabase.from('matches').delete().eq('id', matchId)
  return !error
}
