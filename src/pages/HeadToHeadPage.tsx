import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fetchMatchesWithDetails, type MatchWithDetails } from '../lib/matchQueries'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { ArrowLeft, Loader2 } from 'lucide-react'
import RecordSummary from '../components/stats/RecordSummary'
import BreakdownList from '../components/stats/BreakdownList'
import MatchList from '../components/stats/MatchList'
import TrendChart from '../components/stats/TrendChart'
import { useMatchBreakdown } from '../hooks/useMatchBreakdown'

export default function HeadToHeadPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [allMatches, setAllMatches] = useState<MatchWithDetails[]>([])
  const [playerName, setPlayerName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !id) return
    Promise.all([
      fetchMatchesWithDetails(user.id),
      supabase.from('players').select('name').eq('id', id).single(),
    ]).then(([matches, playerRes]) => {
      setAllMatches(matches)
      if (playerRes.data) setPlayerName(playerRes.data.name)
      setLoading(false)
    })
  }, [user, id])

  // Matches as opponent
  const opponentMatches = useMemo(() =>
    allMatches.filter(m => m.opponents.some(o => o.id === id))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [allMatches, id]
  )

  // Matches as partner
  const partnerMatches = useMemo(() =>
    allMatches.filter(m => m.partner_id === id)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [allMatches, id]
  )

  // Opponent stats
  const oppStats = useMemo(() => {
    const wins = opponentMatches.filter(m => m.result === 'win' || m.result === 'walkover').length
    const losses = opponentMatches.filter(m => m.result === 'loss').length
    const total = wins + losses
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0
    return { wins, losses, total, winRate }
  }, [opponentMatches])

  const { bySurface, byMatchType, byLeague } = useMatchBreakdown(opponentMatches)

  // Trend (last 10 matches, oldest first for the chart)
  const trendData = useMemo(() => {
    const last10 = opponentMatches.slice(0, 10).reverse()
    return last10.map((m, i) => ({
      match: i + 1,
      result: (m.result === 'win' || m.result === 'walkover' ? 'W' : 'L') as 'W' | 'L',
      label: format(new Date(m.date), 'M/d'),
    }))
  }, [opponentMatches])

  // Partner stats
  const partnerStats = useMemo(() => {
    if (partnerMatches.length === 0) return null
    const wins = partnerMatches.filter(m => m.result === 'win' || m.result === 'walkover').length
    const losses = partnerMatches.filter(m => m.result === 'loss').length
    const total = wins + losses
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0

    // Opponents faced together
    const oppMap = new Map<string, number>()
    for (const m of partnerMatches) {
      for (const o of m.opponents) {
        oppMap.set(o.name, (oppMap.get(o.name) || 0) + 1)
      }
    }
    const topOpponents = [...oppMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }))

    return { wins, losses, total, winRate, topOpponents }
  }, [partnerMatches])

  if (loading) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-green-700" size={32} />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-700 rounded">
        <ArrowLeft size={16} /> Back
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">vs {playerName}</h1>
      <p className="text-sm text-gray-500 mb-4">Head-to-head record</p>

      {/* Main H2H record */}
      <RecordSummary wins={oppStats.wins} losses={oppStats.losses} winRate={oppStats.winRate} />

      {/* Trend chart */}
      <TrendChart data={trendData} title={`Win Rate Trend (Last ${trendData.length} Matches)`} />

      {/* Breakdowns */}
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <BreakdownList title="By Surface" data={bySurface} />
        <BreakdownList title="By Match Type" data={byMatchType} />
      </div>

      {byLeague.length > 0 && (
        <div className="mb-4">
          <BreakdownList title="By League" data={byLeague} />
        </div>
      )}

      {/* Partner Stats section */}
      {partnerStats && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Partner Stats (Doubles with {playerName})</h2>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center">
              <p className="text-xs text-gray-500">Record</p>
              <p className="text-sm font-bold text-gray-900">{partnerStats.wins}W-{partnerStats.losses}L</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Win Rate</p>
              <p className={`text-sm font-bold ${partnerStats.winRate >= 50 ? 'text-green-700' : 'text-red-600'}`}>
                {partnerStats.winRate}%
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Matches</p>
              <p className="text-sm font-bold text-gray-900">{partnerStats.total}</p>
            </div>
          </div>
          {partnerStats.topOpponents.length > 0 && (
            <>
              <h3 className="text-xs font-medium text-gray-500 uppercase mt-3 mb-2">Opponents Faced Together</h3>
              <div className="space-y-1.5">
                {partnerStats.topOpponents.map(o => (
                  <div key={o.name} className="flex justify-between text-sm">
                    <span className="text-gray-700">{o.name}</span>
                    <span className="text-gray-500">{o.count}x</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Match list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">
          All Matches vs {playerName} ({opponentMatches.length})
        </h2>
        <MatchList matches={opponentMatches} onMatchClick={(id) => navigate(`/history/${id}`)} />
      </div>
    </div>
  )
}
