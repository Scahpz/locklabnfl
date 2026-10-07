// ── Injury context, shared app-wide ───────────────────────────────────────────
// Normalizes Sleeper injury statuses, provides the tag shown next to players,
// and adjusts weekly projections for the injured player AND the teammates /
// opponents it affects (next-man-up bumps, QB-out downgrades, D/ST boosts).
//
// Double-counting guard: Sleeper often zeroes an Out player's projection and
// already bumps his backup. We only move numbers when the injured starter's
// raw projection is still meaningful (> ABSORBED_FP); otherwise we assume
// Sleeper has priced it in and only add the explanation text.

const ABSORBED_FP = 1;

// status key → display + how much of the player's own projection survives
export const INJURY_META = {
  out:          { label: 'OUT', long: 'Out',          mult: 0,    severity: 4, cls: 'bg-red-500/15 border-red-500/35 text-red-400' },
  ir:           { label: 'IR',  long: 'Injured reserve', mult: 0, severity: 5, cls: 'bg-red-500/15 border-red-500/35 text-red-400' },
  pup:          { label: 'PUP', long: 'PUP list',     mult: 0,    severity: 5, cls: 'bg-red-500/15 border-red-500/35 text-red-400' },
  sus:          { label: 'SUS', long: 'Suspended',    mult: 0,    severity: 4, cls: 'bg-red-500/15 border-red-500/35 text-red-400' },
  doubtful:     { label: 'D',   long: 'Doubtful',     mult: 0.25, severity: 3, cls: 'bg-orange-500/15 border-orange-500/35 text-orange-400' },
  questionable: { label: 'Q',   long: 'Questionable', mult: 0.9,  severity: 2, cls: 'bg-amber-500/15 border-amber-500/35 text-amber-400' },
  returning:    { label: 'RET', long: 'Returning',    mult: 0.95, severity: 1, cls: 'bg-sky-500/15 border-sky-500/35 text-sky-400' },
};

// Sleeper strings: "Out", "IR", "PUP", "Sus", "Doubtful", "Questionable", "NA", "DNR", null
export function normalizeInjury(raw) {
  const s = String(raw ?? '').toLowerCase().trim();
  if (!s || s === 'healthy' || s === 'active' || s === 'null') return null;
  if (s === 'ir' || s.includes('reserve')) return 'ir';
  if (s.startsWith('pup') || s.includes('physically')) return 'pup';
  if (s.startsWith('sus')) return 'sus';
  if (s === 'out' || s === 'na' || s === 'dnr' || s.includes('out')) return 'out';
  if (s.startsWith('doubt')) return 'doubtful';
  if (s.startsWith('quest')) return 'questionable';
  if (s === 'returning') return 'returning';
  return null;
}

export function injuryMeta(player) {
  const key = player?.injury_key ?? normalizeInjury(player?.injury_status);
  return key ? { key, ...INJURY_META[key] } : null;
}

export function isOutType(key) {
  return key === 'out' || key === 'ir' || key === 'pup' || key === 'sus';
}

// Share of an injured starter's projection the next man up absorbs
const NEXT_MAN_SHARE = { QB: 0.8, RB: 0.55, WR: 0.3, TE: 0.45 };
const QB_OUT_PASS_CATCHER_HIT = 0.9;   // WR/TE projections when the starting QB is out
const DEF_STARTERS_OUT_BOOST  = 0.03;  // per missing opposing defensive starter (capped)

const FP_FIELDS = ['proj_pts_ppr', 'proj_pts_half_ppr', 'proj_pts_std'];

function scale(p, mult) {
  for (const f of FP_FIELDS) if (p[f] != null) p[f] = Math.round(p[f] * mult * 10) / 10;
}
function addFrom(p, raw, share) {
  for (const f of FP_FIELDS) if (raw[f] != null) p[f] = Math.round(((p[f] ?? 0) + raw[f] * share) * 10) / 10;
}

