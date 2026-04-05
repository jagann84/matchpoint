import { supabase } from './supabase'
import { fetchMatchesWithDetails, type MatchWithDetails } from './matchQueries'

// ─── Export ───

interface ExportData {
  version: 1
  exportedAt: string
  matches: MatchWithDetails[]
}

export async function exportAsJSON(userId: string): Promise<void> {
  const matches = await fetchMatchesWithDetails(userId)
  const data: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    matches,
  }
  downloadFile(
    JSON.stringify(data, null, 2),
    `matchpoint-export-${formatDateForFile()}.json`,
    'application/json',
  )
}

export async function exportAsCSV(userId: string): Promise<void> {
  const matches = await fetchMatchesWithDetails(userId)

  const headers = [
    'Date', 'Result', 'Opponents', 'Partner', 'Score', 'Format',
    'Surface', 'Match Type', 'League', 'Location', 'Competitive',
    'Pro Set', '3rd Set TB', 'Retired', 'Notes', 'Tags',
  ]

  const rows = matches.map(m => [
    m.date,
    m.result,
    m.opponents.map(o => o.name).join(' & '),
    m.partner_name || '',
    m.result === 'walkover' ? 'W/O' : m.sets.map(s => `${s.my_games}-${s.opponent_games}`).join(' '),
    m.format,
    m.surface,
    m.match_type,
    m.league_name || '',
    m.location || '',
    m.is_competitive ? 'Yes' : 'No',
    m.is_pro_set ? 'Yes' : 'No',
    m.third_set_tiebreak ? 'Yes' : 'No',
    m.retired ? 'Yes' : 'No',
    (m.notes || '').replace(/"/g, '""'),
    m.tags.join(', '),
  ])

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n')

  downloadFile(csv, `matchpoint-export-${formatDateForFile()}.csv`, 'text/csv')
}

// ─── Import ───

interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
}

export async function importFromJSON(
  userId: string,
  file: File,
): Promise<ImportResult> {
  const text = await file.text()
  let data: ExportData

  try {
    data = JSON.parse(text)
  } catch {
    return { imported: 0, skipped: 0, errors: ['Invalid JSON file'] }
  }

  if (!data.matches || !Array.isArray(data.matches)) {
    return { imported: 0, skipped: 0, errors: ['Invalid export format — missing matches array'] }
  }

  const result: ImportResult = { imported: 0, skipped: 0, errors: [] }

  // Get existing players and leagues for resolution
  const [playersRes, leaguesRes] = await Promise.all([
    supabase.from('players').select('id, name').eq('user_id', userId),
    supabase.from('leagues').select('id, name').eq('user_id', userId),
  ])
  const existingPlayers = playersRes.data || []
  const existingLeagues = leaguesRes.data || []

  for (const match of data.matches) {
    try {
      // Resolve opponent IDs
      const opponentIds: string[] = []
      for (const opp of match.opponents) {
        const existing = existingPlayers.find(
          p => p.name.toLowerCase() === opp.name.toLowerCase(),
        )
        if (existing) {
          opponentIds.push(existing.id)
        } else {
          const { data: newPlayer } = await supabase
            .from('players')
            .insert({ user_id: userId, name: opp.name, auto_created: true })
            .select('id')
            .single()
          if (newPlayer) {
            opponentIds.push(newPlayer.id)
            existingPlayers.push({ id: newPlayer.id, name: opp.name })
          }
        }
      }

      // Resolve partner ID
      let partnerId: string | null = null
      if (match.partner_name) {
        const existing = existingPlayers.find(
          p => p.name.toLowerCase() === match.partner_name!.toLowerCase(),
        )
        if (existing) {
          partnerId = existing.id
        } else {
          const { data: newPlayer } = await supabase
            .from('players')
            .insert({ user_id: userId, name: match.partner_name, auto_created: true })
            .select('id')
            .single()
          if (newPlayer) {
            partnerId = newPlayer.id
            existingPlayers.push({ id: newPlayer.id, name: match.partner_name })
          }
        }
      }

      // Resolve league ID
      let leagueId: string | null = null
      if (match.league_name) {
        const existing = existingLeagues.find(
          l => l.name.toLowerCase() === match.league_name!.toLowerCase(),
        )
        if (existing) {
          leagueId = existing.id
        } else {
          const { data: newLeague } = await supabase
            .from('leagues')
            .insert({ user_id: userId, name: match.league_name, type: 'league', auto_created: true })
            .select('id')
            .single()
          if (newLeague) {
            leagueId = newLeague.id
            existingLeagues.push({ id: newLeague.id, name: match.league_name })
          }
        }
      }

      // Check for duplicate (same date + opponents + score)
      const { data: existingMatches } = await supabase
        .from('matches')
        .select('id')
        .eq('user_id', userId)
        .eq('date', match.date)
        .eq('result', match.result)

      if (existingMatches && existingMatches.length > 0) {
        // Simple duplicate check — skip if same date + result + opponent count
        let isDup = false
        for (const em of existingMatches) {
          const { data: emOpps } = await supabase
            .from('match_opponents')
            .select('player_id')
            .eq('match_id', em.id)
          if (emOpps && emOpps.length === opponentIds.length) {
            const emOppIds = emOpps.map(o => o.player_id)
            if (opponentIds.every(id => emOppIds.includes(id))) {
              isDup = true
              break
            }
          }
        }
        if (isDup) {
          result.skipped++
          continue
        }
      }

      // Insert match
      const { data: newMatch, error: matchError } = await supabase
        .from('matches')
        .insert({
          user_id: userId,
          date: match.date,
          match_type: match.match_type,
          format: match.format,
          surface: match.surface,
          location: match.location,
          league_id: leagueId,
          result: match.result,
          is_competitive: match.is_competitive,
          is_pro_set: match.is_pro_set,
          third_set_tiebreak: match.third_set_tiebreak,
          retired: match.retired,
          notes: match.notes,
          raw_input: match.raw_input,
          partner_id: partnerId,
        })
        .select('id')
        .single()

      if (matchError || !newMatch) {
        result.errors.push(`Failed to import match from ${match.date}`)
        continue
      }

      // Insert opponents
      if (opponentIds.length > 0) {
        await supabase.from('match_opponents').insert(
          opponentIds.map(pid => ({ match_id: newMatch.id, player_id: pid })),
        )
      }

      // Insert sets
      if (match.sets.length > 0) {
        await supabase.from('match_sets').insert(
          match.sets.map((s, i) => ({
            match_id: newMatch.id,
            set_number: i + 1,
            my_games: s.my_games,
            opponent_games: s.opponent_games,
            is_tiebreak: s.is_tiebreak,
            tiebreak_score: s.tiebreak_score,
          })),
        )
      }

      // Insert tags
      if (match.tags.length > 0) {
        await supabase.from('match_tags').insert(
          match.tags.map(tag => ({ match_id: newMatch.id, tag_id: tag })),
        )
      }

      result.imported++
    } catch (err) {
      result.errors.push(`Error importing match from ${match.date}: ${err}`)
    }
  }

  return result
}

// ─── Helpers ───

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function formatDateForFile(): string {
  return new Date().toISOString().split('T')[0]
}
