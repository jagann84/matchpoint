import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { fetchMatchesWithDetails, deleteMatch, type MatchWithDetails } from '../lib/matchQueries'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import {
  Loader2, Filter, ChevronDown, ChevronUp, List, Search, X,
} from 'lucide-react'

export default function HistoryPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [matches, setMatches] = useState<MatchWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Filter state
  const [filterResult, setFilterResult] = useState<string>('')
  const [filterSurface, setFilterSurface] = useState<string>('')
  const [filterMatchType, setFilterMatchType] = useState<string>('')
  const [filterFormat, setFilterFormat] = useState<string>('')
  const [filterOpponent, setFilterOpponent] = useState<string>('')
  const [filterLeague, setFilterLeague] = useState<string>('')
  const [filterYear, setFilterYear] = useState<string>('')
  const [filterTag, setFilterTag] = useState<string>('')

  // Context
  const [players, setPlayers] = useState<{ id: string; name: string }[]>([])
  const [leagues, setLeagues] = useState<{ id: string; name: string }[]>([])

  const loadData = useCallback(async () => {
    if (!user) return
    const [matchData, playersRes, leaguesRes] = await Promise.all([
      fetchMatchesWithDetails(user.id),
      supabase.from('players').select('id, name').eq('user_id', user.id).order('name'),
      supabase.from('leagues').select('id, name').eq('user_id', user.id).order('name'),
    ])
    setMatches(matchData)
    if (playersRes.data) setPlayers(playersRes.data)
    if (leaguesRes.data) setLeagues(leaguesRes.data)
    setLoading(false)
  }, [user])

  useEffect(() => { loadData() }, [loadData])

  const filtered = matches.filter(m => {
    if (filterResult && m.result !== filterResult) return false
    if (filterSurface && m.surface !== filterSurface) return false
    if (filterMatchType && m.match_type !== filterMatchType) return false
    if (filterFormat && m.format !== filterFormat) return false
    if (filterOpponent && !m.opponents.some(o => o.id === filterOpponent)) return false
    if (filterLeague && m.league_id !== filterLeague) return false
    if (filterYear && !m.date.startsWith(filterYear)) return false
    if (filterTag && !m.tags.includes(filterTag)) return false

    // Free-text search across opponent names, partner, location, notes, league, tags
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const searchableFields = [
        ...m.opponents.map(o => o.name),
        m.partner_name,
        m.location,
        m.notes,
        m.league_name,
        ...m.tags,
      ]
      if (!searchableFields.some(f => f?.toLowerCase().includes(q))) return false
    }

    return true
  })

  const years = [...new Set(matches.map(m => m.date.slice(0, 4)))].sort().reverse()

  // Collect all unique tags
  const allTags = [...new Set(matches.flatMap(m => m.tags))].sort()

  const hasActiveFilters = filterResult || filterSurface || filterMatchType || filterFormat || filterOpponent || filterLeague || filterYear || filterTag || searchQuery

  const clearFilters = () => {
    setFilterResult('')
    setFilterSurface('')
    setFilterMatchType('')
    setFilterFormat('')
    setFilterOpponent('')
    setFilterLeague('')
    setFilterYear('')
    setFilterTag('')
    setSearchQuery('')
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-green-600" size={32} />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl overflow-x-hidden">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Match History</h1>
        <button
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
          aria-label={`Filters${hasActiveFilters ? ' (active)' : ''}`}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 ${
            hasActiveFilters ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Filter size={16} />
          Filters
          {hasActiveFilters && <span className="w-2 h-2 bg-green-700 rounded-full" />}
          {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search opponents, location, notes..."
          aria-label="Search matches"
          className="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder:text-gray-400"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <FilterSelect label="Result" value={filterResult} onChange={setFilterResult}
              options={[{ value: 'win', label: 'Win' }, { value: 'loss', label: 'Loss' }, { value: 'walkover', label: 'Walkover' }]} />
            <FilterSelect label="Surface" value={filterSurface} onChange={setFilterSurface}
              options={[{ value: 'hard', label: 'Hard' }, { value: 'clay', label: 'Clay' }, { value: 'grass', label: 'Grass' }, { value: 'indoor-hard', label: 'Indoor Hard' }, { value: 'indoor-clay', label: 'Indoor Clay' }]} />
            <FilterSelect label="Match Type" value={filterMatchType} onChange={setFilterMatchType}
              options={[{ value: 'practice', label: 'Practice' }, { value: 'friendly', label: 'Friendly' }, { value: 'league', label: 'League' }, { value: 'tournament', label: 'Tournament' }]} />
            <FilterSelect label="Format" value={filterFormat} onChange={setFilterFormat}
              options={[{ value: 'singles', label: 'Singles' }, { value: 'doubles', label: 'Doubles' }]} />
            <FilterSelect label="Opponent" value={filterOpponent} onChange={setFilterOpponent}
              options={players.map(p => ({ value: p.id, label: p.name }))} />
            {leagues.length > 0 && (
              <FilterSelect label="League" value={filterLeague} onChange={setFilterLeague}
                options={leagues.map(l => ({ value: l.id, label: l.name }))} />
            )}
            {years.length > 1 && (
              <FilterSelect label="Year" value={filterYear} onChange={setFilterYear}
                options={years.map(y => ({ value: y, label: y }))} />
            )}
            {allTags.length > 0 && (
              <FilterSelect label="Tag" value={filterTag} onChange={setFilterTag}
                options={allTags.map(t => ({ value: t, label: t }))} />
            )}
          </div>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-xs text-green-700 hover:text-green-800 font-medium">
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Results count */}
      {hasActiveFilters && (
        <p className="text-sm text-gray-500 mb-3">
          {filtered.length} match{filtered.length !== 1 ? 'es' : ''} found
        </p>
      )}

      {/* Match list */}
      {matches.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <List className="mx-auto text-gray-300 mb-3" size={48} />
          <h3 className="text-base font-semibold text-gray-700 mb-1">No matches yet</h3>
          <p className="text-sm text-gray-500 mb-4">Log your first match to see it here.</p>
          <button
            onClick={() => navigate('/log-match')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Log Match
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-gray-500 mb-2">No matches match your filters.</p>
          <button onClick={clearFilters} className="text-sm text-green-600 hover:text-green-700 font-medium focus:outline-none focus-visible:underline">Clear all filters</button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(match => (
            <MatchCard key={match.id} match={match} onClick={() => navigate(`/history/${match.id}`)} />
          ))}
        </div>
      )}
    </div>
  )
}

