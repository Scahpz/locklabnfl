import { getPrevLines } from '@/lib/liveData';
import { NFL_LEAGUE_AVGS } from '@/lib/teamStats';

// NFL-specific grading engine

function formScore(avg, line) {
  if (avg == null) return null;
  const scale = Math.max(avg, line, 1);
  return Math.max(0, Math.min(0.85, 0.5 + (avg - line) / scale));
}

function defScore(value, leagueAvg) {
  if (value == null || leagueAvg == null) return null;
  return Math.max(0, Math.min(0.85, 0.5 + (value - leagueAvg) / (leagueAvg * 0.25)));
}

function impliedProbability(odds) {
  if (odds == null) return 0.5;
  return odds < 0
    ? Math.abs(odds) / (Math.abs(odds) + 100)
    : 100 / (odds + 100);
}

// Map NFL prop type -> defensive stat key from teamStats
function getDefStatKey(propType, position) {
  if (propType === 'passing_yards' || propType === 'passing_tds' || propType === 'completions') return 'pass_yds_allowed';
  if (propType === 'rushing_yards' || propType === 'rushing_tds') return 'rush_yds_allowed';
  if (position === 'TE') return 'rec_yds_allowed_te';
  if (position === 'RB') return 'rec_yds_allowed_rb';
  return 'rec_yds_allowed_wr'; // WR default for receiving props
}

function getDefStatLabel(propType, position) {
  if (propType === 'passing_yards' || propType === 'passing_tds') return 'Pass Yds Allowed';
  if (propType === 'rushing_yards' || propType === 'rushing_tds') return 'Rush Yds Allowed';
  if (position === 'TE') return 'TE Rec Yds Allowed';
  if (position === 'RB') return 'RB Rec Yds Allowed';
  return 'WR Rec Yds Allowed';
}

export function gradeProp(prop) {
  const hasContext = prop.opponent_def_rating != null || prop.has_analytics
    || !!prop.opponent || prop.data_unavailable === true;
  if (prop.has_analytics || hasContext) return gradeWithContext(prop);
  return gradeFromMarket(prop);
}

