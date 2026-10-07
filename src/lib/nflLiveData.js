import { applyInjuryContext, buildTeamDefenseInjuries } from './injuries';

// Fetches live NFL roster (Sleeper API) + per-player projections + schedule/totals (ESPN).
// Returns a player array with real projected FP attached, compatible with fantasyScore().

const CACHE_KEY = 'locklab_nfl_live_v15'; // v15: D/ST + K included, injury-adjusted projections, spreads
const CACHE_TTL = 4 * 60 * 60 * 1000;    // 4h

const ESPN_NORM = { WSH: 'WAS' };
function normESPN(t) { return ESPN_NORM[t] ?? t; }

const BAD_STATUS = new Set([
  'Cut', 'Retired', 'Practice Squad',
  'Physically Unable to Perform', 'Inactive',
]);

const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);

// Max depth-chart slot to include per position — keeps the list to active-roster players
// and avoids UDFA / camp bodies with no real fantasy value.
const MAX_DEPTH = { QB: 3, RB: 4, WR: 5, TE: 3, K: 1, DEF: 1 };

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
  const rawLine = Math.max(line, 0);
  const safeLine = Math.round(rawLine);
  return {
    prop_type,
    line: safeLine,
    over_odds: -110,
    under_odds: -110,
    projection: safeLine,
    edge: 0,
    hit_rate_last_10: null,
    avg_last_5: null,
    avg_last_10: null,
    streak_info: null,
    confidence_score: 5,
    confidence_tier: 'C',
    is_top_pick: false, is_lock: false, best_value: false, trap_warning: false,
    last_5_games: [], last_10_games: [],
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

async function tryFetch(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

// Fetch the schedule for the current regular-season week.
// Returns a synthetic object: { events, seasonYear, weekNum }
async function fetchESPNSchedule() {
  const year = new Date().getFullYear();

  // ESPN's undated scoreboard always reflects the week in progress or about to
  // start (never a past completed week) — use it to learn the current week number.
  const current    = await tryFetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
  const seasonYear = current?.season?.year ?? year;
  const weekNum    = current?.week?.number ?? 1;

  // Fetch the full game list for that specific week. ESPN's `dates=` range query
  // (previously used to pull the whole season in one call) now returns HTTP 400
  // for any multi-day range, so weeks must be fetched one at a time via `week=`.
  const weekData = await tryFetch(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${weekNum}`,
  );

  const events = (weekData?.events?.length ? weekData.events : current?.events) ?? [];

  return { events, seasonYear, weekNum };
}

// ESPN odds.details looks like "KC -3.5" (favorite + spread) or "EVEN".
function parseSpread(details) {
  const m = String(details ?? '').match(/^([A-Z]{2,3})\s+(-?\d+(?:\.\d+)?)/);
  return m ? { fav: normESPN(m[1]), points: Math.abs(parseFloat(m[2])) } : null;
}

function buildScheduleMaps({ events = [] } = {}) {
  const teamToOpp   = {};
  const teamToTotal = {};
  const teamIsHome  = {};
  const teamImplied = {}; // team → implied points scored (from total + spread)
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
    const spread = parseSpread(comp.odds?.[0]?.details);
    const half = total / 2;
    const adj = spread ? spread.points / 2 : 0;
    teamImplied[h] = spread?.fav === h ? half + adj : spread ? half - adj : half;
    teamImplied[a] = spread?.fav === a ? half + adj : spread ? half - adj : half;
  }
  return { teamToOpp, teamToTotal, teamIsHome, teamImplied };
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

function buildPlayers(sleeperRaw, projections, { teamToOpp, teamToTotal, teamIsHome, teamImplied = {} }) {
  const players = [];

  for (const [id, p] of Object.entries(sleeperRaw)) {
    if (!POSITIONS.has(p.position)) continue;
    // Team defenses have no full_name in Sleeper ("Kansas City" + "Chiefs") — without
    // this fallback every D/ST was silently dropped and the D/ST tab was empty.
    const fullName = p.full_name || (p.position === 'DEF' && p.first_name ? `${p.first_name} ${p.last_name} D/ST` : null);
    if (!p.team || !fullName) continue;
    if (p.active === false) continue;
    if (BAD_STATUS.has(p.status ?? '')) continue;
    // Exclude camp bodies / UDFAs beyond reasonable roster depth.
    // DEF (team defenses) have no depth chart order in Sleeper — always include them.
    if (p.position !== 'DEF') {
      const maxDepth = MAX_DEPTH[p.position] ?? 3;
      if ((p.depth_chart_order ?? 99) > maxDepth) continue;
    }

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

    // A player has "real" projection data when Sleeper has actual stats — not just a
    // zero-filled entry (common before week 1 opens). DEF uses pts_ppr directly.
    const hasRealData = proj != null && Boolean(
      proj.pass_yd || proj.rush_yd || proj.rec_yd || proj.rec ||
      proj.fg_att  || proj.pts_allow != null ||
      (proj.pts_ppr != null && proj.pts_ppr > 0),
    );

    // Props: built from real stats when available, otherwise POS_DEFAULTS so the
    // player still renders a meaningful stat line in the UI.
    let props;
    if (hasRealData) {
      props = buildPropsFromProjections(p.position, proj, gameTotal, isHome);
    }
    if (!props || props.length === 0) {
      props = (POS_DEFAULTS[p.position] ?? []).map(({ prop_type, line, variance }) =>
        makeProp(prop_type, line, variance, gameTotal, isHome),
      );
    }

    // proj_pts_ppr: use real Sleeper FP when available; null otherwise.
    // Deliberatley NOT estimating FP from POS_DEFAULTS so that fantasyScoring
    // can detect no-real-data players and rank them below players with actual projections.
    const projPPR      = hasRealData ? (proj?.pts_ppr      ?? estimateFPPPR(props)) : null;
    const projHalfPPR  = hasRealData ? (proj?.pts_half_ppr ?? projPPR)              : null;
    const projStd      = hasRealData ? (proj?.pts_std      ?? projPPR)              : null;

    players.push({
      id,
      player_name:         fullName,
      team,
      opponent,
      position:            p.position,
      photo_url:           p.position === 'DEF'
        ? `https://sleepercdn.com/images/team_logos/nfl/${team.toLowerCase()}.png`
        : `https://sleepercdn.com/content/nfl/players/thumb/${id}.jpg`,
      is_starter:          p.position === 'DEF' || p.depth_chart_order === 1,
      depth_chart_order:   p.position === 'DEF' ? 1 : (p.depth_chart_order ?? 99),
      implied_pts:         teamImplied[team] ?? null,
      opp_implied_pts:     teamImplied[opponent] ?? null,
      game_total:          gameTotal,
      injury_status:       injStatus,
      injury_note:         injNote,
      has_real_projection: hasRealData,
      proj_pts_ppr:        projPPR,
      proj_pts_half_ppr:   projHalfPPR,
      proj_pts_std:        projStd,
      proj_rec:            proj?.rec      ?? null,
      proj_pass_td:        proj?.pass_td  ?? null,
      proj_rush_yd:        proj?.rush_yd  ?? null,
      proj_rec_yd:         proj?.rec_yd   ?? null,
      proj_pass_yd:        proj?.pass_yd  ?? null,
      proj_def:            p.position === 'DEF' && proj ? {
        sacks: proj.sack ?? null, ints: proj.int ?? null, fum_rec: proj.fum_rec ?? null, pts_allow: proj.pts_allow ?? null,
      } : null,
      props,
    });
  }

  const posOrder = { QB: 0, RB: 1, WR: 2, TE: 3, DEF: 4 };
  players.sort((a, b) => {
    if (a.is_starter !== b.is_starter) return a.is_starter ? -1 : 1;
    if (a.depth_chart_order !== b.depth_chart_order) return a.depth_chart_order - b.depth_chart_order;
    return (posOrder[a.position] ?? 9) - (posOrder[b.position] ?? 9);
  });

  return players;
}

