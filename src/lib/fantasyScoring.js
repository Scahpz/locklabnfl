import { TEAM_STATS, NFL_LEAGUE_AVGS } from '@/lib/teamStats';
import { getLeagueSettings } from '@/lib/leagueSettings';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function getDefStatKey(propType, position) {
  if (position === 'K' || position === 'DEF') return null; // no yards-allowed stat for K/DST
  if (propType === 'passing_yards' || propType === 'passing_tds') return 'pass_yds_allowed';
  if (propType === 'rushing_yards' || propType === 'rushing_tds') return 'rush_yds_allowed';
  if (position === 'TE') return 'rec_yds_allowed_te';
  if (position === 'RB') return 'rec_yds_allowed_rb';
  return 'rec_yds_allowed_wr';
}

function letterGrade(total) {
  if (total >= 85) return 'A+';
  if (total >= 78) return 'A';
  if (total >= 72) return 'A-';
  if (total >= 66) return 'B+';
  if (total >= 60) return 'B';
  if (total >= 54) return 'B-';
  if (total >= 48) return 'C+';
  if (total >= 42) return 'C';
  if (total >= 36) return 'C-';
  if (total >= 30) return 'D+';
  if (total >= 24) return 'D';
  if (total >= 18) return 'D-';
  return 'F';
}

function matchupRatingLabel(tier2Score) {
  const pct = tier2Score / 20;
  if (pct >= 0.85) return 'Elite';
  if (pct >= 0.68) return 'Good';
  if (pct >= 0.48) return 'Neutral';
  if (pct >= 0.30) return 'Tough';
  return 'Avoid';
}

// ─── Positional constants ─────────────────────────────────────────────────────

// "Elite week" ceiling per position (not theoretical max, just a great week)
const POS_TOP_FP = { QB: 28, RB: 22, WR: 20, TE: 16, K: 13, DEF: 18 };

// Replacement-level FP — the floor of a waiver-wire starter in a 12-team league.
const REPLACEMENT_LEVEL = { QB: 12, RB: 4, WR: 5, TE: 2, K: 3, DEF: 4 };

// Roster-slot based START/FLEX thresholds for a 12-team 1QB/2RB/2WR/1TE/1FLEX league.
// Scaled proportionally by s.leagueSize at runtime.
const STARTER_COUNTS = { QB: 13, RB: 26, WR: 26, TE: 13, K: 12, DEF: 12 };
const FLEX_COUNTS    = { QB: 9,  RB: 18, WR: 18, TE: 7,  K: 4,  DEF: 5  };

// ─── Dynamic variance ─────────────────────────────────────────────────────────
// Coefficient of variation (std / mean) for floor/ceiling spread.
// High-volume players are more consistent; boom/bust players have wider ranges.

function computeCV(player) {
  const pos    = player.position ?? 'WR';
  const rec    = player.proj_rec    ?? null;
  const rushYd = player.proj_rush_yd ?? null;

  if (pos === 'QB') return 0.28;

  if (pos === 'WR') {
    if (rec != null) return Math.max(0.38, 0.72 - rec * 0.024);
    return 0.55;
  }
  if (pos === 'TE') {
    if (rec != null) return Math.max(0.40, 0.78 - rec * 0.030);
    return 0.60;
  }
  if (pos === 'RB') {
    if (rushYd != null) return Math.max(0.35, 0.65 - rushYd * 0.004);
    return 0.52;
  }
  return 0.50;
}

// ─── Format bonus ─────────────────────────────────────────────────────────────
// PPR vs Standard is already baked into Sleeper's pts_ppr / pts_std projections.
// Only bonus for rules Sleeper can't know: TE premium, 6PT passing TDs, superflex.

function formatBonus(position, s) {
  let bonus = 0;
  if (position === 'TE' && s.tePremium) bonus += 5;
  if (position === 'QB' && s.passTDPts === 6) bonus += 4;
  if (position === 'QB' && s.superflex) bonus += 8;
  else if (position === 'QB' && s.flexType === 'RB/WR/TE/QB') bonus += 4;
  if (position === 'TE' && ['RB/WR/TE', 'RB/WR/TE/QB'].includes(s.flexType)) bonus += 2;
  return bonus;
}

