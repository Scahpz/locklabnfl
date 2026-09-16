// Fetches NFL season stats from Sleeper directly (same source as the start/sit section).
// Loads BOTH the current season AND the prior season so analytics always have a full
// data foundation even when only 1-3 weeks of the new season have been played.
// Current-season games sort first (newest) so L5/L10 windows are anchored to 2026+.

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Normalize ESPN abbreviations → Sleeper format, and vice-versa
const ESPN_TO_SLEEPER = { WSH: 'WAS', LA: 'LAR' };
const SLEEPER_TO_ESPN = { WAS: 'WSH', LAR: 'LA' };

let _memCache = null;
let _resolvedSeason = null;

// Determine the current NFL season year.
// September+: use the current calendar year if Week 1 has real data, else prior year.
async function _resolveSeason() {
  if (_resolvedSeason) return _resolvedSeason;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  // Before September: always prior year's complete season
  if (month < 8) {
    _resolvedSeason = year - 1;
    return _resolvedSeason;
  }

  // September+: check weeks 1 and 2 — if either has data, current season is live
  for (const checkWeek of [1, 2]) {
    try {
      const r = await fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${year}/${checkWeek}`);
      if (r.ok) {
        const data = await r.json();
        if (Object.keys(data).length > 50) {
          _resolvedSeason = year;
          return _resolvedSeason;
        }
      }
    } catch {}
  }

  _resolvedSeason = year - 1;
  return _resolvedSeason;
}

function normName(n) {
  return n.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

// Build week → ESPN_abbr → { opp (Sleeper abbr), date, isHome } from an ESPN schedule response
function _buildScheduleMap(schedRes) {
  const map = {};
  for (const event of schedRes?.events ?? []) {
    const weekNum = event.week?.number;
    if (!weekNum) continue;
    const comp = event.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors?.find(c => c.homeAway === 'home')?.team?.abbreviation?.toUpperCase();
    const away = comp.competitors?.find(c => c.homeAway === 'away')?.team?.abbreviation?.toUpperCase();
    if (!home || !away) continue;
    const date = event.date ?? null;
    if (!map[weekNum]) map[weekNum] = {};
    const homeSlp = ESPN_TO_SLEEPER[home] ?? home;
    const awaySlp = ESPN_TO_SLEEPER[away] ?? away;
    map[weekNum][home] = { opp: awaySlp, date, isHome: true };
    map[weekNum][away] = { opp: homeSlp, date, isHome: false };
  }
  return map;
}

export async function loadSleeperHistory() {
  if (_memCache && Date.now() - _memCache.ts < CACHE_TTL_MS) return _memCache;

  const season      = await _resolveSeason();
  const priorSeason = season - 1;
  const CACHE_KEY   = `locklab_sl_hist3_${season}`; // v3: loads both current + prior season

  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.ts && Date.now() - parsed.ts < CACHE_TTL_MS) {
        _memCache = parsed;
        return _memCache;
      }
    }
  } catch {}

  // Fetch everything in parallel:
  //   1 players list
  //   2 ESPN schedules (current + prior season)
  //   18 × current season Sleeper weekly stats
  //   18 × prior season Sleeper weekly stats
  const [playersData, schedResCurr, schedResPrior, ...weekResultsAll] = await Promise.all([
    fetch('https://api.sleeper.app/v1/players/nfl').then(r => r.ok ? r.json() : {}),
    fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}0901-${season + 1}0201&limit=300`)
      .then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${priorSeason}0901-${season}0201&limit=300`)
      .then(r => r.ok ? r.json() : null).catch(() => null),
    // current season weeks 1-18
    ...Array.from({ length: 18 }, (_, i) =>
      fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${i + 1}`)
        .then(r => r.ok ? r.json() : {})
        .then(data => ({ week: i + 1, season, data }))
        .catch(() => ({ week: i + 1, season, data: {} }))
    ),
    // prior season weeks 1-18
    ...Array.from({ length: 18 }, (_, i) =>
      fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${priorSeason}/${i + 1}`)
        .then(r => r.ok ? r.json() : {})
        .then(data => ({ week: i + 1, season: priorSeason, data }))
        .catch(() => ({ week: i + 1, season: priorSeason, data: {} }))
    ),
  ]);

  const schedMapCurr  = _buildScheduleMap(schedResCurr);
  const schedMapPrior = _buildScheduleMap(schedResPrior);

  const currWeekResults  = weekResultsAll.slice(0, 18);
  const priorWeekResults = weekResultsAll.slice(18);

  const byName     = {};
  const byNameNorm = {};

  function processWeeks(weekResults, schedMap) {
    for (const { week, season: wkSeason, data } of weekResults) {
      for (const [pid, stats] of Object.entries(data)) {
        if (!stats || typeof stats !== 'object') continue;
        const info = playersData[pid];
        if (!info?.full_name) continue;

        // Skip bye weeks and DNP/inactive games (Sleeper emits zero-stat rows for these)
        if ((stats.pts_half_ppr ?? 0) < 0.5) continue;

        const name = info.full_name;
        if (!byName[name]) {
          byName[name] = { position: info.position || '', games: [] };
          byNameNorm[normName(name)] = name;
        }

        const espnTeam   = SLEEPER_TO_ESPN[info.team] ?? info.team;
        const weekSched  = schedMap[week] ?? {};
        const schedEntry = weekSched[espnTeam] ?? weekSched[info.team] ?? null;

        byName[name].games.push({
          week,
          season: wkSeason,
          stats,
          opp:    schedEntry?.opp    ?? stats.opponent ?? stats.opp ?? '',
          isHome: schedEntry?.isHome ?? null,
          date:   schedEntry?.date   ?? null,
        });
      }
    }
  }

  processWeeks(currWeekResults, schedMapCurr);
  processWeeks(priorWeekResults, schedMapPrior);

  for (const entry of Object.values(byName)) {
    // Current season games first, then prior season — within each, newest week first
    entry.games.sort((a, b) =>
      b.season !== a.season ? b.season - a.season : b.week - a.week
    );
  }

  const result = { byName, byNameNorm, ts: Date.now(), season };
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch {}

  _memCache = result;
  return result;
}

const STAT_GETTERS = {
  passing_yards:    s => s.pass_yd   || 0,
  passing_tds:      s => s.pass_td   || 0,
  completions:      s => s.pass_cmp  || 0,
  passing_ints:     s => s.pass_int  || 0,
  passing_attempts: s => s.pass_att  || 0,
  rushing_yards:    s => s.rush_yd   || 0,
  rushing_tds:      s => s.rush_td   || 0,
  rushing_attempts: s => s.rush_att  || 0,
  receiving_yards:  s => s.rec_yd    || 0,
  receiving_tds:    s => s.rec_td    || 0,
  receptions:       s => s.rec       || 0,
  targets:          s => s.rec_tgt   || 0,
  fantasy_points:   s => s.pts_ppr   || 0,
  rush_rec_yards:   s => (s.rush_yd || 0) + (s.rec_yd  || 0),
  rush_rec_tds:     s => (s.rush_td || 0) + (s.rec_td  || 0),
  pass_rush_yards:  s => (s.pass_yd || 0) + (s.rush_yd || 0),
  anytime_td:       s => (s.rush_td || 0) + (s.rec_td  || 0) + (s.pass_td || 0),
  sacks:            s => s.sack      || 0,
  tackles:          s => (s.tkl_solo || 0) + (s.tkl_ast || 0),
};

function _avg(vals) {
  const v = vals.filter(x => x != null);
  if (!v.length) return null;
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10;
}

function _hitRate(vals, line) {
  if (!vals.length || line == null) return null;
  return Math.round(vals.filter(v => v > line).length / vals.length * 100);
}

function _findEntry(playerName, cache) {
  if (cache.byName[playerName]) return cache.byName[playerName];

  const norm = normName(playerName);
  const canonical = cache.byNameNorm[norm];
  if (canonical) return cache.byName[canonical];

  for (const [k, v] of Object.entries(cache.byNameNorm)) {
    if (norm.length > 4 && (k.startsWith(norm) || norm.startsWith(k))) {
      return cache.byName[v];
    }
  }

  return null;
}

export function computeAnalyticsFromSleeper(playerName, propType, line, cache) {
  if (!cache?.byName) return null;

  const entry = _findEntry(playerName, cache);
  if (!entry || !entry.games.length) return null;

  const getter = STAT_GETTERS[propType];
  if (!getter) return null;

  // games is sorted: current season newest first, then prior season newest first
  const games  = entry.games;
  const values = games.map(g => getter(g.stats));
  const logs   = games.map(g => ({
    value:  Math.round(getter(g.stats) * 10) / 10,
    opp:    g.opp,
    isHome: g.isHome,
    date:   g.date ?? `${g.season}-W${g.week}`,
    season: g.season,
    week:   g.week,
  }));

  // L5/L10/L20 windows start from the most recent games (current season first)
  const v5  = values.slice(0, 5);
  const v10 = values.slice(0, 10);
  const v20 = values.slice(0, 20);

  // Current-season games only (for display — "2026 stats")
  const currGames  = games.filter(g => g.season === cache.season);
  const currValues = currGames.map(g => getter(g.stats));

  const a10     = _avg(v10);
  const proj    = _avg(v5) ?? a10 ?? _avg(values);
  const confScore = values.length >= 10 ? 8
                  : values.length >= 5  ? 6
                  : values.length >= 3  ? 4 : 2;

  return {
    avg_last_5:        _avg(v5),
    avg_last_10:       a10,
    avg_last_20:       _avg(v20),
    hit_rate_last_5:   _hitRate(v5,  line),
    hit_rate_last_10:  _hitRate(v10, line),
    hit_rate_last_20:  _hitRate(v20, line),
    season_avg:        currValues.length ? _avg(currValues) : _avg(values),
    season_games:      currValues.length || values.length,
    season_hit_rate:   currValues.length ? _hitRate(currValues, line) : _hitRate(values, line),
    // current-season game logs shown up front in chart; prior season fills the window
    last_5_games:      v5,
    last_10_games:     v10,
    last_20_games:     v20,
    game_logs_last_10: logs.slice(0, 10),
    game_logs_last_20: logs.slice(0, 20),
    projection:        proj,
    edge:              a10 != null && line != null ? Math.round((a10 - line) * 10) / 10 : null,
    home_avg:          null,
    away_avg:          null,
    home_hit_rate:     null,
    away_hit_rate:     null,
    home_games_count:  0,
    away_games_count:  0,
    data_seasons:      cache.season,
    confidence_score:  confScore,
  };
}
