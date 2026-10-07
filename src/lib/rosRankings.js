// ── Rest-of-season rankings ───────────────────────────────────────────────────
// For every remaining week: Sleeper's weekly projection for the player (already
// zero on byes), nudged by how many fantasy points that week's opponent allows
// to the position THIS season, by the player's usage trend, and by his injury
// outlook. Sum → ROS points; average matchup difficulty → schedule grade.
//
// SOS_WEIGHT is deliberately partial: Sleeper's own projections already account
// for some matchup, so the schedule adjusts rather than replaces them.

import { matchupFor, fmtKey, byeWeek } from './fantasyOutlook';
import { INJURY_META } from './injuries';

const SOS_WEIGHT   = 0.35;  // how far an easy/hard opponent moves a weekly projection
const TREND_WEIGHT = 0.08;  // ±8% for a maxed-out usage trend (momentum ±100)
const IR_WEEKS     = 4;     // assumed minimum absence for IR / PUP

export const ROS_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'DEF'];

function injuryWeekMultiplier(key, weekIndex) {
  if (!key) return 1;
  if (key === 'ir' || key === 'pup') return weekIndex < IR_WEEKS ? 0 : 0.95;
  if (key === 'out' || key === 'sus') return weekIndex === 0 ? 0 : 1;
  if (weekIndex === 0) return INJURY_META[key]?.mult ?? 1;
  return 1;
}

function injuryOutlookText(key) {
  if (!key) return null;
  if (key === 'ir' || key === 'pup') return `${INJURY_META[key].long} — out at least ~${IR_WEEKS} weeks`;
  if (key === 'out' || key === 'sus') return `${INJURY_META[key].long} this week`;
  if (key === 'returning') return 'Returning from injury';
  return `${INJURY_META[key].long} this week`;
}

/**
 * players     live players (injury-adjusted) — any positions
 * outlook     /api/fantasy/outlook bundle
 * trendIndex  { [playerId]: { momentum, tags } } from the Trend Engine (optional)
 * Returns { [position]: entries[] } sorted by ROS points, each entry:
 *   { player, rosPoints, perGame, games, bye, sos: { index, grade, rank, of }, weeks[], reason }
 */
export function buildRosRankings(players, outlook, settings, trendIndex = {}) {
  if (!outlook?.ros) return {};
  const k = fmtKey(settings?.scoring);
  const col = k === 'ppr' ? 1 : k === 'half' ? 2 : 3;
  const out = {};

  for (const pos of ROS_POSITIONS) {
    const entries = [];
    for (const player of players) {
      if (player.position !== pos) continue;
      const rows = outlook.ros[String(player.id)];
      if (!rows?.length) continue;
      const projByWeek = Object.fromEntries(rows.map(r => [r[0], r[col]]));
      const sched = outlook.schedule?.[player.team] ?? {};
      const momentum = trendIndex[player.id]?.momentum ?? 0;
      const trendMult = 1 + TREND_WEIGHT * Math.max(-1, Math.min(1, momentum / 100));

      const weeks = [];
      let total = 0, ratioSum = 0, games = 0, idx = 0;
      for (let w = outlook.week; w <= 18; w++) {
        const opponent = sched[String(w)] ?? null;
        if (!opponent) { weeks.push({ week: w, bye: true }); continue; }
        const m = matchupFor(outlook, pos, opponent, settings?.scoring);
        const ratio = m?.ratio ?? 1;
        const base = projByWeek[w] ?? 0;
        const adj = base * (1 + SOS_WEIGHT * (1 / ratio - 1)) * trendMult * injuryWeekMultiplier(player.injury_key, idx);
        weeks.push({ week: w, opponent, proj: base, adjusted: adj, ratio, matchup: m });
        total += adj; ratioSum += ratio; games++; idx++;
      }
      if (total <= 0.5) continue;
      entries.push({
        player,
        rosPoints: Math.round(total * 10) / 10,
        perGame: games ? Math.round((total / games) * 10) / 10 : 0,
        games,
        bye: byeWeek(outlook, player.team),
        sosIndex: games ? ratioSum / games : 1,
        momentum,
        weeks,
      });
    }

    // Schedule rank among players at the position: 1 = easiest remaining schedule
    const bySos = [...entries].sort((a, b) => a.sosIndex - b.sosIndex);
    bySos.forEach((e, i) => {
      const third = bySos.length / 3;
      e.sos = {
        index: Math.round(e.sosIndex * 100) / 100,
        rank: i + 1,
        of: bySos.length,
        grade: i < third ? 'easy' : i >= bySos.length - third ? 'hard' : 'average',
      };
    });

    entries.sort((a, b) => b.rosPoints - a.rosPoints);
    entries.forEach((e, i) => {
      e.rank = i + 1;
      // Schedule grade and bye are shown as chips; the reason carries everything else.
      const parts = [];
      if (e.momentum >= 25) parts.push('usage trending up');
      else if (e.momentum <= -25) parts.push('usage trending down');
      const inj = injuryOutlookText(e.player.injury_key);
      if (inj) parts.push(inj);
      if (e.player.role_bump_from) parts.push(`role up with ${e.player.role_bump_from} out`);
      e.reason = parts.length ? parts.join(' · ') : null;
    });
    out[pos] = entries;
  }
  return out;
}

// Flattened lookup: playerId → ROS entry (used by My Team / trades)
export function indexRos(rosByPos) {
  const idx = {};
  for (const list of Object.values(rosByPos ?? {})) for (const e of list) idx[String(e.player.id)] = e;
  return idx;
}
