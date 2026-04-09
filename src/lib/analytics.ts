import { track } from '@vercel/analytics'

// ─── Categorical dimensions ──────────────────────────────────────────────
// Keep values low-cardinality so they aggregate cleanly in the dashboard.
// NEVER put PII here: no player names, no raw input text, no scores,
// no locations. Numbers are fine (they can't be deanonymized) as long
// as they're small integers like counts, not IDs.

type MatchTypeDim = 'practice' | 'friendly' | 'league' | 'tournament' | 'unknown'
type SurfaceDim = 'hard' | 'clay' | 'grass' | 'indoor-hard' | 'indoor-clay' | 'other' | 'unknown'
type FormatDim = 'singles' | 'doubles' | 'unknown'
type ParseConfidenceDim = 'high' | 'medium' | 'low'
type SourceDim = 'freeform' | 'manual' | 'confirmation' | 'sync'

/**
 * Low-cardinality error buckets. Add new values sparingly — every bucket
 * you add increases dashboard noise. "unknown" is fine as a catchall.
 */
export type ErrorCategory =
  | 'parse'       // JSON / schema / invalid input
  | 'network'     // fetch / offline / timeout
  | 'auth'        // JWT / 401 / session expired
  | 'validation'  // missing required fields / enum out of range
  | 'rate_limit'  // 429
  | 'not_found'   // 404
  | 'unknown'

/**
 * Turn an unknown thrown value into a low-cardinality category label.
 * Be conservative: when in doubt, return 'unknown' rather than misclassifying.
 */
export function categorizeError(err: unknown): ErrorCategory {
  if (err == null) return 'unknown'
  const raw = (err as { message?: unknown })?.message ?? err
  const msg = String(raw).toLowerCase()

  if (msg.includes('jwt') || msg.includes('401') || msg.includes('unauthorized')) return 'auth'
  if (msg.includes('429') || msg.includes('rate')) return 'rate_limit'
  if (msg.includes('404') || msg.includes('not found')) return 'not_found'
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || msg.includes('offline')) return 'network'
  if (msg.includes('required') || msg.includes('missing') || msg.includes('invalid value') || msg.includes('enum')) return 'validation'
  if (msg.includes('parse') || msg.includes('json') || msg.includes('syntax')) return 'parse'
  return 'unknown'
}

// ─── Discriminated union of every tracked event ──────────────────────────
// Adding a new event = add a variant here. Adding a property to an existing
// event = add it here. TypeScript will then force every call site to
// comply, which is how we avoid "oops I renamed the event but half the
// call sites are still emitting the old name" drift.

export type AnalyticsEvent =
  | {
      name: 'match_saved'
      props: {
        match_type: MatchTypeDim
        surface: SurfaceDim
        format: FormatDim
        is_competitive: boolean
        confidence: ParseConfidenceDim
        source: SourceDim
      }
    }
  | {
      name: 'match_save_failed'
      props: {
        error_category: ErrorCategory
        source: SourceDim
      }
    }
  | {
      name: 'match_parse_failed'
      props: {
        error_category: ErrorCategory
        input_length: number
      }
    }
  | {
      name: 'match_duplicate_detected'
      props: {
        match_type: MatchTypeDim
        surface: SurfaceDim
      }
    }
  | {
      name: 'match_disambiguation_shown'
      props: {
        ambiguity_count: number
      }
    }
  | {
      name: 'match_queued_offline'
      props: {
        match_type: MatchTypeDim
      }
    }
  | {
      name: 'offline_sync_completed'
      props: {
        synced: number
        failed: number
        pending_before: number
      }
    }

// ─── The single entry point ──────────────────────────────────────────────
// Fire-and-forget. Analytics MUST NEVER throw into the app — the try/catch
// is load-bearing. If @vercel/analytics is blocked (ad blocker, dev mode
// without the script, privacy extensions), this silently no-ops.

export function logEvent(event: AnalyticsEvent): void {
  try {
    // Vercel's track() accepts Record<string, string|number|boolean|null|undefined>.
    // Our discriminated union is structurally compatible but TypeScript can't
    // prove it in the general case, so we assert.
    track(event.name, event.props as Record<string, string | number | boolean | null>)
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[analytics]', event.name, event.props)
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[analytics] track() failed:', err)
    }
  }
}

// ─── Dimension coercion helpers ──────────────────────────────────────────
// These turn free-form strings (coming from the AI parser or user input)
// into the constrained enum types above, falling back to 'unknown' so we
// never drop an event just because a field doesn't match.

export function toMatchTypeDim(v: unknown): MatchTypeDim {
  const allowed: MatchTypeDim[] = ['practice', 'friendly', 'league', 'tournament']
  return allowed.includes(v as MatchTypeDim) ? (v as MatchTypeDim) : 'unknown'
}
export function toSurfaceDim(v: unknown): SurfaceDim {
  const allowed: SurfaceDim[] = ['hard', 'clay', 'grass', 'indoor-hard', 'indoor-clay', 'other']
  return allowed.includes(v as SurfaceDim) ? (v as SurfaceDim) : 'unknown'
}
export function toFormatDim(v: unknown): FormatDim {
  return v === 'singles' || v === 'doubles' ? v : 'unknown'
}
