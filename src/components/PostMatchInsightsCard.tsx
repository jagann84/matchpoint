import type { PostMatchInsights } from '../lib/matchService'
import { Trophy, Flame, BarChart3, Target, X } from 'lucide-react'

// A celebratory/informational card shown after saving a match.
// Transforms the dead-end "✓ Match saved" toast into a rewarding
// moment that makes the user want to log the next match.
//
// Design principles:
//   - Feel like a reward, not a report (emojis, bold numbers)
//   - Show only insights relevant to THIS match (H2H vs this opponent,
//     win rate on THIS surface, current streak)
//   - Dismissable with a single tap/swipe
//   - Gracefully omit sections where data is insufficient (e.g., no
//     prior matches vs this opponent)

interface Props {
  insights: PostMatchInsights
  opponentName: string
  result: string
  scoreStr: string
  onDismiss: () => void
}

export default function PostMatchInsightsCard({
  insights,
  opponentName,
  result,
  scoreStr,
  onDismiss,
}: Props) {
  const isWin = result === 'win' || result === 'walkover'

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
      {/* Header — match result */}
      <div className={`px-5 py-4 ${isWin ? 'bg-green-50' : 'bg-red-50'} flex items-center justify-between`}>
        <div>
          <div className="flex items-center gap-2">
            <Trophy size={18} className={isWin ? 'text-green-600' : 'text-red-500'} />
            <span className={`font-bold text-lg ${isWin ? 'text-green-700' : 'text-red-700'}`}>
              {isWin ? 'Win' : 'Loss'} vs {opponentName}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-0.5">{scoreStr}</p>
        </div>
        <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600 p-1">
          <X size={20} />
        </button>
      </div>

      {/* Insights grid */}
      <div className="px-5 py-4 space-y-3">
        {/* Head-to-head */}
        {insights.h2h_total > 1 && (
          <InsightRow
            icon={<Target size={16} className="text-blue-500" />}
            label={`vs ${opponentName}`}
            value={`${insights.h2h_wins}-${insights.h2h_losses}`}
            detail={
              insights.h2h_wins > insights.h2h_losses
                ? 'You lead the series'
                : insights.h2h_wins < insights.h2h_losses
                ? 'They lead the series'
                : 'Series is tied'
            }
          />
        )}

        {/* Current streak */}
        {insights.streak_count >= 2 && (
          <InsightRow
            icon={<Flame size={16} className={insights.streak_type === 'win' ? 'text-orange-500' : 'text-gray-400'} />}
            label={insights.streak_type === 'win' ? 'Win streak' : 'Losing streak'}
            value={`${insights.streak_count} matches`}
            detail={insights.streak_type === 'win' && insights.streak_count >= 5 ? 'On fire!' : undefined}
            highlight={insights.streak_type === 'win' && insights.streak_count >= 3}
          />
        )}

        {/* Surface win rate */}
        {insights.surface_total >= 3 && (
          <InsightRow
            icon={<BarChart3 size={16} className="text-purple-500" />}
            label={`${formatSurface(insights.surface)} win rate`}
            value={`${insights.surface_win_rate}%`}
            detail={`${insights.surface_wins}W ${insights.surface_total - insights.surface_wins}L`}
          />
        )}

        {/* Milestone check */}
        {isMilestone(insights.total_matches) && (
          <div className="bg-yellow-50 rounded-lg px-3 py-2 text-center">
            <span className="text-sm font-medium text-yellow-800">
              {getMilestoneMessage(insights.total_matches)}
            </span>
          </div>
        )}
      </div>

      {/* Tap to dismiss hint */}
      <div className="px-5 pb-3">
        <p className="text-xs text-gray-400 text-center">Tap anywhere outside to dismiss</p>
      </div>
    </div>
  )
}

function InsightRow({
  icon,
  label,
  value,
  detail,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail?: string
  highlight?: boolean
}) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${highlight ? 'bg-orange-50 -mx-2 px-2 rounded-lg' : ''}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm text-gray-700">{label}</span>
      </div>
      <div className="text-right">
        <span className={`font-semibold text-sm ${highlight ? 'text-orange-600' : 'text-gray-900'}`}>{value}</span>
        {detail && <p className="text-xs text-gray-500">{detail}</p>}
      </div>
    </div>
  )
}

function formatSurface(s: string): string {
  const map: Record<string, string> = {
    hard: 'Hard court',
    clay: 'Clay',
    grass: 'Grass',
    'indoor-hard': 'Indoor hard',
    'indoor-clay': 'Indoor clay',
    other: 'Other surface',
  }
  return map[s] || s
}

function isMilestone(total: number): boolean {
  if (total <= 0) return false
  // First match, then every 25 up to 100, then every 50, then every 100
  return total === 1 || total === 10 || total === 25 || total === 50 ||
    total === 75 || total === 100 || (total > 100 && total % 100 === 0)
}

function getMilestoneMessage(total: number): string {
  if (total === 1) return '🎾 First match logged! Welcome to MatchPoint!'
  if (total === 10) return '🔟 10 matches logged! You\'re building a real dataset.'
  if (total === 25) return '⭐ 25 matches! Your trends are getting meaningful.'
  if (total === 50) return '🏅 50 matches tracked! Half-century milestone.'
  if (total === 100) return '💯 100 matches! You\'re a MatchPoint power user.'
  return `🏆 ${total} matches tracked! Incredible commitment.`
}
