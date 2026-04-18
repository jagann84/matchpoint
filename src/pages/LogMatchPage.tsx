import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { parseMatchInput, type ParsedMatch } from '../lib/anthropic'
import { saveMatch, checkDuplicate, fetchPostMatchInsights, type PostMatchInsights } from '../lib/matchService'
import { detectAmbiguousNames, type AmbiguousName } from '../lib/playerMatching'
import PlayerDisambiguation from '../components/PlayerDisambiguation'
import { showToast } from '../components/Toast'
import PostMatchInsightsCard from '../components/PostMatchInsightsCard'
import { Loader2, AlertTriangle, Sparkles, ChevronDown, ChevronUp, Plus, X, Minus } from 'lucide-react'
import { SURFACES, MATCH_TYPES, type Surface, type MatchType } from '../lib/constants'
import { logEvent, categorizeError, toMatchTypeDim, toSurfaceDim, toFormatDim } from '../lib/analytics'
import { localToday } from '../lib/dates'

export default function LogMatchPage() {
  const { user } = useAuth()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Synchronous double-submit guard. A ref (not state) because ref
  // updates are visible to the very next line of code, while state
  // updates are batched until the next render — which is exactly the
  // window a fast double-tap on mobile can slip through. One ref
  // serves all four save pathways (freeform, confirmation, manual,
  // post-disambiguation) since the user can only be in one at a time.
  const submittingRef = useRef(false)

  // Context data
  const [contextLoaded, setContextLoaded] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [players, setPlayers] = useState<{ id: string; name: string }[]>([])
  const [leagues, setLeagues] = useState<{ id: string; name: string }[]>([])
  const [defaultSurface, setDefaultSurface] = useState<string>('hard')
  const [defaultMatchType, setDefaultMatchType] = useState<string>('friendly')

  // Input state
  const [input, setInput] = useState('')
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState('')

  // Confirmation state
  const [pendingMatches, setPendingMatches] = useState<ParsedMatch[]>([])
  const [currentConfirmIdx, setCurrentConfirmIdx] = useState(0)
  const [duplicateWarning, setDuplicateWarning] = useState(false)

  // Disambiguation state
  const [disambiguating, setDisambiguating] = useState(false)
  const [disambiguationData, setDisambiguationData] = useState<{
    ambiguities: AmbiguousName[]
    matches: ParsedMatch[]
  } | null>(null)

  // Manual form
  const [showManual, setShowManual] = useState(false)
  const [manualForm, setManualForm] = useState(createEmptyForm())

  // Saved locations for autocomplete
  const [savedLocations, setSavedLocations] = useState<string[]>([])

  // Post-match insights card
  const [insightsData, setInsightsData] = useState<{
    insights: PostMatchInsights
    opponentName: string
    result: string
    scoreStr: string
  } | null>(null)

  // Helper: after a single-match save, try to fetch contextual insights.
  // Resolves opponent names → IDs from the (freshly reloaded) players list,
  // then calls the RPC. Returns true if insights were shown, false otherwise.
  // Never throws — insights are a nice-to-have, never worth blocking.
  const tryShowInsights = async (
    match: ParsedMatch,
    freshPlayers: { id: string; name: string }[],
  ): Promise<boolean> => {
    try {
      const opponentIds = match.opponentNames
        .map(n => freshPlayers.find(p => p.name.toLowerCase() === n.toLowerCase())?.id)
        .filter(Boolean) as string[]

      if (opponentIds.length === 0) return false

      const insights = await fetchPostMatchInsights(user!.id, opponentIds, match.surface)
      if (!insights) return false

      const scoreStr = match.sets.length > 0
        ? match.sets.map(s => `${s.myGames}-${s.opponentGames}`).join(', ')
        : 'W/O'

      setInsightsData({
        insights,
        opponentName: match.opponentNames.join(' & '),
        result: match.result,
        scoreStr,
      })
      return true
    } catch {
      return false
    }
  }

  function createEmptyForm(): ParsedMatch {
    return {
      date: localToday(),
      matchType: (defaultMatchType as MatchType) || 'friendly',
      format: 'singles',
      surface: (defaultSurface as Surface) || 'hard',
      location: null,
      leagueName: null,
      isCompetitive: false,
      result: 'win',
      opponentNames: [''],
      partnerName: null,
      sets: [{ myGames: 0, opponentGames: 0, isTiebreak: false, tiebreakScore: null }],
      isProSet: false,
      thirdSetTiebreak: false,
      retired: false,
      notes: null,
      tags: [],
      confidence: 'high',
      ambiguities: [],
    }
  }

  const loadContext = useCallback(async () => {
    if (!user) return

    const [settingsRes, playersRes, leaguesRes] = await Promise.all([
      supabase.from('user_settings').select('*').eq('user_id', user.id).single(),
      supabase.from('players').select('id, name').eq('user_id', user.id).order('name'),
      supabase.from('leagues').select('id, name').eq('user_id', user.id).order('name'),
    ])

    if (settingsRes.data) {
      setHasApiKey(!!settingsRes.data.anthropic_api_key)
      setDefaultSurface(settingsRes.data.default_surface || 'hard')
      setDefaultMatchType(settingsRes.data.default_match_type || 'friendly')
      setSavedLocations(settingsRes.data.custom_locations || [])
    }
    if (playersRes.data) setPlayers(playersRes.data)
    if (leaguesRes.data) setLeagues(leaguesRes.data)
    setContextLoaded(true)
  }, [user])

  useEffect(() => {
    loadContext()
  }, [loadContext])

  // Auto-focus textarea on mobile
  useEffect(() => {
    if (window.innerWidth < 768) {
      setTimeout(() => textareaRef.current?.focus(), 300)
    }
  }, [])

  // Detect platform so we can show the right dictation hint. iOS users get
  // the keyboard mic (tap the mic icon on the system keyboard); Mac users
  // get WISPR Flow / native dictation. Android gets Gboard's mic. We memoize
  // because userAgent never changes within a session.
  const dictationHint = useMemo(() => {
    if (typeof navigator === 'undefined') return 'native dictation'
    const ua = navigator.userAgent
    if (/iPhone|iPad|iPod/i.test(ua)) return 'tap the mic on your keyboard to dictate'
    if (/Mac/i.test(ua)) return 'use WISPR Flow or Fn+Fn to dictate'
    if (/Android/i.test(ua)) return 'tap the mic on your keyboard to dictate'
    return 'use your system dictation'
  }, [])

  const handleSubmit = async () => {
    if (submittingRef.current) return
    if (!input.trim()) {
      setError('Please describe your match before submitting.')
      return
    }
    if (!hasApiKey) {
      setError('Set up your Anthropic API key in Settings to enable smart match logging.')
      return
    }

    submittingRef.current = true
    setError('')
    setParsing(true)
    setDuplicateWarning(false)

    let result: Awaited<ReturnType<typeof parseMatchInput>>
    try {
      // Isolate parse errors from save errors so analytics can tell them apart.
      // A parse failure is usually a model/API problem; a save failure is
      // usually a DB/network problem. Bucketing them together would hide both.
      try {
        result = await parseMatchInput(
          input.trim(),
          players.map(p => p.name),
          leagues.map(l => l.name),
          defaultSurface, defaultMatchType,
        )
      } catch (parseErr) {
        logEvent({
          name: 'match_parse_failed',
          props: {
            error_category: categorizeError(parseErr),
            input_length: input.trim().length,
          },
        })
        throw parseErr
      }

      // Check all matches for ambiguous player names
      const allAmbiguities: AmbiguousName[] = []
      for (const match of result.matches) {
        const ambiguities = detectAmbiguousNames(
          match.opponentNames,
          match.partnerName,
          players,
        )
        allAmbiguities.push(...ambiguities)
      }

      // If there are ambiguous names, show disambiguation UI before proceeding
      if (allAmbiguities.length > 0) {
        // Deduplicate ambiguities by inputName (same name across matches)
        const seen = new Set<string>()
        const unique = allAmbiguities.filter(a => {
          const key = `${a.field}-${a.inputName.toLowerCase()}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })

        logEvent({
          name: 'match_disambiguation_shown',
          props: { ambiguity_count: unique.length },
        })

        setDisambiguationData({ ambiguities: unique, matches: result.matches })
        setDisambiguating(true)
        setParsing(false)
        return
      }

      // Process each match
      const highConfidence: ParsedMatch[] = []
      const needsConfirm: ParsedMatch[] = []

      for (const match of result.matches) {
        // Store raw input
        (match as ParsedMatch & { rawInput?: string }).rawInput = input.trim()

        if (match.confidence === 'high') {
          highConfidence.push(match)
        } else {
          needsConfirm.push(match)
        }
      }

      // Auto-save high confidence matches
      let savedCount = 0
      let wins = 0
      let losses = 0
      const allNewPlayers: string[] = []
      const allNewLeagues: string[] = []

      for (const match of highConfidence) {
        // Check for duplicates
        const isDup = await checkDuplicate(
          user!.id, match.date, match.opponentNames, match.sets, players
        )
        if (isDup) {
          logEvent({
            name: 'match_duplicate_detected',
            props: {
              match_type: toMatchTypeDim(match.matchType),
              surface: toSurfaceDim(match.surface),
            },
          })
          // Move to confirmation with duplicate warning
          match.ambiguities = [...match.ambiguities, 'This looks like a duplicate match (same date, opponent, and score). Save anyway?']
          match.confidence = 'medium'
          needsConfirm.push(match)
          continue
        }

        const res = await saveMatch(user!.id, match, players, leagues, input.trim())
        logEvent({
          name: 'match_saved',
          props: {
            match_type: toMatchTypeDim(match.matchType),
            surface: toSurfaceDim(match.surface),
            format: toFormatDim(match.format),
            is_competitive: !!match.isCompetitive,
            confidence: match.confidence,
            source: 'freeform',
          },
        })
        savedCount++
        if (match.result === 'win' || match.result === 'walkover') wins++
        else losses++
        allNewPlayers.push(...res.newPlayers)
        allNewLeagues.push(...res.newLeagues)
      }

      if (savedCount > 0) {
        await loadContext() // Refresh player/league lists

        // Single match: show insights card instead of a toast.
        // We re-fetch the players list because loadContext updates
        // state asynchronously — the ref'd `players` may be stale.
        let showedInsights = false
        if (savedCount === 1 && needsConfirm.length === 0) {
          const freshPlayers = await supabase
            .from('players').select('id, name').eq('user_id', user!.id)
          showedInsights = await tryShowInsights(
            highConfidence[0],
            freshPlayers.data ?? players,
          )
        }

        // Fall back to toast if insights didn't fire, or for batch saves
        if (!showedInsights) {
          const opponentStr = highConfidence.length === 1
            ? `vs ${highConfidence[0].opponentNames.join(' & ')}`
            : ''
          const scoreStr = highConfidence.length === 1 && highConfidence[0].sets.length > 0
            ? ` ${highConfidence[0].sets.map(s => `${s.myGames}-${s.opponentGames}`).join(', ')}`
            : ''
          const resultStr = highConfidence.length === 1
            ? (highConfidence[0].result === 'win' ? '✓ Win' : highConfidence[0].result === 'walkover' ? '✓ W/O' : '✗ Loss')
            : `✓ ${savedCount} matches logged (${wins}W ${losses}L)`

          let msg = savedCount === 1
            ? `${resultStr} ${opponentStr}${scoreStr}`
            : resultStr

          if (allNewPlayers.length > 0) msg += ` · New: ${allNewPlayers.join(', ')}`
          if (allNewLeagues.length > 0) msg += ` · New league: ${allNewLeagues.join(', ')}`

          showToast(msg, 'success')
          setInput('')
        }
        // If insights showed, keep the input until the card is dismissed
      }

      if (needsConfirm.length > 0) {
        setPendingMatches(needsConfirm)
        setCurrentConfirmIdx(0)
      }
    } catch (err) {
      logEvent({
        name: 'match_save_failed',
        props: { error_category: categorizeError(err), source: 'freeform' },
      })
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setParsing(false)
      submittingRef.current = false
    }
  }

  const handleConfirmSave = async (match: ParsedMatch) => {
    if (submittingRef.current) return
    submittingRef.current = true
    try {
      const res = await saveMatch(user!.id, match, players, leagues, input.trim())
      logEvent({
        name: 'match_saved',
        props: {
          match_type: toMatchTypeDim(match.matchType),
          surface: toSurfaceDim(match.surface),
          format: toFormatDim(match.format),
          is_competitive: !!match.isCompetitive,
          confidence: match.confidence,
          source: 'confirmation',
        },
      })
      await loadContext()

      // Move to next or finish
      if (currentConfirmIdx < pendingMatches.length - 1) {
        setCurrentConfirmIdx(prev => prev + 1)
        // Toast for intermediate matches in a batch
        const scoreStr = match.sets.length > 0
          ? match.sets.map(s => `${s.myGames}-${s.opponentGames}`).join(', ')
          : 'W/O'
        showToast(`✓ Saved vs ${match.opponentNames.join(' & ')} ${scoreStr}`, 'success', res.matchId)
      } else {
        // Last (or only) match in the batch — try insights
        setPendingMatches([])
        const freshPlayers = await supabase
          .from('players').select('id, name').eq('user_id', user!.id)
        const showedInsights = await tryShowInsights(match, freshPlayers.data ?? players)
        if (!showedInsights) {
          const scoreStr = match.sets.length > 0
            ? match.sets.map(s => `${s.myGames}-${s.opponentGames}`).join(', ')
            : 'W/O'
          const resultStr = match.result === 'win' ? '✓ Win' : match.result === 'walkover' ? '✓ W/O' : '✗ Loss'
          let msg = `${resultStr} vs ${match.opponentNames.join(' & ')} ${scoreStr}`
          if (res.newPlayers.length > 0) msg += ` · New: ${res.newPlayers.join(', ')}`
          showToast(msg, 'success', res.matchId)
          setInput('')
        }
      }
    } catch (err) {
      logEvent({
        name: 'match_save_failed',
        props: { error_category: categorizeError(err), source: 'confirmation' },
      })
      showToast('Failed to save match', 'error')
    } finally {
      submittingRef.current = false
    }
  }

  const handleConfirmCancel = () => {
    if (currentConfirmIdx < pendingMatches.length - 1) {
      setCurrentConfirmIdx(prev => prev + 1)
    } else {
      setPendingMatches([])
    }
  }

  const handleDisambiguationResolved = async (resolutions: Map<string, string>) => {
    if (!disambiguationData) return
    if (submittingRef.current) return
    submittingRef.current = true

    try {
    // Apply resolutions to all matches
    const resolvedMatches = disambiguationData.matches.map(match => {
      const updated = { ...match }
      updated.opponentNames = match.opponentNames.map((name, i) => {
        const key = `opponent-${i}`
        return resolutions.get(key) ?? name
      })
      if (match.partnerName) {
        const partnerResolved = resolutions.get('partner-0')
        if (partnerResolved) updated.partnerName = partnerResolved
      }
      return updated
    })

    setDisambiguating(false)
    setDisambiguationData(null)

    // Now proceed with the normal save flow using resolved names
    const highConfidence: ParsedMatch[] = []
    const needsConfirm: ParsedMatch[] = []

    for (const match of resolvedMatches) {
      (match as ParsedMatch & { rawInput?: string }).rawInput = input.trim()
      if (match.confidence === 'high') {
        highConfidence.push(match)
      } else {
        needsConfirm.push(match)
      }
    }

    let savedCount = 0
    let wins = 0
    let losses = 0
    const allNewPlayers: string[] = []
    const allNewLeagues: string[] = []

    for (const match of highConfidence) {
      const isDup = await checkDuplicate(user!.id, match.date, match.opponentNames, match.sets, players)
      if (isDup) {
        logEvent({
          name: 'match_duplicate_detected',
          props: {
            match_type: toMatchTypeDim(match.matchType),
            surface: toSurfaceDim(match.surface),
          },
        })
        match.ambiguities = [...match.ambiguities, 'This looks like a duplicate match (same date, opponent, and score). Save anyway?']
        match.confidence = 'medium'
        needsConfirm.push(match)
        continue
      }

      try {
        const res = await saveMatch(user!.id, match, players, leagues, input.trim())
        logEvent({
          name: 'match_saved',
          props: {
            match_type: toMatchTypeDim(match.matchType),
            surface: toSurfaceDim(match.surface),
            format: toFormatDim(match.format),
            is_competitive: !!match.isCompetitive,
            confidence: match.confidence,
            source: 'freeform',
          },
        })
        savedCount++
        if (match.result === 'win' || match.result === 'walkover') wins++
        else losses++
        allNewPlayers.push(...res.newPlayers)
        allNewLeagues.push(...res.newLeagues)
      } catch (err) {
        logEvent({
          name: 'match_save_failed',
          props: { error_category: categorizeError(err), source: 'freeform' },
        })
        showToast('Failed to save one of the matches', 'error')
        // Continue trying the rest — a single DB hiccup shouldn't drop the
        // whole batch the user already disambiguated.
      }
    }

    if (savedCount > 0) {
      await loadContext()

      let showedInsights = false
      if (savedCount === 1 && needsConfirm.length === 0) {
        const freshPlayers = await supabase
          .from('players').select('id, name').eq('user_id', user!.id)
        showedInsights = await tryShowInsights(
          highConfidence[0],
          freshPlayers.data ?? players,
        )
      }

      if (!showedInsights) {
        const opponentStr = highConfidence.length === 1
          ? `vs ${highConfidence[0].opponentNames.join(' & ')}`
          : ''
        const scoreStr = highConfidence.length === 1 && highConfidence[0].sets.length > 0
          ? ` ${highConfidence[0].sets.map(s => `${s.myGames}-${s.opponentGames}`).join(', ')}`
          : ''
        const resultStr = highConfidence.length === 1
          ? (highConfidence[0].result === 'win' ? '✓ Win' : highConfidence[0].result === 'walkover' ? '✓ W/O' : '✗ Loss')
          : `✓ ${savedCount} matches logged (${wins}W ${losses}L)`

        let msg = savedCount === 1
          ? `${resultStr} ${opponentStr}${scoreStr}`
          : resultStr

        if (allNewPlayers.length > 0) msg += ` · New: ${allNewPlayers.join(', ')}`
        if (allNewLeagues.length > 0) msg += ` · New league: ${allNewLeagues.join(', ')}`

        showToast(msg, 'success')
        setInput('')
      }
    }

    if (needsConfirm.length > 0) {
      setPendingMatches(needsConfirm)
      setCurrentConfirmIdx(0)
    }
    } finally {
      submittingRef.current = false
    }
  }

  const handleDisambiguationCancel = () => {
    setDisambiguating(false)
    setDisambiguationData(null)
  }

  const handleManualSave = async () => {
    if (submittingRef.current) return
    if (manualForm.opponentNames[0] === '' && manualForm.result !== 'walkover') {
      setError('Please enter at least one opponent name.')
      return
    }
    // Belt-and-braces future-date guard (the <input max=...> handles the
    // picker but not typed input).
    if (manualForm.date > localToday()) {
      setError("Match date can't be in the future.")
      return
    }

    // Check for ambiguous names before saving
    const ambiguities = detectAmbiguousNames(
      manualForm.opponentNames,
      manualForm.partnerName,
      players,
    )

    if (ambiguities.length > 0) {
      logEvent({
        name: 'match_disambiguation_shown',
        props: { ambiguity_count: ambiguities.length },
      })
      setDisambiguationData({ ambiguities, matches: [manualForm] })
      setDisambiguating(true)
      return
    }

    submittingRef.current = true
    try {
      const res = await saveMatch(user!.id, manualForm, players, leagues)
      logEvent({
        name: 'match_saved',
        props: {
          match_type: toMatchTypeDim(manualForm.matchType),
          surface: toSurfaceDim(manualForm.surface),
          format: toFormatDim(manualForm.format),
          is_competitive: !!manualForm.isCompetitive,
          confidence: 'high',
          source: 'manual',
        },
      })
      await loadContext()

      // Try insights before resetting the form
      const freshPlayers = await supabase
        .from('players').select('id, name').eq('user_id', user!.id)
      const showedInsights = await tryShowInsights(manualForm, freshPlayers.data ?? players)

      setShowManual(false)
      if (!showedInsights) {
        const scoreStr = manualForm.sets.length > 0
          ? manualForm.sets.map(s => `${s.myGames}-${s.opponentGames}`).join(', ')
          : 'W/O'
        showToast(`✓ Match saved: ${scoreStr}`, 'success', res.matchId)
      }
      setManualForm(createEmptyForm())
    } catch (err) {
      logEvent({
        name: 'match_save_failed',
        props: { error_category: categorizeError(err), source: 'manual' },
      })
      showToast('Failed to save match', 'error')
    } finally {
      submittingRef.current = false
    }
  }

  // If we need disambiguation, show that first
  if (disambiguating && disambiguationData) {
    return (
      <div className="p-4 md:p-8 max-w-2xl overflow-x-hidden">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Log Match</h1>
        <PlayerDisambiguation
          ambiguities={disambiguationData.ambiguities}
          onResolved={handleDisambiguationResolved}
          onCancel={handleDisambiguationCancel}
        />
      </div>
    )
  }

  // If we have pending confirmation matches, show the card
  if (pendingMatches.length > 0) {
    const match = pendingMatches[currentConfirmIdx]
    return (
      <div className="p-4 md:p-8 max-w-2xl overflow-x-hidden">
        <ConfirmationCard
          match={match}
          index={currentConfirmIdx}
          total={pendingMatches.length}
          players={players}
          leagues={leagues}
          onSave={handleConfirmSave}
          onCancel={handleConfirmCancel}
        />
      </div>
    )
  }

  // Manual form
  if (showManual) {
    return (
      <div className="p-4 md:p-8 max-w-2xl overflow-x-hidden">
        <ManualForm
          form={manualForm}
          setForm={setManualForm}
          players={players}
          leagues={leagues}
          savedLocations={savedLocations}
          onSave={handleManualSave}
          onCancel={() => { setShowManual(false); setManualForm(createEmptyForm()) }}
          error={error}
        />
      </div>
    )
  }

  // Freeform input
  return (
    <div className="p-4 md:p-8 max-w-2xl overflow-x-hidden">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Log Match</h1>
      <p className="text-sm text-gray-500 mb-4">
        Describe your match and we'll parse it automatically.
      </p>

      {/* Post-match insights card — shown after a successful save */}
      {insightsData && (
        <div className="mb-4">
          <PostMatchInsightsCard
            insights={insightsData.insights}
            opponentName={insightsData.opponentName}
            result={insightsData.result}
            scoreStr={insightsData.scoreStr}
            onDismiss={() => {
              setInsightsData(null)
              setInput('')
            }}
          />
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => { setInput(e.target.value); setError('') }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
          }}
          placeholder='e.g., "Beat Scott 6-4 6-3 on hard court, USTA 4.5 league match at Reston courts, serve was great"'
          rows={5}
          className="w-full px-3 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none placeholder:text-gray-500"
        />

        {error && (
          <div className="flex items-start gap-2 mt-3 text-sm text-red-600">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => { setShowManual(true); setManualForm(createEmptyForm()) }}
            className="text-sm text-gray-500 hover:text-green-600 transition-colors"
          >
            Or enter manually →
          </button>
          <button
            onClick={handleSubmit}
            disabled={parsing || !input.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {parsing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Parsing...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Log Match
              </>
            )}
          </button>
        </div>
      </div>

      {contextLoaded && !hasApiKey && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          Set up your Anthropic API key in Settings to enable smart match logging.
        </div>
      )}

      <p className="text-xs text-gray-500 mt-3">
        Tip: Press ⌘+Enter to submit. Prefer to speak? {dictationHint} — it'll type directly into the box above.
      </p>
    </div>
  )
}

/* ─── Confirmation Card ─── */

function ConfirmationCard({
  match: initial,
  index,
  total,
  players,
  leagues,
  onSave,
  onCancel,
}: {
  match: ParsedMatch
  index: number
  total: number
  players: { id: string; name: string }[]
  leagues: { id: string; name: string }[]
  onSave: (match: ParsedMatch) => void
  onCancel: () => void
}) {
  const [match, setMatch] = useState<ParsedMatch>(initial)

  const update = (changes: Partial<ParsedMatch>) => setMatch(prev => ({ ...prev, ...changes }))

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Confirm Match</h1>
        {total > 1 && (
          <span className="text-sm text-gray-500">{index + 1} of {total}</span>
        )}
      </div>

      {/* Ambiguity banner */}
      {match.ambiguities.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 space-y-1">
              {match.ambiguities.map((a, i) => <p key={i}>{a}</p>)}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
        {/* Date */}
        <Field label="Date">
          <input
            type="date"
            value={match.date}
            max={localToday()}
            onChange={e => update({ date: e.target.value })}
            className="input-field"
          />
        </Field>

        {/* Result */}
        <Field label="Result">
          <div className="flex gap-2">
            {(['win', 'loss', 'walkover'] as const).map(r => (
              <PillButton key={r} active={match.result === r} onClick={() => update({ result: r })}>
                {r === 'win' ? 'Win' : r === 'loss' ? 'Loss' : 'Walkover'}
              </PillButton>
            ))}
          </div>
        </Field>

        {/* Score */}
        {match.result !== 'walkover' && (
          <Field label="Score">
            <div className="space-y-2">
              {match.sets.map((set, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-10">Set {i + 1}</span>
                  <input
                    type="number" min={0} max={13}
                    value={set.myGames}
                    onChange={e => {
                      const newSets = [...match.sets]
                      newSets[i] = { ...newSets[i], myGames: parseInt(e.target.value) || 0 }
                      update({ sets: newSets })
                    }}
                    className="w-14 px-2 py-1.5 border border-gray-300 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <span className="text-gray-500">-</span>
                  <input
                    type="number" min={0} max={13}
                    value={set.opponentGames}
                    onChange={e => {
                      const newSets = [...match.sets]
                      newSets[i] = { ...newSets[i], opponentGames: parseInt(e.target.value) || 0 }
                      update({ sets: newSets })
                    }}
                    className="w-14 px-2 py-1.5 border border-gray-300 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  {match.sets.length > 1 && (
                    <button onClick={() => update({ sets: match.sets.filter((_, j) => j !== i) })} className="text-gray-500 hover:text-red-500">
                      <Minus size={14} />
                    </button>
                  )}
                </div>
              ))}
              {match.sets.length < 3 && (
                <button
                  onClick={() => update({ sets: [...match.sets, { myGames: 0, opponentGames: 0, isTiebreak: false, tiebreakScore: null }] })}
                  className="text-xs text-green-700 hover:text-green-800 font-medium"
                >
                  + Add Set
                </button>
              )}
            </div>
          </Field>
        )}

        {/* Opponent(s) */}
        <Field label={match.format === 'doubles' ? 'Opponents' : 'Opponent'}>
          {match.opponentNames.map((name, i) => (
            <div key={i} className="flex items-center gap-2 mb-1">
              <input
                type="text"
                value={name}
                onChange={e => {
                  const updated = [...match.opponentNames]
                  updated[i] = e.target.value
                  update({ opponentNames: updated })
                }}
                className="input-field flex-1"
                list="player-suggestions"
              />
              {!players.find(p => p.name.toLowerCase() === name.toLowerCase()) && name && (
                <span className="text-xs text-amber-600 whitespace-nowrap">✨ New</span>
              )}
            </div>
          ))}
          <datalist id="player-suggestions">
            {players.map(p => <option key={p.id} value={p.name} />)}
          </datalist>
        </Field>

        {/* Partner (doubles) */}
        {match.format === 'doubles' && (
          <Field label="Partner">
            <input
              type="text"
              value={match.partnerName || ''}
              onChange={e => update({ partnerName: e.target.value || null })}
              className="input-field"
              list="player-suggestions"
            />
          </Field>
        )}

        {/* Surface */}
        <Field label="Surface">
          <div className="flex flex-wrap gap-2">
            {SURFACES.map(s => (
              <PillButton key={s.value} active={match.surface === s.value} onClick={() => update({ surface: s.value })}>
                {s.label}
              </PillButton>
            ))}
          </div>
        </Field>

        {/* Match Type */}
        <Field label="Match Type">
          <div className="flex flex-wrap gap-2">
            {MATCH_TYPES.map(t => (
              <PillButton key={t.value} active={match.matchType === t.value} onClick={() => update({ matchType: t.value })}>
                {t.label}
              </PillButton>
            ))}
          </div>
        </Field>

        {/* Competitive */}
        <Field label="Competitive match">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={match.isCompetitive}
              onChange={e => update({ isCompetitive: e.target.checked })}
              className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
            />
            <span className="text-sm text-gray-600">Counts toward competitive record</span>
          </label>
        </Field>

        {/* League */}
        {(match.matchType === 'league' || match.matchType === 'tournament') && (
          <Field label="League / Tournament">
            <input
              type="text"
              value={match.leagueName || ''}
              onChange={e => update({ leagueName: e.target.value || null })}
              className="input-field"
              list="league-suggestions"
              placeholder="Select or type new..."
            />
            {match.leagueName && !leagues.find(l => l.name.toLowerCase() === match.leagueName!.toLowerCase()) && (
              <span className="text-xs text-amber-600 mt-1 block">✨ New league</span>
            )}
            <datalist id="league-suggestions">
              {leagues.map(l => <option key={l.id} value={l.name} />)}
            </datalist>
          </Field>
        )}

        {/* Location */}
        <Field label="Location">
          <input
            type="text"
            value={match.location || ''}
            onChange={e => update({ location: e.target.value || null })}
            className="input-field"
            placeholder="e.g., Reston Community Courts"
          />
        </Field>

        {/* Notes */}
        <Field label="Notes">
          <textarea
            value={match.notes || ''}
            onChange={e => update({ notes: e.target.value || null })}
            rows={2}
            className="input-field resize-none"
            placeholder="Any notes about the match..."
          />
        </Field>

        {/* Tags */}
        <Field label="Tags">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {match.tags.map((tag, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-700">
                {tag}
                <button onClick={() => update({ tags: match.tags.filter((_, j) => j !== i) })} className="text-gray-500 hover:text-red-500">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <TagInput tags={match.tags} onAdd={(tag) => update({ tags: [...match.tags, tag] })} />
        </Field>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(match)}
            className="flex-1 px-4 py-2.5 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Save Match
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Manual Form ─── */

function ManualForm({
  form,
  setForm,
  players,
  leagues,
  savedLocations,
  onSave,
  onCancel,
  error,
}: {
  form: ParsedMatch
  setForm: (f: ParsedMatch) => void
  players: { id: string; name: string }[]
  leagues: { id: string; name: string }[]
  savedLocations: string[]
  onSave: () => void
  onCancel: () => void
  error: string
}) {
  const update = (changes: Partial<ParsedMatch>) => setForm({ ...form, ...changes })

  // Auto-set competitive based on match type
  const handleMatchTypeChange = (t: MatchType) => {
    const isComp = t === 'league' || t === 'tournament'
    update({ matchType: t, isCompetitive: isComp })
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Log Match Manually</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
        {/* Date */}
        <Field label="Date">
          <input type="date" value={form.date} max={localToday()} onChange={e => update({ date: e.target.value })} className="input-field" />
        </Field>

        {/* Match Type */}
        <Field label="Match Type">
          <div className="flex flex-wrap gap-2">
            {MATCH_TYPES.map(t => (
              <PillButton key={t.value} active={form.matchType === t.value} onClick={() => handleMatchTypeChange(t.value)}>
                {t.label}
              </PillButton>
            ))}
          </div>
        </Field>

        {/* Competitive */}
        <Field label="">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isCompetitive}
              onChange={e => update({ isCompetitive: e.target.checked })}
              className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
            />
            <span className="text-sm text-gray-600">Competitive match</span>
          </label>
        </Field>

        {/* League */}
        {(form.matchType === 'league' || form.matchType === 'tournament') && (
          <Field label="League / Tournament">
            <input
              type="text"
              value={form.leagueName || ''}
              onChange={e => update({ leagueName: e.target.value || null })}
              className="input-field"
              list="league-list"
              placeholder="Select or add new..."
            />
            <datalist id="league-list">
              {leagues.map(l => <option key={l.id} value={l.name} />)}
            </datalist>
          </Field>
        )}

        {/* Format */}
        <Field label="Format">
          <div className="flex gap-2">
            <PillButton active={form.format === 'singles'} onClick={() => update({ format: 'singles', opponentNames: [form.opponentNames[0] || ''], partnerName: null })}>
              Singles
            </PillButton>
            <PillButton active={form.format === 'doubles'} onClick={() => update({ format: 'doubles', opponentNames: [form.opponentNames[0] || '', form.opponentNames[1] || ''] })}>
              Doubles
            </PillButton>
          </div>
        </Field>

        {/* Surface */}
        <Field label="Surface">
          <div className="flex flex-wrap gap-2">
            {SURFACES.map(s => (
              <PillButton key={s.value} active={form.surface === s.value} onClick={() => update({ surface: s.value })}>
                {s.label}
              </PillButton>
            ))}
          </div>
        </Field>

        {/* Location */}
        <Field label="Location">
          <input
            type="text"
            value={form.location || ''}
            onChange={e => update({ location: e.target.value || null })}
            className="input-field"
            list="location-list"
            placeholder="e.g., Reston Community Courts"
          />
          <datalist id="location-list">
            {savedLocations.map(l => <option key={l} value={l} />)}
          </datalist>
        </Field>

        {/* Opponent(s) */}
        <Field label={form.format === 'doubles' ? 'Opponents' : 'Opponent'}>
          {form.opponentNames.map((name, i) => (
            <input
              key={i}
              type="text"
              value={name}
              onChange={e => {
                const updated = [...form.opponentNames]
                updated[i] = e.target.value
                update({ opponentNames: updated })
              }}
              className="input-field mb-1"
              list="player-list"
              placeholder={`Opponent ${form.format === 'doubles' ? i + 1 : ''}`}
            />
          ))}
          <datalist id="player-list">
            {players.map(p => <option key={p.id} value={p.name} />)}
          </datalist>
        </Field>

        {/* Partner */}
        {form.format === 'doubles' && (
          <Field label="Partner">
            <input
              type="text"
              value={form.partnerName || ''}
              onChange={e => update({ partnerName: e.target.value || null })}
              className="input-field"
              list="player-list"
              placeholder="Your doubles partner"
            />
          </Field>
        )}

        {/* Result */}
        <Field label="Result">
          <div className="flex gap-2">
            {(['win', 'loss', 'walkover'] as const).map(r => (
              <PillButton key={r} active={form.result === r} onClick={() => update({ result: r })}>
                {r === 'win' ? 'Win' : r === 'loss' ? 'Loss' : 'Walkover'}
              </PillButton>
            ))}
          </div>
        </Field>

        {/* Score */}
        {form.result !== 'walkover' && (
          <Field label="Score">
            <div className="space-y-2">
              {form.sets.map((set, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-10">Set {i + 1}</span>
                  <input
                    type="number" min={0} max={13}
                    value={set.myGames}
                    onChange={e => {
                      const newSets = [...form.sets]
                      newSets[i] = { ...newSets[i], myGames: parseInt(e.target.value) || 0 }
                      update({ sets: newSets })
                    }}
                    className="w-14 px-2 py-1.5 border border-gray-300 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <span className="text-gray-500">-</span>
                  <input
                    type="number" min={0} max={13}
                    value={set.opponentGames}
                    onChange={e => {
                      const newSets = [...form.sets]
                      newSets[i] = { ...newSets[i], opponentGames: parseInt(e.target.value) || 0 }
                      update({ sets: newSets })
                    }}
                    className="w-14 px-2 py-1.5 border border-gray-300 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  {form.sets.length > 1 && (
                    <button onClick={() => update({ sets: form.sets.filter((_, j) => j !== i) })} className="text-gray-500 hover:text-red-500">
                      <Minus size={14} />
                    </button>
                  )}
                </div>
              ))}
              {form.sets.length < 3 && (
                <button
                  onClick={() => update({ sets: [...form.sets, { myGames: 0, opponentGames: 0, isTiebreak: false, tiebreakScore: null }] })}
                  className="text-xs text-green-700 hover:text-green-800 font-medium"
                >
                  + Add Set
                </button>
              )}
            </div>
          </Field>
        )}

        {/* Tags */}
        <Field label="Tags">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {form.tags.map((tag, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-700">
                {tag}
                <button onClick={() => update({ tags: form.tags.filter((_, j) => j !== i) })} className="text-gray-500 hover:text-red-500">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <TagInput tags={form.tags} onAdd={(tag) => update({ tags: [...form.tags, tag] })} />
        </Field>

        {/* Notes */}
        <Field label="Notes">
          <textarea
            value={form.notes || ''}
            onChange={e => update({ notes: e.target.value || null })}
            rows={3}
            className="input-field resize-none"
            placeholder="How did the match go? Any observations..."
          />
        </Field>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-600">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="flex-1 px-4 py-2.5 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Save Match
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Shared UI Components ─── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>}
      {children}
    </div>
  )
}

function PillButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
        active ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

function TagInput({ tags, onAdd }: { tags: string[]; onAdd: (tag: string) => void }) {
  const [value, setValue] = useState('')

  const handleAdd = () => {
    const trimmed = value.trim()
    if (trimmed && !tags.includes(trimmed)) {
      onAdd(trimmed)
      setValue('')
    }
  }

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
        placeholder="Add tag..."
        className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
      />
      <button
        type="button"
        onClick={handleAdd}
        disabled={!value.trim()}
        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm transition-colors disabled:opacity-50"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
