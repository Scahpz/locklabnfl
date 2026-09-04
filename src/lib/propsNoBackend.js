// Fetches NFL props directly from PrizePicks (public API, no key)
// and enriches with L5/L10/hit-rate analytics computed from Sleeper 2025 season stats.

const PP_URL = 'https://api.prizepicks.com/projections?league_id=9&per_page=250&single_stat=true';
const SLEEPER_STATS_URL = week => `https://api.sleeper.app/v1/stats/nfl/regular/2025/${week}`;
const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';
const LIVE_CACHE_KEY = 'locklab_nfl_live_v10'; // nflLiveData.js cache for name→id mapping

const STATS_CACHE_KEY = 'locklab_s25_wkstats_v1';
const STATS_CACHE_TS  = 'locklab_s25_wkstats_ts_v1';
const STATS_TTL_MS    = 24 * 60 * 60 * 1000;

const NAME_ID_CACHE_KEY = 'locklab_nfl_nameid_v1';
const NAME_ID_CACHE_TS  = 'locklab_nfl_nameid_ts_v1';
const NAME_ID_TTL_MS    = 7 * 24 * 60 * 60 * 1000; // 7 days — player list is stable

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
  fantasy_points:  'pts_ppr',
  passing_ints:    'pass_int',
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

// Normalize player names for comparison across data sources.
// Strips dots (D.J. → DJ), collapses whitespace, lowercases.
// Handles: "D.J. Moore" ↔ "DJ Moore", "T.J. Watt" ↔ "TJ Watt", etc.
function normName(n) {
  return (n || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
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
      if (p.player_name && p.id) map[normName(p.player_name)] = p.id;
    });
    return map;
  } catch {
    return {};
  }
}

