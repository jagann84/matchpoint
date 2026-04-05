import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { fetchMatchesWithDetails, type MatchWithDetails } from '../lib/matchQueries'
import { format } from 'date-fns'
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CalendarPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [matches, setMatches] = useState<MatchWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    fetchMatchesWithDetails(user.id).then(m => {
      setMatches(m)
      setLoading(false)
    })
  }, [user])

  // Map dates to matches for quick lookup
  const matchesByDate = useMemo(() => {
    const map = new Map<string, MatchWithDetails[]>()
    for (const m of matches) {
      const existing = map.get(m.date) || []
      existing.push(m)
      map.set(m.date, existing)
    }
    return map
  }, [matches])

  // Calendar grid cells for current month
  const calendarCells = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: (number | null)[] = []

    // Leading empty cells
    for (let i = 0; i < firstDay; i++) cells.push(null)
    // Day cells
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    // Trailing empty cells to fill last row
    while (cells.length % 7 !== 0) cells.push(null)

    return cells
  }, [year, month])

  const goToPrevMonth = useCallback(() => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelectedDate(null)
  }, [month])

  const goToNextMonth = useCallback(() => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelectedDate(null)
  }, [month])

  const goToToday = useCallback(() => {
    const now = new Date()
    setYear(now.getFullYear())
    setMonth(now.getMonth())
    setSelectedDate(null)
  }, [])

  const monthLabel = format(new Date(year, month, 1), 'MMMM yyyy')
  const today = format(new Date(), 'yyyy-MM-dd')

  // Matches for selected date
  const selectedMatches = selectedDate ? (matchesByDate.get(selectedDate) || []) : []

  // Monthly stats
  const monthMatches = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
    return matches.filter(m => m.date.startsWith(prefix))
  }, [matches, year, month])

  const monthWins = monthMatches.filter(m => m.result === 'win' || m.result === 'walkover').length
  const monthLosses = monthMatches.filter(m => m.result === 'loss').length

  if (loading) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-green-600" size={32} />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Calendar</h1>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={goToPrevMonth}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
          aria-label="Previous month"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">{monthLabel}</h2>
          {monthMatches.length > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">
              {monthMatches.length} match{monthMatches.length !== 1 ? 'es' : ''} &middot; {monthWins}W-{monthLosses}L
            </p>
          )}
        </div>
        <button
          onClick={goToNextMonth}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
          aria-label="Next month"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Today button */}
      <div className="flex justify-center mb-3">
        <button
          onClick={goToToday}
          className="text-xs text-green-700 hover:text-green-800 font-medium focus:outline-none focus-visible:underline"
        >
          Today
        </button>
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {DAYS.map(d => (
            <div key={d} className="text-center text-xs font-medium text-gray-500 py-2">
              {d}
            </div>
          ))}
        </div>

        {/* Date cells */}
        <div className="grid grid-cols-7">
          {calendarCells.map((day, i) => {
            if (day === null) {
              return <div key={`empty-${i}`} className="h-14 border-b border-r border-gray-50" />
            }

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const dayMatches = matchesByDate.get(dateStr) || []
            const isToday = dateStr === today
            const isSelected = dateStr === selectedDate
            const hasMatches = dayMatches.length > 0

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={`h-14 border-b border-r border-gray-50 flex flex-col items-center justify-center gap-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-500 ${
                  isSelected ? 'bg-green-50' :
                  hasMatches ? 'hover:bg-gray-50 cursor-pointer' :
                  'hover:bg-gray-50'
                }`}
              >
                <span className={`text-sm leading-none ${
                  isToday ? 'bg-green-700 text-white w-6 h-6 rounded-full flex items-center justify-center font-semibold' :
                  isSelected ? 'text-green-700 font-semibold' :
                  'text-gray-700'
                }`}>
                  {day}
                </span>
                {hasMatches && (
                  <div className="flex gap-0.5">
                    {dayMatches.slice(0, 3).map((m, j) => (
                      <span
                        key={j}
                        className={`w-1.5 h-1.5 rounded-full ${
                          m.result === 'win' || m.result === 'walkover' ? 'bg-green-500' : 'bg-red-500'
                        }`}
                      />
                    ))}
                    {dayMatches.length > 3 && (
                      <span className="text-[8px] text-gray-400">+{dayMatches.length - 3}</span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected date detail */}
      {selectedDate && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            {format(new Date(selectedDate + 'T12:00:00'), 'EEEE, MMMM d, yyyy')}
          </h3>
          {selectedMatches.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No matches on this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedMatches.map(m => {
                const scoreStr = m.result === 'walkover'
                  ? 'W/O'
                  : m.sets.map(s => `${s.my_games}-${s.opponent_games}`).join(', ')
                return (
                  <button
                    key={m.id}
                    onClick={() => navigate(`/history/${m.id}`)}
                    className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-xs font-bold w-6 ${
                        m.result === 'win' || m.result === 'walkover' ? 'text-green-700' : 'text-red-600'
                      }`}>
                        {m.result === 'win' ? 'W' : m.result === 'walkover' ? 'W/O' : 'L'}
                      </span>
                      <div className="min-w-0">
                        <span className="text-sm text-gray-800 font-medium truncate block">
                          vs {m.opponents.map(o => o.name).join(' & ')}
                        </span>
                        <span className="text-xs text-gray-500 capitalize">
                          {m.surface.replace('-', ' ')} &middot; {m.match_type}
                        </span>
                      </div>
                    </div>
                    <span className="text-sm font-mono text-gray-600 shrink-0 ml-2">{scoreStr}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
