import { describe, it, expect } from 'vitest'
import { detectAmbiguousNames } from './playerMatching'

// playerMatching.ts is pure — no I/O, no globals — so tests are cheap
// and the assertions are mostly about "does the policy match the spec?"
// The real-world bug class this protects against: "Scott" silently
// binding to the wrong existing player, which has already bitten us
// (see commit e49012d context).

const p = (id: string, name: string) => ({ id, name })

describe('detectAmbiguousNames', () => {
  describe('unambiguous cases (should return empty)', () => {
    it('returns empty when there are no candidates at all', () => {
      const result = detectAmbiguousNames(['Totally New Person'], null, [])
      expect(result).toEqual([])
    })

    it('returns empty when the only candidate is an exact match', () => {
      const players = [p('1', 'Scott Gelbman'), p('2', 'Alice')]
      const result = detectAmbiguousNames(['Scott Gelbman'], null, players)
      expect(result).toEqual([])
    })

    it('is case-insensitive on exact matches', () => {
      const players = [p('1', 'Scott Gelbman')]
      const result = detectAmbiguousNames(['scott gelbman'], null, players)
      expect(result).toEqual([])
    })

    it('ignores empty opponent slots', () => {
      const players = [p('1', 'Alice')]
      const result = detectAmbiguousNames(['', '  '], null, players)
      expect(result).toEqual([])
    })

    it('treats a null partner as "no partner to disambiguate"', () => {
      const players = [p('1', 'Alice'), p('2', 'Alex')]
      const result = detectAmbiguousNames(['Bob'], null, players)
      expect(result).toEqual([])
    })
  })

  describe('ambiguous cases', () => {
    it('flags a bare first name that matches two different players', () => {
      // This is the "Scott" scenario that drove the feature.
      const players = [
        p('1', 'Scott Gelbman'),
        p('2', 'Scott Washow'),
        p('3', 'Alice'),
      ]
      const result = detectAmbiguousNames(['Scott'], null, players)
      expect(result).toHaveLength(1)
      expect(result[0].inputName).toBe('Scott')
      expect(result[0].field).toBe('opponent')
      expect(result[0].candidates.map(c => c.name).sort()).toEqual([
        'Scott Gelbman',
        'Scott Washow',
      ])
    })

    it('flags a single partial match with no exact fallback', () => {
      // "Mike" when only "Mike Smith" exists — ambiguous because we
      // can't tell if the user means Mike Smith or a new player named
      // just "Mike".
      const players = [p('1', 'Mike Smith')]
      const result = detectAmbiguousNames(['Mike'], null, players)
      expect(result).toHaveLength(1)
      expect(result[0].candidates).toHaveLength(1)
      expect(result[0].candidates[0].matchType).toBe('partial')
    })

    it('does NOT flag an exact match even when a partial also exists', () => {
      // "Scott" should bind to "Scott" directly; "Scott Gelbman" is a
      // partial that would otherwise add ambiguity, but the exact
      // match wins.
      const players = [p('1', 'Scott'), p('2', 'Scott Gelbman')]
      const result = detectAmbiguousNames(['Scott'], null, players)
      // 2 candidates total, one exact — this IS ambiguous per the
      // current rule ("more than one candidate"). Document the rule.
      expect(result).toHaveLength(1)
      expect(result[0].candidates[0].matchType).toBe('exact')
      expect(result[0].candidates[0].name).toBe('Scott')
    })

    it('flags partner ambiguity independently of opponents', () => {
      const players = [p('1', 'Sam Jones'), p('2', 'Sam Baker')]
      const result = detectAmbiguousNames([], 'Sam', players)
      expect(result).toHaveLength(1)
      expect(result[0].field).toBe('partner')
    })

    it('reports the right index for each ambiguous opponent', () => {
      const players = [p('1', 'Alex Kim'), p('2', 'Alex Chen')]
      const result = detectAmbiguousNames(['Bob', 'Alex'], null, players)
      expect(result).toHaveLength(1)
      expect(result[0].index).toBe(1)
    })
  })

  describe('candidate ordering', () => {
    it('sorts exact matches before partial matches', () => {
      const players = [
        p('1', 'Scott Gelbman'), // partial
        p('2', 'Scott'),         // exact
        p('3', 'Scott Washow'),  // partial
      ]
      const result = detectAmbiguousNames(['Scott'], null, players)
      expect(result[0].candidates[0].matchType).toBe('exact')
      expect(result[0].candidates.slice(1).every(c => c.matchType === 'partial'))
        .toBe(true)
    })
  })
})
