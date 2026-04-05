import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.101.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildSystemPrompt(
  playerNames: string[],
  leagueNames: string[],
  defaultSurface: string,
  defaultMatchType: string,
  today: string,
): string {
  return `You are a tennis match data parser. Extract structured match data from the user's freeform description.

Today's date is: ${today}
Known players: ${playerNames.length > 0 ? playerNames.join(', ') : '(none yet)'}
Known leagues/tournaments: ${leagueNames.length > 0 ? leagueNames.join(', ') : '(none yet)'}
Default surface: ${defaultSurface}
Default match type: ${defaultMatchType}

The input may describe ONE match or MULTIPLE matches (e.g., a rotating doubles session). Return ONLY valid JSON — no markdown, no explanation.

If the input describes ONE match, return a JSON object with a "matches" array containing one entry.
If the input describes MULTIPLE matches (rotating doubles, back-to-back matches), return a "matches" array with one entry per match.

Schema:

{
  "matches": [
    {
      "date": "YYYY-MM-DD",
      "matchType": "practice" | "friendly" | "league" | "tournament",
      "format": "singles" | "doubles",
      "surface": "hard" | "clay" | "grass" | "indoor-hard" | "indoor-clay" | "other",
      "location": "string or null",
      "leagueName": "string or null — name of the league or tournament if mentioned",
      "isCompetitive": boolean,
      "result": "win" | "loss" | "walkover",
      "opponentNames": ["string"],
      "partnerName": "string or null",
      "sets": [
        { "myGames": number, "opponentGames": number, "isTiebreak": boolean, "tiebreakScore": "string or null" }
      ],
      "isProSet": boolean,
      "thirdSetTiebreak": boolean,
      "retired": boolean,
      "notes": "string or null — any commentary, observations, or feelings about the match that aren't structural data",
      "tags": ["string — extracted performance tags based on notes content"],
      "confidence": "high" | "medium" | "low",
      "ambiguities": ["string — list anything unclear or assumed, empty array if confident"]
    }
  ]
}

Rules:
- If a player name closely matches a known player, use the known name exactly.
- If a player name is new (not in the known list), use the name as provided — it will be auto-created.
- If a league/tournament name closely matches a known one, use the known name exactly.
- If a league/tournament name is new, use it as provided — it will be auto-created.
- If date is not specified, use today's date.
- Resolve relative dates ("yesterday", "last Tuesday") against today's date.
- If surface is not mentioned, use the default surface.
- If match type is not mentioned, use the default match type.
- "Won" or "beat" = result is "win". "Lost" = result is "loss". "Walkover", "no show", "didn't show" = result is "walkover".
- For walkovers, the sets array should be empty.
- Detect pro sets (single set with games > 7 for the winner, e.g., 8-5, 10-4).
- Detect 3rd set super tiebreaks (3rd set score like 10-7, 10-8 in a best-of-3).
- If a set score is 7-6 or 6-7, mark isTiebreak as true.
- A set score of 7-5 or 5-7 is NOT a tiebreak.
- Extract notes/commentary from the input — anything about how the match felt, what went well/poorly.
- Extract tags based on the notes content using common tennis performance categories (serve, return, net play, groundstrokes, mental, fitness).
- CRITICAL: If the score implies a win (user won more sets) but the user said "lost" (or vice versa), set confidence to "medium" and add this to ambiguities: "Score suggests [win/loss] but you said [loss/win]. Please confirm."

isCompetitive rules:
- Default: league and tournament matches are competitive (true). Practice and friendly matches are not competitive (false).
- If the user explicitly says "competitive", "serious", "real match", or "counts" → set isCompetitive to true regardless of match type.
- If the user explicitly says "practice", "casual", "just for fun", "doesn't count" → set isCompetitive to false regardless of match type.
- "Rotating doubles" or "switching partners" sessions are always practice (isCompetitive: false).

Multi-match rules:
- If the input describes rotating doubles or multiple separate matches, create one entry per match in the "matches" array.
- For rotating doubles sessions, share the date, surface, location, and match type across all entries.
- Each entry in a rotating set gets its own partner, opponents, score, and result.

Confidence rules:
- Set confidence to "high" if all key fields (result, score, opponent) are clearly present and consistent.
- "medium" if reasonable assumptions were made or there's a potential inconsistency.
- "low" if critical info is missing or highly ambiguous.
- List any assumptions or missing info in ambiguities.`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get user's API key from settings
    const { data: settings } = await supabaseAdmin
      .from('user_settings')
      .select('anthropic_api_key')
      .eq('user_id', user.id)
      .single()

    if (!settings?.anthropic_api_key) {
      return new Response(JSON.stringify({ error: 'No API key configured. Set your Anthropic API key in Settings.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse request body
    const { userInput, playerNames, leagueNames, defaultSurface, defaultMatchType } = await req.json()

    if (!userInput) {
      return new Response(JSON.stringify({ error: 'Missing userInput' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const today = new Date().toISOString().split('T')[0]
    const systemPrompt = buildSystemPrompt(
      playerNames || [],
      leagueNames || [],
      defaultSurface || 'hard',
      defaultMatchType || 'friendly',
      today,
    )

    // Call Anthropic API server-side (no dangerous-direct-browser-access needed)
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.anthropic_api_key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userInput }],
      }),
    })

    if (!response.ok) {
      const data = await response.json()
      const msg = data.error?.message || 'API request failed'
      return new Response(JSON.stringify({ error: msg }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text
    if (!text) {
      return new Response(JSON.stringify({ error: 'Empty response from API' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Extract JSON from response
    let jsonStr = text.trim()
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) jsonStr = jsonMatch[1].trim()

    const parsed = JSON.parse(jsonStr)
    if (!parsed.matches || !Array.isArray(parsed.matches)) {
      return new Response(JSON.stringify({ error: 'Invalid response format from AI' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