// Resolve projected FP for current scoring format
function getProjectedFP(player, s) {
  if (!player) return null;
  if (s.scoring === 'ppr')      return player.proj_pts_ppr      ?? null;
  if (s.scoring === 'half_ppr') return player.proj_pts_half_ppr ?? player.proj_pts_ppr ?? null;
  return player.proj_pts_std ?? player.proj_pts_ppr ?? null;
}

// ─── Main scoring engine ──────────────────────────────────────────────────────

export function fantasyScore(player, prop, settings) {
  if (!player || !prop) return null;
  const s = settings || getLeagueSettings();

  const position   = player.position   ?? 'WR';
  const propType   = prop.prop_type    ?? 'receiving_yards';
  const opponent   = player.opponent   ?? '';
  const depthOrder = player.depth_chart_order ?? (player.is_starter ? 1 : 99);
  const injStatus  = (player.injury_status ?? 'healthy').toLowerCase();
  const gameTotal  = prop.game_total   ?? 45.5;
  const isHome     = prop.is_home      ?? false;

  const criteria = [];

  // ── TIER 1 – Points Above Replacement (60 pts) ───────────────────────────
  // Primary ranking driver. Uses Sleeper's per-player weekly projection.
  // Normalized against PAR so cross-position comparisons are fair:
  //   a TE 8 FP above replacement ranks higher than an RB 8 FP above replacement
  //   because replacement TEs are easier to stream.

  const rawProjFP  = getProjectedFP(player, s);
  const replLevel  = REPLACEMENT_LEVEL[position] ?? 5;
  const topFP      = POS_TOP_FP[position]        ?? 20;
  const parRange   = topFP - replLevel;

  let tier1Score;
  let projFPBase;

  if (rawProjFP != null) {
    const par = Math.max(0, rawProjFP - replLevel);
    tier1Score = clamp(par / parRange, 0, 1.1) * 60;
    projFPBase = rawProjFP;
    const fmt = s.scoring === 'ppr' ? 'PPR' : s.scoring === 'half_ppr' ? 'Half PPR' : 'Std';
    criteria.push({
      label: 'Projected Fantasy Points',
      score: parseFloat(tier1Score.toFixed(2)),
      maxScore: 60,
      tip: `${rawProjFP.toFixed(1)} proj FP (${fmt}) · ${par.toFixed(1)} pts above replacement`,
    });
  } else {
    // No Sleeper projection — player has no projected fantasy value this week.
    // Assign a minimal tier1 so they still appear in the list but rank at the bottom.
    tier1Score = 2;
    projFPBase = null;
    criteria.push({
      label: 'Projected Fantasy Points',
      score: 2,
      maxScore: 60,
      tip: 'No projection data — not expected to have fantasy value this week',
    });
  }

  const tier1 = tier1Score;

  // ── TIER 2 – Matchup (20 pts) ─────────────────────────────────────────────

  const defStatKey   = getDefStatKey(propType, position);
  const teamDefStats = (defStatKey && opponent) ? TEAM_STATS[opponent] ?? null : null;
  const oppStat      = teamDefStats ? teamDefStats[defStatKey] : null;
  const leagueAvg    = defStatKey ? NFL_LEAGUE_AVGS[defStatKey] ?? 100 : 100;

  let defScore = 0.5 * 12;
  let defTip   = position === 'K' || position === 'DEF'
    ? 'Matchup N/A — scored on projected FP'
    : 'Defense data unavailable — neutral';
  if (oppStat != null) {
    defScore = clamp(0.5 + (oppStat - leagueAvg) / leagueAvg * 2, 0, 1) * 12;
    defTip   = `${opponent} allows ${oppStat} (avg ${leagueAvg})`;
  }
  criteria.push({ label: 'Opponent Defense', score: parseFloat(defScore.toFixed(2)), maxScore: 12, tip: defTip });

  const totalScore = clamp(0.5 + (gameTotal - 45.5) / 12, 0, 1) * 6;
  criteria.push({ label: 'Game Total', score: parseFloat(totalScore.toFixed(2)), maxScore: 6, tip: `O/U ${gameTotal} (avg 45.5)` });

  const homeScore = (isHome ? 0.65 : 0.35) * 2;
  criteria.push({ label: 'Home/Away', score: parseFloat(homeScore.toFixed(2)), maxScore: 2, tip: isHome ? 'Home game' : 'Away game' });

  const tier2 = defScore + totalScore + homeScore;

  // ── TIER 3 – Health / Role (15 pts) ──────────────────────────────────────

  let injMult = 1.0;
  if      (injStatus.includes('out'))          injMult = 0.0;
  else if (injStatus.includes('doubtful'))     injMult = 0.1;
  else if (injStatus.includes('questionable')) injMult = 0.45;
  const injScore = injMult * 8;
  criteria.push({
    label: 'Injury Status', score: parseFloat(injScore.toFixed(2)), maxScore: 8,
    tip: injStatus.charAt(0).toUpperCase() + injStatus.slice(1) || 'Healthy',
  });

  const roleMulti = depthOrder === 1 ? 1.0 : depthOrder === 2 ? 0.5 : 0.15;
  const roleScore = roleMulti * 5;
  criteria.push({
    label: 'Starting Role', score: parseFloat(roleScore.toFixed(2)), maxScore: 5,
    tip: depthOrder === 1 ? 'Confirmed starter' : depthOrder === 2 ? 'Backup (depth 2)' : 'Deep depth chart',
  });

  const targetShare = prop.target_share ?? null;
  const snapPct     = prop.snap_pct     ?? null;
  // Fallback: estimate from player-level volume data when prop doesn't carry usage fields
  // (happens with stale cache or POS_DEFAULTS props). This keeps Grade Breakdown and
  // Player Snapshot showing the same value.
  const catchRateEst = position === 'TE' ? 0.75 : position === 'RB' ? 0.82 : 0.68;
  const estTargetShare = (position !== 'QB' && targetShare == null && player?.proj_rec != null)
    ? Math.min(player.proj_rec / (catchRateEst * 33), 0.45)
    : targetShare;
  const estSnapPct = (position === 'RB' && snapPct == null && player?.proj_rush_yd != null)
    ? Math.min(player.proj_rush_yd / 130, 0.75)
    : snapPct;

  const usageLabel = position === 'QB' ? 'Rushing Volume'
    : position === 'RB' ? 'Snap % / Workload'
    : 'Target Share';

  let usageScore = 0.5 * 2;
  let usageTip   = 'Usage data unavailable';

  if (position === 'QB') {
    const rushYd = player?.proj_rush_yd ?? null;
    if (rushYd != null && rushYd > 5) {
      usageScore = clamp(rushYd / 40, 0, 1) * 2;
      usageTip   = `${Math.round(rushYd)} proj. rush yds — dual-threat upside`;
    } else {
      usageScore = 0.7 * 2;
      usageTip   = 'Projected starter at QB';
    }
  } else if (position === 'RB' && estSnapPct != null) {
    usageScore = clamp(estSnapPct / 0.70, 0, 1) * 2;
    usageTip   = snapPct != null
      ? `Snap % ${Math.round(snapPct * 100)}%`
      : `Snap % ~${Math.round(estSnapPct * 100)}% (est. from rush volume)`;
  } else if (estTargetShare != null) {
    usageScore = clamp(estTargetShare / 0.25, 0, 1) * 2;
    usageTip   = targetShare != null
      ? `Target share ${Math.round(targetShare * 100)}%`
      : `Target share ~${Math.round(estTargetShare * 100)}% (est. from proj. receptions)`;
  }
  criteria.push({ label: usageLabel, score: parseFloat(usageScore.toFixed(2)), maxScore: 2, tip: usageTip });

  const tier3 = injScore + roleScore + usageScore;

  // ── TIER 4 – Situation (5 pts) ────────────────────────────────────────────

  const restScore = (prop.is_back_to_back ? 0.3 : 1.0) * 3;
  criteria.push({ label: 'Rest / Schedule', score: parseFloat(restScore.toFixed(2)), maxScore: 3, tip: prop.is_back_to_back ? 'Short week' : 'Full rest' });

  const trapScore = (prop.trap_warning ? 0.2 : 1.0) * 2;
  criteria.push({ label: 'Trap Warning', score: parseFloat(trapScore.toFixed(2)), maxScore: 2, tip: prop.trap_warning ? 'TRAP: public fade' : 'No trap warning' });

  const tier4 = restScore + trapScore;

  // ── Format Bonus ──────────────────────────────────────────────────────────
  const fmtBonus = formatBonus(position, s);
  if (fmtBonus > 0) {
    const tags = [
      position === 'TE' && s.tePremium                                   ? 'TE Premium' : null,
      position === 'QB' && s.superflex                                    ? 'Superflex'  : null,
      position === 'QB' && s.passTDPts === 6                             ? '6PT TDs'    : null,
      position === 'QB' && !s.superflex && s.flexType === 'RB/WR/TE/QB' ? 'QB Flex'    : null,
      position === 'TE' && ['RB/WR/TE','RB/WR/TE/QB'].includes(s.flexType) ? 'TE Flex' : null,
    ].filter(Boolean).join(' · ');
    criteria.push({
      label: `Format Bonus (${tags})`,
      score: parseFloat(fmtBonus.toFixed(2)),
      maxScore: fmtBonus,
      tip: `+${fmtBonus.toFixed(1)} pts from your league settings`,
    });
  }

  const total   = parseFloat((tier1 + tier2 + tier3 + tier4 + fmtBonus).toFixed(1));
  const grade   = letterGrade(total);
  const verdict = total >= 72 ? 'START' : total >= 52 ? 'FLEX' : 'SIT';

  // ── Floor / Projection / Ceiling ─────────────────────────────────────────
  // Player-specific variance: high-volume players have tighter ranges,
  // boom/bust players have wider ranges. CV derived from projected stats.
  let floor = 0, projection = 0, ceiling = 0;
  if (projFPBase != null && projFPBase > 0) {
    const cv   = computeCV(player);
    floor      = parseFloat(Math.max(0, projFPBase * (1 - cv)).toFixed(1));
    projection = parseFloat(projFPBase.toFixed(1));
    ceiling    = parseFloat((projFPBase * (1 + cv)).toFixed(1));
  }

  return {
    total, grade, verdict,
    tier1: parseFloat(tier1.toFixed(2)),
    tier2: parseFloat(tier2.toFixed(2)),
    tier3: parseFloat(tier3.toFixed(2)),
    tier4: parseFloat(tier4.toFixed(2)),
    criteria,
    projection, ceiling, floor,
    projFPts: projection,
    matchupRating: matchupRatingLabel(tier2),
    scoringFormat: s.scoring,
  };
}

