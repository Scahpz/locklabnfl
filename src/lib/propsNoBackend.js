// Fetches NFL props directly from PrizePicks (public API, no key)
// and enriches with L5/L10/hit-rate analytics computed from Sleeper 2025 season stats.

const PP_URL = 'https://api.prizepicks.com/projections?league_id=9&per_page=250&single_stat=true';
const SLEEPER_STATS_URL = week => `https://api.sleeper.app/v1/stats/nfl/regular/2025/${week}`;
const LIVE_CACHE_KEY = 'locklab_nfl_live_v5'; // nflLiveData.js cache for name→id mapping

const STATS_CACHE_KEY = 'locklab_s25_wkstats_v1';
const STATS_CACHE_TS  = 'locklab_s25_wkstats_ts_v1';
const STATS_TTL_MS    = 24 * 60 * 60 * 1000;

const PP_STAT_MAP = {
  'Passing Yards':    'passing_yards',
  'Rushing Yards':    'rushing_yards',
  'Receiving Yards':  'receiving_yards',
  'Receptions':       'receptions',
  'Passing TDs':      'passing_tds',
  'Rushing TDs':      'rushing_tds',
  'Receiving TDs':    'receiving_tds',
  'Fantasy Score':    'fantasy_points',
  'Tackles':          'tackles',
  'Sacks':            'sacks',
  'Interceptions':    'interceptions',
  'Completions':      'completions',
  'Kicking Points':   'kicking_points',
};

// Prop type → Sleeper weekly stat key
const PROP_TO_SLEEPER = {
  passing_yards:   'pass_yd',
  rushing_yards:   'rush_yd',
  receiving_yards: 'rec_yd',
  receptions:      'rec',
  passing_tds:     'pass_td',
  rushing_tds:     'rush_td',
  receiving_tds:   'rec_td',
};

