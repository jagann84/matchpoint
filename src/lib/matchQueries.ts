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

const MATCH_SELECT = `
  *,
  league:leagues!matches_league_id_fkey(name),
  partner:players!matches_partner_id_fkey(name),
  match_opponents(player_id, player:players!match_opponents_player_id_fkey(id, name)),
  match_sets(set_number, my_games, opponent_games, is_tiebreak, tiebreak_score),
  match_tags(tag_id)
`

function transformMatch(m: any): MatchWithDetails {
  return {
    id: m.id,
    date: m.date,
    match_type: m.match_type,
    format: m.format,
    surface: m.surface,
    location: m.location,
    league_id: m.league_id,
    league_name: m.league?.name || null,
    result: m.result,
    is_competitive: m.is_competitive,
    is_pro_set: m.is_pro_set,
    third_set_tiebreak: m.third_set_tiebreak,
    retired: m.retired,
    notes: m.notes,
    raw_input: m.raw_input,
    partner_id: m.partner_id,
    partner_name: m.partner?.name || null,
    created_at: m.created_at,
    updated_at: m.updated_at,
    opponents: (m.match_opponents || []).map((o: any) => ({
      id: o.player_id,
      name: o.player?.name || 'Unknown',
    })),
    sets: (m.match_sets || [])
      .sort((a: any, b: any) => a.set_number - b.set_number)
      .map((s: any) => ({
        set_number: s.set_number,
        my_games: s.my_games,
        opponent_games: s.opponent_games,
        is_tiebreak: s.is_tiebreak,
        tiebreak_score: s.tiebreak_score,
      })),
    tags: (m.match_tags || []).map((t: any) => t.tag_id),
  }
}

export async function fetchMatchesWithDetails(userId: string): Promise<MatchWithDetails[]> {
  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_SELECT)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'Failed to load matches')
  if (!data) return []

  return data.map(transformMatch)
}

export async function fetchMatchesPaginated(
  userId: string,
  offset: number = 0,
  limit: number = 20,
): Promise<{ matches: MatchWithDetails[]; total: number }> {
  const { data, error, count } = await supabase
    .from('matches')
    .select(MATCH_SELECT, { count: 'exact' })
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(error.message || 'Failed to load matches')
  if (!data) return { matches: [], total: 0 }

  return { matches: data.map(transformMatch), total: count || 0 }
}

export async function fetchSingleMatch(matchId: string): Promise<MatchWithDetails | null> {
  const { data: m, error } = await supabase
    .from('matches')
    .select(MATCH_SELECT)
    .eq('id', matchId)
    .is('deleted_at', null)
    .single()

  if (error || !m) return null

  return transformMatch(m)
}

export async function deleteMatch(matchId: string): Promise<boolean> {
  const { error } = await supabase.rpc('delete_match_transaction', { p_match_id: matchId })
  return !error
}

export async function restoreMatch(matchId: string): Promise<boolean> {
  const { error } = await supabase.rpc('restore_match', { p_match_id: matchId })
  return !error
}
