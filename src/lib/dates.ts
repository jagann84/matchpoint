// Local-timezone date helpers.
//
// The browser's Date -> ISO string gives UTC, so `new Date().toISOString()`
// is the wrong thing for anything user-facing: on the evening of the 7th
// in PT it returns "2026-04-08", meaning a user logging a match they just
// finished would see tomorrow's date. Use these helpers instead.

/**
 * Today's date in the user's local timezone, formatted YYYY-MM-DD —
 * the format <input type="date"> accepts.
 */
export function localToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
