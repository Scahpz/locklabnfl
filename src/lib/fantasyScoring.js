import { TEAM_STATS, NFL_LEAGUE_AVGS } from '@/lib/teamStats';
import { getLeagueSettings, projectedFantasyPts, pprMultiplier } from '@/lib/leagueSettings';

// ─── Helpers ────────────────────────────────────────────────────────────────

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
  const pct = tier2Score / 25;
  if (pct >= 0.85) return 'Elite';
  if (pct >= 0.68) return 'Good';
  if (pct >= 0.48) return 'Neutral';
  if (pct >= 0.30) return 'Tough';
  return 'Avoid';
}

// ─── Format bonus ────────────────────────────────────────────────────────────
// Extra points that shift rankings when league settings change.
// Applied on top of the base 0-100 score — grades and verdicts naturally follow.

function formatBonus(position, propType, s) {
  let bonus = 0;
  const isRecProp  = ['receptions', 'receiving_yards', 'receiving_tds'].includes(propType);
  const isPassProp = ['passing_yards', 'passing_tds'].includes(propType);

  // PPR / receiving format: rewards WR/TE/RB receiving props
  if (isRecProp) {
    const table = {
      ppr:      { WR: 6, TE: 5, RB: 4, QB: 0 },
      half_ppr: { WR: 3, TE: 2.5, RB: 2, QB: 0 },
      standard: { WR: 0, TE: 0, RB: 0, QB: 0 },
    };
    bonus += (table[s.scoring] ?? table.standard)[position] ?? 0;
  }

  // TE Premium: additional TE bonus on top of PPR
  if (position === 'TE' && s.tePremium && isRecProp) bonus += 5;

  // 6-point QB TDs: boosts QBs with strong TD rate
  if (position === 'QB' && s.passTDPts === 6 && isPassProp) bonus += 4;

  // Superflex: QBs gain major positional scarcity value
  if (position === 'QB' && s.superflex) {
    bonus += 8;
  } else if (position === 'QB' && s.flexType === 'RB/WR/TE/QB') {
    // QB-eligible flex without true superflex: moderate boost
    bonus += 4;
  }

  // TE-eligible flex slot
  if (position === 'TE' && isRecProp && ['RB/WR/TE', 'RB/WR/TE/QB'].includes(s.flexType)) {
    bonus += 2;
  }

  return bonus;
}

// ─── Main scoring engine ─────────────────────────────────────────────────────

/**
 * Returns a score 0-100 and breakdown for a single player + prop.
 * Accepts optional league settings; falls back to localStorage settings.
 */