// Full name→id lookup: tries nflLiveData cache first, then a dedicated name→id cache,
// then fetches the Sleeper player list as a last resort (cached 7 days).
async function buildNameToIdFull() {
  const fast = buildNameToId();
  if (Object.keys(fast).length > 10) return fast;

  try {
    const cached = localStorage.getItem(NAME_ID_CACHE_KEY);
    const ts = Number(localStorage.getItem(NAME_ID_CACHE_TS) || 0);
    if (cached && Date.now() - ts < NAME_ID_TTL_MS) return JSON.parse(cached);
  } catch {}

  const players = await fetchSafe(SLEEPER_PLAYERS_URL, 20000);
  if (!players) return {};

  const SKILL = new Set(['QB', 'RB', 'WR', 'TE', 'K']);
  const map = {};
  Object.entries(players).forEach(([id, p]) => {
    if (!p.first_name || !p.last_name || !SKILL.has(p.position)) return;
    map[normName(`${p.first_name} ${p.last_name}`)] = id;
  });

  try {
    localStorage.setItem(NAME_ID_CACHE_KEY, JSON.stringify(map));
    localStorage.setItem(NAME_ID_CACHE_TS, String(Date.now()));
  } catch {}

  return map;
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

// ── Direct Underdog v5 fetch (browser-side, CORS: * on their API) ─────────────
const UD_URL = 'https://api.underdogfantasy.com/beta/v5/over_under_lines?sport_id=NFL';

const UD_STAT_MAP = {
  passing_yds: 'passing_yards', rushing_yds: 'rushing_yards',
  receiving_yds: 'receiving_yards', receptions: 'receptions',
  receiving_rec: 'receptions', passing_tds: 'passing_tds',
  rushing_tds: 'rushing_tds', receiving_tds: 'receiving_tds',
  rush_rec_tds: 'rush_rec_tds', rush_rec_yds: 'rush_rec_yards',
  fantasy_pts: 'fantasy_points', passing_ints: 'passing_ints',
  sacks: 'sacks', passing_long: 'passing_long',
  rushing_long: 'rushing_long', rushing_att: 'rushing_attempts',
  period_1_receiving_yds: 'q1_receiving_yards',
  period_1_receiving_rec: 'q1_receptions',
  period_1_2_receiving_yds: 'h1_receiving_yards',
  period_1_2_receiving_rec: 'h1_receptions',
  period_1_passing_yds: 'q1_passing_yards',
  period_1_2_passing_yds: 'h1_passing_yards',
  period_1_rushing_yds: 'q1_rushing_yards',
  period_1_2_rushing_yds: 'h1_rushing_yards',
  period_1_rush_rec_tds: 'q1_rush_rec_tds',
  period_1_2_rush_rec_tds: 'h1_rush_rec_tds',
};

export async function fetchUnderdogDirect() {
  // Fetch props and 2025 season stats in parallel
  const [raw, statsMap] = await Promise.all([
    fetchSafe(UD_URL, 15000),
    buildSeasonStats(),
  ]);
  if (!raw?.over_under_lines?.length) return null;

  const players     = Object.fromEntries((raw.players     || []).map(p => [p.id, p]));
  const appearances = Object.fromEntries((raw.appearances || []).map(a => [a.id, a]));

  // Build team UUID → abbreviation from games array (e.g. "NE @ SEA")
  const teamUUIDMap = {};
  const gameInfoMap = {};
  for (const g of (raw.games || [])) {
    if (g.sport_id && g.sport_id !== 'NFL') continue;
    const parts = (g.abbreviated_title || g.title || '').split(' @ ');
    const away  = parts[0]?.trim() || '';
    const home  = parts[1]?.trim() || '';
    if (g.away_team_id && away) teamUUIDMap[g.away_team_id] = away;
    if (g.home_team_id && home) teamUUIDMap[g.home_team_id] = home;
    if (g.id != null) {
      gameInfoMap[g.id] = {
        home, away,
        home_team_id: g.home_team_id,
        scheduled_at: g.scheduled_at || '',
      };
    }
  }

  const props = [];
  const seen  = new Set();

  for (const line of raw.over_under_lines) {
    if (line.status !== 'active') continue;
    const statValue = line.stat_value;
    if (statValue == null) continue;

    const ou         = line.over_under || {};
    const appStat    = ou.appearance_stat || {};
    const stat       = appStat.stat || '';
    const dispStat   = appStat.display_stat || '';
    const appId      = appStat.appearance_id;
    const propType   = UD_STAT_MAP[stat];
    if (!propType || !appId) continue;

    const appearance = appearances[appId] || {};
    const playerId   = appearance.player_id;
    const player     = playerId ? players[playerId] : null;
    if (!player || player.sport_id !== 'NFL') continue;

    const name = `${player.first_name || ''} ${player.last_name || ''}`.trim();
    if (!name) continue;

    // Dedup by player + prop_type (keep first line seen)
    const key = `${name}__${propType}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const teamUUID   = appearance.team_id || '';
    const matchId    = appearance.match_id;
    const teamAbbrev = teamUUIDMap[teamUUID] || '';
    const gameMeta   = gameInfoMap[matchId]  || {};
    const home       = gameMeta.home || '';
    const away       = gameMeta.away || '';
    const opponent   = teamAbbrev && teamAbbrev === home ? away : (home || '');

    let overOdds = -110, underOdds = -110;
    for (const opt of (line.options || [])) {
      const price = parseInt(opt.american_price, 10) || -110;
      if (opt.choice === 'higher') overOdds  = price;
      if (opt.choice === 'lower')  underOdds = price;
    }

    props.push({
      player_name:    name,
      team:           teamAbbrev,
      player_team:    teamAbbrev,
      position:       player.position_name || '',
      prop_type:      propType,
      line:           parseFloat(statValue),
      over_odds:      overOdds,
      under_odds:     underOdds,
      display_stat:   dispStat,
      is_season_long: stat.startsWith('season_'),
      home,
      away,
      opponent,
      scheduled_at:   gameMeta.scheduled_at || '',
      image_url:      player.image_url || '',
      sources:        ['underdog'],
      all_books:      [{ key: 'underdog', title: 'Underdog', line: parseFloat(statValue), over_odds: overOdds, under_odds: underOdds }],
      has_analytics:  false,
    });
  }

  if (!props.length) return null;

  // Enrich with 2025 Sleeper season stats (last 10 games, hit rate, season avg)
  if (statsMap) {
    const nameToId = await buildNameToIdFull();
    props.forEach(prop => {
      const sleeperKey = PROP_TO_SLEEPER[prop.prop_type];
      if (!sleeperKey) return;
      const pid = nameToId[normName(prop.player_name)];
      if (!pid || !statsMap[pid]?.[sleeperKey]?.length) return;
      const analytics = computeAnalytics(statsMap[pid][sleeperKey], prop.line);
      if (analytics) Object.assign(prop, analytics);
    });
  }

  const seenGames = new Map();
  props.forEach(p => {
    const a = (p.away || '').toUpperCase();
    const h = (p.home || '').toUpperCase();
    if (!a || !h) return;
    const k = `${a}@${h}`;
    if (!seenGames.has(k)) seenGames.set(k, { home: p.home, away: p.away, scheduled_at: p.scheduled_at });
  });

  return {
    game_date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    games_summary: Array.from(seenGames.values()).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)),
    props,
  };
}

export async function fetchPropsNoBackend() {
  const [ppRaw, statsMap] = await Promise.all([
    fetchSafe(PP_URL, 12000),
    buildSeasonStats(),
  ]);

  if (!ppRaw?.data?.length) {
    // PrizePicks blocked or empty — fall back to direct Underdog fetch
    return fetchUnderdogDirect();
  }

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
    const pid      = nameToId[normName(playerName)];
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

  // Build games_summary from the props so the Props page game filter shows matchup buttons
  const seenGames = new Map();
  props.forEach(p => {
    const away = (p.away || '').toUpperCase();
    const home = (p.home || '').toUpperCase();
    if (!away || !home) return;
    const key = `${away}@${home}`;
    if (!seenGames.has(key)) {
      seenGames.set(key, { home: p.home, away: p.away, scheduled_at: p.scheduled_at });
    }
  });
  const games_summary = Array.from(seenGames.values())
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  return {
    game_date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    games_summary,
    props,
  };
}
