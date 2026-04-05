import { useMemo } from 'react'
import type { MatchWithDetails } from '../lib/matchQueries'

interface BreakdownEntry {
  name: string
  winRate: number
  total: number
}

function isWin(m: MatchWithDetails) {
  return m.result === 'win' || m.result === 'walkover'
}

function computeBreakdown(
  matches: MatchWithDetails[],
  keyFn: (m: MatchWithDetails) => string | null,
  transformName?: (name: string) => string,
): BreakdownEntry[] {
  const map = new Map<string, { wins: number; total: number }>()
  for (const m of matches) {
    const key = keyFn(m)
    if (key === null) continue
    if (!map.has(key)) map.set(key, { wins: 0, total: 0 })
    const e = map.get(key)!
    e.total++
    if (isWin(m)) e.wins++
  }
  return [...map.entries()].map(([name, { wins, total }]) => ({
    name: transformName ? transformName(name) : name,
    winRate: Math.round((wins / total) * 100),
    total,
  }))
}

export function useMatchBreakdown(matches: MatchWithDetails[]) {
  return useMemo(() => {
    const bySurface = computeBreakdown(
      matches,
      m => m.surface,
      name => name.replace('-', ' '),
    )

    const byMatchType = computeBreakdown(
      matches,
      m => m.match_type,
      name => name.charAt(0).toUpperCase() + name.slice(1),
    )

    const byLeague = computeBreakdown(
      matches,
      m => m.league_name || null,
    )

    return { bySurface, byMatchType, byLeague }
  }, [matches])
}
