import { supabase } from './supabase'

export interface ParsedMatch {
  date: string
  matchType: 'practice' | 'friendly' | 'league' | 'tournament'
  format: 'singles' | 'doubles'
  surface: 'hard' | 'clay' | 'grass' | 'indoor-hard' | 'indoor-clay' | 'other'
  location: string | null
  leagueName: string | null
  isCompetitive: boolean
  result: 'win' | 'loss' | 'walkover'
  opponentNames: string[]
  partnerName: string | null
  sets: {
    myGames: number
    opponentGames: number
    isTiebreak: boolean
    tiebreakScore: string | null
  }[]
  isProSet: boolean
  thirdSetTiebreak: boolean
  retired: boolean
  notes: string | null
  tags: string[]
  confidence: 'high' | 'medium' | 'low'
  ambiguities: string[]
}

export interface ParseResult {
  matches: ParsedMatch[]
}

export async function parseMatchInput(
  userInput: string,
  playerNames: string[],
  leagueNames: string[],
  defaultSurface: string,
  defaultMatchType: string,
): Promise<ParseResult> {
  const { data, error } = await supabase.functions.invoke('parse-match', {
    body: { userInput, playerNames, leagueNames, defaultSurface, defaultMatchType },
  })

  if (error) {
    throw new Error(error.message || 'Failed to parse match')
  }

  if (data?.error) {
    const msg = data.error
    if (msg.includes('invalid') || msg.includes('key') || msg.includes('credit')) {
      throw new Error('Your API key seems invalid or out of credits. Check it in Settings.')
    }
    throw new Error(msg)
  }

  if (!data?.matches || !Array.isArray(data.matches)) {
    throw new Error('Invalid response format')
  }

  return data as ParseResult
}
