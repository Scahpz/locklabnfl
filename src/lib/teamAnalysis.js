// ── My Team analysis: lineups, roster strength, advice, trades, matchups ──────
// Everything here works off real league rosters (league connection), this week's
// injury-adjusted projections, and rest-of-season values (rosRankings). No data
// is invented: players we have no projection for count as 0 and are flagged.

import { matchupFor, difficultyLabel } from './fantasyOutlook';
import { isOutType, INJURY_META } from './injuries';

export const SLOT_ELIGIBLE = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], K: ['K'], DEF: ['DEF'],
  FLEX: ['RB', 'WR', 'TE'], WRRB_FLEX: ['RB', 'WR'], REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
};
export const SLOT_LABEL = {
  FLEX: 'FLEX', WRRB_FLEX: 'W/R', REC_FLEX: 'W/T', SUPER_FLEX: 'SFLEX', DEF: 'D/ST',
};
export const TRADE_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

// Weekly boom/bust spread by position (std dev as a share of projection)
const POS_CV = { QB: 0.28, RB: 0.45, WR: 0.55, TE: 0.6, K: 0.4, DEF: 0.6 };
const NEXT_MAN_SHARE = 0.55;

// ── Context helpers ───────────────────────────────────────────────────────────
// ctx = { playersById, index, rosIdx, settings, slots, trendIndex, rostered, outlook, teams }

export function positionOf(ctx, id) {
  return ctx.playersById[id]?.position ?? ctx.index?.[id]?.p ?? null;
}
export function nameOf(ctx, id) {
  return ctx.playersById[id]?.player_name ?? ctx.index?.[id]?.n ?? `Player ${id}`;
}

// This week's projected points in the league's format (6-pt passing TDs adjusted)
export function weeklyPoints(ctx, id) {
  const p = ctx.playersById[id];
  if (!p) return 0;
  const s = ctx.settings ?? {};
  let pts = s.scoring === 'ppr' ? p.proj_pts_ppr
    : s.scoring === 'half_ppr' ? (p.proj_pts_half_ppr ?? p.proj_pts_ppr)
    : (p.proj_pts_std ?? p.proj_pts_ppr);
  if (pts == null) return 0;
  if (p.position === 'QB' && s.passTDPts === 6 && p.proj_pass_td) pts += p.proj_pass_td * 2;
  return Math.round(pts * 10) / 10;
}
export function rosPerGame(ctx, id) { return ctx.rosIdx[id]?.perGame ?? 0; }
export function rosTotal(ctx, id)   { return ctx.rosIdx[id]?.rosPoints ?? 0; }

// ── Lineup solver ─────────────────────────────────────────────────────────────
// Greedy, most-restrictive slot first — optimal for standard NFL slot shapes.
export function optimalLineup(ctx, ids, valueOf, slots) {
  const pool = ids.map(id => ({ id, pos: positionOf(ctx, id), value: valueOf(id) }))
    .filter(p => p.pos)
    .sort((a, b) => b.value - a.value);
  const order = slots
    .map((slot, i) => ({ slot, i, elig: SLOT_ELIGIBLE[slot] ?? [] }))
    .filter(s => s.elig.length)
    .sort((a, b) => a.elig.length - b.elig.length || a.i - b.i);
  const used = new Set();
  const filled = [];
  for (const s of order) {
    const pick = pool.find(p => !used.has(p.id) && s.elig.includes(p.pos));
    if (pick) used.add(pick.id);
    filled.push({ slot: s.slot, i: s.i, id: pick?.id ?? null, value: pick?.value ?? 0 });
  }
  filled.sort((a, b) => a.i - b.i);
  return {
    starters: filled,
    bench: pool.filter(p => !used.has(p.id)).map(p => p.id),
    total: Math.round(filled.reduce((a, s) => a + s.value, 0) * 10) / 10,
  };
}

// ── Roster strength ───────────────────────────────────────────────────────────
// Demand per position = dedicated slots + a share of each flex it can fill.
function positionDemand(slots) {
  const d = Object.fromEntries(TRADE_POSITIONS.map(p => [p, 0]));
  for (const slot of slots) {
    const elig = (SLOT_ELIGIBLE[slot] ?? []).filter(p => d[p] != null);
    elig.forEach(p => { d[p] += 1 / elig.length; });
  }
  return d;
}

