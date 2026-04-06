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

export type Surface = (typeof SURFACES)[number]['value']
export type MatchType = (typeof MATCH_TYPES)[number]['value']
