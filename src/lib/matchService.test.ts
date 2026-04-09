import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the supabase module BEFORE importing the subject under test.
// We use vi.hoisted so the mock function handle is available inside
// the factory — Vitest hoists vi.mock() calls to the top of the file,
// which means normal top-level const would be TDZ at mock time.
const rpcMock = vi.hoisted(() => vi.fn())
vi.mock('./supabase', () => ({
  supabase: { rpc: rpcMock },
}))

// Now we can import the subject. matchService.checkDuplicate touches
// supabase.rpc exactly once per call; everything else is pure logic
// and easy to assert against.
import { checkDuplicate } from './matchService'

// Test fixtures: the tiny shape checkDuplicate expects.
const players = [
  { id: 'p-alice', name: 'Alice' },
  { id: 'p-bob',   name: 'Bob' },
]

const sets = [
  { myGames: 6, opponentGames: 3 },
  { myGames: 6, opponentGames: 4 },
]

beforeEach(() => {
  rpcMock.mockReset()
})

describe('checkDuplicate', () => {
  it('returns false immediately when no opponent names are provided (no RPC call)', async () => {
    const result = await checkDuplicate('u1', '2026-04-08', [], sets, players)
    expect(result).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('returns false when any opponent name is unknown (no RPC call)', async () => {
    // "Alice" resolves, but "Mystery" does not — the guard
    // `oppIds.length !== opponentNames.length` bails early because an
    // unknown opponent means the match can't be a duplicate of anything.
    const result = await checkDuplicate(
      'u1',
      '2026-04-08',
      ['Alice', 'Mystery Person'],
      sets,
      players,
    )
    expect(result).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('calls the RPC with resolved opponent IDs and returns true on match', async () => {
    rpcMock.mockResolvedValueOnce({ data: true, error: null })

    const result = await checkDuplicate(
      'u1',
      '2026-04-08',
      ['Alice', 'Bob'],
      sets,
      players,
    )

    expect(result).toBe(true)
    expect(rpcMock).toHaveBeenCalledTimes(1)
    const [fn, payload] = rpcMock.mock.calls[0]
    expect(fn).toBe('check_duplicate_match')
    expect(payload).toEqual({
      p_user_id: 'u1',
      p_date: '2026-04-08',
      p_opponent_ids: ['p-alice', 'p-bob'],
      p_sets: [
        { my_games: 6, opponent_games: 3 },
        { my_games: 6, opponent_games: 4 },
      ],
    })
  })

  it('returns false when the RPC indicates no duplicate', async () => {
    rpcMock.mockResolvedValueOnce({ data: false, error: null })
    const result = await checkDuplicate('u1', '2026-04-08', ['Alice'], sets, players)
    expect(result).toBe(false)
  })

  it('fails OPEN when the RPC errors (a broken dup check must not block legit saves)', async () => {
    // This is the critical behavior: if the RPC blows up, we return
    // false and let the save proceed. Worst case the user confirms a
    // "duplicate" that wasn't one. Best case nothing breaks because
    // of a backend hiccup.
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    const result = await checkDuplicate('u1', '2026-04-08', ['Alice'], sets, players)
    expect(result).toBe(false)
  })

  it('is case-insensitive on opponent name resolution', async () => {
    rpcMock.mockResolvedValueOnce({ data: true, error: null })
    const result = await checkDuplicate(
      'u1',
      '2026-04-08',
      ['ALICE'],
      sets,
      players,
    )
    expect(result).toBe(true)
    expect(rpcMock.mock.calls[0][1].p_opponent_ids).toEqual(['p-alice'])
  })
})
