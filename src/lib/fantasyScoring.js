import { TEAM_STATS, NFL_LEAGUE_AVGS } from '@/lib/teamStats';
import { getLeagueSettings } from '@/lib/leagueSettings';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function getDefStatKey(propType, position) {
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

// ─── Format bonus ─────────────────────────────────────────────────────────────
// PPR vs Standard is already captured in Sleeper's pts_ppr / pts_std projections.
// Only add bonuses for rules Sleeper doesn't know: TE premium, 6PT TDs, superflex.

function formatBonus(position, s) {
  let bonus = 0;

  // TE Premium: extra 0.5/rec for TEs (not in Sleeper pts_ppr)
  if (position === 'TE' && s.tePremium) bonus += 5;

  // 6-point QB TDs: Sleeper assumes 4PT TDs — adjust for the extra 2 pts/TD
  if (position === 'QB' && s.passTDPts === 6) bonus += 4;

  // Superflex: QBs gain major scarcity value when a 2nd QB slot exists
  if (position === 'QB' && s.superflex) {
    bonus += 8;
  } else if (position === 'QB' && s.flexType === 'RB/WR/TE/QB') {
    bonus += 4;
  }

  // TE-eligible flex slot adds a small bump to TE value
  if (position === 'TE' && ['RB/WR/TE', 'RB/WR/TE/QB'].includes(s.flexType)) {
    bonus += 2;
  }

  return bonus;
}

// Resolve the projected FP for a player under the current scoring format
function getProjectedFP(player, s) {
  if (!player) return null;
  if (s.scoring === 'ppr')      return player.proj_pts_ppr      ?? null;
  if (s.scoring === 'half_ppr') return player.proj_pts_half_ppr ?? player.proj_pts_ppr ?? null;
  /* standard */                return player.proj_pts_std      ?? player.proj_pts_ppr ?? null;
}

// Rough FP estimate from a prop line when no Sleeper projection is available
function estimateFPFromProp(l6, propType, position, s) {
  let base = 0;
  if (propType === 'passing_yards')   base = l6 * s.passYdPts;
  else if (propType === 'rushing_yards')   base = l6 * s.rushYdPts;
  else if (propType === 'receiving_yards') base = l6 * s.recYdPts;
  else if (propType === 'receptions')      base = l6 * s.recPts;
  else base = l6 * 0.1;
  // Add typical TD contribution by position
  const tdBonus =
    position === 'QB' ? 1.5 * s.passTDPts :
    position === 'RB' ? 0.3 * s.rushTDPts :
    position === 'WR' ? 0.15 * s.recTDPts :
    position === 'TE' ? 0.2  * s.recTDPts : 0;
  return base + tdBonus;
}

// "Great week" FP per position — players projected near this mark should rank as clear STARTs.
// Intentionally not the all-time max (Josh Allen can hit 45+); represents a strong elite week.
const POS_TOP_FP = { QB: 28, RB: 22, WR: 22, TE: 16 };

// ─── Main scoring engine ──────────────────────────────────────────────────────

/**
 * Returns a score 0-100 and breakdown for a single player + prop.
 * Projected FP (from Sleeper) is the primary ranking driver (~60% of score).
 * Matchup, health, and situation are modifiers.
 */
export function fantasyScore(player, prop, settings) {
  if (!player || !prop) return null;
  const s = settings || getLeagueSettings();

  const position  = player.position ?? 'WR';
  const propType  = prop.prop_type  ?? 'receiving_yards';
  const opponent  = player.opponent ?? '';
  const isStarter = player.is_starter ?? true;
  const depthOrder = player.depth_chart_order ?? (isStarter ? 1 : 99);
  const injStatus = (player.injury_status ?? 'healthy').toLowerCase();
  const injNote   = player.injury_note ?? '';
  const gameTotal = prop.game_total ?? 45.5;
  const isHome    = prop.is_home    ?? false;

  const criteria = [];

  // ── TIER 1 – Projected Fantasy Value (60 pts) ────────────────────────────
  // The single biggest factor: how many FP is this player expected to score?
  // Uses Sleeper's per-player weekly projection when available, otherwise
  // estimates from the prop line average.

  const rawProjFP = getProjectedFP(player, s);
  const topFP     = POS_TOP_FP[position] ?? 25;

  let tier1Score;
  let projFPLabel;

  if (rawProjFP != null) {
    tier1Score  = clamp(rawProjFP / topFP, 0, 1.1) * 60;
    const fmt   = s.scoring === 'ppr' ? 'PPR' : s.scoring === 'half_ppr' ? 'Half PPR' : 'Std';
    projFPLabel = `${rawProjFP.toFixed(1)} proj FP (${fmt})`;
  } else {
    // Fallback: estimate FP from the prop line average
    const l6       = prop.avg_last_10 ?? prop.line ?? 0;
    const estFP    = estimateFPFromProp(l6, propType, position, s);
    tier1Score     = clamp(estFP / topFP, 0, 1.1) * 60;
    projFPLabel    = `~${estFP.toFixed(1)} est FP (no projection data)`;
  }

  criteria.push({
    label:    'Projected Fantasy Points',
    score:    parseFloat(tier1Score.toFixed(2)),
    maxScore: 60,
    tip:      projFPLabel,
  });

  const tier1 = tier1Score;

  // ── TIER 2 – Matchup (20 pts) ─────────────────────────────────────────────

  const defStatKey  = getDefStatKey(propType, position);
  const teamDefStats = TEAM_STATS[opponent] ?? null;
  const oppStat     = teamDefStats ? teamDefStats[defStatKey] : null;
  const leagueAvg   = NFL_LEAGUE_AVGS[defStatKey] ?? 100;

  // 2a. Opponent defense vs position (12 pts)
  let defScore = 0.5 * 12;
  let defTip   = 'Defense data unavailable — neutral';
  if (oppStat != null) {
    defScore = clamp(0.5 + (oppStat - leagueAvg) / leagueAvg * 2, 0, 1) * 12;
    defTip   = `${opponent} allows ${oppStat} (avg ${leagueAvg})`;
  }
  criteria.push({ label: 'Opponent Defense', score: parseFloat(defScore.toFixed(2)), maxScore: 12, tip: defTip });

  // 2b. Game total (6 pts)
  const totalScore = clamp(0.5 + (gameTotal - 45.5) / 12, 0, 1) * 6;
  criteria.push({ label: 'Game Total', score: parseFloat(totalScore.toFixed(2)), maxScore: 6, tip: `O/U ${gameTotal} (avg 45.5)` });

  // 2c. Home/Away (2 pts)
  const homeScore = (isHome ? 0.65 : 0.35) * 2;
  criteria.push({ label: 'Home/Away', score: parseFloat(homeScore.toFixed(2)), maxScore: 2, tip: isHome ? 'Home game' : 'Away game' });

  const tier2 = defScore + totalScore + homeScore;

  // ── TIER 3 – Health / Role (15 pts) ──────────────────────────────────────

  // 3a. Injury status (8 pts)
  let injMult = 1.0;
  if      (injStatus.includes('out'))          injMult = 0.0;
  else if (injStatus.includes('doubtful'))     injMult = 0.1;
  else if (injStatus.includes('questionable')) injMult = 0.45;
  const injScore = injMult * 8;
  criteria.push({
    label:    'Injury Status',
    score:    parseFloat(injScore.toFixed(2)),
    maxScore: 8,
    tip:      injStatus.charAt(0).toUpperCase() + injStatus.slice(1) || 'Healthy',
  });

  // 3b. Depth / starting role (5 pts)
  const roleMulti = depthOrder === 1 ? 1.0 : depthOrder === 2 ? 0.5 : 0.15;
  const roleScore = roleMulti * 5;
  criteria.push({
    label:    'Starting Role',
    score:    parseFloat(roleScore.toFixed(2)),
    maxScore: 5,
    tip:      depthOrder === 1 ? 'Confirmed starter' : depthOrder === 2 ? 'Backup (depth 2)' : 'Deep depth chart',
  });

  // 3c. Usage / target share (2 pts)
  const targetShare = prop.target_share ?? null;
  const snapPct     = prop.snap_pct     ?? null;
  let usageScore = 0.5 * 2;
  let usageTip   = 'Usage data unavailable';
  if (position === 'RB' && snapPct != null) {
    usageScore = clamp(snapPct / 0.70, 0, 1) * 2;
    usageTip   = `Snap % ${Math.round(snapPct * 100)}%`;
  } else if (targetShare != null) {
    usageScore = clamp(targetShare / 0.25, 0, 1) * 2;
    usageTip   = `Target share ${Math.round(targetShare * 100)}%`;
  }
  criteria.push({ label: 'Usage / Target Share', score: parseFloat(usageScore.toFixed(2)), maxScore: 2, tip: usageTip });

  const tier3 = injScore + roleScore + usageScore;

  // ── TIER 4 – Situation (5 pts) ────────────────────────────────────────────

  // 4a. Rest / short week (3 pts)
  const isShortWeek = prop.is_back_to_back ?? false;
  const restScore   = (isShortWeek ? 0.3 : 1.0) * 3;
  criteria.push({ label: 'Rest / Schedule', score: parseFloat(restScore.toFixed(2)), maxScore: 3, tip: isShortWeek ? 'Short week — fatigue risk' : 'Full rest' });

  // 4b. Trap warning (2 pts)
  const trapWarning = prop.trap_warning ?? false;
  const trapScore   = (trapWarning ? 0.2 : 1.0) * 2;
  criteria.push({ label: 'Trap Warning', score: parseFloat(trapScore.toFixed(2)), maxScore: 2, tip: trapWarning ? 'TRAP: public fade — use caution' : 'No trap warning' });

  const tier4 = restScore + trapScore;

  // ── Format Bonus ──────────────────────────────────────────────────────────
  const fmtBonus = formatBonus(position, s);
  if (fmtBonus > 0) {
    const tags = [
      position === 'TE' && s.tePremium                              ? 'TE Premium' : null,
      position === 'QB' && s.superflex                              ? 'Superflex'  : null,
      position === 'QB' && s.passTDPts === 6                        ? '6PT TDs'    : null,
      position === 'QB' && !s.superflex && s.flexType === 'RB/WR/TE/QB' ? 'QB Flex' : null,
      position === 'TE' && ['RB/WR/TE','RB/WR/TE/QB'].includes(s.flexType) ? 'TE Flex' : null,
    ].filter(Boolean).join(' · ');
    criteria.push({
      label:    `Format Bonus (${tags})`,
      score:    parseFloat(fmtBonus.toFixed(2)),
      maxScore: fmtBonus,
      tip:      `+${fmtBonus.toFixed(1)} pts from your league settings`,
    });
  }

  const total   = parseFloat((tier1 + tier2 + tier3 + tier4 + fmtBonus).toFixed(1));
  const grade   = letterGrade(total);
  const verdict = total >= 72 ? 'START' : total >= 52 ? 'FLEX' : 'SIT';

  // ── Floor / Projection / Ceiling (fantasy points) ────────────────────────
  // Derived from real Sleeper weekly projection with realistic variance:
  //   floor = bad game (10th percentile) ≈ 45% of projection
  //   ceiling = great game (90th percentile) ≈ 165% of projection
  const projFPBase = rawProjFP ?? 0;
  const floor      = parseFloat((projFPBase * 0.45).toFixed(1));
  const projection = parseFloat(projFPBase.toFixed(1));
  const ceiling    = parseFloat((projFPBase * 1.65).toFixed(1));

  return {
    total,
    grade,
    tier1:    parseFloat(tier1.toFixed(2)),
    tier2:    parseFloat(tier2.toFixed(2)),
    tier3:    parseFloat(tier3.toFixed(2)),
    tier4:    parseFloat(tier4.toFixed(2)),
    criteria,
    verdict,
    projection,
    ceiling,
    floor,
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
      if (diff > 0.01)       winner = 'A';
      else if (diff < -0.01) winner = 'B';
    } else if (vA !== vB) {
      winner = vA > vB ? (higherWins ? 'A' : 'B') : (higherWins ? 'B' : 'A');
    }
    return { label, valueA: vA, valueB: vB, winner };
  }

  const posA   = playerA.position ?? 'WR';
  const posB   = playerB.position ?? 'WR';
  const oppA   = playerA.opponent ?? '';
  const oppB   = playerB.opponent ?? '';
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

  const dimensions = [
    dim('Fantasy Score',      scoreA.total,               scoreB.total),
    dim('Grade',              scoreA.total,               scoreB.total),
    dim('Projected FP',       scoreA.projection,           scoreB.projection),
    dim('Ceiling',            scoreA.ceiling,              scoreB.ceiling),
    dim('Matchup',            oppStatA,                    oppStatB),
    dim('Game Total',         propA.game_total ?? 45.5,   propB.game_total ?? 45.5),
    dim('Target Share',       propA.target_share ?? 0,    propB.target_share ?? 0),
    dim('Injury Status',      injWeight(injA),             injWeight(injB)),
    dim('Home/Away',          isHomeA ? 1 : 0,            isHomeB ? 1 : 0),
    dim('Floor',              scoreA.floor,                scoreB.floor),
    dim('Role Score',         scoreA.tier3,                scoreB.tier3),
    dim('Situation Score',    scoreA.tier4,                scoreB.tier4),
  ];

  // Human-readable overrides
  dimensions[1] = {
    label: 'Grade',
    valueA: scoreA.grade, valueB: scoreB.grade,
    winner: scoreA.total > scoreB.total ? 'A' : scoreA.total < scoreB.total ? 'B' : 'tie',
  };
  dimensions[4] = {
    label: 'Matchup',
    valueA: scoreA.matchupRating, valueB: scoreB.matchupRating,
    winner: scoreA.tier2 > scoreB.tier2 ? 'A' : scoreA.tier2 < scoreB.tier2 ? 'B' : 'tie',
  };
  dimensions[7] = {
    label: 'Injury Status',
    valueA: playerA.injury_status ?? 'Healthy', valueB: playerB.injury_status ?? 'Healthy',
    winner: injWeight(injA) > injWeight(injB) ? 'A' : injWeight(injA) < injWeight(injB) ? 'B' : 'tie',
  };
  dimensions[8] = {
    label: 'Home/Away',
    valueA: isHomeA ? 'Home' : 'Away', valueB: isHomeB ? 'Home' : 'Away',
    winner: (isHomeA && !isHomeB) ? 'A' : (!isHomeA && isHomeB) ? 'B' : 'tie',
  };

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
    const betterProj = scoreA.tier1 > scoreB.tier1 ? playerA.player_name : playerB.player_name;
    reasoning.push(`${betterProj} has a higher projected fantasy output for this week.`);
  }

  if (Math.abs(scoreA.tier2 - scoreB.tier2) > 1) {
    const betterMatchup = scoreA.tier2 > scoreB.tier2 ? playerA.player_name : playerB.player_name;
    reasoning.push(`${betterMatchup} has the better matchup this week (${betterMatchup === playerA.player_name ? scoreA.matchupRating : scoreB.matchupRating}).`);
  }

  if (injA !== injB && (injA !== 'healthy' || injB !== 'healthy')) {
    const concern = injA !== 'healthy' ? playerA.player_name : playerB.player_name;
    const status  = injA !== 'healthy' ? injA : injB;
    reasoning.push(`Injury concern: ${concern} is listed as ${status} — factor in closer to game time.`);
  }

  if (winnerName) {
    reasoning.push(`Recommendation: Start ${winnerName} with ${confidence.toLowerCase()} confidence.`);
  } else {
    reasoning.push(`Too close to call — go with the player in the better matchup or flip a coin.`);
  }

  return { winner: winnerKey, dimensions, reasoning, confidence, scoreA, scoreB };
}