/**
 * Mutates and returns players with injury-adjusted projections + reasons.
 *   players          — output of nflLiveData buildPlayers (Sleeper IDs, depth chart)
 *   teamDefense      — { TEAM: { starters_out: [names] } } from the full Sleeper roster
 *   returningIds     — Set of player ids flagged "returning" by the season outlook
 * Adds: injury_key, injury_reasons[], injury_proj_delta (ppr), raw_proj_pts_ppr
 */
export function applyInjuryContext(players, { teamDefense = {}, returningIds = new Set() } = {}) {
  for (const p of players) {
    p.injury_key = normalizeInjury(p.injury_status);
    if (!p.injury_key && returningIds.has(String(p.id))) p.injury_key = 'returning';
    p.injury_reasons = [];
    p.raw_proj_pts_ppr = p.proj_pts_ppr;
    p.raw_proj = Object.fromEntries(FP_FIELDS.map(f => [f, p[f]]));
  }

  const byTeamPos = {};
  for (const p of players) {
    if (p.position === 'DEF' || p.position === 'K') continue;
    (byTeamPos[`${p.team}_${p.position}`] ??= []).push(p);
  }
  Object.values(byTeamPos).forEach(list => list.sort((a, b) => (a.depth_chart_order ?? 99) - (b.depth_chart_order ?? 99)));

  const qbOut = {}; // team → injured starting QB (only when not already absorbed)

  // 1. The injured player himself
  for (const p of players) {
    const meta = p.injury_key ? INJURY_META[p.injury_key] : null;
    if (!meta) continue;
    const raw = p.proj_pts_ppr ?? 0;
    if (raw > ABSORBED_FP && meta.mult < 1) {
      scale(p, meta.mult);
      p.injury_reasons.push(
        meta.mult === 0
          ? `${meta.long} — projection zeroed`
          : `${meta.long} — projection cut ${Math.round((1 - meta.mult) * 100)}%`,
      );
    } else if (meta.mult < 1) {
      p.injury_reasons.push(`${meta.long} — already reflected in projection`);
    }
    if (p.injury_key === 'returning') p.injury_reasons.unshift('Returning from injury — slight rust discount');
  }

  // 2. Next man up on the same team/position
  for (const list of Object.values(byTeamPos)) {
    const starter = list[0];
    if (!starter || (starter.depth_chart_order ?? 99) !== 1) continue;
    const key = starter.injury_key;
    if (!key || !(isOutType(key) || key === 'doubtful')) continue;
    const backup = list.find(p => p !== starter && !isOutType(p.injury_key));
    if (!backup) continue;
    const share = (NEXT_MAN_SHARE[starter.position] ?? 0.3) * (key === 'doubtful' ? 0.75 : 1);
    const starterRaw = starter.raw_proj_pts_ppr ?? 0;
    const status = INJURY_META[key].long.toLowerCase();
    if (starterRaw > ABSORBED_FP) {
      addFrom(backup, starter.raw_proj, share);
      backup.injury_reasons.push(`${starter.player_name} is ${status} — next man up (+${Math.round(starterRaw * share * 10) / 10} FP)`);
    } else {
      backup.injury_reasons.push(`${starter.player_name} is ${status} — expanded role`);
    }
    backup.role_bump_from = starter.player_name;
    if (starter.position === 'QB' && starterRaw > ABSORBED_FP) qbOut[starter.team] = starter;
    else if (starter.position === 'QB') qbOut[starter.team] = { ...starter, absorbed: true };
  }

  // 3. Pass catchers lose value when their QB is out
  for (const p of players) {
    const q = qbOut[p.team];
    if (!q || (p.position !== 'WR' && p.position !== 'TE')) continue;
    if (!q.absorbed) scale(p, QB_OUT_PASS_CATCHER_HIT);
    p.injury_reasons.push(`QB ${q.player_name} is out — backup QB lowers the passing ceiling`);
  }

  // 4. Opponent context: missing defensive starters help skill players; for D/ST
  //    an opposing QB out is a boost and own missing starters are a hit.
  for (const p of players) {
    const oppDef = teamDefense[p.opponent];
    if (p.position === 'DEF') {
      const own = teamDefense[p.team]?.starters_out ?? [];
      p.dst_injuries = { own_out: own, opp_qb_out: qbOut[p.opponent]?.player_name ?? null };
      if (own.length) p.injury_reasons.push(`Missing ${own.length} defensive starter${own.length > 1 ? 's' : ''}: ${own.slice(0, 3).join(', ')}`);
      if (qbOut[p.opponent]) p.injury_reasons.push(`Opposing QB ${qbOut[p.opponent].player_name} is out`);
      continue;
    }
    const missing = oppDef?.starters_out ?? [];
    if (missing.length >= 2 && p.position !== 'K') {
      scale(p, 1 + Math.min(missing.length, 4) * DEF_STARTERS_OUT_BOOST);
      p.injury_reasons.push(`${p.opponent} defense missing ${missing.length} starters`);
    }
  }

  for (const p of players) {
    p.injury_proj_delta = p.raw_proj_pts_ppr != null && p.proj_pts_ppr != null
      ? Math.round((p.proj_pts_ppr - p.raw_proj_pts_ppr) * 10) / 10
      : 0;
  }
  return players;
}