async function fetchSafe(url, ms = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Build Sleeper player_id → weekly stat arrays from 18 weeks of 2025 season data.
// Cached for 24h (season stats don't change after the season).
async function buildSeasonStats() {
  try {
    const cached = localStorage.getItem(STATS_CACHE_KEY);
    const ts = Number(localStorage.getItem(STATS_CACHE_TS) || 0);
    if (cached && Date.now() - ts < STATS_TTL_MS) return JSON.parse(cached);
  } catch {}

  const RELEVANT = new Set(Object.values(PROP_TO_SLEEPER));
  const weeks = Array.from({ length: 18 }, (_, i) => i + 1);

  const weeklyData = await Promise.all(weeks.map(w => fetchSafe(SLEEPER_STATS_URL(w))));

  // { player_id: { stat_key: [val_wk1, val_wk2, ...] } }
  const map = {};
  weeklyData.forEach(weekStats => {
    if (!weekStats) return;
    Object.entries(weekStats).forEach(([pid, stats]) => {
      if (!map[pid]) map[pid] = {};
      Object.entries(stats).forEach(([k, v]) => {
        if (!RELEVANT.has(k) || typeof v !== 'number') return;
        if (!map[pid][k]) map[pid][k] = [];
        map[pid][k].push(v);
      });
    });
  });

  try {
    localStorage.setItem(STATS_CACHE_KEY, JSON.stringify(map));
    localStorage.setItem(STATS_CACHE_TS, String(Date.now()));
  } catch {}

  return map;
}

// Get player name → Sleeper ID mapping. Uses the nflLiveData cached players
// if available (free), otherwise skips analytics rather than fetching ~7MB list.
function buildNameToId() {
  try {
    const raw = localStorage.getItem(LIVE_CACHE_KEY);
    const cached = raw ? JSON.parse(raw) : null;
    if (!cached?.players?.length) return {};
    const map = {};
    cached.players.forEach(p => {
      if (p.player_name && p.id) map[p.player_name.toLowerCase()] = p.id;
    });
    return map;
  } catch {
    return {};
  }
}

function computeAnalytics(gameLogs, line) {
  if (!gameLogs?.length) return null;
  const last10 = gameLogs.slice(-10);
  const last5  = gameLogs.slice(-5);

  const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const hr  = arr => Math.round(arr.filter(v => v > line).length / arr.length * 100);

  const l10avg = Math.round(avg(last10) * 10) / 10;
  const l5avg  = Math.round(avg(last5)  * 10) / 10;
  const sAvg   = Math.round(avg(gameLogs) * 10) / 10;
  const l10hr  = hr(last10);

  const cs = l10hr >= 80 && l10avg > line ? 9
           : l10hr >= 70 && l10avg > line ? 7
           : l10hr >= 60 ? 6
           : l10hr >= 50 ? 5
           : 3;

  return {
    has_analytics:    true,
    avg_last_10:      l10avg,
    avg_last_5:       l5avg,
    season_avg:       sAvg,
    season_games:     gameLogs.length,
    hit_rate_last_10: l10hr,
    season_hit_rate:  hr(gameLogs),
    last_10_games:    last10,
    last_5_games:     last5,
    projection:       l10avg,
    edge:             Math.round((l10avg - line) * 10) / 10,
    confidence_score: cs,
    confidence_tier:  cs >= 8 ? 'A' : cs >= 6 ? 'B' : 'C',
    is_top_pick:      cs >= 8,
    is_lock:          cs === 10,
    best_value:       l10avg - line > 8,
  };
}

export async function fetchPropsNoBackend() {
  const [ppRaw, statsMap] = await Promise.all([
    fetchSafe(PP_URL, 12000),
    buildSeasonStats(),
  ]);

  if (!ppRaw?.data?.length) return null;

  // Build PrizePicks entity lookups
  const ppPlayers = {};
  const ppGames   = {};
  (ppRaw.included || []).forEach(item => {
    if (item.type === 'NewPlayer') ppPlayers[item.id] = item.attributes;
    if (item.type === 'Game')      ppGames[item.id]   = item.attributes;
  });

  const nameToId = buildNameToId();

  const props = [];
  (ppRaw.data || []).forEach(proj => {
    if (proj.type !== 'Projection') return;
    const attrs = proj.attributes;
    if (!['pre_game', 'in_progress'].includes(attrs.status)) return;

    const propType = PP_STAT_MAP[attrs.stat_type];
    if (!propType) return;

    const line = attrs.line_score ?? null;
    if (line == null) return;

    const playerId = proj.relationships?.new_player?.data?.id;
    const gameId   = proj.relationships?.game?.data?.id;
    const ppPlayer = ppPlayers[playerId] || {};
    const ppGame   = ppGames[gameId]     || {};

    const playerName = ppPlayer.name     || '';
    const team       = ppPlayer.team     || '';
    const position   = ppPlayer.position || '';
    const homeTeam   = ppGame.home_team  || ppGame.away_team_name || '';
    const awayTeam   = ppGame.away_team  || ppGame.home_team_name || '';
    const isHome     = team && homeTeam && team.toUpperCase() === homeTeam.toUpperCase();
    const opponent   = isHome ? awayTeam : homeTeam;

    // Analytics from 2025 Sleeper stats
    let analytics = null;
    const statKey  = PROP_TO_SLEEPER[propType];
    const pid      = nameToId[playerName.toLowerCase()];
    if (statKey && pid && statsMap[pid]?.[statKey]?.length) {
      analytics = computeAnalytics(statsMap[pid][statKey], line);
    }

    const cs = analytics?.confidence_score ?? 5;

    props.push({
      player_name:        playerName,
      player_team:        team,
      position,
      prop_type:          propType,
      line,
      over_odds:          -110,
      under_odds:         -110,
      home:               homeTeam,
      away:               awayTeam,
      is_home:            isHome,
      opponent,
      scheduled_at:       attrs.start_time,
      injury_status:      'healthy',
      is_starter:         true,
      photo_url:          null,
      sources:            ['prizepicks'],
      all_books:          [{ key: 'prizepicks', title: 'PrizePicks', line, over_odds: -110, under_odds: -110 }],
      confidence_score:   cs,
      confidence_tier:    cs >= 8 ? 'A' : cs >= 6 ? 'B' : 'C',
      is_top_pick:        analytics?.is_top_pick ?? false,
      is_lock:            false,
      best_value:         analytics?.best_value ?? false,
      trap_warning:       false,
      streak_info:        null,
      minutes_avg:        null,
      def_rank_vs_pos:    null,
      matchup_rating:     null,
      game_total:         null,
      ...(analytics ?? { has_analytics: false }),
    });
  });

  if (!props.length) return null;

  return {
    game_date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    games_summary: [],
    props,
  };
}
