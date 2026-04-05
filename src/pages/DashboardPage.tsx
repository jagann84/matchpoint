import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { fetchMatchesWithDetails, type MatchWithDetails } from '../lib/matchQueries'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { Loader2, TrendingUp, TrendingDown, Minus, Trophy, Target } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

type TimePeriod = 'all' | 'year' | 'month'

interface Goal {
  id: string
  target_win_rate: number
  year: number
  match_type_filter: string | null
  league_filter: string | null
  competitive_only: boolean
  is_active: boolean
}

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [allMatches, setAllMatches] = useState<MatchWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<TimePeriod>('all')
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()))
  const [goal, setGoal] = useState<Goal | null>(null)

  const loadData = useCallback(async () => {
    if (!user) return
    const [matches, goalRes] = await Promise.all([
      fetchMatchesWithDetails(user.id),
      supabase.from('goals').select('*').eq('user_id', user.id).eq('is_active', true).single(),
    ])
    setAllMatches(matches)
    if (goalRes.data) setGoal(goalRes.data)
    setLoading(false)
  }, [user])

  useEffect(() => { loadData() }, [loadData])

  // Available years
  const years = useMemo(() =>
    [...new Set(allMatches.map(m => m.date.slice(0, 4)))].sort().reverse(),
    [allMatches]
  )

  // Filter matches by period
  const matches = useMemo(() => {
    const now = new Date()
    const currentYear = String(now.getFullYear())
    const currentMonth = format(now, 'yyyy-MM')

    return allMatches.filter(m => {
      if (period === 'year') return m.date.startsWith(selectedYear)
      if (period === 'month') return m.date.startsWith(currentMonth)
      return true
    })
  }, [allMatches, period, selectedYear])

  // Stats
  const stats = useMemo(() => {
    const wins = matches.filter(m => m.result === 'win' || m.result === 'walkover').length
    const losses = matches.filter(m => m.result === 'loss').length
    const total = wins + losses
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0

    // Streak
    let streak = 0
    let streakType: 'W' | 'L' | '' = ''
    for (const m of matches) {
      const isWin = m.result === 'win' || m.result === 'walkover'
      if (streakType === '') {
        streakType = isWin ? 'W' : 'L'
        streak = 1
      } else if ((isWin && streakType === 'W') || (!isWin && streakType === 'L')) {
        streak++
      } else {
        break
      }
    }

    return { wins, losses, total, winRate, streak, streakType }
  }, [matches])

  // Win rate by surface
  const surfaceData = useMemo(() => {
    const map = new Map<string, { wins: number; total: number }>()
    for (const m of matches) {
      const s = m.surface
      if (!map.has(s)) map.set(s, { wins: 0, total: 0 })
      const entry = map.get(s)!
      entry.total++
      if (m.result === 'win' || m.result === 'walkover') entry.wins++
    }
    return [...map.entries()]
      .map(([name, { wins, total }]) => ({
        name: name.replace('-', ' '),
        winRate: Math.round((wins / total) * 100),
        total,
      }))
      .sort((a, b) => b.total - a.total)
  }, [matches])

  // Win rate by match type
  const matchTypeData = useMemo(() => {
    const map = new Map<string, { wins: number; total: number }>()
    for (const m of matches) {
      const t = m.match_type
      if (!map.has(t)) map.set(t, { wins: 0, total: 0 })
      const entry = map.get(t)!
      entry.total++
      if (m.result === 'win' || m.result === 'walkover') entry.wins++
    }
    return [...map.entries()]
      .map(([name, { wins, total }]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        winRate: Math.round((wins / total) * 100),
        total,
      }))
      .sort((a, b) => b.total - a.total)
  }, [matches])

  // Win rate by league
  const leagueData = useMemo(() => {
    const map = new Map<string, { wins: number; total: number }>()
    for (const m of matches) {
      if (!m.league_name) continue
      if (!map.has(m.league_name)) map.set(m.league_name, { wins: 0, total: 0 })
      const entry = map.get(m.league_name)!
      entry.total++
      if (m.result === 'win' || m.result === 'walkover') entry.wins++
    }
    return [...map.entries()]
      .map(([name, { wins, total }]) => ({
        name,
        winRate: Math.round((wins / total) * 100),
        total,
      }))
      .sort((a, b) => b.total - a.total)
  }, [matches])

  // Top 3 opponents
  const topOpponents = useMemo(() => {
    const map = new Map<string, { id: string; name: string; wins: number; losses: number }>()
    for (const m of matches) {
      for (const opp of m.opponents) {
        if (!map.has(opp.id)) map.set(opp.id, { id: opp.id, name: opp.name, wins: 0, losses: 0 })
        const entry = map.get(opp.id)!
        if (m.result === 'win' || m.result === 'walkover') entry.wins++
        else entry.losses++
      }
    }
    return [...map.values()]
      .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses))
      .slice(0, 3)
  }, [matches])

  // Doubles partner win rates
  const partnerStats = useMemo(() => {
    const map = new Map<string, { id: string; name: string; wins: number; losses: number }>()
    for (const m of matches) {
      if (m.format !== 'doubles' || !m.partner_id || !m.partner_name) continue
      if (!map.has(m.partner_id)) map.set(m.partner_id, { id: m.partner_id, name: m.partner_name, wins: 0, losses: 0 })
      const entry = map.get(m.partner_id)!
      if (m.result === 'win' || m.result === 'walkover') entry.wins++
      else entry.losses++
    }
    return [...map.values()]
      .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses))
  }, [matches])

  // Overall vs Competitive
  const comparisonData = useMemo(() => {
    const allWins = matches.filter(m => m.result === 'win' || m.result === 'walkover').length
    const allTotal = matches.length
    const compMatches = matches.filter(m => m.is_competitive)
    const compWins = compMatches.filter(m => m.result === 'win' || m.result === 'walkover').length
    const compTotal = compMatches.length
    const casualMatches = matches.filter(m => !m.is_competitive)
    const casualWins = casualMatches.filter(m => m.result === 'win' || m.result === 'walkover').length
    const casualTotal = casualMatches.length

    // Only show if there's a mix of competitive and non-competitive
    if (compTotal === 0 || casualTotal === 0) return null

    return [
      { name: 'Overall', winRate: allTotal > 0 ? Math.round((allWins / allTotal) * 100) : 0, total: allTotal },
      { name: 'Competitive', winRate: compTotal > 0 ? Math.round((compWins / compTotal) * 100) : 0, total: compTotal },
      { name: 'Casual', winRate: casualTotal > 0 ? Math.round((casualWins / casualTotal) * 100) : 0, total: casualTotal },
    ]
  }, [matches])

  // Year-over-year
  const yoyData = useMemo(() => {
    if (years.length < 2) return null
    return years.slice(0, 3).map(year => {
      const ym = allMatches.filter(m => m.date.startsWith(year))
      const wins = ym.filter(m => m.result === 'win' || m.result === 'walkover').length
      const total = ym.length
      return { year, winRate: total > 0 ? Math.round((wins / total) * 100) : 0, total }
    }).reverse()
  }, [allMatches, years])

  // Goal progress
  const goalProgress = useMemo(() => {
    if (!goal) return null
    let goalMatches = allMatches.filter(m => m.date.startsWith(String(goal.year)))
    if (goal.competitive_only) goalMatches = goalMatches.filter(m => m.is_competitive)
    if (goal.match_type_filter) goalMatches = goalMatches.filter(m => m.match_type === goal.match_type_filter)
    if (goal.league_filter) goalMatches = goalMatches.filter(m => m.league_id === goal.league_filter)

    const wins = goalMatches.filter(m => m.result === 'win' || m.result === 'walkover').length
    const total = goalMatches.length
    const currentRate = total > 0 ? Math.round((wins / total) * 100) : 0
    const status = currentRate >= goal.target_win_rate ? 'ahead' : currentRate >= goal.target_win_rate - 5 ? 'on track' : 'behind'

    return { target: goal.target_win_rate, current: currentRate, played: total, wins, year: goal.year, status }
  }, [goal, allMatches])

  // Recent 5
  const recentMatches = matches.slice(0, 5)

  if (loading) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-green-600" size={32} />
      </div>
    )
  }

  if (allMatches.length === 0) {
    return (
      <div className="p-4 md:p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <Trophy className="mx-auto text-gray-300 mb-3" size={48} />
          <h3 className="text-base font-semibold text-gray-700 mb-1">No matches yet</h3>
          <p className="text-sm text-gray-500 mb-4">Log your first match to see your stats here.</p>
          <button
            onClick={() => navigate('/log-match')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Log Match
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Dashboard</h1>

      {/* Goal progress */}
      {goalProgress && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target size={16} className="text-green-600" />
              <span className="text-sm font-semibold text-gray-900">{goalProgress.year} Goal: {goalProgress.target}% win rate</span>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              goalProgress.status === 'ahead' ? 'bg-green-100 text-green-700' :
              goalProgress.status === 'on track' ? 'bg-amber-100 text-amber-700' :
              'bg-red-100 text-red-700'
            }`}>
              {goalProgress.status}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 mb-1.5">
            <div
              className={`h-3 rounded-full transition-all ${
                goalProgress.current >= goalProgress.target ? 'bg-green-500' : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(goalProgress.current, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Currently {goalProgress.current}% ({goalProgress.wins}W in {goalProgress.played} matches)</span>
            <span>Target: {goalProgress.target}%</span>
          </div>
        </div>
      )}

      {/* Period filter */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {(['all', 'year', 'month'] as const).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            aria-pressed={period === p}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 ${
              period === p ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {p === 'all' ? 'All Time' : p === 'year' ? 'This Year' : 'This Month'}
          </button>
        ))}
        {period === 'year' && years.length > 1 && (
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>

      {/* Main stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Total" value={String(stats.total)} />
        <StatCard
          label="Record"
          value={`${stats.wins}W - ${stats.losses}L`}
          valueColor={stats.wins > stats.losses ? 'text-green-600' : stats.wins < stats.losses ? 'text-red-600' : 'text-gray-900'}
        />
        <StatCard label="Win Rate" value={`${stats.winRate}%`} large />
        <StatCard
          label="Streak"
          value={stats.streak > 0 ? `${stats.streak}${stats.streakType}` : '-'}
          icon={stats.streakType === 'W' ? <TrendingUp size={16} className="text-green-500" /> : stats.streakType === 'L' ? <TrendingDown size={16} className="text-red-500" /> : <Minus size={16} className="text-gray-400" />}
        />
      </div>

      {/* Two column layout on desktop */}
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        {/* Recent matches */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Recent Matches</h2>
            <button onClick={() => navigate('/history')} className="text-xs text-green-600 hover:text-green-700 font-medium focus:outline-none focus-visible:underline">View all</button>
          </div>
          {recentMatches.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No matches in this period.</p>
          ) : (
            <div className="space-y-2">
              {recentMatches.map(m => (
                <button
                  key={m.id}
                  onClick={() => navigate(`/history/${m.id}`)}
                  className="w-full flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs font-bold w-5 ${
                      m.result === 'win' ? 'text-green-600' : m.result === 'walkover' ? 'text-blue-600' : 'text-red-500'
                    }`}>
                      {m.result === 'win' ? 'W' : m.result === 'walkover' ? 'W/O' : 'L'}
                    </span>
                    <span className="text-sm text-gray-700 truncate">
                      {m.opponents.map(o => o.name).join(' & ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-mono text-gray-500">
                      {m.result === 'walkover' ? 'W/O' : m.sets.map(s => `${s.my_games}-${s.opponent_games}`).join(', ')}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {format(new Date(m.date), 'M/d')}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Top opponents */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Most Played Opponents</h2>
          {topOpponents.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No data yet.</p>
          ) : (
            <div className="space-y-2.5">
              {topOpponents.map(opp => {
                const total = opp.wins + opp.losses
                const winRate = Math.round((opp.wins / total) * 100)
                return (
                  <button
                    key={opp.id}
                    onClick={() => navigate(`/h2h/${opp.id}`)}
                    className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  >
                    <span className="text-sm font-medium text-gray-800">{opp.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{opp.wins}W-{opp.losses}L</span>
                      <span className={`text-xs font-semibold ${winRate >= 50 ? 'text-green-600' : 'text-red-500'}`}>
                        {winRate}%
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        {surfaceData.length > 0 && (
          <ChartCard title="Win Rate by Surface" data={surfaceData} />
        )}
        {matchTypeData.length > 0 && (
          <ChartCard title="Win Rate by Match Type" data={matchTypeData} />
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        {leagueData.length > 0 && (
          <ChartCard title="Win Rate by League" data={leagueData} />
        )}
        {comparisonData && (
          <ChartCard title="Overall vs Competitive" data={comparisonData} />
        )}
      </div>

      {/* Doubles partner stats */}
      {partnerStats.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Doubles Partners</h2>
          <div className="space-y-2.5">
            {partnerStats.map(p => {
              const total = p.wins + p.losses
              const winRate = Math.round((p.wins / total) * 100)
              return (
                <button
                  key={p.id}
                  onClick={() => navigate(`/partner/${p.id}`)}
                  className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                >
                  <span className="text-sm font-medium text-gray-800">{p.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{p.wins}W-{p.losses}L</span>
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

      {/* Year-over-year */}
      {yoyData && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Year-over-Year Win Rate</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={yoyData} barSize={40}>
              <XAxis dataKey="year" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip
                formatter={(value: number) => [`${value}%`, 'Win Rate']}
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
              />
              <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                {yoyData.map((entry, i) => (
                  <Cell key={i} fill={entry.winRate >= 50 ? '#16a34a' : '#dc2626'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function StatCard({
  label, value, large, valueColor, icon,
}: {
  label: string; value: string; large?: boolean; valueColor?: string; icon?: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <div className="flex items-center gap-1.5">
        {icon}
        <span className={`${large ? 'text-2xl' : 'text-lg'} font-bold ${valueColor || 'text-gray-900'}`}>
          {value}
        </span>
      </div>
    </div>
  )
}

function ChartCard({
  title, data,
}: {
  title: string
  data: { name: string; winRate: number; total: number }[]
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">{title}</h2>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barSize={32} layout="vertical">
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={80} className="capitalize" />
          <Tooltip
            formatter={(value: number, _name: string, props: { payload: { total: number } }) => [`${value}% (${props.payload.total} matches)`, 'Win Rate']}
            contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
          />
          <Bar dataKey="winRate" radius={[0, 4, 4, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.winRate >= 50 ? '#16a34a' : '#dc2626'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
