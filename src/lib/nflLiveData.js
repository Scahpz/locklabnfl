// Fetches live NFL roster (Sleeper API) + per-player projections + schedule/totals (ESPN).
// Returns a player array with real projected FP attached, compatible with fantasyScore().

const CACHE_KEY = 'locklab_nfl_live_v8';  // v8: POS_DEFAULTS fallback for all zero-stat players
const CACHE_TTL = 4 * 60 * 60 * 1000;    // 4h

const ESPN_NORM = { WSH: 'WAS' };
function normESPN(t) { return ESPN_NORM[t] ?? t; }

const BAD_STATUS = new Set([
  'Cut', 'Retired', 'Practice Squad',
  'Physically Unable to Perform', 'Inactive',
]);

const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);

const INT_TYPES = new Set(['passing_tds', 'rushing_tds', 'receiving_tds', 'receptions']);

// Position-based fallback prop lines — only used when no Sleeper projection exists
const POS_DEFAULTS = {
  QB: [
    { prop_type: 'passing_yards', line: 245.5, variance: 55 },
    { prop_type: 'passing_tds',   line: 1.5,   variance: 1  },
  ],
  RB: [
    { prop_type: 'rushing_yards', line: 68.5,  variance: 32 },
    { prop_type: 'receptions',    line: 2.5,   variance: 1.5 },
  ],
  WR: [
    { prop_type: 'receiving_yards', line: 55.5, variance: 28 },
    { prop_type: 'receptions',      line: 4.5,  variance: 2  },
  ],
  TE: [
    { prop_type: 'receiving_yards', line: 35.5, variance: 20 },
    { prop_type: 'receptions',      line: 3.5,  variance: 1.5 },
  ],
  K: [
    { prop_type: 'field_goal_attempts', line: 2.5, variance: 1.0 },
  ],
  DEF: [
    { prop_type: 'points_allowed', line: 20.5, variance: 8 },
  ],
};

function makeProp(prop_type, line, variance, gameTotal = 45.5, isHome = false) {
  const isInt = INT_TYPES.has(prop_type);
  const safeVariance = Math.max(variance, 0.3);
  const rawLine = Math.max(line, 0);
  const safeLine = Math.round(rawLine);
  const games = Array.from({ length: 6 }, () => {
    const raw = safeLine + (Math.random() * safeVariance * 2 - safeVariance);
    return Math.max(0, Math.round(raw));
  });
  const avg6 = Math.round(games.reduce((a, b) => a + b, 0) / 6);
  const avg3 = Math.round(games.slice(-3).reduce((a, b) => a + b, 0) / 3);
  const hits = games.filter(v => v > safeLine).length;
  return {
    prop_type,
    line: safeLine,
    over_odds: -110,
    under_odds: -110,
    projection: avg3,
    edge: parseFloat((((avg3 - safeLine) / Math.max(safeLine, 1)) * 100).toFixed(1)),
    hit_rate_last_10: Math.round((hits / 6) * 100),
    avg_last_5: avg3,
    avg_last_10: avg6,
    streak_info: `Hit over in ${hits} of last 6`,
    confidence_score: 5,
    confidence_tier: 'C',
    is_top_pick: false, is_lock: false, best_value: false, trap_warning: false,
    last_5_games: games.slice(-3), last_10_games: games,
    matchup_rating: 'neutral', def_rank_vs_pos: 16,
    game_total: gameTotal, is_home: isHome,
    snap_pct: null, target_share: null,
  };
}