export function fantasyScore(player, prop, settings) {
  if (!player || !prop) return null;
  const s = settings || getLeagueSettings();

  const line = prop.line ?? 0;
  const l6   = prop.avg_last_10 ?? line;   // 6-game average stored as avg_last_10
  const l3   = prop.avg_last_5  ?? l6;     // 3-game average stored as avg_last_5
  const hitRate = prop.hit_rate_last_10 ?? 50;
  const games   = prop.last_10_games ?? [];

  const opponent = player.opponent ?? prop.opponent ?? '';
  const position = player.position ?? prop.position ?? 'WR';
  const defStatKey  = getDefStatKey(prop.prop_type, position);
  const teamDefStats = TEAM_STATS[opponent] ?? null;
  const oppStat     = teamDefStats ? teamDefStats[defStatKey] : null;
  const leagueAvg   = NFL_LEAGUE_AVGS[defStatKey] ?? 100;

  const gameTotal   = prop.game_total ?? 45.5;
  const isHome      = prop.is_home ?? false;
  const targetShare = prop.target_share ?? null;
  const snapPct     = prop.snap_pct ?? null;
  const injNote     = player.injury_note ?? prop.injury_note ?? '';
  const injStatus   = (player.injury_status ?? prop.injury_status ?? 'healthy').toLowerCase();
  const trapWarning = prop.trap_warning ?? false;
  const isStarter   = player.is_starter ?? true;

  const criteria = [];

  // ── TIER 1 – Recent Form (40 pts) ───────────────────────────────────────

  // 1. L6 avg vs line (12 pts)
  const l6Score = clamp(0.5 + (l6 - line) / Math.max(line, 1) * 2, 0, 1) * 12;
  criteria.push({
    label: 'L6 Avg vs Line',
    score: parseFloat(l6Score.toFixed(2)),
    maxScore: 12,
    tip: `L6 avg ${l6} vs line ${line}`,
  });

  // 2. L3 avg vs line (10 pts)
  const l3Score = clamp(0.5 + (l3 - line) / Math.max(line, 1) * 2, 0, 1) * 10;
  criteria.push({
    label: 'L3 Avg vs Line',
    score: parseFloat(l3Score.toFixed(2)),
    maxScore: 10,
    tip: `L3 avg ${l3} vs line ${line}`,
  });

  // 3. Hit rate >= 60% (10 pts)
  const hrScore = (hitRate / 100) * 10;
  criteria.push({
    label: 'Hit Rate',
    score: parseFloat(hrScore.toFixed(2)),
    maxScore: 10,
    tip: `Hit rate ${hitRate}% (need ≥60%)`,
  });

  // 4. Trending direction – L3 > L6 = hot (8 pts)
  const trend = l3 > l6 ? 1 : l3 < l6 ? 0 : 0.5;
  const trendScore = trend * 8;
  criteria.push({
    label: 'Trending Direction',
    score: parseFloat(trendScore.toFixed(2)),
    maxScore: 8,
    tip: l3 > l6 ? 'Hot — L3 > L6' : l3 < l6 ? 'Cooling — L3 < L6' : 'Flat',
  });

  const tier1 = l6Score + l3Score + hrScore + trendScore;

  // ── TIER 2 – Matchup (25 pts) ────────────────────────────────────────────

  // 5. Def stat vs league avg (12 pts)
  let defScore = 0.5 * 12; // default neutral
  let defTip   = 'Defense data unavailable';
  if (oppStat != null) {
    defScore = clamp(0.5 + (oppStat - leagueAvg) / leagueAvg * 2, 0, 1) * 12;
    defTip = `${opponent} allows ${oppStat} (avg ${leagueAvg})`;
  }
  criteria.push({
    label: 'Opponent Defense',
    score: parseFloat(defScore.toFixed(2)),
    maxScore: 12,
    tip: defTip,
  });

  // 6. Game total vs 45.5 (8 pts)
  const totalScore = clamp(0.5 + (gameTotal - 45.5) / 10, 0, 1) * 8;
  criteria.push({
    label: 'Game Total',
    score: parseFloat(totalScore.toFixed(2)),
    maxScore: 8,
    tip: `Game total ${gameTotal} (avg 45.5)`,
  });

  // 7. Is home (5 pts)
  const homeScore = (isHome ? 0.6 : 0.4) * 5;
  criteria.push({
    label: 'Home/Away',
    score: parseFloat(homeScore.toFixed(2)),
    maxScore: 5,
    tip: isHome ? 'Home game' : 'Away game',
  });

  const tier2 = defScore + totalScore + homeScore;

  // ── TIER 3 – Situation (20 pts) ──────────────────────────────────────────

  // 8. Home/away split (8 pts)
  // We don't have separate home/away split averages in the mock data structure,
  // so we use neutral 0.5 unless is_home is set and we can derive something meaningful
  const splitScore = 0.5 * 8;
  criteria.push({
    label: 'Home/Away Split',
    score: parseFloat(splitScore.toFixed(2)),
    maxScore: 8,
    tip: 'Split data not available — using neutral',
  });

  // 9. Short week flag (4 pts)
  const isShortWeek = prop.is_back_to_back ?? false;
  const shortWeekScore = (!isShortWeek ? 1 : 0.3) * 4;
  criteria.push({
    label: 'Rest / Schedule',
    score: parseFloat(shortWeekScore.toFixed(2)),
    maxScore: 4,
    tip: isShortWeek ? 'Short week — fatigue risk' : 'Full rest',
  });

  // 10. Target share / usage (5 pts) — PPR-adjusted: target share worth more in PPR
  const pprMult = pprMultiplier(position, s);
  const usageMax = 5 * pprMult;
  let usageScore = 0.5 * usageMax;
  let usageTip = 'Usage data unavailable';
  if (position === 'RB' && snapPct != null) {
    usageScore = clamp(snapPct / 0.70, 0, 1) * usageMax;
    usageTip = `Snap pct ${Math.round(snapPct * 100)}% (${s.scoring === 'ppr' ? 'PPR boost' : s.scoring === 'half_ppr' ? 'Half PPR' : 'Standard'})`;
  } else if (targetShare != null) {
    usageScore = clamp(targetShare / 0.25, 0, 1) * usageMax;
    usageTip = `Target share ${Math.round(targetShare * 100)}% (${s.scoring === 'ppr' ? 'PPR boost applied' : s.scoring === 'half_ppr' ? 'Half PPR' : 'Standard'})`;
  }
  criteria.push({
    label: `Target Share / Usage${s.recPts > 0 && position !== 'QB' ? ` (${s.scoring === 'ppr' ? 'PPR' : 'Half PPR'})` : ''}`,
    score: parseFloat(Math.min(usageScore, 7).toFixed(2)), // cap at 7 so PPR boost stays bounded
    maxScore: Math.min(parseFloat(usageMax.toFixed(1)), 7),
    tip: usageTip,
  });

  // 11. Streak – hit last 3? (3 pts)
  let streakMultiplier = 0.33;
  if (games.length >= 3) {
    const last3 = games.slice(-3);
    const hits  = last3.filter(v => v > line).length;
    streakMultiplier = hits >= 3 ? 1.0 : hits >= 2 ? 0.66 : 0.33;
  }
  const streakScore = streakMultiplier * 3;
  criteria.push({
    label: 'Recent Streak',
    score: parseFloat(streakScore.toFixed(2)),
    maxScore: 3,
    tip: prop.streak_info ?? `Hit ${Math.round(streakMultiplier * 3)} of last 3`,
  });

  const cappedUsage = Math.min(usageScore, 7);
  const tier3 = splitScore + shortWeekScore + cappedUsage + streakScore;

  // ── TIER 4 – Context (15 pts) ────────────────────────────────────────────

  // 12. Teammate injury boost (4 pts)
  const injBoostScore = (injNote ? 1.0 : 0.5) * 4;
  criteria.push({
    label: 'Teammate Injury Boost',
    score: parseFloat(injBoostScore.toFixed(2)),
    maxScore: 4,
    tip: injNote ? `Boost: ${injNote}` : 'No injury boosts noted',
  });

  // 13. Blowout risk (3 pts)
  const spread = prop.spread ?? null;
  const absSpread = spread != null ? Math.abs(spread) : null;
  let blowoutScore = 0.7 * 3; // neutral default
  let blowoutTip   = 'Spread data unavailable';
  if (absSpread != null) {
    blowoutScore = (absSpread <= 7 ? 1.0 : absSpread <= 10 ? 0.7 : 0.4) * 3;
    blowoutTip   = `Spread ${spread > 0 ? '+' : ''}${spread} (abs ${absSpread})`;
  }
  criteria.push({
    label: 'Blowout Risk',
    score: parseFloat(blowoutScore.toFixed(2)),
    maxScore: 3,
    tip: blowoutTip,
  });

  // 14. Injury status (5 pts)
  let injMult = 1.0;
  if (injStatus.includes('out'))        injMult = 0.0;
  else if (injStatus.includes('doubtful'))  injMult = 0.1;
  else if (injStatus.includes('questionable')) injMult = 0.4;
  const injScore = injMult * 5;
  criteria.push({
    label: 'Injury Status',
    score: parseFloat(injScore.toFixed(2)),
    maxScore: 5,
    tip: injStatus.charAt(0).toUpperCase() + injStatus.slice(1),
  });

  // 15. Role stability (2 pts)
  const roleScore = (isStarter ? 1.0 : 0.5) * 2;
  criteria.push({
    label: 'Role Stability',
    score: parseFloat(roleScore.toFixed(2)),
    maxScore: 2,
    tip: isStarter ? 'Confirmed starter' : 'Backup / unclear role',
  });

  // 16. Trap warning (1 pt)
  const trapScore = (!trapWarning ? 1.0 : 0.3) * 1;
  criteria.push({
    label: 'Trap Warning',
    score: parseFloat(trapScore.toFixed(2)),
    maxScore: 1,
    tip: trapWarning ? 'TRAP warning active' : 'No trap warning',
  });

  const tier4 = injBoostScore + blowoutScore + injScore + roleScore + trapScore;

  // ── Format Bonus – league settings shift rankings ────────────────────────
  const fmtBonus = formatBonus(position, prop.prop_type, s);
  if (fmtBonus > 0) {
    const tags = [
      s.scoring !== 'standard' ? (s.scoring === 'ppr' ? 'PPR' : '½PPR') : null,
      position === 'TE' && s.tePremium ? 'TE+' : null,
      position === 'QB' && s.superflex ? 'SF' : null,
      position === 'QB' && s.passTDPts === 6 ? '6PT TD' : null,
      position === 'QB' && !s.superflex && s.flexType === 'RB/WR/TE/QB' ? 'QB Flex' : null,
      position === 'TE' && ['RB/WR/TE','RB/WR/TE/QB'].includes(s.flexType) ? 'TE Flex' : null,
    ].filter(Boolean).join(' · ');
    criteria.push({
      label: `Format Bonus (${tags})`,
      score: parseFloat(fmtBonus.toFixed(2)),
      maxScore: fmtBonus,
      tip: `+${fmtBonus.toFixed(1)} pts from your league settings`,
    });
  }

  // Projected fantasy points (informational)
  const projFPts = projectedFantasyPts(prop, position, s);

  const total   = parseFloat((tier1 + tier2 + tier3 + tier4 + fmtBonus).toFixed(1));
  const grade   = letterGrade(total);
  const verdict = total >= 72 ? 'START' : total >= 52 ? 'FLEX' : 'SIT';

  const ceiling    = games.length ? Math.max(...games) : prop.projection ?? l6;
  const floor      = games.length ? Math.min(...games) : Math.max(0, l6 - (prop.projection ?? l6) * 0.5);
  const projection = prop.projection ?? l6;

  return {
    total,
    grade,
    tier1: parseFloat(tier1.toFixed(2)),
    tier2: parseFloat(tier2.toFixed(2)),
    tier3: parseFloat(tier3.toFixed(2)),
    tier4: parseFloat(tier4.toFixed(2)),
    criteria,
    verdict,
    projection,
    ceiling,
    floor,
    projFPts: parseFloat(projFPts.toFixed(1)),
    matchupRating: matchupRatingLabel(tier2),
    scoringFormat: s.scoring,
  };
}