// Defensive starters (depth 1) currently out, per team — from the full Sleeper player list.
const IDP_POSITIONS = new Set(['DL', 'DE', 'DT', 'LB', 'OLB', 'ILB', 'DB', 'CB', 'S', 'SS', 'FS']);
export function buildTeamDefenseInjuries(sleeperRaw) {
  const out = {};
  for (const p of Object.values(sleeperRaw ?? {})) {
    if (!p.team || !IDP_POSITIONS.has(p.position) || p.depth_chart_order !== 1) continue;
    const key = normalizeInjury(p.injury_status);
    if (!key || !(isOutType(key) || key === 'doubtful')) continue;
    (out[p.team] ??= { starters_out: [] }).starters_out.push(p.full_name || `${p.first_name} ${p.last_name}`);
  }
  return out;
}

// Layered on after the season outlook loads: players who missed recent games and
// are projected to play again get a "returning" tag and a small rust discount.
export function applyReturning(players, returning = {}) {
  for (const p of players) {
    const missed = returning[String(p.id)];
    if (!missed || p.injury_key) continue;
    p.injury_key = 'returning';
    for (const f of FP_FIELDS) if (p[f] != null) p[f] = Math.round(p[f] * INJURY_META.returning.mult * 10) / 10;
    (p.injury_reasons ??= []).unshift(`Returning after missing ${missed} game${missed > 1 ? 's' : ''} — slight rust discount`);
  }
  return players;
}

// ── Name-based lookup for pages that don't carry Sleeper IDs (betting props) ──
// Reads the Start/Sit live-player cache (adjusted players + full roster index),
// so it costs nothing extra; returns {} until that cache exists.
const LIVE_CACHE_KEY = 'locklab_nfl_live_v15';
const norm = n => String(n ?? '').toLowerCase().replace(/[.'’]/g, '').replace(/\s+(jr|sr|ii|iii|iv)$/, '').replace(/\s+/g, ' ').trim();

export function loadInjuryIndexByName() {
  try {
    const c = JSON.parse(localStorage.getItem(LIVE_CACHE_KEY) || 'null');
    if (!c) return {};
    const out = {};
    for (const v of Object.values(c.index ?? {})) {
      const key = normalizeInjury(v.i);
      if (key) out[norm(v.n)] = { injury_status: v.i, injury_key: key, injury_reasons: [] };
    }
    // Live players carry the richer context (next-man-up, QB out, …)
    for (const p of c.players ?? []) {
      if (p.injury_key || p.injury_reasons?.length) {
        out[norm(p.player_name)] = { injury_status: p.injury_status, injury_key: p.injury_key, injury_reasons: p.injury_reasons ?? [] };
      }
    }
    return out;
  } catch { return {}; }
}

export function injuryForName(index, name) {
  return index?.[norm(name)] ?? null;
}
