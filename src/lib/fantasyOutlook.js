// ── Season outlook: schedule, points allowed by position, D/ST profiles, ROS ──
// Built server-side (/api/fantasy/outlook) from this season's Sleeper results and
// projections, refreshed every 6h so opponent ratings update as weeks finish.

import { NFL_API } from './config';
import { applyReturning } from './injuries';

const CACHE_KEY = 'locklab_fantasy_outlook_v1';
const CACHE_TTL = 3 * 60 * 60 * 1000;

let inflight = null;

export async function fetchOutlook({ force = false } = {}) {
  if (!force) {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c?.loaded && Date.now() - c._ts < CACHE_TTL) return c;
    } catch {}
  }
  if (inflight) return inflight;
  inflight = (async () => {
    // The server builds the bundle in the background on first request — poll briefly.
    for (let i = 0; i < 6; i++) {
      try {
        const res = await fetch(`${NFL_API}/api/fantasy/outlook`, { signal: AbortSignal.timeout(20000) });
        const data = res.ok ? await res.json() : null;
        if (data?.loaded) {
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, _ts: Date.now() })); } catch {}
          return data;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 4000));
    }
    return null;
  })().finally(() => { inflight = null; });
  return inflight;
}

export function fmtKey(scoring) {
  return scoring === 'ppr' ? 'ppr' : scoring === 'half_ppr' ? 'half' : 'std';
}

// Outlook positions use Sleeper's "DEF"; the UI says D/ST.
const POS = p => (p === 'D/ST' ? 'DEF' : p);

/**
 * How a defense treats a position this season.
 * Returns { allowed, leagueAvg, rank (1 = allows the MOST = easiest), teams, ratio }
 * ratio = leagueAvg / allowed → 1 is average, >1 harder, <1 easier.
 */
export function matchupFor(outlook, position, opponent, scoring) {
  const pos = POS(position);
  const table = outlook?.fpa?.[pos];
  const row = table?.[opponent];
  if (!row || !row.games) return null;
  const k = fmtKey(scoring);
  const leagueAvg = outlook.league_avg?.[pos]?.[k] ?? 0;
  const sorted = Object.entries(table).filter(([, r]) => r.games).sort((a, b) => b[1][k] - a[1][k]);
  const rank = sorted.findIndex(([t]) => t === opponent) + 1;
  // DEF scores can be ~0 or negative; shift so the ratio stays meaningful.
  const shift = pos === 'DEF' ? 5 : 0;
  const ratio = (leagueAvg + shift) / Math.max(row[k] + shift, 0.5);
  return { allowed: row[k], leagueAvg, rank, teams: sorted.length, ratio, games: row.games };
}

export function difficultyLabel(ratio) {
  if (ratio == null) return null;
  if (ratio <= 0.88) return 'easy';
  if (ratio >= 1.12) return 'hard';
  return 'average';
}

export const DIFFICULTY_STYLE = {
  easy:    { label: 'Easy',    cls: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' },
  average: { label: 'Average', cls: 'bg-amber-500/15 border-amber-500/30 text-amber-400' },
  hard:    { label: 'Hard',    cls: 'bg-red-500/15 border-red-500/30 text-red-400' },
};

// green (easy) → amber → red (hard), from a difficulty ratio
export function difficultyColor(ratio) {
  const t = Math.max(0, Math.min(1, (ratio - 0.7) / 0.6)); // 0.7 easy … 1.3 hard
  const hue = 145 - t * 145;
  return `hsl(${hue}, 70%, 48%)`;
}

export function remainingSchedule(outlook, team) {
  if (!outlook?.schedule?.[team]) return [];
  const out = [];
  for (let w = outlook.week; w <= 18; w++) {
    out.push({ week: w, opponent: outlook.schedule[team][String(w)] ?? null });
  }
  return out;
}

export function byeWeek(outlook, team) {
  const sched = outlook?.schedule?.[team];
  if (!sched) return null;
  for (let w = 1; w <= 18; w++) if (!sched[String(w)]) return w;
  return null;
}

// Attach outlook-derived context to live players (once per load):
//   D/ST → dst_context (opponent offense vs D/STs, pressure/turnover profiles, league avgs)
//   all  → "returning" injury tags
export function attachOutlookContext(players, outlook, scoring = 'ppr') {
  if (!outlook || !players?.length) return players;
  const teams = Object.values(outlook.dst ?? {});
  const mean = (sel) => {
    const v = teams.map(sel).filter(x => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  const avg = {
    sacks: mean(t => t.def?.sacks), takeaways: mean(t => t.def?.takeaways), pts_allowed: mean(t => t.def?.pts_allowed),
  };
  // Fresh reason arrays — the live-player cache is shared, so never mutate it in place
  const next = players.map(p => ({ ...p, injury_reasons: [...(p.injury_reasons ?? [])] }));
  for (const p of next) {
    if (p.position !== 'DEF' || !p.opponent || p.opponent === 'TBD') continue;
    p.dst_context = {
      oppVsDst: matchupFor(outlook, 'DEF', p.opponent, scoring),
      own: outlook.dst?.[p.team]?.def ?? null,
      opp: outlook.dst?.[p.opponent]?.off ?? null,
      avg,
    };
  }
  applyReturning(next, outlook.returning);
  return next;
}
