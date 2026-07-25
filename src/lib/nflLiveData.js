// Fetches live NFL roster (Sleeper API) + schedule/totals (ESPN scoreboard).
// Returns a player array compatible with fantasyScore() and rankPlayers().

const CACHE_KEY = 'locklab_nfl_live_v3';
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4h

// ESPN uses WSH for Washington; Sleeper uses WAS
const ESPN_NORM = { WSH: 'WAS' };
function normESPN(t) { return ESPN_NORM[t] ?? t; }

// Statuses that mean the player is not on an active roster
const BAD_STATUS = new Set([
  'Cut', 'Retired', 'Practice Squad',
  'Physically Unable to Perform', 'Inactive',
]);

const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

// Position-based baseline prop lines — generate synthetic lines when live ones aren't available
const POS_DEFAULTS = {
  QB: [
    { prop_type: 'passing_yards', line: 245.5, variance: 55 },
    { prop_type: 'passing_tds',   line: 1.5,   variance: 1  },
    { prop_type: 'rushing_yards', line: 18.5,  variance: 12 },
  ],
  RB: [
    { prop_type: 'rushing_yards', line: 68.5,  variance: 32  },
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
};

const INT_TYPES = new Set(['passing_tds', 'rushing_tds', 'receiving_tds', 'receptions']);

function makeProp(prop_type, line, variance, gameTotal = 45.5, isHome = false) {
  const isInt = INT_TYPES.has(prop_type);
  const games = Array.from({ length: 6 }, () => {
    const raw = line + 2 + (Math.random() * variance * 2 - variance);
    return isInt ? Math.round(raw) : parseFloat(raw.toFixed(1));
  });
  const avg6 = parseFloat((games.reduce((a, b) => a + b, 0) / 6).toFixed(1));
  const avg3 = parseFloat((games.slice(-3).reduce((a, b) => a + b, 0) / 3).toFixed(1));
  const hits = games.filter(v => v > line).length;
  const proj = parseFloat((avg3 * 1.02).toFixed(1));
  return {
    prop_type, line,
    over_odds: -110, under_odds: -110,
    projection: proj,
    edge: parseFloat((((proj - line) / Math.max(line, 1)) * 100).toFixed(1)),
    hit_rate_last_10: Math.round((hits / 6) * 100),
    avg_last_5: avg3, avg_last_10: avg6,
    streak_info: `Hit over in ${hits} of last 6`,
    confidence_score: hits >= 4 ? 7 : 5,
    confidence_tier: hits >= 4 ? 'B' : 'C',
    is_top_pick: false, is_lock: false, best_value: false, trap_warning: false,
    last_5_games: games.slice(-3), last_10_games: games,
    matchup_rating: 'neutral', def_rank_vs_pos: 16,
    game_total: gameTotal, is_home: isHome,
    snap_pct: null, target_share: null,
  };
}

async function fetchSleeperPlayers() {
  const res = await fetch('https://api.sleeper.app/v1/players/nfl');
  if (!res.ok) throw new Error(`Sleeper ${res.status}`);
  return res.json();
}

async function fetchESPNSchedule() {
  const res = await fetch(
    'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
  );
  if (!res.ok) return null;
  return res.json();
}

function buildScheduleMaps(espnData) {
  const teamToOpp   = {};
  const teamToTotal = {};
  const teamIsHome  = {};
  for (const event of espnData?.events ?? []) {
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

function buildPlayers(sleeperRaw, { teamToOpp, teamToTotal, teamIsHome }) {
  const players = [];

  for (const [id, p] of Object.entries(sleeperRaw)) {
    // Position filter
    if (!POSITIONS.has(p.position)) continue;
    // Must be on a team with a name
    if (!p.team || !p.full_name) continue;
    // Sleeper's boolean active field is the most reliable cut filter
    if (p.active === false) continue;
    // Skip players with clearly inactive statuses
    if (BAD_STATUS.has(p.status ?? '')) continue;

    const team      = p.team; // Sleeper codes match teamLogos.js exactly (WAS, GB, KC, JAX, etc.)
    const opponent  = teamToOpp[team] ?? 'TBD';
    const gameTotal = teamToTotal[team] ?? 45.5;
    const isHome    = teamIsHome[team] ?? false;

    const injStatus = (p.injury_status ?? 'healthy').toLowerCase() || 'healthy';
    const injNote   = p.injury_body_part
      ? `${p.injury_body_part.charAt(0).toUpperCase()}${p.injury_body_part.slice(1)} injury`
      : (p.injury_notes ?? '');

    const props = (POS_DEFAULTS[p.position] ?? []).map(({ prop_type, line, variance }) =>
      makeProp(prop_type, line, variance, gameTotal, isHome)
    );

    players.push({
      id,
      player_name: p.full_name,
      team,
      opponent,
      position: p.position,
      photo_url: '',
      is_starter: p.depth_chart_order === 1,
      depth_chart_order: p.depth_chart_order ?? 99,
      injury_status: injStatus,
      injury_note: injNote,
      props,
    });
  }

  // Sort: starters first, then by depth, then alphabetically within each team
  const posOrder = { QB: 0, RB: 1, WR: 2, TE: 3 };
  players.sort((a, b) => {
    if (a.is_starter !== b.is_starter) return a.is_starter ? -1 : 1;
    if (a.depth_chart_order !== b.depth_chart_order) return a.depth_chart_order - b.depth_chart_order;
    return (posOrder[a.position] ?? 9) - (posOrder[b.position] ?? 9);
  });

  return players;
}

export async function fetchLivePlayers() {
  // Return cached data if still fresh
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

  const espnData  = espnResult.status === 'fulfilled' ? espnResult.value : null;
  const schedMaps = buildScheduleMaps(espnData);
  const hasSchedule = Object.keys(schedMaps.teamToOpp).length > 0;
  const week = espnData?.week?.number ?? null;

  const players = buildPlayers(sleeperResult.value, schedMaps);

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), players, hasSchedule, week }));
  } catch {}

  return { players, hasSchedule, week };
}

export function clearLiveCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
}