// ─── Rankings ─────────────────────────────────────────────────────────────────

// Always score each player on their most relevant prop type (correct def stat key,
// accurate matchup context). Tier1 still uses player.proj_pts_* regardless.
const PRIMARY_PROP_TYPE = {
  QB: 'passing_yards',
  RB: 'rushing_yards',
  WR: 'receiving_yards',
  TE: 'receiving_yards',
};

export function rankPlayers(players, position = 'all', settings) {
  const s = settings || getLeagueSettings();
  const filtered = position === 'all'
    ? players
    : players.filter(p => p.position === position);

  return filtered
    .map(player => {
      const primaryType = PRIMARY_PROP_TYPE[player.position] ?? 'receiving_yards';
      const prop = (player.props ?? []).find(p => p.prop_type === primaryType)
        ?? (player.props ?? [])[0];
      if (!prop) return null;

      const score = fantasyScore(player, prop, s);
      return { player, prop, score };
    })
    .filter(Boolean)
    .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
}

export function rankWaiverWire(players, position = 'all', settings) {
  const s = settings || getLeagueSettings();
  const filtered = position === 'all'
    ? players
    : players.filter(p => p.position === position);

  return filtered
    .map(player => {
      const primaryType = PRIMARY_PROP_TYPE[player.position] ?? 'receiving_yards';
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
        player,
        prop,
        score: { ...base, total: parseFloat(waiverTotal.toFixed(1)), waiverBoost: opportunityBoost + injuryUpside },
        waiverReason:   player.waiver_reason ?? null,
        injuryUpside:   player.injury_upside ?? null,
        isHandcuff:     player.is_handcuff   ?? false,
        waiverPriority: player.waiver_priority ?? 'low',
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
}
