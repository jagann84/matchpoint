import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fetchMatchesWithDetails, type MatchWithDetails } from '../lib/matchQueries'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { ArrowLeft, Loader2 } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

export default function PartnerStatsPage() {
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

  // Doubles matches with this partner
  const partnerMatches = useMemo(() =>
    allMatches.filter(m => m.partner_id === id)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [allMatches, id]
  )

  // Overall stats
  const stats = useMemo(() => {
    const wins = partnerMatches.filter(m => m.result === 'win' || m.result === 'walkover').length
    const losses = partnerMatches.filter(m => m.result === 'loss').length
    const total = wins + losses
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0
    return { wins, losses, total, winRate }
  }, [partnerMatches])

  // By surface
  const bySurface = useMemo(() => {
    const map = new Map<string, { wins: number; total: number }>()
    for (const m of partnerMatches) {
      if (!map.has(m.surface)) map.set(m.surface, { wins: 0, total: 0 })
      const e = map.get(m.surface)!
      e.total++
      if (m.result === 'win' || m.result === 'walkover') e.wins++
    }
    return [...map.entries()].map(([name, { wins, total }]) => ({
      name: name.replace('-', ' '), winRate: Math.round((wins / total) * 100), total,
    }))
  }, [partnerMatches])

  // Opponents faced together
  const opponentsFaced = useMemo(() => {
    const map = new Map<string, { id: string; name: string; wins: number; losses: number }>()
    for (const m of partnerMatches) {
      for (const o of m.opponents) {
        if (!map.has(o.id)) map.set(o.id, { id: o.id, name: o.name, wins: 0, losses: 0 })
        const e = map.get(o.id)!
        if (m.result === 'win' || m.result === 'walkover') e.wins++
        else e.losses++
      }
    }
    return [...map.values()]
      .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses))
  }, [partnerMatches])

  // By league
  const byLeague = useMemo(() => {
    const map = new Map<string, { wins: number; total: number }>()
    for (const m of partnerMatches) {
      if (!m.league_name) continue
      if (!map.has(m.league_name)) map.set(m.league_name, { wins: 0, total: 0 })
      const e = map.get(m.league_name)!
      e.total++
      if (m.result === 'win' || m.result === 'walkover') e.wins++
    }
    return [...map.entries()].map(([name, { wins, total }]) => ({
      name, winRate: Math.round((wins / total) * 100), total,
    }))
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
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={16} /> Back
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">Partner: {playerName}</h1>
      <p className="text-sm text-gray-500 mb-4">Doubles record together</p>

      {partnerMatches.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-sm text-gray-500">No doubles matches recorded with {playerName}.</p>
        </div>
      ) : (
        <>
          {/* Main record */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
              <p className="text-xs text-gray-500 uppercase mb-1">Wins</p>
              <p className="text-2xl font-bold text-green-600">{stats.wins}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
              <p className="text-xs text-gray-500 uppercase mb-1">Win Rate</p>
              <p className={`text-2xl font-bold ${stats.winRate >= 50 ? 'text-green-600' : 'text-red-500'}`}>
                {stats.winRate}%
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
              <p className="text-xs text-gray-500 uppercase mb-1">Losses</p>
              <p className="text-2xl font-bold text-red-500">{stats.losses}</p>
            </div>
          </div>

          {/* Surface breakdown */}
          {bySurface.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">By Surface</h2>
              <ResponsiveContainer width="100%" height={Math.max(120, bySurface.length * 50)}>
                <BarChart data={bySurface} barSize={24} layout="vertical">
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={80} className="capitalize" />
                  <Tooltip
                    formatter={(value: number, _name: string, props: { payload: { total: number } }) => [`${value}% (${props.payload.total} matches)`, 'Win Rate']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                  />
                  <Bar dataKey="winRate" radius={[0, 4, 4, 0]}>
                    {bySurface.map((entry, i) => (
                      <Cell key={i} fill={entry.winRate >= 50 ? '#16a34a' : '#dc2626'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* League breakdown */}
          {byLeague.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">By League</h2>
              <div className="space-y-2">
                {byLeague.map(d => (
                  <div key={d.name} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{d.name}</span>
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
          )}

          {/* Opponents faced */}
          {opponentsFaced.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Opponents Faced Together</h2>
              <div className="space-y-2">
                {opponentsFaced.map(o => {
                  const total = o.wins + o.losses
                  const winRate = Math.round((o.wins / total) * 100)
                  return (
                    <button
                      key={o.id}
                      onClick={() => navigate(`/h2h/${o.id}`)}
                      className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                    >
                      <span className="text-sm text-gray-700">{o.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{o.wins}W-{o.losses}L</span>
                        <span className={`text-xs font-semibold ${winRate >= 50 ? 'text-green-600' : 'text-red-500'}`}>
                          {winRate}%
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Match list */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">
              All Doubles with {playerName} ({partnerMatches.length})
            </h2>
            <div className="space-y-2">
              {partnerMatches.map(m => (
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
                    <span className="text-xs text-gray-500 truncate">
                      vs {m.opponents.map(o => o.name).join(' & ')}
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
        </>
      )}
    </div>
  )
}