// ─── Head-to-head comparison ──────────────────────────────────────────────────

export function compareStartSit(playerA, propA, playerB, propB, settings) {
  if (!playerA || !propA || !playerB || !propB) return null;
  const s = settings || getLeagueSettings();

  const scoreA = fantasyScore(playerA, propA, s);
  const scoreB = fantasyScore(playerB, propB, s);
  if (!scoreA || !scoreB) return null;

  function dim(label, vA, vB, higherWins = true) {
    let winner = 'tie';
    if (typeof vA === 'number' && typeof vB === 'number') {
      const diff = higherWins ? vA - vB : vB - vA;
      if (diff > 0.01) winner = 'A'; else if (diff < -0.01) winner = 'B';
    }
    return { label, valueA: vA, valueB: vB, winner };
  }

  const posA  = playerA.position ?? 'WR';
  const posB  = playerB.position ?? 'WR';
  const oppA  = playerA.opponent ?? '';
  const oppB  = playerB.opponent ?? '';
  const defKeyA = getDefStatKey(propA.prop_type, posA);
  const defKeyB = getDefStatKey(propB.prop_type, posB);
  const oppStatA = TEAM_STATS[oppA]?.[defKeyA] ?? NFL_LEAGUE_AVGS[defKeyA];
  const oppStatB = TEAM_STATS[oppB]?.[defKeyB] ?? NFL_LEAGUE_AVGS[defKeyB];

  const injA = (playerA.injury_status ?? 'healthy').toLowerCase();
  const injB = (playerB.injury_status ?? 'healthy').toLowerCase();
  function injWeight(inj) {
    if (inj.includes('out'))          return 0;
    if (inj.includes('doubtful'))     return 1;
    if (inj.includes('questionable')) return 2;
    return 3;
  }

  const isHomeA = propA.is_home ?? false;
  const isHomeB = propB.is_home ?? false;

  // Human-readable health & role label (replaces raw tier3 decimal like "14.63")
  function healthRoleLabel(player) {
    const depth = player.depth_chart_order ?? 99;
    const inj   = (player.injury_status ?? 'healthy').toLowerCase();
    const status = inj === 'healthy' ? '' : ` (${inj})`;
    if (depth === 1) return `Starter${status}`;
    if (depth === 2) return `Backup${status}`;
    if (depth <= 4) return `Depth ${depth}${status}`;
    return `Depth${status}`;
  }

  // For usage: RBs are measured by snap%, receivers by target share.
  // QBs don't have a meaningful target share — show N/A instead of 0.
  // Situation Score (tier4) is omitted — it never varies in NFL since there
  // are no back-to-back games and we have no live trap-warning data.
  function usageValue(player, prop) {
    if (player.position === 'QB') return null;
    if (player.position === 'RB') return prop.snap_pct ?? null;
    return prop.target_share ?? null;
  }
  function usageDisplay(player, val) {
    if (player.position === 'QB') return 'N/A';
    if (val == null || val === 0) return '—';
    if (player.position === 'RB') return `${Math.round(val * 100)}% snaps`;
    return `${Math.round(val * 100)}% tgt`;
  }

  const usageA = usageValue(playerA, propA);
  const usageB = usageValue(playerB, propB);
  const bothQB = posA === 'QB' && posB === 'QB';
  const usageLabel = bothQB ? 'Target Share'
    : (posA === 'RB' || posB === 'RB') ? 'Snap % / Target Share'
    : 'Target Share';

  const dimensions = [
    dim('Fantasy Score',   scoreA.total,             scoreB.total),
    dim('Grade',           scoreA.total,             scoreB.total),
    dim('Projected FP',    scoreA.projection,        scoreB.projection),
    dim('Ceiling',         scoreA.ceiling,           scoreB.ceiling),
    dim('Matchup',         oppStatA,                 oppStatB),
    dim('Game Total',      propA.game_total ?? 45.5, propB.game_total ?? 45.5),
    dim(usageLabel,        usageA ?? 0,              usageB ?? 0),
    dim('Injury Status',   injWeight(injA),           injWeight(injB)),
    dim('Home/Away',       isHomeA ? 1 : 0,          isHomeB ? 1 : 0),
    dim('Floor',           scoreA.floor,             scoreB.floor),
    dim('Health & Role',   scoreA.tier3,             scoreB.tier3),
  ];

  dimensions[1] = { label: 'Grade', valueA: scoreA.grade, valueB: scoreB.grade,
    winner: scoreA.total > scoreB.total ? 'A' : scoreA.total < scoreB.total ? 'B' : 'tie' };
  dimensions[4] = { label: 'Matchup', valueA: scoreA.matchupRating, valueB: scoreB.matchupRating,
    winner: scoreA.tier2 > scoreB.tier2 ? 'A' : scoreA.tier2 < scoreB.tier2 ? 'B' : 'tie' };
  // Usage: show formatted string values, not raw decimals
  dimensions[6] = { label: usageLabel, valueA: usageDisplay(playerA, usageA), valueB: usageDisplay(playerB, usageB),
    winner: (usageA ?? 0) > (usageB ?? 0) ? 'A' : (usageA ?? 0) < (usageB ?? 0) ? 'B' : 'tie' };
  dimensions[7] = { label: 'Injury Status', valueA: playerA.injury_status ?? 'Healthy', valueB: playerB.injury_status ?? 'Healthy',
    winner: injWeight(injA) > injWeight(injB) ? 'A' : injWeight(injA) < injWeight(injB) ? 'B' : 'tie' };
  dimensions[8] = { label: 'Home/Away', valueA: isHomeA ? 'Home' : 'Away', valueB: isHomeB ? 'Home' : 'Away',
    winner: (isHomeA && !isHomeB) ? 'A' : (!isHomeA && isHomeB) ? 'B' : 'tie' };
  // Health & Role: show human-readable label instead of raw tier3 decimal
  dimensions[10] = { label: 'Health & Role', valueA: healthRoleLabel(playerA), valueB: healthRoleLabel(playerB),
    winner: scoreA.tier3 > scoreB.tier3 ? 'A' : scoreA.tier3 < scoreB.tier3 ? 'B' : 'tie' };

  const aWins     = dimensions.filter(d => d.winner === 'A').length;
  const bWins     = dimensions.filter(d => d.winner === 'B').length;
  const scoreDiff = Math.abs(scoreA.total - scoreB.total);
  const confidence = scoreDiff >= 12 ? 'High' : scoreDiff >= 6 ? 'Medium' : 'Low';
  const winnerKey  = aWins > bWins ? 'A' : bWins > aWins ? 'B' : 'toss-up';
  const winnerName = winnerKey === 'A' ? playerA.player_name : winnerKey === 'B' ? playerB.player_name : null;

  const reasoning = [];
  if (scoreDiff >= 6) {
    const higher = scoreA.total >= scoreB.total
      ? { name: playerA.player_name, score: scoreA }
      : { name: playerB.player_name, score: scoreB };
    reasoning.push(`${higher.name} has a meaningfully higher fantasy score (${higher.score.total}) — a ${scoreDiff.toFixed(1)}-point edge.`);
  } else {
    reasoning.push(`Scores are close (${scoreA.total} vs ${scoreB.total}) — this is a genuine toss-up decision.`);
  }
  if (Math.abs(scoreA.tier1 - scoreB.tier1) > 2) {
    const better = scoreA.tier1 > scoreB.tier1 ? playerA.player_name : playerB.player_name;
    reasoning.push(`${better} has a higher projected fantasy output this week.`);
  }
  if (Math.abs(scoreA.tier2 - scoreB.tier2) > 1) {
    const better = scoreA.tier2 > scoreB.tier2 ? playerA.player_name : playerB.player_name;
    reasoning.push(`${better} has the better matchup (${better === playerA.player_name ? scoreA.matchupRating : scoreB.matchupRating}).`);
  }
  if (injA !== injB && (injA !== 'healthy' || injB !== 'healthy')) {
    const concern = injA !== 'healthy' ? playerA.player_name : playerB.player_name;
    const status  = injA !== 'healthy' ? injA : injB;
    reasoning.push(`Injury concern: ${concern} is listed as ${status}.`);
  }
  reasoning.push(winnerName
    ? `Recommendation: Start ${winnerName} with ${confidence.toLowerCase()} confidence.`
    : 'Too close to call — go with the better matchup or flip a coin.');

  return { winner: winnerKey, dimensions, reasoning, confidence, scoreA, scoreB };
}

