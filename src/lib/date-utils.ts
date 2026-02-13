/**
 * Date utilities for HisaabKitaab.
 * All dates use Pakistan Standard Time (PKT, UTC+5) to ensure consistency
 * regardless of server timezone (Vercel runs in UTC).
 */

const PKT_TIMEZONE = "Asia/Karachi";

/**
 * Get today's date in YYYY-MM-DD format in Pakistan Standard Time.
 * Works correctly on both server (UTC) and client (any timezone).
 */
export function getTodayPKT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: PKT_TIMEZONE });
}

/**
 * Get first day of current month in YYYY-MM-DD format in PKT.
 */
export function getFirstOfMonthPKT(): string {
  const pkToday = getTodayPKT(); // YYYY-MM-DD
  const [year, month] = pkToday.split("-");
  return `${year}-${month}-01`;
}

/**
 * Get the current date/time components in PKT.
 * Returns { year, month (0-indexed), date, hours, minutes }.
 */
export function getPKTDateParts(): {
  year: number;
  month: number;
  date: number;
} {
  const pkToday = getTodayPKT();
  const [y, m, d] = pkToday.split("-").map(Number);
  return { year: y, month: m - 1, date: d }; // month is 0-indexed like JS Date
}

/**
 * Get a date N months ago in YYYY-MM-DD format (first of that month) in PKT.
 */
export function getMonthsAgoPKT(monthsAgo: number): string {
  const { year, month } = getPKTDateParts();
  const d = new Date(year, month - monthsAgo, 1);
  return d.toISOString().split("T")[0];
}

/**
 * Get today's date in local browser timezone (YYYY-MM-DD format).
 * Use this ONLY on the client side where the browser timezone matches the user.
 */
export function getTodayLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
