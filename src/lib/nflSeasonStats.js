import { useState, useEffect } from 'react';
import { TEAM_OFFENSE } from './gameAnalysis';

// ─── ESPN team IDs for stats API ─────────────────────────────────────────────
const ESPN_IDS = {
  ARI: 22, ATL:  1, BAL: 33, BUF:  2, CAR: 29, CHI:  3, CIN:  4, CLE:  5,
  DAL:  6, DEN:  7, DET:  8, GB:   9, HOU: 34, IND: 11, JAX: 30, KC:  12,
  LAC: 24, LAR: 14, LV:  13, MIA: 15, MIN: 16, NE:  17, NO:  18, NYG: 19,
  NYJ: 20, PHI: 21, PIT: 23, SEA: 26, SF:  25, TB:  27, TEN: 10, WAS: 28,
};

const CACHE_KEY   = 'nfl_live_stats_2026_27'; // 2026-27 season live stats cache
const CACHE_TTL   = 6 * 60 * 60 * 1000; // 6 hours

// ─── Season detection ─────────────────────────────────────────────────────────
// Returns true only during the 2026-27 NFL regular season + playoffs window
export function isLiveSeason() {
  const now   = Date.now();
  const start = new Date('2026-09-03').getTime(); // Kickoff Week 1
  const end   = new Date('2027-02-15').getTime(); // after Super Bowl
  return now >= start && now <= end;
}

// ─── ESPN stats parser ────────────────────────────────────────────────────────
function statVal(categories, statName, fallback = null) {
  for (const cat of categories) {
    const hit = (cat.stats ?? []).find(s => s.name === statName || s.abbreviation === statName);
    if (hit != null) return Number(hit.value);
  }
  return fallback;
}

function parseOffense(categories, gp, hardcoded) {
  // ESPN returns season totals; divide by games played for per-game averages.
  // Stat names verified against ESPN public API responses.
  const pts  = gp > 0 ? statVal(categories, 'totalPoints', null)       : null;
  const pyds = gp > 0 ? statVal(categories, 'passingYards', null)      : null;
  const ryds = gp > 0 ? statVal(categories, 'rushingYards', null)      : null;
  const tyds = gp > 0 ? statVal(categories, 'totalYards', null)        : null;

  if (pts == null || pyds == null || ryds == null) return null;

  const totalYds = tyds ?? (pyds + ryds);

  return {
    pts:   Math.round((pts  / gp) * 10) / 10,
    yds:   Math.round((totalYds / gp)),
    pass:  Math.round(pyds / gp),
    rush:  Math.round(ryds / gp),
    // 3rd-down %, red-zone %, turnovers — harder to get from ESPN team stats;
    // fall back to last-season hardcoded values as a stable prior
    third: hardcoded?.third ?? 40,
    rz:    hardcoded?.rz    ?? 60,
    to:    hardcoded?.to    ?? 1.2,
  };
}

// ─── Defensive stats parser ───────────────────────────────────────────────────
// Extracts yards allowed per game from ESPN's defensive category.
// ESPN reports season totals so we divide by gamesPlayed.
// Position-level splits (WR/TE/RB) are derived via fixed league-average shares.
function parseDefense(categories, gp) {
  if (!gp) return null;

  // ESPN uses several name variants — try each
  const passAllowed = statVal(categories, 'passingYardsAllowed', null)
    ?? statVal(categories, 'netPassingYardsAllowed', null)
    ?? statVal(categories, 'passYardsAllowed', null);
  const rushAllowed = statVal(categories, 'rushingYardsAllowed', null)
    ?? statVal(categories, 'rushYardsAllowed', null);

  if (passAllowed == null || rushAllowed == null) return null;

  const passPerGame = Math.round(passAllowed / gp);
  const rushPerGame = Math.round(rushAllowed / gp);

  // Positional split constants: league-average share of receiving yards by position
  return {
    pass_yds_allowed:    passPerGame,
    rush_yds_allowed:    rushPerGame,
    rec_yds_allowed_wr:  Math.round(passPerGame * 0.66),
    rec_yds_allowed_te:  Math.round(passPerGame * 0.25),
    rec_yds_allowed_rb:  Math.round(passPerGame * 0.14),
  };
}

// ─── Fetch one team ───────────────────────────────────────────────────────────
async function fetchTeamStats(abv) {
  const id = ESPN_IDS[abv];
  if (!id) return null;

  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/statistics`,
    { signal: AbortSignal.timeout(6000) },
  );
  if (!res.ok) return null;

  const data = await res.json();
  const categories = data?.splits?.categories ?? [];
  if (!categories.length) return null;

  // gamesPlayed lives in the "general" category
  let gp = statVal(categories, 'gamesPlayed', 0);
  if (!gp) gp = statVal(categories, 'games', 0);
  if (!gp) return null;

  const hardcoded = TEAM_OFFENSE[abv] ?? null;
  return {
    offense: parseOffense(categories, gp, hardcoded),
    defense: parseDefense(categories, gp),
  };
}

// ─── Fetch all 32 teams (throttled to avoid rate-limiting) ───────────────────
async function fetchAllStats() {
  const teams = Object.keys(ESPN_IDS);
  const offenseTable = {};
  const defenseTable = {};

  // Batch in groups of 8 to avoid hammering ESPN
  for (let i = 0; i < teams.length; i += 8) {
    const batch = teams.slice(i, i + 8);
    const results = await Promise.allSettled(batch.map(abv => fetchTeamStats(abv)));
    results.forEach((r, idx) => {
      if (r.status !== 'fulfilled' || !r.value) return;
      const abv = batch[idx];
      if (r.value.offense) offenseTable[abv] = r.value.offense;
      if (r.value.defense) defenseTable[abv] = r.value.defense;
    });
  }

  const hasEnough = Object.keys(offenseTable).length >= 20;
  return hasEnough
    ? { offense: offenseTable, defense: Object.keys(defenseTable).length >= 20 ? defenseTable : null }
    : null;
}

// ─── Cache helpers ────────────────────────────────────────────────────────────
function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* quota exceeded — silently skip */ }
}

// ─── React hook ───────────────────────────────────────────────────────────────
// Returns { offense: { ARI: {...} }, defense: { ARI: {...} } } or null
export function useSeasonStats() {
  const [stats, setStats] = useState(() => {
    if (!isLiveSeason()) return null;
    return readCache();
  });

  useEffect(() => {
    if (!isLiveSeason()) return;

    const cached = readCache();
    if (cached) { setStats(cached); return; }

    let cancelled = false;
    fetchAllStats().then(result => {
      if (cancelled || !result) return;
      writeCache(result);
      setStats(result);
    }).catch(() => { /* silent — falls back to hardcoded 2025 data */ });

    return () => { cancelled = true; };
  }, []);

  return stats;
}

// ─── Utility: merge live stats with hardcoded fallback ───────────────────────
// Returns an offense table that fills gaps with 2024 hardcoded values
export function mergedOffenseTable(liveStats) {
  if (!liveStats?.offense) return TEAM_OFFENSE;
  return { ...TEAM_OFFENSE, ...liveStats.offense };
}