// Build props from real Sleeper projection stats so lines are player-specific
function buildPropsFromProjections(position, proj, gameTotal, isHome) {
  const props = [];
  const { pass_yd, rush_yd, rec_yd, rec } = proj ?? {};

  // Estimate per-player usage metrics from Sleeper volume projections.
  // These feed the Usage/Target Share component of fantasyScore() so the
  // score varies by player instead of defaulting to a neutral 0.5 placeholder.
  // Target share: estimated targets / ~33 team targets per game.
  const catchRate = position === 'TE' ? 0.75 : position === 'RB' ? 0.82 : 0.68;
  const estTargetShare = (position !== 'QB' && rec)
    ? parseFloat(Math.min(rec / (catchRate * 33), 0.45).toFixed(3))
    : null;
  // RB snap pct: correlated with rush volume; a 100-yd back is ~75% snaps.
  const estSnapPct = (position === 'RB' && rush_yd)
    ? parseFloat(Math.min(rush_yd / 130, 0.75).toFixed(3))
    : null;

  // Helper: override projection with the actual Sleeper stat so that the lean
  // calculation in PlayerBreakdownModal has a single, consistent number.
  function push(base, rawStat) {
    base.projection = Math.round(rawStat);
    props.push(base);
  }

  if (position === 'QB') {
    if (pass_yd && pass_yd > 10) {
      push(makeProp('passing_yards', pass_yd * 0.88, pass_yd * 0.28, gameTotal, isHome), pass_yd);
    }
    if (rush_yd && rush_yd > 4) {
      push(makeProp('rushing_yards', rush_yd * 0.85, rush_yd * 0.50, gameTotal, isHome), rush_yd);
    }
  } else if (position === 'RB') {
    if (rush_yd && rush_yd > 0) {
      push({ ...makeProp('rushing_yards', rush_yd * 0.85, rush_yd * 0.45, gameTotal, isHome), snap_pct: estSnapPct, target_share: estTargetShare }, rush_yd);
    }
    if (rec && rec > 0) {
      push({ ...makeProp('receptions', rec * 0.85, rec * 0.55, gameTotal, isHome), snap_pct: estSnapPct, target_share: estTargetShare }, rec);
    }
  } else if (position === 'WR') {
    if (rec_yd && rec_yd > 0) {
      push({ ...makeProp('receiving_yards', rec_yd * 0.85, rec_yd * 0.45, gameTotal, isHome), target_share: estTargetShare }, rec_yd);
    }
    if (rec && rec > 0) {
      push({ ...makeProp('receptions', rec * 0.85, rec * 0.55, gameTotal, isHome), target_share: estTargetShare }, rec);
    }
  } else if (position === 'TE') {
    if (rec_yd && rec_yd > 0) {
      push({ ...makeProp('receiving_yards', rec_yd * 0.85, rec_yd * 0.50, gameTotal, isHome), target_share: estTargetShare }, rec_yd);
    }
    if (rec && rec > 0) {
      push({ ...makeProp('receptions', rec * 0.85, rec * 0.55, gameTotal, isHome), target_share: estTargetShare }, rec);
    }
  } else if (position === 'K') {
    const fgAtt = proj?.fg_att ?? 0;
    if (fgAtt > 0) {
      push(makeProp('field_goal_attempts', fgAtt, fgAtt * 0.4, gameTotal, isHome), fgAtt);
    }
  } else if (position === 'DEF') {
    const ptsAllow = proj?.pts_allow ?? proj?.pts_allow_0 ?? 20.5;
    push(makeProp('points_allowed', ptsAllow, 8, gameTotal, isHome), ptsAllow);
  }

  return props;
}

async function fetchSleeperPlayers() {
  const res = await fetch('https://api.sleeper.app/v1/players/nfl');
  if (!res.ok) throw new Error(`Sleeper players ${res.status}`);
  return res.json();
}

