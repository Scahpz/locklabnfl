// Fetches NFL season stats from Sleeper directly (same source as the start/sit section).
// Guaranteed to have correct season data — bypasses the Railway backend for historical analytics.

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

let _memCache = null;
let _resolvedSeason = null;

// Determine which season has enough data (≥5 completed weeks).
// Current year is only used if week 5 exists with real data; otherwise prior year.
async function _resolveSeason() {
  if (_resolvedSeason) return _resolvedSeason;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  // Before September: always prior year's season
  if (month < 8) {
    _resolvedSeason = year - 1;
    return _resolvedSeason;
  }

  // September+: check if current year has ≥5 weeks of real regular-season data
  try {
    const r = await fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${year}/5`);
    if (r.ok) {
      const data = await r.json();
      // More than 50 entries means real games happened, not just preseason noise
      if (Object.keys(data).length > 50) {
        _resolvedSeason = year;
        return _resolvedSeason;
      }
    }
  } catch {}

  // Not enough current-year data — use prior year's complete season
  _resolvedSeason = year - 1;
  return _resolvedSeason;
}

function normName(n) {
  return n.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

export async function loadSleeperHistory() {
  if (_memCache && Date.now() - _memCache.ts < CACHE_TTL_MS) return _memCache;

  const season = await _resolveSeason();
  const CACHE_KEY = `locklab_sl_hist_${season}`;

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

  // Fetch player list + all 18 weeks in parallel (same URL pattern as PlayerBreakdownModal)
  const [playersData, ...weekResults] = await Promise.all([
    fetch('https://api.sleeper.app/v1/players/nfl').then(r => r.ok ? r.json() : {}),
    ...Array.from({ length: 18 }, (_, i) =>
      fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${i + 1}`)
        .then(r => r.ok ? r.json() : {})
        .then(data => ({ week: i + 1, data }))
        .catch(() => ({ week: i + 1, data: {} }))
    ),
  ]);

  const byName = {};
  const byNameNorm = {}; // normalized → canonical

  for (const { week, data } of weekResults) {
    for (const [pid, stats] of Object.entries(data)) {
      if (!stats || typeof stats !== 'object') continue;
      const info = playersData[pid];
      if (!info?.full_name) continue;

      const name = info.full_name;
      if (!byName[name]) {
        byName[name] = { position: info.position || '', games: [] };
        byNameNorm[normName(name)] = name;
      }

      byName[name].games.push({
        week,
        season: SLEEPER_SEASON,
        stats,
        opp: stats.opponent || stats.opp || '',
      });
    }
  }

  for (const entry of Object.values(byName)) {
    entry.games.sort((a, b) => b.week - a.week); // most recent first
  }

  const result = { byName, byNameNorm, ts: Date.now(), season };
  const CACHE_KEY_SAVE = `locklab_sl_hist_${season}`;
  try { sessionStorage.setItem(CACHE_KEY_SAVE, JSON.stringify(result)); } catch {}

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

  // Partial: remove periods, try prefix/suffix match
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

  const games  = entry.games; // sorted desc by week
  const values = games.map(g => getter(g.stats));
  const logs   = games.map(g => ({
    value:  Math.round(getter(g.stats) * 10) / 10,
    opp:    g.opp,
    isHome: null,
    date:   `${SLEEPER_SEASON}-W${g.week}`,
    season: SLEEPER_SEASON,
    week:   g.week,
  }));

  const v5  = values.slice(0, 5);
  const v10 = values.slice(0, 10);
  const v20 = values.slice(0, 20);

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
    season_avg:        _avg(values),
    season_games:      values.length,
    season_hit_rate:   _hitRate(values, line),
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
