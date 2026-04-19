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
  // Ensure the session token is fresh before calling the Edge Function.
  // On mobile PWAs the browser may have been backgrounded long enough for
  // the JWT to expire, while the Supabase auto-refresh timer (which runs
  // on a setInterval) was paused by the OS.  A quick getSession() forces
  // the client library to check the access-token expiry and transparently
  // refresh it if needed — preventing a 401 from the Edge Function.
  await supabase.auth.getSession()

  const { data, error } = await supabase.functions.invoke('parse-match', {
    body: { userInput, playerNames, leagueNames, defaultSurface, defaultMatchType },
  })

  if (error) {
    // supabase.functions.invoke wraps non-2xx responses in a FunctionsHttpError
    // whose message is the generic "Edge Function returned a non-2xx status code".
    // Surface something actionable instead.
    const msg = error.message || ''
    if (msg.includes('non-2xx')) {
      // Try to extract the actual error from the response body
      const body = typeof data === 'object' && data?.error ? data.error : null
      if (body) {
        throw new Error(body)
      }
      throw new Error('Session may have expired. Please try again — if it persists, sign out and back in.')
    }
    throw new Error(msg || 'Failed to parse match')
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