function MatchCard({ match, onClick }: { match: MatchWithDetails; onClick: () => void }) {
  const scoreStr = match.result === 'walkover'
    ? 'W/O'
    : match.sets.map(s => `${s.my_games}-${s.opponent_games}`).join(', ')

  const opponentStr = match.opponents.map(o => o.name).join(' & ')
  const displayName = match.format === 'doubles' && match.partner_name
    ? `${opponentStr} (w/ ${match.partner_name})`
    : opponentStr

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:border-gray-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Date + opponent */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-500">{format(new Date(match.date), 'MMM d, yyyy')}</span>
            {match.league_name && (
              <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-full truncate max-w-[120px]">
                {match.league_name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 truncate">{displayName || 'Unknown'}</span>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
              match.surface === 'clay' ? 'bg-orange-100 text-orange-700' :
              match.surface === 'grass' ? 'bg-emerald-100 text-emerald-700' :
              match.surface.includes('indoor') ? 'bg-purple-100 text-purple-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {match.surface.replace('-', ' ')}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full capitalize">
              {match.match_type}
            </span>
            {match.format === 'doubles' && (
              <span className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded-full">doubles</span>
            )}
            {match.tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-gray-50 text-gray-500 rounded-full truncate max-w-[100px]">
                {tag}
              </span>
            ))}
            {match.tags.length > 3 && (
              <span className="text-[10px] text-gray-400">+{match.tags.length - 3}</span>
            )}
          </div>
        </div>

        {/* Score + result */}
        <div className="flex flex-col items-end gap-1 shrink-0 max-w-[40%]">
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
            match.result === 'win' ? 'bg-green-100 text-green-700' :
            match.result === 'walkover' ? 'bg-blue-100 text-blue-700' :
            'bg-red-100 text-red-700'
          }`}>
            {match.result === 'win' ? 'W' : match.result === 'walkover' ? 'W/O' : 'L'}
          </span>
          <span className="text-sm font-mono text-gray-700 text-right">{scoreStr}</span>
        </div>
      </div>
    </button>
  )
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
      >
        <option value="">All</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