/** Per-team, per-position strength from ROS per-game values. */
export function teamProfiles(ctx) {
  const demand = positionDemand(ctx.slots);
  const raw = ctx.teams.map(team => {
    const byPos = {};
    for (const pos of TRADE_POSITIONS) {
      const ids = team.playerIds
        .filter(id => positionOf(ctx, id) === pos)
        .sort((a, b) => rosPerGame(ctx, b) - rosPerGame(ctx, a));
      const k = Math.max(1, Math.ceil(demand[pos]));
      const starters = ids.slice(0, k);
      byPos[pos] = {
        ids, k,
        strength: starters.reduce((a, id) => a + rosPerGame(ctx, id), 0),
        weakestStarter: starters.length >= k ? rosPerGame(ctx, starters[k - 1]) : 0,
        weakestStarterId: starters[k - 1] ?? null,
        nextUp: rosPerGame(ctx, ids[k] ?? null),
        nextUpId: ids[k] ?? null,
      };
    }
    return { id: team.id, name: team.name, owner: team.owner, byPos };
  });

  // Compare with the league median; "Deep" also requires a startable bench piece.
  for (const pos of TRADE_POSITIONS) {
    const med = median(raw.map(t => t.byPos[pos].strength));
    const medWeakest = median(raw.map(t => t.byPos[pos].weakestStarter));
    for (const t of raw) {
      const b = t.byPos[pos];
      b.ratio = med > 0 ? b.strength / med : 1;
      const benchStarter = b.nextUp >= medWeakest * 0.9 && b.nextUp > 0;
      b.label = (b.ratio >= 1.12 && benchStarter) || (b.ratio >= 1.25) ? 'Deep'
        : b.ratio <= 0.85 ? 'Thin' : 'Solid';
      b.leagueWeakest = medWeakest;
    }
  }
  return raw;
}

