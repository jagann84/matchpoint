/**
 * Fuzzy player name matching for disambiguation.
 *
 * Given a name from AI parsing (e.g., "Scott"), finds all existing players
 * that could be a match. Returns candidates when there are multiple possible
 * matches — the user must pick the right one.
 */

export interface PlayerCandidate {
  id: string
  name: string
  matchType: 'exact' | 'partial'
}

export interface AmbiguousName {
  inputName: string
  field: 'opponent' | 'partner'
  index: number // for opponents array
  candidates: PlayerCandidate[]
}

/**
 * Find all players whose name could match the input.
 * Returns candidates sorted by match quality.
 */
function findCandidates(
  inputName: string,
  players: { id: string; name: string }[],
): PlayerCandidate[] {
  const input = inputName.toLowerCase().trim()
  if (!input) return []

  const candidates: PlayerCandidate[] = []

  for (const p of players) {
    const name = p.name.toLowerCase().trim()

    // Exact match (case-insensitive)
    if (name === input) {
      candidates.push({ id: p.id, name: p.name, matchType: 'exact' })
      continue
    }

    // Input is a prefix/first-name of the player name
    // e.g., "Scott" matches "Scott M." or "Scott Wilson"
    if (name.startsWith(input + ' ') || name.startsWith(input + '.')) {
      candidates.push({ id: p.id, name: p.name, matchType: 'partial' })
      continue
    }

    // Player name is a prefix of the input
    // e.g., "Scott M" matches player named "Scott"
    if (input.startsWith(name + ' ') || input.startsWith(name + '.')) {
      candidates.push({ id: p.id, name: p.name, matchType: 'partial' })
      continue
    }

    // First name matches (split on space)
    const inputFirst = input.split(/\s+/)[0]
    const nameFirst = name.split(/\s+/)[0]
    if (inputFirst.length >= 2 && nameFirst.length >= 2 && inputFirst === nameFirst) {
      // Same first name but different full name
      if (name !== input) {
        candidates.push({ id: p.id, name: p.name, matchType: 'partial' })
      }
    }
  }

  // Sort: exact first, then partial
  candidates.sort((a, b) => {
    if (a.matchType === 'exact' && b.matchType !== 'exact') return -1
    if (a.matchType !== 'exact' && b.matchType === 'exact') return 1
    return a.name.localeCompare(b.name)
  })

  return candidates
}

/**
 * Check all opponent and partner names for ambiguity.
 * Returns an array of ambiguous names that need user resolution.
 *
 * A name is ambiguous when:
 * - It matches multiple existing players (e.g., "Scott" matches "Scott" AND "Scott M.")
 * - It partially matches one player but isn't an exact match (e.g., "Mike" when only "Mike Smith" exists)
 */
export function detectAmbiguousNames(
  opponentNames: string[],
  partnerName: string | null,
  players: { id: string; name: string }[],
): AmbiguousName[] {
  const ambiguous: AmbiguousName[] = []

  for (let i = 0; i < opponentNames.length; i++) {
    const name = opponentNames[i]
    if (!name.trim()) continue

    const candidates = findCandidates(name, players)

    // Ambiguous if: multiple candidates, OR exactly one partial match (no exact)
    const hasExact = candidates.some(c => c.matchType === 'exact')
    const isAmbiguous =
      candidates.length > 1 || // Multiple possible matches
      (candidates.length === 1 && !hasExact) // One partial, no exact

    if (isAmbiguous) {
      ambiguous.push({
        inputName: name,
        field: 'opponent',
        index: i,
        candidates,
      })
    }
  }

  if (partnerName?.trim()) {
    const candidates = findCandidates(partnerName, players)
    const hasExact = candidates.some(c => c.matchType === 'exact')
    const isAmbiguous = candidates.length > 1 || (candidates.length === 1 && !hasExact)

    if (isAmbiguous) {
      ambiguous.push({
        inputName: partnerName,
        field: 'partner',
        index: 0,
        candidates,
      })
    }
  }

  return ambiguous
}
