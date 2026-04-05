import { format } from 'date-fns'
import type { MatchWithDetails } from '../../lib/matchQueries'

interface MatchListProps {
  matches: MatchWithDetails[]
  onMatchClick: (id: string) => void
  showPartner?: boolean
}

export default function MatchList({ matches, onMatchClick, showPartner }: MatchListProps) {
  return (
    <div className="space-y-2">
      {matches.map(m => (
        <button
          key={m.id}
          onClick={() => onMatchClick(m.id)}
          className="w-full flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-50 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-green-700"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-xs font-bold w-5 ${
              m.result === 'win' ? 'text-green-700' : m.result === 'walkover' ? 'text-blue-600' : 'text-red-600'
            }`}>
              {m.result === 'win' ? 'W' : m.result === 'walkover' ? 'W/O' : 'L'}
            </span>
            <span className="text-xs text-gray-500">
              {format(new Date(m.date), 'MMM d, yyyy')}
            </span>
            {showPartner && (
              <span className="text-xs text-gray-500 truncate">
                vs {m.opponents.map(o => o.name).join(' & ')}
              </span>
            )}
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
  )
}