function gradeWithContext(prop) {
  const line    = prop.line;
  const l10     = prop.avg_last_10;
  const l5      = prop.avg_last_5;
  const hit     = prop.hit_rate_last_10;
  const noData  = prop.data_unavailable === true;
  const pendingLabel  = (loading, unavail) => noData ? unavail : loading;
  const pendingDetail = (loading, unavail) => noData ? unavail : loading;

  const propType   = prop.prop_type;
  const position   = prop.position;
  const spread     = prop.spread;
  const gameTotal  = prop.game_total;
  const isB2B      = prop.is_back_to_back ?? false;
  const injNote    = prop.injury_context;
  const injCount   = prop.injury_count ?? 0;
  const ownInjStatus = (prop.injury_status || '').toLowerCase();
  const isReturning  = ['questionable','probable','game time decision','gtd','dtd','day-to-day','day to day'].some(s => ownInjStatus.includes(s));
  const edge         = prop.edge;

  const criteria = [];

  // -- 1. MATCHUP / OPPONENT DEFENSE (weight 18) --------------------------------
  const defStatKey   = getDefStatKey(propType, position);
  const defStatLabel = getDefStatLabel(propType, position);
  const leagueAvg    = NFL_LEAGUE_AVGS[defStatKey];
  const oppDefStat   = prop.opp_def_stat ?? null;

  criteria.push({
    label: oppDefStat != null
      ? `${defStatLabel}: opp allows ${oppDefStat} (avg ${leagueAvg}) — ${oppDefStat > leagueAvg ? 'weak (OVER)' : 'elite (UNDER)'}`
      : 'Opponent Defense — loading...',
    detail: oppDefStat != null
      ? oppDefStat > leagueAvg
        ? `Defense allows ${oppDefStat} ${defStatLabel.toLowerCase()} per game (avg ${leagueAvg}) — favorable matchup`
        : `Defense limits to ${oppDefStat} per game (avg ${leagueAvg}) — tough matchup`
      : 'Fetching opponent defensive stats',
    pass:            oppDefStat != null && oppDefStat > leagueAvg,
    continuousScore: oppDefStat != null ? defScore(oppDefStat, leagueAvg) : null,
    weight:          18,
    available:       oppDefStat != null,
    pending:         oppDefStat == null,
    category:        'matchup',
  });

  // -- 2. GAME TOTAL (weight 6) -------------------------------------------------
  const AVG_TOTAL = 45.5;
  const highScoring = gameTotal != null && gameTotal >= AVG_TOTAL;
  criteria.push({
    label: gameTotal != null
      ? `Game Total: ${gameTotal} (avg ${AVG_TOTAL}) — ${highScoring ? 'high-scoring' : 'low-scoring'}`
      : 'Game Total — no data',
    detail: gameTotal != null
      ? highScoring
        ? `O/U ${gameTotal} — high-scoring game, more opportunities for skill players`
        : `O/U ${gameTotal} — low-total game, fewer scoring chances`
      : 'No game total available — factor excluded from score',
    pass:            highScoring,
    continuousScore: gameTotal != null ? formScore(gameTotal, AVG_TOTAL) : null,
    weight:          6,
    available:       gameTotal != null,
    pending:         gameTotal == null,
    category:        'matchup',
  });

  // -- 3. RECENT FORM — L10 (weight 22) -----------------------------------------
  criteria.push({
    label: l10 != null
      ? `L10 Avg: ${l10} vs Line ${line}`
      : pendingLabel('L10 Average — loading game logs...', 'L10 Average — not available'),
    detail: l10 != null
      ? l10 > line
        ? `Averaging ${l10} over last 10 games — beats the line by +${(l10 - line).toFixed(1)}`
        : `Averaging ${l10} over last 10 — below line by ${(line - l10).toFixed(1)}`
      : pendingDetail('Game log data loading', 'Prior-season stats unavailable for this prop type'),
    pass:            l10 != null && l10 > line,
    continuousScore: formScore(l10, line),
    weight:          22,
    available:       l10 != null,
    pending:         l10 == null && !noData,
    category:        'form',
  });

  // -- 4. RECENT FORM — L5 (weight 13) ------------------------------------------
  criteria.push({
    label: l5 != null
      ? `L5 Avg: ${l5} vs Line ${line}`
      : pendingLabel('L5 Average — loading...', 'L5 Average — not available'),
    detail: l5 != null
      ? l5 > line
        ? `Hot recent form — L5 avg ${l5} beats the line`
        : `Cold stretch — L5 avg ${l5} below line`
      : pendingDetail('Loading', 'Stats unavailable'),
    pass:            l5 != null && l5 > line,
    continuousScore: formScore(l5, line),
    weight:          13,
    available:       l5 != null,
    pending:         l5 == null && !noData,
    category:        'form',
  });

  // -- 5. HIT RATE (weight 12) --------------------------------------------------
  criteria.push({
    label: hit != null
      ? `Hit Rate: ${hit}% (need ≥ 60%)`
      : pendingLabel('Hit Rate — loading...', 'Hit Rate — not available'),
    detail: hit != null
      ? hit >= 60
        ? `Cleared this line ${hit}% of last 10 games — highly consistent`
        : `Only ${hit}% hit rate — inconsistent`
      : pendingDetail('Loading', 'Stats unavailable'),
    pass:            hit != null && hit >= 60,
    continuousScore: hit != null ? Math.min(0.85, hit / 100) : null,
    weight:          12,
    available:       hit != null,
    pending:         hit == null && !noData,
    category:        'form',
  });

  // -- 6. SEASON STATS (weight 7) -----------------------------------------------
  const seasonAvg   = prop.season_avg;
  const seasonGames = prop.season_games;
  criteria.push({
    label: seasonAvg != null
      ? `Season Avg: ${seasonAvg} vs Line ${line} (${seasonGames}G)`
      : pendingLabel('Season Stats — loading...', 'Season Stats — not available'),
    detail: seasonAvg != null
      ? seasonAvg > line
        ? `Season average ${seasonAvg} clears the line — consistent production all season`
        : `Season average ${seasonAvg} is below the line`
      : 'Season average unavailable',
    pass:            seasonAvg != null && seasonAvg > line,
    continuousScore: formScore(seasonAvg, line),
    weight:          7,
    available:       seasonAvg != null,
    pending:         seasonAvg == null && !noData,
    category:        'season',
  });

  // -- 7. TARGET SHARE / USAGE (weight 8) ----------------------------------------
  const targetShare = prop.target_share;
  if (injNote) {
    const injWeight = Math.min(8, injCount >= 2 ? 8 : 6);
    criteria.push({
      label: `Usage Boost: ${injNote}`,
      detail: `${injNote} out — expanded role, more targets/carries expected`,
      pass: true, continuousScore: 0.85, weight: injWeight, available: true, category: 'usage',
    });
  } else if (targetShare != null) {
    const HIGH_TARGET_SHARE = 0.20;
    criteria.push({
      label: `Target Share: ${Math.round(targetShare * 100)}% (need ≥ 20%)`,
      detail: targetShare >= HIGH_TARGET_SHARE
        ? `${Math.round(targetShare * 100)}% target share — strong passing game role`
        : `Only ${Math.round(targetShare * 100)}% target share — limited looks`,
      pass: targetShare >= HIGH_TARGET_SHARE,
      continuousScore: Math.min(0.85, targetShare / HIGH_TARGET_SHARE * 0.5 + 0.2),
      weight: 8,
      available: true,
      category: 'usage',
    });
  } else {
    // No target share or injury data — neutral signal, not negative
    const edgeScale = Math.max(Math.abs(l10 ?? line ?? 1), 1);
    const edgeContinuousScore = edge != null
      ? Math.min(0.85, Math.max(0.15, 0.5 + edge / edgeScale))
      : 0.5;
    criteria.push({
      label: edge != null ? `Model Edge: ${edge > 0 ? '+' : ''}${edge}` : 'Usage: Normal snap count',
      detail: edge != null && edge > 0
        ? `Model projects +${edge} above the line`
        : 'No major lineup changes — normal role expected',
      pass: edge != null ? edge > 0 : true, // neutral snap count is not a negative
      continuousScore: edgeContinuousScore,
      weight: 8,
      available: true,
      category: 'usage',
    });
  }

  // -- 8. SPREAD / BLOWOUT RISK (weight 8) ----------------------------------------
  const absSpread    = spread != null ? Math.abs(spread) : null;
  const blowoutRisk  = absSpread != null && absSpread >= 10;
  const spreadScore  = absSpread != null ? Math.min(0.85, Math.max(0.15, 0.62 - absSpread / 18)) : null;
  criteria.push({
    label: absSpread != null
      ? blowoutRisk
        ? `Blowout Risk: ${absSpread.toFixed(1)}-pt spread`
        : `Spread: ${spread > 0 ? '+' : ''}${spread.toFixed(1)} — competitive`
      : 'Spread — no data',
    detail: absSpread != null
      ? blowoutRisk
        ? `${absSpread}-pt spread — risk of garbage time limiting starter usage`
        : 'Competitive game — full usage expected'
      : 'No spread data — factor excluded from score',
    pass:            absSpread != null && !blowoutRisk,
    continuousScore: spreadScore,
    weight:          8,
    available:       absSpread != null, // only count when we have real data
    pending:         absSpread == null,
    category:        'rest',
  });

  // -- 9. REST (weight 6) --------------------------------------------------------
  criteria.push({
    label: isB2B ? 'Short Week (Thursday Game)' : 'Rest: Normal week',
    detail: isB2B ? 'Short week — reduced prep time and fatigue risk' : 'Full week of prep — no schedule concerns',
    pass:      !isB2B,
    continuousScore: isB2B ? 0.25 : 0.75,
    weight:    6,
    available: true,
    category:  'rest',
  });

  if (isReturning) {
    const statusLabel = ownInjStatus.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    criteria.push({
      label:           `Injury Status: ${statusLabel}`,
      detail:          `Listed as ${statusLabel} — may play on a snap limit or be a late scratch`,
      pass:            false,
      continuousScore: 0.2,
      weight:          14,
      available:       true,
      category:        'rest',
    });
  }

  // -- HOME/AWAY SPLIT ----------------------------------------------------------
  const homeAvg = prop.home_avg;
  const awayAvg = prop.away_avg;
  if (homeAvg != null || awayAvg != null) {
    const isHome   = prop.is_home ?? false;
    const splitAvg = isHome ? (homeAvg ?? awayAvg) : (awayAvg ?? homeAvg);
    const splitHR  = isHome ? (prop.home_hit_rate ?? prop.away_hit_rate) : (prop.away_hit_rate ?? prop.home_hit_rate);
    const splitG   = isHome ? (prop.home_games_count ?? 0) : (prop.away_games_count ?? 0);
    const locLabel = isHome ? 'Home' : 'Away';
    criteria.push({
      label: splitAvg != null
        ? `${locLabel} Splits: ${splitAvg} avg, ${splitHR ?? '?'}% hit rate (${splitG}G)`
        : `${locLabel} Splits — insufficient data`,
      detail: splitAvg != null
        ? splitAvg > line
          ? `${locLabel} avg of ${splitAvg} exceeds the line — strong ${locLabel.toLowerCase()} performer`
          : `${locLabel} avg of ${splitAvg} is below the line`
        : `Not enough ${locLabel.toLowerCase()} games`,
      pass:            splitAvg != null && splitAvg > line,
      continuousScore: splitAvg != null ? formScore(splitAvg, line) : null,
      weight:          10,
      available:       splitAvg != null,
      pending:         false,
      category:        'form',
    });
  }

  // -- H2H VS TONIGHT'S OPPONENT -----------------------------------------------
  const allGameLogs = prop.game_logs_last_20 || prop.game_logs_last_10 || [];
  const opponent    = prop.opponent || '';
  const h2hGames    = allGameLogs.filter(g => g.opp === opponent);
  if (h2hGames.length >= 2) {
    const h2hVals = h2hGames.map(g => g.value);
    const h2hAvg  = Math.round(h2hVals.reduce((s, v) => s + v, 0) / h2hVals.length * 10) / 10;
    const h2hHits = h2hVals.filter(v => v > line).length;
    const h2hHR   = Math.round(h2hHits / h2hVals.length * 100);
    criteria.push({
      label:  `H2H vs ${opponent}: ${h2hAvg} avg, ${h2hHR}% hit rate (${h2hGames.length}G)`,
      detail: h2hAvg > line
        ? `Averaging ${h2hAvg} in ${h2hGames.length} games vs ${opponent} — strong historical matchup`
        : `Averaging only ${h2hAvg} vs ${opponent} — tough historical matchup`,
      pass:            h2hAvg > line,
      continuousScore: formScore(h2hAvg, line),
      weight:          7,
      available:       true,
      category:        'form',
    });
  }

  // -- LINE MOVEMENT -----------------------------------------------------------
  const prevLines = getPrevLines();
  const prevLine  = prevLines[`${prop.player_name}__${prop.prop_type}`];
  if (prevLine != null && prevLine !== line) {
    const diff = line - prevLine;
    const sharpOnOver = diff > 0;
    criteria.push({
      label:  `Line Movement: ${prevLine} → ${line} (${diff > 0 ? '+' : ''}${diff.toFixed(1)})`,
      detail: sharpOnOver ? `Line rose — sharp money on the OVER` : `Line fell — sharp money on the UNDER`,
      pass:      sharpOnOver,
      continuousScore: sharpOnOver ? 0.75 : 0.25,
      weight:    8,
      available: true,
      category:  'matchup',
    });
  }

  // -- SCORING -----------------------------------------------------------------
  // De-vig market probability as baseline anchor
  const rawOver  = impliedProbability(prop.over_odds ?? -110);
  const rawUnder = impliedProbability(prop.under_odds ?? -110);
  const marketProb = rawOver / (rawOver + rawUnder); // true market prob, 0-1

  // Completeness: fraction of total possible weight that has real data
  const totalPossibleWeight = criteria.reduce((s, c) => s + c.weight, 0) || 100;
  const availableCriteria   = criteria.filter(c => c.available);
  const availableWeight     = availableCriteria.reduce((s, c) => s + c.weight, 0);
  const completeness        = availableWeight / totalPossibleWeight; // 0-1

  // Model score from available factors only; individual contribution capped at 85%
  const modelScore = availableWeight > 0
    ? availableCriteria.reduce((sum, c) => {
        const cs = c.continuousScore != null ? c.continuousScore : (c.pass ? 0.85 : 0.15);
        return sum + cs * c.weight;
      }, 0) / availableWeight
    : marketProb;

  // Blend: when completeness is low, shrink toward market to avoid false confidence
  const overProb = completeness * modelScore + (1 - completeness) * marketProb;

  // Per-factor display score
  criteria.forEach(c => {
    const cs = c.continuousScore != null ? c.continuousScore : (c.pass ? 0.85 : 0.15);
    c.factorScore = c.available ? Math.round(cs * c.weight * 10) / 10 : null;
  });

  // Confidence: how far the model is from 50/50 (max 100)
  const rawConf = Math.round(50 + Math.abs(overProb - 0.5) * 100);

  // Cap based on data completeness — never show A grades when most factors are missing
  const confCap = completeness < 0.25 ? 62
                : completeness < 0.45 ? 70
                : completeness < 0.65 ? 80
                : 98;
  const confidence = Math.min(confCap, rawConf);

  const lean      = overProb >= 0.5 ? 'OVER' : 'UNDER';
  const verdict   = confidence < 60 ? 'UNSAFE' : lean;
  const passCount = availableCriteria.filter(c => c.pass).length;
  const hasRealData = l10 != null;

  return {
    verdict,
    confidence,
    criteria,
    passCount,
    lean,
    overProb:     Math.round(overProb * 100),
    underProb:    Math.round((1 - overProb) * 100),
    completeness: Math.round(completeness * 100),
    totalCriteria: criteria.length,
    dataQuality:   hasRealData ? 'full' : completeness > 0.35 ? 'context' : 'market',
    overScore:     overProb,
    totalWeight:   totalPossibleWeight,
  };
}

