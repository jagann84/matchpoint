import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { fetchMatchesWithDetails, type MatchWithDetails } from '../lib/matchQueries'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { Loader2, TrendingUp, TrendingDown, Minus, Trophy, Target, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import ErrorRetry from '../components/ErrorRetry'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, ReferenceLine,
} from 'recharts'
import { useMatchBreakdown } from '../hooks/useMatchBreakdown'

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
  const [loadError, setLoadError] = useState(false)
  const [period, setPeriod] = useState<TimePeriod>('all')
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()))
  const [goal, setGoal] = useState<Goal | null>(null)

  const loadData = useCallback(async () => {
    if (!user) return
    setLoadError(false)
    try {
      const [matches, goalRes] = await Promise.all([
        fetchMatchesWithDetails(user.id),
        supabase.from('goals').select('*').eq('user_id', user.id).eq('is_active', true).single(),
      ])
      setAllMatches(matches)
      if (goalRes.data) setGoal(goalRes.data)
    } catch {
      setLoadError(true)
    }
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

  // Win rate breakdowns (shared hook)
  const { bySurface: surfaceData, byMatchType: matchTypeData, byLeague: leagueData } = useMatchBreakdown(matches)

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

  // Trend forecast — 4-week rolling windows with linear regression
  const trendData = useMemo(() => {
    if (allMatches.length < 5) return null

    // Sort oldest first for chronological bucketing
    const sorted = [...allMatches].reverse()
    const firstDate = new Date(sorted[0].date)

    // Bucket into 4-week windows
    const windows: { week: number; label: string; wins: number; total: number }[] = []
    for (const m of sorted) {
      const daysSinceFirst = Math.floor((new Date(m.date).getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24))
      const windowIndex = Math.floor(daysSinceFirst / 28)
      if (!windows[windowIndex]) {
        const windowStart = new Date(firstDate.getTime() + windowIndex * 28 * 24 * 60 * 60 * 1000)
        windows[windowIndex] = { week: windowIndex, label: format(windowStart, 'MMM d'), wins: 0, total: 0 }
      }
      windows[windowIndex].total++
      if (m.result === 'win' || m.result === 'walkover') windows[windowIndex].wins++
    }

    // Filter out empty windows and compute win rates
    const points = windows
      .filter(w => w && w.total >= 2)
      .map(w => ({ ...w, winRate: Math.round((w.wins / w.total) * 100) }))

    if (points.length < 3) return null

    // Linear regression: y = mx + b
    const n = points.length
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
    for (let i = 0; i < n; i++) {
      sumX += i
      sumY += points[i].winRate
      sumXY += i * points[i].winRate
      sumX2 += i * i
    }
    const m = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const b = (sumY - m * sumX) / n

    // Current win rate and projected
    const currentRate = points[points.length - 1].winRate
    const projectedWindows = 3 // ~3 months forward
    const projectedRate = Math.round(Math.min(100, Math.max(0, m * (n - 1 + projectedWindows) + b)))

    // Build chart data: actual + projected points
    const chartData = points.map((p, i) => ({
      label: p.label,
      winRate: p.winRate,
      trend: Math.round(m * i + b),
      projected: undefined as number | undefined,
    }))

    // Add projected points
    for (let i = 1; i <= projectedWindows; i++) {
      const futureDate = new Date(firstDate.getTime() + (points[points.length - 1].week + i) * 28 * 24 * 60 * 60 * 1000)
      chartData.push({
        label: format(futureDate, 'MMM d'),
        winRate: undefined as unknown as number,
        trend: Math.round(m * (n - 1 + i) + b),
        projected: Math.round(Math.min(100, Math.max(0, m * (n - 1 + i) + b))),
      })
    }

    const improving = m > 0.5
    const declining = m < -0.5

    return { chartData, currentRate, projectedRate, improving, declining, slope: m }
  }, [allMatches])

  // Recent 5
  const recentMatches = matches.slice(0, 5)

  if (loading) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-green-600" size={32} />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-4 md:p-8">
        <ErrorRetry
          message="Couldn't load your dashboard. Check your connection and try again."
          onRetry={loadData}
        />
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
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-medium transition-colors"
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
              period === p ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
            <button onClick={() => navigate('/history')} className="text-xs text-green-700 hover:text-green-800 font-medium focus:outline-none focus-visible:underline">View all</button>
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
                      m.result === 'win' ? 'text-green-700' : m.result === 'walkover' ? 'text-blue-700' : 'text-red-600'
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
                      <span className={`text-xs font-semibold ${winRate >= 50 ? 'text-green-700' : 'text-red-600'}`}>
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
                    <span className={`text-xs font-semibold ${winRate >= 50 ? 'text-green-700' : 'text-red-600'}`}>
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
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

      {/* Trend forecast */}
      {trendData && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Win Rate Trend</h2>
            <div className="flex items-center gap-1.5">
              {trendData.improving ? (
                <ArrowUpRight size={14} className="text-green-600" />
              ) : trendData.declining ? (
                <ArrowDownRight size={14} className="text-red-600" />
              ) : null}
              <span className={`text-xs font-medium ${
                trendData.improving ? 'text-green-700' :
                trendData.declining ? 'text-red-600' :
                'text-gray-500'
              }`}>
                {trendData.improving ? 'Improving' : trendData.declining ? 'Declining' : 'Steady'}
              </span>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData.chartData}>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                formatter={(value: number, name: string) => [
                  `${value}%`,
                  name === 'winRate' ? 'Actual' : name === 'trend' ? 'Trend' : 'Projected',
                ]}
              />
              <ReferenceLine y={50} stroke="#e5e7eb" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="winRate" stroke="#16a34a" strokeWidth={2} dot={{ r: 3, fill: '#16a34a' }} connectNulls={false} />
              <Line type="monotone" dataKey="trend" stroke="#9ca3af" strokeWidth={1} strokeDasharray="4 4" dot={false} />
              <Line type="monotone" dataKey="projected" stroke="#16a34a" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3, fill: '#fff', stroke: '#16a34a', strokeWidth: 2 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>

          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
            <span>Current: <span className="font-semibold text-gray-700">{trendData.currentRate}%</span></span>
            <span>
              Projected (~3 months): <span className={`font-semibold ${
                trendData.projectedRate >= trendData.currentRate ? 'text-green-700' : 'text-red-600'
              }`}>{trendData.projectedRate}%</span>
            </span>
          </div>
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
  // Scale chart height so bars don't compress when there are many entries.
  // 48px per bar gives comfortable spacing; minimum 160px for 1-2 bars.
  const chartHeight = Math.max(160, data.length * 48)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">{title}</h2>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={data} barSize={28} layout="vertical">
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
          <YAxis
            type="category"
            dataKey="name"
            axisLine={false}
            tickLine={false}
            width={120}
            tick={({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => {
              // Truncate long labels (>16 chars) with ellipsis to prevent
              // wrapping that causes overlapping rows.
              const label = payload.value.length > 16
                ? payload.value.slice(0, 15) + '…'
                : payload.value
              return (
                <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill="#374151">
                  {label}
                </text>
              )
            }}
          />
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