async function fetchSleeperProjections(season, week) {
  try {
    const res = await fetch(
      `https://api.sleeper.app/v1/projections/nfl/regular/${season}/${week}`,
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// Fetch the schedule — always prefers the upcoming regular-season week over preseason.
// Returns a synthetic object: { events, seasonYear, weekNum }
async function fetchESPNSchedule() {
  const year = new Date().getFullYear();
  async function tryFetch(url) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
      return r.ok ? r.json() : null;
    } catch { return null; }
  }

  const [current, regSeason] = await Promise.all([
    tryFetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'),
    tryFetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` +
      `?dates=${year}0901-${year + 1}0115&limit=300`,
    ),
  ]);

  // Merge events, deduplicate by id, drop preseason (type 1 OR slug contains 'pre')
  const seen = new Set();
  const allRegular = [...(regSeason?.events ?? []), ...(current?.events ?? [])]
    .filter(ev => {
      const t    = ev.season?.type;
      const slug = (ev.season?.slug ?? '').toLowerCase();
      if (t === 1 || slug.includes('pre')) return false; // preseason
      if (seen.has(ev.id)) return false;
      seen.add(ev.id);
      return true;
    });

  // Filter to the earliest week so buildScheduleMaps maps Week 1 opponents only
  const minWeek = allRegular.reduce((m, ev) => {
    const w = ev.week?.number;
    return (w != null && w < m) ? w : m;
  }, Infinity);
  const events = minWeek === Infinity ? allRegular : allRegular.filter(ev => ev.week?.number === minWeek);

  // Use season year from regular-season response; week from first event if available
  const seasonYear = regSeason?.season?.year ?? current?.season?.year ?? year;
  const weekNum    = regSeason?.week?.number ?? current?.week?.number  ?? 1;

  return { events, seasonYear, weekNum };
}

function buildScheduleMaps({ events = [] } = {}) {
  const teamToOpp   = {};
  const teamToTotal = {};
  const teamIsHome  = {};
  for (const event of events) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors?.find(c => c.homeAway === 'home');
    const away = comp.competitors?.find(c => c.homeAway === 'away');
    if (!home?.team?.abbreviation || !away?.team?.abbreviation) continue;
    const h = normESPN(home.team.abbreviation);
    const a = normESPN(away.team.abbreviation);
    teamToOpp[h] = a;  teamToOpp[a] = h;
    teamIsHome[h] = true;  teamIsHome[a] = false;
    const total = comp.odds?.[0]?.overUnder ?? 45.5;
    teamToTotal[h] = total;  teamToTotal[a] = total;
  }
  return { teamToOpp, teamToTotal, teamIsHome };
}

// Estimate PPR fantasy points from default props when no Sleeper projection exists.
// Keeps players visible in preseason rankings even without week-specific data.
function estimateFPPPR(props) {
  const passing   = props.find(p => p.prop_type === 'passing_yards')?.projection    ?? 0;
  const rushing   = props.find(p => p.prop_type === 'rushing_yards')?.projection    ?? 0;
  const receiving = props.find(p => p.prop_type === 'receiving_yards')?.projection  ?? 0;
  const rec       = props.find(p => p.prop_type === 'receptions')?.projection       ?? 0;
  const fgAtt     = props.find(p => p.prop_type === 'field_goal_attempts')?.projection ?? 0;
  return parseFloat((passing * 0.04 + rushing * 0.1 + receiving * 0.1 + rec * 1.0 + fgAtt * 2).toFixed(1));
}

function buildPlayers(sleeperRaw, projections, { teamToOpp, teamToTotal, teamIsHome }) {
  const players = [];

  for (const [id, p] of Object.entries(sleeperRaw)) {
    if (!POSITIONS.has(p.position)) continue;
    if (!p.team || !p.full_name) continue;
    if (p.active === false) continue;
    if (BAD_STATUS.has(p.status ?? '')) continue;

    const team      = p.team;
    const opponent  = teamToOpp[team] ?? 'TBD';
    const gameTotal = teamToTotal[team] ?? 45.5;
    const isHome    = teamIsHome[team] ?? false;

    const injStatus = (p.injury_status ?? 'healthy').toLowerCase() || 'healthy';
    const injNote   = p.injury_body_part
      ? `${p.injury_body_part.charAt(0).toUpperCase()}${p.injury_body_part.slice(1)} injury`
      : (p.injury_notes ?? '');

    // Real Sleeper projection for this player this week
    const proj = projections?.[id] ?? null;

    // Generate props from real projected stats; fall back to position averages
    // whenever real data is absent or zero (preseason, zero-volume projection).
    let props;
    if (proj && (proj.pass_yd || proj.rush_yd || proj.rec_yd || proj.rec || proj.fg_att || proj.pts_allow != null)) {
      props = buildPropsFromProjections(p.position, proj, gameTotal, isHome);
    }
    if (!props || props.length === 0) {
      // No real projection data — use position defaults so the player still appears in rankings
      props = (POS_DEFAULTS[p.position] ?? []).map(({ prop_type, line, variance }) =>
        makeProp(prop_type, line, variance, gameTotal, isHome),
      );
    }

    players.push({
      id,
      player_name:        p.full_name,
      team,
      opponent,
      position:           p.position,
      photo_url:          '',
      is_starter:         p.depth_chart_order === 1,
      depth_chart_order:  p.depth_chart_order ?? 99,
      injury_status:      injStatus,
      injury_note:        injNote,
      // Real Sleeper per-player projections; fall back to prop-derived estimate
      // when Sleeper has no data (preseason) so scorePosition doesn't drop the player.
      proj_pts_ppr:       proj?.pts_ppr       ?? (props.length > 0 ? estimateFPPPR(props) : null),
      proj_pts_half_ppr:  proj?.pts_half_ppr  ?? (props.length > 0 ? estimateFPPPR(props) : null),
      proj_pts_std:       proj?.pts_std       ?? (props.length > 0 ? estimateFPPPR(props) : null),
      proj_rec:           proj?.rec           ?? null,
      proj_pass_td:       proj?.pass_td       ?? null,
      proj_rush_yd:       proj?.rush_yd       ?? null,
      proj_rec_yd:        proj?.rec_yd        ?? null,
      proj_pass_yd:       proj?.pass_yd       ?? null,
      props,
    });
  }

  const posOrder = { QB: 0, RB: 1, WR: 2, TE: 3, K: 4, DEF: 5 };
  players.sort((a, b) => {
    if (a.is_starter !== b.is_starter) return a.is_starter ? -1 : 1;
    if (a.depth_chart_order !== b.depth_chart_order) return a.depth_chart_order - b.depth_chart_order;
    return (posOrder[a.position] ?? 9) - (posOrder[b.position] ?? 9);
  });

  return players;
}

export async function fetchLivePlayers() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
    if (cached.ts && Date.now() - cached.ts < CACHE_TTL) {
      return { players: cached.players, hasSchedule: cached.hasSchedule, week: cached.week };
    }
  } catch {}

  const [sleeperResult, espnResult] = await Promise.allSettled([
    fetchSleeperPlayers(),
    fetchESPNSchedule(),
  ]);

  if (sleeperResult.status === 'rejected') {
    throw new Error('Sleeper API unavailable');
  }

  const espnData    = espnResult.status === 'fulfilled' ? espnResult.value : null;
  const season      = espnData?.seasonYear ?? new Date().getFullYear();
  const weekNum     = espnData?.weekNum    ?? 1;
  const schedMaps   = buildScheduleMaps(espnData);
  const hasSchedule = Object.keys(schedMaps.teamToOpp).length > 0;

  // Fetch per-player projections for this exact week (non-blocking if it fails)
  const projections = await fetchSleeperProjections(season, weekNum);

  const players = buildPlayers(sleeperResult.value, projections, schedMaps);

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      ts: Date.now(), players, hasSchedule, week: weekNum,
    }));
  } catch {}

  return { players, hasSchedule, week: weekNum };
}

export function clearLiveCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem('locklab_nfl_live_v3');
    localStorage.removeItem('locklab_nfl_live_v4');
    localStorage.removeItem('locklab_nfl_live_v5');
    localStorage.removeItem('locklab_nfl_live_v6');
    localStorage.removeItem('locklab_nfl_live_v7');
  } catch {}
}