// Compact id → { name, position, team, injury } for every fantasy-relevant player,
// including IR / deep-bench guys the rankings skip — so league rosters can always
// show a name even when a player has no projection.
function buildRosterIndex(sleeperRaw) {
  const idx = {};
  for (const [id, p] of Object.entries(sleeperRaw)) {
    if (!POSITIONS.has(p.position)) continue;
    const name = p.full_name || (p.position === 'DEF' ? `${p.first_name} ${p.last_name} D/ST` : null);
    if (!name) continue;
    idx[id] = { n: name, p: p.position, t: p.team ?? null, i: p.injury_status ?? null };
  }
  return idx;
}

export async function fetchLivePlayers() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
    if (cached.ts && Date.now() - cached.ts < CACHE_TTL) {
      return { players: cached.players, hasSchedule: cached.hasSchedule, week: cached.week, index: cached.index ?? {} };
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
  // Injury context: own projection, next-man-up, QB-out, opponent defensive starters.
  // "Returning" tags are layered on later from the season outlook (see StartSit).
  applyInjuryContext(players, { teamDefense: buildTeamDefenseInjuries(sleeperResult.value) });

  const index = buildRosterIndex(sleeperResult.value);

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      ts: Date.now(), players, hasSchedule, week: weekNum, index,
    }));
  } catch {
    // Quota exceeded on some phones — the index is the nice-to-have part
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), players, hasSchedule, week: weekNum })); } catch {}
  }

  return { players, hasSchedule, week: weekNum, index };
}

export function clearLiveCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem('locklab_nfl_live_v14');
    localStorage.removeItem('locklab_nfl_live_v12');
    localStorage.removeItem('locklab_nfl_live_v11');
    localStorage.removeItem('locklab_nfl_live_v10');
    localStorage.removeItem('locklab_nfl_live_v3');
    localStorage.removeItem('locklab_nfl_live_v4');
    localStorage.removeItem('locklab_nfl_live_v5');
    localStorage.removeItem('locklab_nfl_live_v6');
    localStorage.removeItem('locklab_nfl_live_v7');
    localStorage.removeItem('locklab_nfl_live_v8');
  } catch {}
}
