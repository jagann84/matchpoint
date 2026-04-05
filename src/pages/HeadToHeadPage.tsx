import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fetchMatchesWithDetails, type MatchWithDetails } from '../lib/matchQueries'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { ArrowLeft, Loader2 } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line,
} from 'recharts'

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

  // Breakdown by surface
  const bySurface = useMemo(() => {
    const map = new Map<string, { wins: number; total: number }>()
    for (const m of opponentMatches) {
      if (!map.has(m.surface)) map.set(m.surface, { wins: 0, total: 0 })
      const e = map.get(m.surface)!
      e.total++
      if (m.result === 'win' || m.result === 'walkover') e.wins++
    }
    return [...map.entries()].map(([name, { wins, total }]) => ({
      name: name.replace('-', ' '), winRate: Math.round((wins / total) * 100), total,
    }))
  }, [opponentMatches])

  // Breakdown by match type
  const byMatchType = useMemo(() => {
    const map = new Map<string, { wins: number; total: number }>()
    for (const m of opponentMatches) {
      if (!map.has(m.match_type)) map.set(m.match_type, { wins: 0, total: 0 })
      const e = map.get(m.match_type)!
      e.total++
      if (m.result === 'win' || m.result === 'walkover') e.wins++
    }
    return [...map.entries()].map(([name, { wins, total }]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1), winRate: Math.round((wins / total) * 100), total,
    }))
  }, [opponentMatches])

  // Breakdown by league
  const byLeague = useMemo(() => {
    const map = new Map<string, { wins: number; total: number }>()
    for (const m of opponentMatches) {
      if (!m.league_name) continue
      if (!map.has(m.league_name)) map.set(m.league_name, { wins: 0, total: 0 })
      const e = map.get(m.league_name)!
      e.total++
      if (m.result === 'win' || m.result === 'walkover') e.wins++
    }
    return [...map.entries()].map(([name, { wins, total }]) => ({
      name, winRate: Math.round((wins / total) * 100), total,
    }))
  }, [opponentMatches])

  // Trend (last 10 matches, oldest first for the chart)
  const trendData = useMemo(() => {
    const last10 = opponentMatches.slice(0, 10).reverse()
    let cumWins = 0
    let cumTotal = 0
    return last10.map(m => {
      cumTotal++
      if (m.result === 'win' || m.result === 'walkover') cumWins++
      return {
        label: format(new Date(m.date), 'M/d'),
        result: m.result === 'win' || m.result === 'walkover' ? 1 : 0,
        winRate: Math.round((cumWins / cumTotal) * 100),
      }
    })
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
        <Loader2 className="animate-spin text-green-600" size={32} />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 focus:outline-none focus-visible:text-gray-700">
        <ArrowLeft size={16} /> Back
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">vs {playerName}</h1>
      <p className="text-sm text-gray-500 mb-4">Head-to-head record</p>

      {/* Main H2H record */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
          <p className="text-xs text-gray-500 uppercase mb-1">Wins</p>
          <p className="text-2xl font-bold text-green-600">{oppStats.wins}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
          <p className="text-xs text-gray-500 uppercase mb-1">Win Rate</p>
          <p className={`text-2xl font-bold ${oppStats.winRate >= 50 ? 'text-green-600' : 'text-red-500'}`}>
            {oppStats.winRate}%
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
          <p className="text-xs text-gray-500 uppercase mb-1">Losses</p>
          <p className="text-2xl font-bold text-red-500">{oppStats.losses}</p>
        </div>
      </div>

      {/* Trend chart */}
      {trendData.length >= 2 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Win Rate Trend (Last {trendData.length} Matches)</h2>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={trendData}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip formatter={(v: number) => [`${v}%`, 'Win Rate']} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
              <Line type="monotone" dataKey="winRate" stroke="#16a34a" strokeWidth={2} dot={{ fill: '#16a34a', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Breakdowns */}
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        {bySurface.length > 0 && (
          <BreakdownCard title="By Surface" data={bySurface} />
        )}
        {byMatchType.length > 0 && (
          <BreakdownCard title="By Match Type" data={byMatchType} />
        )}
      </div>

      {byLeague.length > 0 && (
        <div className="mb-4">
          <BreakdownCard title="By League" data={byLeague} />
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
              <p className={`text-sm font-bold ${partnerStats.winRate >= 50 ? 'text-green-600' : 'text-red-500'}`}>
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
        <div className="space-y-2">
          {opponentMatches.map(m => (
            <button
              key={m.id}
              onClick={() => navigate(`/history/${m.id}`)}
              className="w-full flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-xs font-bold w-5 ${
                  m.result === 'win' ? 'text-green-600' : m.result === 'walkover' ? 'text-blue-600' : 'text-red-500'
                }`}>
                  {m.result === 'win' ? 'W' : m.result === 'walkover' ? 'W/O' : 'L'}
                </span>
                <span className="text-xs text-gray-500">
                  {format(new Date(m.date), 'MMM d, yyyy')}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs font-mono text-gray-700">
                  {m.result === 'walkover' ? 'W/O' : m.sets.map(s => `${s.my_games}-${s.opponent_games}`).join(', ')}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  m.surface === 'clay' ? 'bg-orange-100 text-orange-700' :
                  m.surface === 'grass' ? 'bg-emerald-100 text-emerald-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {m.surface.replace('-', ' ')}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function BreakdownCard({ title, data }: { title: string; data: { name: string; winRate: number; total: number }[] }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">{title}</h2>
      <div className="space-y-2">
        {data.map(d => (
          <div key={d.name} className="flex items-center justify-between">
            <span className="text-sm text-gray-700 capitalize">{d.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{d.total} match{d.total !== 1 ? 'es' : ''}</span>
              <span className={`text-xs font-semibold ${d.winRate >= 50 ? 'text-green-600' : 'text-red-500'}`}>
                {d.winRate}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