function median(arr) {
  const v = arr.filter(x => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return 0;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function needsAndSurplus(profile) {
  const entries = TRADE_POSITIONS.map(pos => ({ pos, ...profile.byPos[pos] }));
  let needs = entries.filter(e => e.label === 'Thin').map(e => e.pos);
  let surplus = entries.filter(e => e.label === 'Deep').map(e => e.pos);
  // Every roster has a relative weak spot / strong spot even if nothing is extreme
  if (!needs.length) needs = [entries.reduce((a, b) => (b.ratio < a.ratio ? b : a)).pos];
  if (!surplus.length) {
    const best = entries.reduce((a, b) => (b.ratio > a.ratio ? b : a));
    if (best.ratio > 1 && best.nextUp > 0 && !needs.includes(best.pos)) surplus = [best.pos];
  }
  return { needs, surplus: surplus.filter(p => !needs.includes(p)) };
}

// ── Advice ────────────────────────────────────────────────────────────────────
export function sellCandidates(ctx, team) {
  const out = [];
  for (const id of team.playerIds) {
    const pos = positionOf(ctx, id);
    const ros = ctx.rosIdx[id];
    if (!TRADE_POSITIONS.includes(pos) || !ros) continue;
    const trend = ctx.trendIndex[id];
    let reason = null;
    if (trend?.tags?.includes('sell_high') && trend.fpoe > 0) {
      reason = `Scoring ${trend.fpoe} FP/g more than his usage supports — sell before it regresses`;
    } else if (ros.sos?.grade === 'hard' && ros.sos.rank > ros.sos.of * 0.8 && ros.rank <= 30) {
      reason = `Brutal remaining schedule (#${ros.sos.rank} of ${ros.sos.of} ${pos}s) — his value peaks now`;
    } else if ((trend?.momentum ?? 0) <= -25 && ros.rank <= 36) {
      reason = `Usage trending down (momentum ${trend.momentum}) while he’s still valued as a starter`;
    } else if (ctx.playersById[id]?.role_bump_from && ros.rank <= 36) {
      reason = `Value inflated while ${ctx.playersById[id].role_bump_from} is out — sell before he returns`;
    }
    if (reason) out.push({ id, pos, value: ros.rosPoints, reason });
  }
  return out.sort((a, b) => b.value - a.value).slice(0, 4);
}

export function handcuffs(ctx, team) {
  const out = [];
  const live = Object.values(ctx.playersById);
  for (const id of team.playerIds) {
    const starter = ctx.playersById[id];
    const ros = ctx.rosIdx[id];
    if (starter?.position !== 'RB' || (starter.depth_chart_order ?? 99) !== 1 || !ros || ros.rank > 40) continue;
    const backup = live
      .filter(p => p.team === starter.team && p.position === 'RB' && p.id !== starter.id && !isOutType(p.injury_key))
      .sort((a, b) => (a.depth_chart_order ?? 99) - (b.depth_chart_order ?? 99))[0];
    if (!backup) continue;
    const bid = String(backup.id);
    const owner = ctx.teams.find(t => t.playerIds.includes(bid));
    const inherit = Math.round(ros.perGame * NEXT_MAN_SHARE * 10) / 10;
    const status = !owner ? 'free' : owner.id === team.id ? 'owned' : 'taken';
    out.push({
      id: bid,
      starterId: String(id),
      status,
      ownerName: owner?.name ?? null,
      reason: `Backs up ${starter.player_name} — would inherit ~${inherit} FP/g if he misses time` +
        (status === 'free' ? '; available on waivers' : status === 'owned' ? '; already on your roster' : `; rostered by ${owner.name}`),
    });
  }
  const rank = { free: 0, taken: 1, owned: 2 };
  return out.sort((a, b) => rank[a.status] - rank[b.status]);
}

export function tradeTargets(ctx, profiles, myTeamId) {
  const mine = profiles.find(p => p.id === myTeamId);
  const me = ctx.teams.find(t => t.id === myTeamId);
  if (!mine || !me) return [];
  const { needs, surplus } = needsAndSurplus(mine);
  const base = lineupWithIds(ctx, me.playerIds);
  const out = [];
  for (const other of profiles) {
    if (other.id === myTeamId) continue;
    const theirs = needsAndSurplus(other);
    const fit = theirs.needs.filter(p => surplus.includes(p));
    for (const pos of TRADE_POSITIONS) {
      const them = other.byPos[pos];
      for (const id of them.ids.slice(0, them.k + 1)) {
        // A team that isn't deep won't give up its best player at the position
        if (them.label !== 'Deep' && id === them.ids[0]) continue;
        // Real lineup gain (handles flex/superflex): add him, re-solve, compare
        const after = lineupWithIds(ctx, [...me.playerIds, id]);
        const gain = after.total - base.total;
        if (gain < 1) continue;
        const replaced = base.ids.filter(x => !after.ids.includes(x));
        const isNeed = needs.includes(pos);
        const score = gain * (isNeed ? 1.3 : 1) * (fit.length ? 1.4 : 1) * (them.label === 'Deep' ? 1.2 : 1);
        const why = them.label === 'Deep' && fit.length
          ? `${other.name} is deep at ${pos} and thin at ${fit.join('/')} — your ${fit.join('/')} depth fits`
          : them.label === 'Deep'
            ? `${other.name} is deep at ${pos} and can spare him`
            : fit.length
              ? `${other.name} needs ${fit.join('/')}, where you have depth`
              : `${other.name} could move him for the right offer`;
        const impact = replaced.length
          ? `He’d start over ${replaced.map(x => nameOf(ctx, x)).join(', ')}`
          : `He’d fill an empty lineup spot`;
        out.push({
          id, pos, teamId: other.id, teamName: other.name, score, fit,
          reason: `${why}. ${impact} (+${gain.toFixed(1)} FP/g ROS).`,
        });
      }
    }
  }
  const seen = new Set();
  return out.sort((a, b) => b.score - a.score).filter(t => !seen.has(t.id) && seen.add(t.id)).slice(0, 6);
}

function lineupWithIds(ctx, ids) {
  const l = optimalLineup(ctx, ids, id => rosPerGame(ctx, id), ctx.slots.filter(sl => sl !== 'K' && sl !== 'DEF'));
  return { total: l.total, ids: l.starters.map(st => st.id).filter(Boolean) };
}

// ── Trade builder ─────────────────────────────────────────────────────────────
function lineupValue(ctx, ids) {
  return optimalLineup(ctx, ids, id => rosPerGame(ctx, id), ctx.slots.filter(s => s !== 'K' && s !== 'DEF')).total;
}

function profileLabels(ctx, teams, teamId) {
  const p = teamProfiles({ ...ctx, teams }).find(t => t.id === teamId);
  return Object.fromEntries(TRADE_POSITIONS.map(pos => [pos, p.byPos[pos].label]));
}

/**
 * Offers for `targetId` (on another team) built from my roster. Realistic means:
 * my starting lineup improves, theirs doesn't get meaningfully worse, and the ROS
 * value sent is within a sane band of what I get back (consolidation costs extra).
 */
export function buildTradeOffers(ctx, myTeamId, targetId) {
  const me = ctx.teams.find(t => t.id === myTeamId);
  const them = ctx.teams.find(t => t.playerIds.includes(String(targetId)));
  if (!me || !them || them.id === me.id) return { offers: [], them: null };
  const V = rosTotal(ctx, targetId);
  if (V <= 0) return { offers: [], them, error: 'No rest-of-season projection for this player yet.' };

  const profiles = teamProfiles(ctx);
  const mySurplus = needsAndSurplus(profiles.find(p => p.id === me.id)).surplus;
  const theirNeeds = needsAndSurplus(profiles.find(p => p.id === them.id)).needs;

  const pieces = me.playerIds
    .filter(id => TRADE_POSITIONS.includes(positionOf(ctx, id)) && rosTotal(ctx, id) > 0)
    .sort((a, b) => rosTotal(ctx, b) - rosTotal(ctx, a))
    .slice(0, 14);
  const packages = [];
  for (let i = 0; i < pieces.length; i++) {
    packages.push([pieces[i]]);
    for (let j = i + 1; j < pieces.length; j++) packages.push([pieces[i], pieces[j]]);
  }

  const myBefore = lineupValue(ctx, me.playerIds);
  const theirBefore = lineupValue(ctx, them.playerIds);
  const offers = [];
  for (const pkg of packages) {
    const S = pkg.reduce((a, id) => a + rosTotal(ctx, id), 0);
    const lo = pkg.length === 1 ? 0.9 * V : 1.05 * V;
    const hi = pkg.length === 1 ? 1.3 * V : 1.55 * V;
    if (S < lo || S > hi) continue;
    const myAfterIds = [...me.playerIds.filter(id => !pkg.includes(id)), String(targetId)];
    const theirAfterIds = [...them.playerIds.filter(id => id !== String(targetId)), ...pkg];
    const myAfter = lineupValue(ctx, myAfterIds);
    const theirAfter = lineupValue(ctx, theirAfterIds);
    const myGain = myAfter - myBefore;
    const theirGain = theirAfter - theirBefore;
    if (myGain <= 0.2 || theirGain < -1.0) continue;
    const fitsNeed = pkg.some(id => theirNeeds.includes(positionOf(ctx, id)));
    const fromSurplus = pkg.every(id => mySurplus.includes(positionOf(ctx, id)));
    offers.push({
      give: pkg, get: [String(targetId)], valueGive: Math.round(S), valueGet: Math.round(V),
      my:    { before: myBefore, after: myAfter, gain: Math.round(myGain * 10) / 10 },
      their: { before: theirBefore, after: theirAfter, gain: Math.round(theirGain * 10) / 10 },
      score: Math.min(myGain, theirGain + 1) + (fitsNeed ? 1 : 0) + (fromSurplus ? 0.75 : 0) - Math.abs(S - V) / Math.max(V, 1),
      fitsNeed, fromSurplus,
    });
  }
  offers.sort((a, b) => b.score - a.score);
  // Drop padded offers: if a smaller package already works, adding players to it
  // only overpays for the same result.
  const lean = offers.filter(o => !offers.some(x =>
    x !== o && x.give.length < o.give.length && x.give.every(id => o.give.includes(id))));
  const top = lean.slice(0, 3).map(o => {
    const teamsAfter = ctx.teams.map(t => (t.id === me.id
      ? { ...t, playerIds: [...me.playerIds.filter(id => !o.give.includes(id)), String(targetId)] }
      : t.id === them.id
        ? { ...t, playerIds: [...them.playerIds.filter(id => id !== String(targetId)), ...o.give] }
        : t));
    const why = [
      o.fromSurplus ? 'deals from your surplus' : null,
      o.fitsNeed ? `fills ${them.name}’s need` : null,
      o.their.gain >= 0 ? 'improves their lineup too' : 'roughly lineup-neutral for them',
    ].filter(Boolean).join(' · ');
    return {
      ...o,
      reason: why,
      labels: {
        myBefore: profileLabels(ctx, ctx.teams, me.id), myAfter: profileLabels(ctx, teamsAfter, me.id),
        theirBefore: profileLabels(ctx, ctx.teams, them.id), theirAfter: profileLabels(ctx, teamsAfter, them.id),
      },
    };
  });
  return { offers: top, them };
}

// ── Weekly matchup prediction ─────────────────────────────────────────────────
function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
const normCdf = z => 0.5 * (1 + erf(z / Math.SQRT2));

function sideProjection(ctx, ids) {
  const rows = ids.map(id => {
    const pos = positionOf(ctx, id);
    const proj = weeklyPoints(ctx, id);
    const p = ctx.playersById[id];
    return {
      id, pos, proj, sd: proj * (POS_CV[pos] ?? 0.5),
      missing: !p, injury: p?.injury_key ?? null,
      opponent: p?.opponent ?? null,
    };
  });
  const total = rows.reduce((a, r) => a + r.proj, 0);
  const sd = Math.sqrt(rows.reduce((a, r) => a + r.sd * r.sd, 0));
  return { rows, total: Math.round(total * 10) / 10, sd };
}

/**
 * mine / theirs: { starters: ids (as set in the league; may be empty), all: roster ids }
 * Returns projections, win probability, key swing players and lineup fixes.
 */
export function predictMatchup(ctx, mine, theirs) {
  const weekly = id => weeklyPoints(ctx, id);
  const myOpt = optimalLineup(ctx, mine.all, weekly, ctx.slots);
  const theirOpt = optimalLineup(ctx, theirs.all, weekly, ctx.slots);
  const theirIds = theirs.starters.length ? theirs.starters : theirOpt.starters.map(s => s.id).filter(Boolean);
  const mySetIds = mine.starters.length ? mine.starters : null;
  const myOptIds = myOpt.starters.map(s => s.id).filter(Boolean);

  const A = sideProjection(ctx, myOptIds);
  const B = sideProjection(ctx, theirIds);
  const winProb = Math.round(normCdf((A.total - B.total) / Math.max(Math.sqrt(A.sd ** 2 + B.sd ** 2), 1)) * 100);

  // Biggest swing = highest variance players on each side, plus their matchup
  const describe = (r) => {
    const m = r.opponent ? matchupFor(ctx.outlook, r.pos, r.opponent, ctx.settings?.scoring) : null;
    const diff = m ? difficultyLabel(m.ratio) : null;
    const inj = r.injury ? INJURY_META[r.injury]?.long : null;
    const parts = [`${r.proj} proj`];
    if (m) parts.push(`vs ${r.opponent} (#${m.rank} in FP allowed to ${r.pos === 'DEF' ? 'D/ST' : r.pos}, ${diff})`);
    if (inj) parts.push(inj.toLowerCase());
    return { id: r.id, pos: r.pos, proj: r.proj, sd: r.sd, injury: r.injury, text: parts.join(' · ') };
  };
  const keyMine = [...A.rows].sort((a, b) => b.sd - a.sd).slice(0, 3).map(describe);
  const keyTheirs = [...B.rows].sort((a, b) => b.sd - a.sd).slice(0, 3).map(describe);

  // Lineup fixes: set lineup vs the app's lineup
  const fixes = [];
  if (mySetIds) {
    const set = sideProjection(ctx, mySetIds);
    for (const r of set.rows) {
      if (r.injury && (isOutType(r.injury) || r.injury === 'doubtful')) {
        fixes.push(`${nameOf(ctx, r.id)} is ${INJURY_META[r.injury].long.toLowerCase()} but in your lineup`);
      }
    }
    const gain = Math.round((A.total - set.total) * 10) / 10;
    if (gain >= 0.5) {
      const ins = myOptIds.filter(id => !mySetIds.includes(id)).map(id => nameOf(ctx, id));
      const outs = mySetIds.filter(id => !myOptIds.includes(id)).map(id => nameOf(ctx, id));
      if (ins.length) fixes.push(`Start ${ins.join(', ')} over ${outs.join(', ')} (+${gain} projected)`);
    }
  }

  return {
    my: { total: A.total, lineup: myOpt, setTotal: mySetIds ? sideProjection(ctx, mySetIds).total : null },
    their: { total: B.total, ids: theirIds, usedOptimal: !theirs.starters.length },
    winProb, keyMine, keyTheirs, fixes,
  };
}