// ─── Rankings ─────────────────────────────────────────────────────────────────

const PRIMARY_PROP_TYPE = {
  QB:  'passing_yards',
  RB:  'rushing_yards',
  WR:  'receiving_yards',
  TE:  'receiving_yards',
  K:   'field_goal_attempts',
  DEF: 'points_allowed',
};

// Score all players at one position, sort by total, then assign START/FLEX/SIT
// by rank within the position group (not by raw score thresholds).
// This means the top-N projected starters leaguewide always get START regardless
// of how the 0-100 score distributes — fixing compression in mixed "All" views.
function scorePosition(players, position, s) {
  const scale  = (s.leagueSize ?? 12) / 12;
  const startN = Math.round(STARTER_COUNTS[position] * scale);
  let   flexN  = Math.round(FLEX_COUNTS[position]    * scale);
  // QBs can only occupy FLEX slots when the league explicitly enables it.
  if (position === 'QB' && !s.superflex && s.flexType !== 'RB/WR/TE/QB') {
    flexN = 0;
  }

  const scored = players
    .filter(p => p.position === position)
    .map(player => {
      const primaryType = PRIMARY_PROP_TYPE[position] ?? 'receiving_yards';
      const prop = (player.props ?? []).find(p => p.prop_type === primaryType)
        ?? (player.props ?? [])[0];
      if (!prop) return null;

      const score = fantasyScore(player, prop, s);
      if (!score) return null;

      // Drop players with no real Sleeper projection data (they get identical fallback
      // lines — QB: 246 pass yds, RB: 69 rush yds, TE: 36 rec yds — and 0/0/0 FP).
      // Keep depth-chart starters even without week data since they belong in rankings.
      if (score.projection === 0 && score.floor === 0 && player.proj_pts_ppr == null) {
        return null;
      }

      return { player, prop, score };
    })
    .filter(Boolean)
    .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));

  // Assign verdict by position rank, not by score cutoff.
  // rankPlayers() merges these after the fact; the verdict survives unchanged.
  return scored.map((entry, idx) => {
    const rank    = idx + 1;
    const verdict = rank <= startN ? 'START' : rank <= startN + flexN ? 'FLEX' : 'SIT';
    return { ...entry, posRank: rank, score: { ...entry.score, verdict } };
  });
}

