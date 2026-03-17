/**
 * SC Legislature session numbering.
 * Sessions are biennial: session 101 = 1975-1976, session 126 = 2025-2026.
 * Formula: sessionNumber = Math.floor((year - 1975) / 2) + 101
 */

/** Get session number for a given year */
export function sessionNumber(year: number): number {
  if (year < 1975) throw new Error(`No session data before 1975 (requested year: ${year})`)
  return Math.floor((year - 1975) / 2) + 101
}

/** Get the year range string for a session (e.g., "2025-2026") */
export function sessionYears(session: number): string {
  const startYear = 1975 + (session - 101) * 2
  return `${startYear}-${startYear + 1}`
}

/** Get the current session number based on today's date */
export function currentSession(): number {
  return sessionNumber(new Date().getFullYear())
}

/** Get the 2-digit suffix for URL construction (e.g., 126 → "26") */
export function sessionSuffix(session: number): string {
  return String(session).slice(-2)
}