function gradeFromMarket(prop) {
  const overOdds  = prop.over_odds  ?? -110;
  const underOdds = prop.under_odds ?? -110;
  const rawOver   = impliedProbability(overOdds);
  const rawUnder  = impliedProbability(underOdds);
  const trueOver  = rawOver / (rawOver + rawUnder);

  const criteria = [
    { label: `Market Implied OVER: ${(trueOver * 100).toFixed(0)}%`, detail: 'De-vigged from market odds', pass: trueOver > 0.505, weight: 100, available: true, market: true, category: 'market' },
    { label: 'Opponent Defense — loading...',      detail: 'Fetching defensive stats',    pass: false, weight: 0, available: false, pending: true, category: 'matchup' },
    { label: 'L10 / L5 Game Averages — loading...', detail: 'Game log data loading',       pass: false, weight: 0, available: false, pending: true, category: 'form' },
    { label: 'Season Stats — loading...',          detail: 'Season average loading',       pass: false, weight: 0, available: false, pending: true, category: 'season' },
    { label: 'Target Share / Usage — loading...',  detail: 'Checking snap counts',         pass: false, weight: 0, available: false, pending: true, category: 'usage' },
    { label: 'Spread / Game Total — loading...',   detail: 'Fetching spread and total',    pass: false, weight: 0, available: false, pending: true, category: 'rest' },
  ];

  criteria.forEach(c => {
    c.factorScore = c.available ? (c.pass ? Math.round(c.weight * 0.85 * 10) / 10 : Math.round(trueOver * c.weight * 10) / 10) : null;
  });

  const confidence = Math.min(54, Math.round(50 + Math.abs(trueOver - 0.5) * 100));
  const lean = trueOver >= 0.5 ? 'OVER' : 'UNDER';
  return {
    verdict: lean, confidence, criteria, passCount: trueOver > 0.505 ? 1 : 0,
    lean,
    overProb:     Math.round(trueOver * 100),
    underProb:    Math.round((1 - trueOver) * 100),
    completeness: 0,
    totalCriteria: 6,
    dataQuality:  'market',
    overScore:    trueOver,
    totalWeight:  100,
  };
}

export function rankScore(prop) {
  const logs = prop.last_10_games || [];
  let p = prop;
  if (logs.length > 0) {
    const hitCount = logs.filter(v => v > prop.line).length;
    const dynamicHitRate = Math.round(hitCount / logs.length * 100);
    const base = prop.projection ?? prop.avg_last_10 ?? null;
    const dynamicEdge = base != null ? Math.round((base - prop.line) * 100) / 100 : prop.edge;
    p = { ...prop, hit_rate_last_10: dynamicHitRate, edge: dynamicEdge };
  }
  const grade = gradeProp(p);
  const base  = grade.dataQuality === 'full' ? 1000 : grade.dataQuality === 'context' ? 500 : 0;
  return base + grade.confidence;
}