export function rankPlayers(players, position = 'all', settings) {
  const s = settings || getLeagueSettings();

  // For "All" tab: explicitly run per-position and merge.
  // This guarantees the same code path as each individual position tab —
  // same prop selection, same PAR normalization, same results.
  const positions = position === 'all' ? ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] : [position];

  return positions
    .flatMap(pos => scorePosition(players, pos, s))
    .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
}

export function rankWaiverWire(players, position = 'all', settings) {
  const s = settings || getLeagueSettings();
  const positions = position === 'all' ? ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] : [position];

  return positions
    .flatMap(pos =>
      players
        .filter(p => p.position === pos)
        .map(player => {
          const primaryType = PRIMARY_PROP_TYPE[pos] ?? 'receiving_yards';
          const prop = (player.props ?? []).find(p => p.prop_type === primaryType)
            ?? (player.props ?? [])[0];
          if (!prop) return null;

          const base = fantasyScore(player, prop, s);
          const opportunityBoost = player.waiver_priority === 'high'   ? 15
                                 : player.waiver_priority === 'medium' ?  8
                                 : player.is_handcuff                  ?  5 : 0;
          const injuryUpside = player.injury_upside ? 10 : 0;
          const waiverTotal  = Math.min(100, (base?.total ?? 0) + opportunityBoost + injuryUpside);

          return {
            player, prop,
            score: { ...base, total: parseFloat(waiverTotal.toFixed(1)), waiverBoost: opportunityBoost + injuryUpside },
            waiverReason:   player.waiver_reason   ?? null,
            injuryUpside:   player.injury_upside   ?? null,
            isHandcuff:     player.is_handcuff     ?? false,
            waiverPriority: player.waiver_priority ?? 'low',
          };
        })
        .filter(Boolean)
    )
    .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
}

// ─── Model Confidence ─────────────────────────────────────────────────────────
// Measures how many secondary criteria align with the verdict direction.
// Returns 'high' | 'medium' | 'low'
export function computeConfidence(score) {
  if (!score?.criteria?.length) return null;
  const proj = score.criteria.find(c => c.label === 'Projected Fantasy Points');
  if (!proj || proj.score <= 5) return 'low';

  const secondary = score.criteria.filter(
    c => c.label !== 'Projected Fantasy Points' && !c.label.startsWith('Format Bonus')
  );
  if (!secondary.length) return 'medium';

  const positiveSignals = secondary.filter(c => c.maxScore > 0 && c.score / c.maxScore >= 0.55).length;
  const rawRatio = positiveSignals / secondary.length;

  // For SIT verdicts, confidence comes from negative alignment
  const alignedRatio = score.verdict === 'SIT' ? 1 - rawRatio : rawRatio;

  if (alignedRatio >= 0.60) return 'high';
  if (alignedRatio >= 0.38) return 'medium';
  return 'low';
}