// ─── Head-to-head comparison ─────────────────────────────────────────────────

/**
 * Returns a head-to-head comparison of 12 dimensions.
 */
export function compareStartSit(playerA, propA, playerB, propB, settings) {
  if (!playerA || !propA || !playerB || !propB) return null;
  const s = settings || getLeagueSettings();

  const scoreA = fantasyScore(playerA, propA, s);
  const scoreB = fantasyScore(playerB, propB, s);

  if (!scoreA || !scoreB) return null;

  const l6A  = propA.avg_last_10 ?? propA.line ?? 0;
  const l3A  = propA.avg_last_5  ?? l6A;
  const l6B  = propB.avg_last_10 ?? propB.line ?? 0;
  const l3B  = propB.avg_last_5  ?? l6B;

  function dim(label, vA, vB, higherWins = true) {
    let winner = 'tie';
    if (typeof vA === 'number' && typeof vB === 'number') {
      const diff = higherWins ? vA - vB : vB - vA;
      if (diff > 0.01)        winner = 'A';
      else if (diff < -0.01)  winner = 'B';
    } else if (vA !== vB) {
      winner = vA > vB ? (higherWins ? 'A' : 'B') : (higherWins ? 'B' : 'A');
    }
    return { label, valueA: vA, valueB: vB, winner };
  }

  const oppA  = playerA.opponent ?? propA.opponent ?? '';
  const oppB  = playerB.opponent ?? propB.opponent ?? '';
  const posA  = playerA.position ?? propA.position ?? 'WR';
  const posB  = playerB.position ?? propB.position ?? 'WR';
  const defKeyA = getDefStatKey(propA.prop_type, posA);
  const defKeyB = getDefStatKey(propB.prop_type, posB);
  const oppStatA = TEAM_STATS[oppA]?.[defKeyA] ?? NFL_LEAGUE_AVGS[defKeyA];
  const oppStatB = TEAM_STATS[oppB]?.[defKeyB] ?? NFL_LEAGUE_AVGS[defKeyB];

  const injA = (playerA.injury_status ?? 'healthy').toLowerCase();
  const injB = (playerB.injury_status ?? 'healthy').toLowerCase();
  function injWeight(s) {
    if (s.includes('out'))          return 0;
    if (s.includes('doubtful'))     return 1;
    if (s.includes('questionable')) return 2;
    return 3;
  }

  const isHomeA = propA.is_home ?? false;
  const isHomeB = propB.is_home ?? false;

  const dimensions = [
    dim('Fantasy Score',   scoreA.total,             scoreB.total),
    dim('Grade',           scoreA.total,             scoreB.total),           // numeric proxy for grade
    dim('Recent Form (L6)', l6A,                     l6B),
    dim('Hot Streak (L3)', l3A,                      l3B),
    dim('Hit Rate',        propA.hit_rate_last_10 ?? 50, propB.hit_rate_last_10 ?? 50),
    dim('Matchup',         oppStatA,                 oppStatB),               // higher = weaker D = better
    dim('Game Total',      propA.game_total ?? 45.5, propB.game_total ?? 45.5),
    dim('Target Share',    propA.target_share ?? 0,  propB.target_share ?? 0),
    dim('Injury Status',   injWeight(injA),           injWeight(injB)),        // higher = healthier
    dim('Home/Away',       isHomeA ? 1 : 0,          isHomeB ? 1 : 0),
    dim('Projection',      scoreA.projection,         scoreB.projection),
    dim('Ceiling',         scoreA.ceiling,            scoreB.ceiling),
  ];

  // Override grade display
  dimensions[1] = {
    label: 'Grade',
    valueA: scoreA.grade,
    valueB: scoreB.grade,
    winner: scoreA.total > scoreB.total ? 'A' : scoreA.total < scoreB.total ? 'B' : 'tie',
  };

  // Override matchup display
  dimensions[5] = {
    label: 'Matchup',
    valueA: scoreA.matchupRating,
    valueB: scoreB.matchupRating,
    winner: scoreA.tier2 > scoreB.tier2 ? 'A' : scoreA.tier2 < scoreB.tier2 ? 'B' : 'tie',
  };

  // Override injury display
  dimensions[8] = {
    label: 'Injury Status',
    valueA: (playerA.injury_status ?? 'Healthy'),
    valueB: (playerB.injury_status ?? 'Healthy'),
    winner: injWeight(injA) > injWeight(injB) ? 'A' : injWeight(injA) < injWeight(injB) ? 'B' : 'tie',
  };

  // Override home/away display
  dimensions[9] = {
    label: 'Home/Away',
    valueA: isHomeA ? 'Home' : 'Away',
    valueB: isHomeB ? 'Home' : 'Away',
    winner: (isHomeA && !isHomeB) ? 'A' : (!isHomeA && isHomeB) ? 'B' : 'tie',
  };

  const aWins = dimensions.filter(d => d.winner === 'A').length;
  const bWins = dimensions.filter(d => d.winner === 'B').length;

  const scoreDiff = Math.abs(scoreA.total - scoreB.total);
  const confidence = scoreDiff >= 12 ? 'High' : scoreDiff >= 6 ? 'Medium' : 'Low';

  const winnerKey = aWins > bWins ? 'A' : bWins > aWins ? 'B' : 'toss-up';
  const winnerName = winnerKey === 'A' ? playerA.player_name : winnerKey === 'B' ? playerB.player_name : null;

  // Build reasoning bullets
  const reasoning = [];

  if (scoreDiff >= 6) {
    const higher = scoreA.total >= scoreB.total ? { name: playerA.player_name, score: scoreA } : { name: playerB.player_name, score: scoreB };
    reasoning.push(`${higher.name} has a meaningfully higher fantasy score (${higher.score.total}) — a ${scoreDiff.toFixed(1)}-point edge.`);
  } else {
    reasoning.push(`Scores are close (${scoreA.total} vs ${scoreB.total}) — this is a genuine toss-up decision.`);
  }

  if (scoreA.tier1 !== scoreB.tier1) {
    const betterForm = scoreA.tier1 > scoreB.tier1 ? playerA.player_name : playerB.player_name;
    reasoning.push(`${betterForm} has stronger recent form based on L6/L3 averages and hit rate.`);
  }

  if (scoreA.tier2 !== scoreB.tier2) {
    const betterMatchup = scoreA.tier2 > scoreB.tier2 ? playerA.player_name : playerB.player_name;
    reasoning.push(`${betterMatchup} has the better matchup this week (${betterMatchup === playerA.player_name ? scoreA.matchupRating : scoreB.matchupRating}).`);
  }

  const injStatusA = (playerA.injury_status ?? 'healthy').toLowerCase();
  const injStatusB = (playerB.injury_status ?? 'healthy').toLowerCase();
  if (injStatusA !== injStatusB && (injStatusA !== 'healthy' || injStatusB !== 'healthy')) {
    const concern = injStatusA !== 'healthy' ? playerA.player_name : playerB.player_name;
    const status  = injStatusA !== 'healthy' ? injStatusA : injStatusB;
    reasoning.push(`Injury concern: ${concern} is listed as ${status} — factor in closer to game time.`);
  }

  if (winnerName) {
    reasoning.push(`Recommendation: Start ${winnerName} with ${confidence.toLowerCase()} confidence.`);
  } else {
    reasoning.push(`Too close to call — go with the player in the better matchup or flip a coin.`);
  }

  return {
    winner: winnerKey,
    dimensions,
    reasoning,
    confidence,
    scoreA,
    scoreB,
  };
}

