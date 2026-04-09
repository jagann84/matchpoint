export const SURFACES = [
  { value: 'hard', label: 'Hard' },
  { value: 'clay', label: 'Clay' },
  { value: 'grass', label: 'Grass' },
  { value: 'indoor-hard', label: 'Indoor Hard' },
  { value: 'indoor-clay', label: 'Indoor Clay' },
  { value: 'other', label: 'Other' },
] as const

export const MATCH_TYPES = [
  { value: 'practice', label: 'Practice' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'league', label: 'League' },
  { value: 'tournament', label: 'Tournament' },
] as const

export const RESULTS = [
  { value: 'win', label: 'Win' },
  { value: 'loss', label: 'Loss' },
  { value: 'walkover', label: 'Walkover' },
] as const

export type Surface = (typeof SURFACES)[number]['value']
export type MatchType = (typeof MATCH_TYPES)[number]['value']
export type Result = (typeof RESULTS)[number]['value']

// Set membership helpers — use these at trust boundaries (form submission,
// API payload validation) to make sure values coming from the UI really
// are one of the allowed options before hitting the database.
export const isSurface = (v: unknown): v is Surface =>
  typeof v === 'string' && SURFACES.some(s => s.value === v)
export const isMatchType = (v: unknown): v is MatchType =>
  typeof v === 'string' && MATCH_TYPES.some(t => t.value === v)
export const isResult = (v: unknown): v is Result =>
  typeof v === 'string' && RESULTS.some(r => r.value === v)