// ─── Rankings ────────────────────────────────────────────────────────────────

/**
 * Returns sorted rankings of all players for a given position.
 */
export function rankPlayers(players, position = 'all', settings) {
  const s = settings || getLeagueSettings();
  const filtered = position === 'all'
    ? players
    : players.filter(p => p.position === position);

  return filtered
    .map(player => {
      const sorted = [...(player.props ?? [])].sort(
        (a, b) => (b.confidence_score ?? 0) - (a.confidence_score ?? 0)
      );
      const prop = sorted[0];
      if (!prop) return null;

      const score = fantasyScore(player, prop, s);
      return { player, prop, score };
    })
    .filter(Boolean)
    .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
}

// Waiver wire ranking — focuses on opportunity, upside, and handcuff value
export function rankWaiverWire(players, position = 'all', settings) {
  const s = settings || getLeagueSettings();
  const filtered = position === 'all'
    ? players
    : players.filter(p => p.position === position);

  return filtered
    .map(player => {
      const sorted = [...(player.props ?? [])].sort(
        (a, b) => (b.confidence_score ?? 0) - (a.confidence_score ?? 0)
      );
      const prop = sorted[0];
      if (!prop) return null;

      const base = fantasyScore(player, prop, s);

      // Waiver score boosts: opportunity tier, injury upside, handcuff value
      const opportunityBoost = player.waiver_priority === 'high' ? 15
        : player.waiver_priority === 'medium' ? 8
        : player.is_handcuff ? 5
        : 0;
      const injuryUpside = player.injury_upside ? 10 : 0;
      const waiverTotal = Math.min(100, (base?.total ?? 0) + opportunityBoost + injuryUpside);

      return {
        player,
        prop,
        score: { ...base, total: parseFloat(waiverTotal.toFixed(1)), waiverBoost: opportunityBoost + injuryUpside },
        waiverReason: player.waiver_reason ?? null,
        injuryUpside: player.injury_upside ?? null,
        isHandcuff: player.is_handcuff ?? false,
        waiverPriority: player.waiver_priority ?? 'low',
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0));
}
