import { getPrevLines } from '@/lib/liveData';
import { NFL_LEAGUE_AVGS, QB_TIER, QB_TIER_SCORE } from '@/lib/teamStats';

// ── Helper functions ──────────────────────────────────────────────────────────

// Exponentially weighted moving average (vals[0] = most recent, highest weight)
function ewmaAvg(vals, decay = 0.18) {
  if (!vals?.length) return null;
  let wSum = 0, vSum = 0;
  vals.forEach((v, i) => {
    const w = Math.exp(-decay * i);
    vSum += v * w;
    wSum += w;
  });
  return Math.round(vSum / wSum * 10) / 10;
}

// Consistency metrics: std dev and coefficient of variation from raw game logs
export function calcConsistency(vals) {
  if (!vals || vals.length < 4) return null;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  if (mean < 1) return null;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
  const stdDev = Math.sqrt(variance);
  return { stdDev: Math.round(stdDev * 10) / 10, cv: stdDev / mean };
}

// Position group classifier — drives weight adjustments
function posGroup(propType, position) {
  const pos = (position || '').toUpperCase();
  const isQBProp  = ['passing_yards','passing_tds','completions','passing_ints','pass_rush_yards'].includes(propType);
  const isRushProp = ['rushing_yards','rushing_tds','rushing_attempts'].includes(propType);
  const isRecProp  = ['receiving_yards','receptions','receiving_tds','rush_rec_yards','rush_rec_tds'].includes(propType);
  if (isQBProp) return 'QB';
  if (isRushProp) return 'RB_RUSH';
  if (isRecProp && pos === 'TE') return 'TE';
  if (isRecProp && pos === 'RB') return 'RB_REC';
  if (isRecProp) return 'WR';
  return 'FLEX';
}

// Continuous defensive quality score using z-score (replaces binary above/below avg)
// Positive oppDefStat means defense allows MORE = weaker = favors OVER
function defPercentileScore(oppDefStat, leagueAvg) {
  if (oppDefStat == null || leagueAvg == null) return null;
  const sd = leagueAvg * 0.115; // ~11.5% CV is typical across NFL team stats
  const z  = (oppDefStat - leagueAvg) / sd;
  // z > 0 (allows more than avg) → higher OVER score; z < 0 → lower score
  return Math.min(0.85, Math.max(0.15, 0.5 + z * 0.19));
}

// Position-specific weight multipliers per factor category
const POS_MULT = {
  QB:      { oppDef: 1.20, gameTotal: 1.50, formL10: 1.00, formL5: 1.00, hitRate: 1.00, season: 0.90, spread: 1.50, usage: 0.30, weather: 1.50, airYards: 0.00, splits: 1.00, h2h: 0.80, epa: 1.00, lineMove: 1.10, consistency: 0.80, qbQuality: 0.00 },
  RB_RUSH: { oppDef: 1.30, gameTotal: 0.50, formL10: 1.00, formL5: 1.10, hitRate: 1.10, season: 0.90, spread: 1.60, usage: 1.30, weather: 0.60, airYards: 0.00, splits: 1.20, h2h: 1.00, epa: 0.90, lineMove: 1.00, consistency: 1.00, qbQuality: 0.00 },
  RB_REC:  { oppDef: 1.00, gameTotal: 1.10, formL10: 1.00, formL5: 1.00, hitRate: 1.00, season: 0.90, spread: 1.00, usage: 1.40, weather: 0.80, airYards: 0.80, splits: 1.00, h2h: 0.90, epa: 1.00, lineMove: 1.00, consistency: 1.00, qbQuality: 0.60 },
  WR:      { oppDef: 1.20, gameTotal: 1.20, formL10: 1.00, formL5: 1.00, hitRate: 1.00, season: 0.90, spread: 0.80, usage: 1.50, weather: 1.10, airYards: 1.40, splits: 1.10, h2h: 1.00, epa: 1.00, lineMove: 1.10, consistency: 1.00, qbQuality: 1.00 },
  TE:      { oppDef: 1.20, gameTotal: 1.00, formL10: 1.00, formL5: 1.00, hitRate: 1.00, season: 0.90, spread: 0.80, usage: 1.40, weather: 0.90, airYards: 1.10, splits: 1.00, h2h: 1.00, epa: 1.00, lineMove: 1.00, consistency: 1.00, qbQuality: 0.80 },
  FLEX:    {},
};

function adjW(base, category, pg) {
  const m = (POS_MULT[pg] || {})[category] ?? 1.0;
  return m === 0 ? 0 : Math.max(1, Math.round(base * m));
}

function formScore(avg, line) {
  if (avg == null) return null;
  const scale = Math.max(avg, line, 1);
  return Math.max(0, Math.min(0.85, 0.5 + (avg - line) / scale));
}

function impliedProbability(odds) {
  if (odds == null) return 0.5;
  return odds < 0
    ? Math.abs(odds) / (Math.abs(odds) + 100)
    : 100 / (odds + 100);
}

function getDefStatKey(propType, position) {
  // TD props use TD-allowed per game, not yardage
  if (propType === 'passing_tds') return 'pass_tds_allowed';
  if (propType === 'rushing_tds') return 'rush_tds_allowed';
  if (propType === 'receiving_tds' || propType === 'rush_rec_tds') return 'rec_tds_allowed';
  // Yardage / volume props
  if (propType === 'passing_yards' || propType === 'completions' || propType === 'pass_rush_yards') return 'pass_yds_allowed';
  if (propType === 'rushing_yards' || propType === 'rushing_attempts') return 'rush_yds_allowed';
  if (position === 'TE') return 'rec_yds_allowed_te';
  if (position === 'RB') return 'rec_yds_allowed_rb';
  return 'rec_yds_allowed_wr';
}

function getDefStatLabel(propType, position) {
  if (propType === 'passing_tds') return 'Pass TDs Allowed/G';
  if (propType === 'rushing_tds') return 'Rush TDs Allowed/G';
  if (propType === 'receiving_tds' || propType === 'rush_rec_tds') return 'Rec TDs Allowed/G';
  if (propType === 'passing_yards' || propType === 'completions') return 'Pass Yds/G';
  if (propType === 'rushing_yards' || propType === 'rushing_attempts') return 'Rush Yds/G';
  if (position === 'TE') return 'TE Rec Yds/G';
  if (position === 'RB') return 'RB Rec Yds/G';
  return 'WR Rec Yds/G';
}

export function gradeProp(prop) {
  const hasContext = prop.opponent_def_rating != null || prop.has_analytics
    || !!prop.opponent || prop.data_unavailable === true;
  if (prop.has_analytics || hasContext) return gradeWithContext(prop);
  return gradeFromMarket(prop);
}

function gradeWithContext(prop) {
  const line = prop.line;
  const noData = prop.data_unavailable === true;

  const propType = prop.prop_type;
  const position = prop.position;
  const pg       = posGroup(propType, position); // position group for weight adjustments

  // ── Raw game logs → EWMA & variance ──────────────────────────────────────────
  const rawLogs = prop.last_10_games || [];
  const hasLogs = rawLogs.length >= 3;

  // Use EWMA when we have raw logs; fall back to flat avg
  const l10     = hasLogs ? ewmaAvg(rawLogs) : prop.avg_last_10;
  const l5      = hasLogs ? ewmaAvg(rawLogs.slice(0, 5)) : prop.avg_last_5;
  const flatL10 = prop.avg_last_10; // used for display alongside EWMA label
  const hasEWMA = hasLogs && l10 != null;

  const hit       = prop.hit_rate_last_10;
  const spread    = prop.spread;
  const gameTotal = prop.game_total;
  const isB2B     = prop.is_back_to_back ?? false;
  const injNote   = prop.injury_context;
  const injCount  = prop.injury_count ?? 0;
  const ownInjStatus = (prop.injury_status || '').toLowerCase();
  const isReturning  = ['questionable','probable','game time decision','gtd','dtd','day-to-day','day to day'].some(s => ownInjStatus.includes(s));
  const edge = prop.edge;

  // Consistency: coefficient of variation from raw logs
  const cons = calcConsistency(rawLogs);

  const criteria = [];

  // ── 1. OPPONENT DEFENSE (DVOA-like percentile scoring) ── weight adj by position
  const defStatKey   = getDefStatKey(propType, position);
  const defStatLabel = getDefStatLabel(propType, position);
  const leagueAvg    = NFL_LEAGUE_AVGS[defStatKey];
  const oppDefStat   = prop.opp_def_stat ?? null;
  const defPctScore  = defPercentileScore(oppDefStat, leagueAvg);
  const defW         = adjW(18, 'oppDef', pg);

  if (defW > 0) {
    const defTierLabel = oppDefStat != null
      ? defPctScore >= 0.70 ? 'weak (bottom-5)'
        : defPctScore >= 0.58 ? 'below avg'
        : defPctScore >= 0.42 ? 'average'
        : defPctScore >= 0.30 ? 'above avg'
        : 'elite (top-5)'
      : null;
    criteria.push({
      label: oppDefStat != null
        ? `Opponent Defense (${defStatLabel}): ${oppDefStat}/g — ${defTierLabel}`
        : 'Opponent Defense — loading...',
      detail: oppDefStat != null
        ? defPctScore >= 0.58
          ? `Allows ${oppDefStat} ${defStatLabel} (league avg ${leagueAvg}) — favorable matchup`
          : `Limits to ${oppDefStat} ${defStatLabel} (avg ${leagueAvg}) — tough matchup`
        : 'Fetching opponent defensive stats',
      pass:            oppDefStat != null && oppDefStat > leagueAvg,
      continuousScore: defPctScore,
      weight:          defW,
      available:       oppDefStat != null,
      pending:         oppDefStat == null,
      category:        'matchup',
    });
  }

  // ── 2. GAME TOTAL (O/U) ── QB & weather-sensitive props weighted higher
  const AVG_TOTAL   = 45.5;
  const highScoring = gameTotal != null && gameTotal >= AVG_TOTAL;
  const totalW      = adjW(6, 'gameTotal', pg);
  if (totalW > 0) {
    criteria.push({
      label: gameTotal != null
        ? `Game Total: O/U ${gameTotal} (avg ${AVG_TOTAL}) — ${highScoring ? 'high-scoring' : 'low-scoring'}`
        : 'Game Total — no data',
      detail: gameTotal != null
        ? highScoring
          ? `O/U ${gameTotal} — high-scoring game, more skill-player opportunities`
          : `O/U ${gameTotal} — low total, fewer volume opportunities`
        : 'No game total available',
      pass:            highScoring,
      continuousScore: gameTotal != null ? formScore(gameTotal, AVG_TOTAL) : null,
      weight:          totalW,
      available:       gameTotal != null,
      pending:         gameTotal == null,
      category:        'matchup',
    });
  }

  // ── 3. RECENT FORM — L10 EWMA (recency-weighted) ─────────────────────────────
  const formL10W = adjW(22, 'formL10', pg);
  criteria.push({
    label: l10 != null
      ? hasEWMA
        ? `L10 Weighted Avg: ${l10} vs Line ${line}${flatL10 !== l10 ? ` (flat ${flatL10})` : ''}`
        : `L10 Avg: ${l10} vs Line ${line}`
      : noData ? 'L10 Average — not available' : 'L10 Average — loading game logs...',
    detail: l10 != null
      ? l10 > line
        ? hasEWMA
          ? `Recent-weighted avg ${l10} beats the line — recency-boosted signal`
          : `Averaging ${l10} over last 10 — beats line by +${(l10 - line).toFixed(1)}`
        : hasEWMA
          ? `Recency-weighted avg ${l10} trails the line`
          : `Averaging ${l10} over last 10 — below line by ${(line - l10).toFixed(1)}`
      : noData ? 'Prior-season stats unavailable' : 'Game log data loading',
    pass:            l10 != null && l10 > line,
    continuousScore: formScore(l10, line),
    weight:          formL10W,
    available:       l10 != null,
    pending:         l10 == null && !noData,
    category:        'form',
  });

  // ── 4. RECENT FORM — L5 EWMA ─────────────────────────────────────────────────
  const formL5W = adjW(13, 'formL5', pg);
  criteria.push({
    label: l5 != null
      ? hasEWMA
        ? `L5 Weighted Avg: ${l5} vs Line ${line}`
        : `L5 Avg: ${l5} vs Line ${line}`
      : noData ? 'L5 Average — not available' : 'L5 Average — loading...',
    detail: l5 != null
      ? l5 > line
        ? `Hot recent form — weighted L5 avg ${l5} beats the line`
        : `Cold stretch — weighted L5 avg ${l5} below line`
      : noData ? 'Stats unavailable' : 'Loading',
    pass:            l5 != null && l5 > line,
    continuousScore: formScore(l5, line),
    weight:          formL5W,
    available:       l5 != null,
    pending:         l5 == null && !noData,
    category:        'form',
  });

  // ── 5. HIT RATE ───────────────────────────────────────────────────────────────
  const hitW = adjW(12, 'hitRate', pg);
  criteria.push({
    label: hit != null
      ? `Hit Rate: ${hit}% (threshold ≥ 60%)`
      : noData ? 'Hit Rate — not available' : 'Hit Rate — loading...',
    detail: hit != null
      ? hit >= 60
        ? `Cleared this line ${hit}% of last 10 games — highly consistent`
        : `Only ${hit}% hit rate — inconsistent performance vs this line`
      : noData ? 'Stats unavailable' : 'Loading',
    pass:            hit != null && hit >= 60,
    continuousScore: hit != null ? Math.min(0.85, hit / 100) : null,
    weight:          hitW,
    available:       hit != null,
    pending:         hit == null && !noData,
    category:        'form',
  });

  // ── 6. SEASON STATS ───────────────────────────────────────────────────────────
  const seasonAvg   = prop.season_avg;
  const seasonGames = prop.season_games;
  const seasonW     = adjW(7, 'season', pg);
  criteria.push({
    label: seasonAvg != null
      ? `Season Avg: ${seasonAvg} vs Line ${line} (${seasonGames}G)`
      : noData ? 'Season Stats — not available' : 'Season Stats — loading...',
    detail: seasonAvg != null
      ? seasonAvg > line
        ? `Season average ${seasonAvg} clears the line`
        : `Season average ${seasonAvg} is below the line`
      : 'Season average unavailable',
    pass:            seasonAvg != null && seasonAvg > line,
    continuousScore: formScore(seasonAvg, line),
    weight:          seasonW,
    available:       seasonAvg != null,
    pending:         seasonAvg == null && !noData,
    category:        'season',
  });

  // ── 7. USAGE — TARGET SHARE / SNAP % (WR/TE weighted higher) ─────────────────
  const targetShare = prop.target_share;
  const snapPct     = prop.snap_pct;
  const usageW      = adjW(8, 'usage', pg);
  if (usageW > 0) {
    if (injNote) {
      const injW2 = Math.min(usageW, injCount >= 2 ? usageW : Math.round(usageW * 0.75));
      criteria.push({
        label: `Usage Boost: ${injNote}`,
        detail: `${injNote} out — expanded role, more targets/carries expected`,
        pass: true, continuousScore: 0.85, weight: injW2, available: true, category: 'usage',
      });
    } else if (targetShare != null) {
      const HIGH_TS = 0.20;
      const snapBonus = snapPct != null && snapPct >= 0.85 ? 0.05 : 0;
      criteria.push({
        label: `Target Share: ${Math.round(targetShare * 100)}%${snapPct != null ? ` · Snap: ${Math.round(snapPct * 100)}%` : ''}`,
        detail: targetShare >= HIGH_TS
          ? `${Math.round(targetShare * 100)}% target share — primary passing-game role${snapPct != null ? `, ${Math.round(snapPct * 100)}% snap rate` : ''}`
          : `Only ${Math.round(targetShare * 100)}% target share — limited involvement`,
        pass: targetShare >= HIGH_TS,
        continuousScore: Math.min(0.85, targetShare / HIGH_TS * 0.5 + 0.2 + snapBonus),
        weight: usageW, available: true, category: 'usage',
      });
    } else if (snapPct != null) {
      const highSnap = snapPct >= 0.75;
      criteria.push({
        label: `Snap Rate: ${Math.round(snapPct * 100)}% (need ≥ 75%)`,
        detail: highSnap
          ? `${Math.round(snapPct * 100)}% snap rate — full workload expected`
          : `Only ${Math.round(snapPct * 100)}% snap rate — rotational role`,
        pass: highSnap,
        continuousScore: Math.min(0.85, snapPct * 0.9 + 0.1),
        weight: usageW, available: true, category: 'usage',
      });
    } else {
      const edgeScale = Math.max(Math.abs(l10 ?? line ?? 1), 1);
      const edgeCS    = edge != null ? Math.min(0.85, Math.max(0.15, 0.5 + edge / edgeScale)) : 0.5;
      criteria.push({
        label: edge != null ? `Model Edge: ${edge > 0 ? '+' : ''}${edge}` : 'Usage: Normal role expected',
        detail: edge != null && edge > 0
          ? `Model projects +${edge} above the line`
          : 'No major lineup changes — normal role expected',
        pass: edge != null ? edge > 0 : true,
        continuousScore: edgeCS,
        weight: usageW, available: true, category: 'usage',
      });
    }
  }

  // ── 8. SPREAD / BLOWOUT RISK (RB rush props weighted highest) ────────────────
  const absSpread   = spread != null ? Math.abs(spread) : null;
  const blowoutRisk = absSpread != null && absSpread >= 10;
  const spreadScore = absSpread != null ? Math.min(0.85, Math.max(0.15, 0.62 - absSpread / 18)) : null;
  const spreadW     = adjW(8, 'spread', pg);
  criteria.push({
    label: absSpread != null
      ? blowoutRisk
        ? `Blowout Risk: ${absSpread.toFixed(1)}-pt spread`
        : `Spread: ${spread > 0 ? '+' : ''}${spread?.toFixed(1)} — competitive`
      : 'Spread — no data',
    detail: absSpread != null
      ? blowoutRisk
        ? `${absSpread}-pt spread — risk of garbage time limiting starter usage`
        : 'Competitive game — full usage expected'
      : 'No spread data',
    pass:            absSpread != null && !blowoutRisk,
    continuousScore: spreadScore,
    weight:          spreadW,
    available:       absSpread != null,
    pending:         absSpread == null,
    category:        'rest',
  });

  // ── 9. REST / SCHEDULE ────────────────────────────────────────────────────────
  criteria.push({
    label: isB2B ? 'Short Week (Thursday Game)' : 'Rest: Normal week',
    detail: isB2B ? 'Short week — fatigue and reduced prep risk' : 'Full week of prep — no schedule concerns',
    pass:            !isB2B,
    continuousScore: isB2B ? 0.25 : 0.75,
    weight:          6,
    available:       true,
    category:        'rest',
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

  // ── 10. WEATHER (QB & WR props weighted highest) ─────────────────────────────
  const weather = prop.weather;
  const isPassingProp = ['passing_yards','receiving_yards','receptions','passing_tds',
    'rush_rec_yards','pass_rush_yards','receiving_tds'].includes(propType);
  const weatherW = adjW(5, 'weather', pg);
  if (weatherW > 0 && weather != null && isPassingProp) {
    if (weather.dome) {
      criteria.push({
        label: 'Weather: Indoor stadium',
        detail: 'Controlled environment — no weather suppression',
        pass: true, continuousScore: 0.75, weight: weatherW, available: true, category: 'matchup',
      });
    } else if (weather.wind_mph != null) {
      const veryWindy = weather.wind_mph > 25;
      const windy     = weather.wind_mph > 15;
      const rainy     = weather.is_rainy;
      criteria.push({
        label: `Weather: ${weather.wind_mph} mph wind${rainy ? ', rain' : ''}${weather.temp_f != null ? `, ${weather.temp_f}°F` : ''}`,
        detail: veryWindy
          ? `Severe wind (${weather.wind_mph} mph) — significantly suppresses passing`
          : windy
          ? `Wind (${weather.wind_mph} mph) — may limit deep routes and kicking`
          : 'Favorable conditions',
        pass:            !windy,
        continuousScore: veryWindy ? 0.10 : windy ? 0.25 : rainy ? 0.60 : 0.80,
        weight:          weatherW,
        available:       true,
        category:        'matchup',
      });
    }
  }

  // ── 11. AIR YARDS SHARE / aDOT (WR/TE weighted higher) ───────────────────────
  const adot = prop.adot;
  const isRecPropType = ['receiving_yards','receptions','receiving_tds','rush_rec_yards','rush_rec_tds'].includes(propType);
  const airW = adjW(4, 'airYards', pg);
  if (airW > 0 && adot != null && isRecPropType) {
    const highAY = adot >= 20;
    criteria.push({
      label: `Air Yards Share: ${adot.toFixed(0)}% (need ≥ 20%)`,
      detail: highAY
        ? `${adot.toFixed(0)}% of team air yards — primary downfield target`
        : `Only ${adot.toFixed(0)}% of team air yards — underneath/limited aerial role`,
      pass:            highAY,
      continuousScore: Math.min(0.85, Math.max(0.15, adot / 20 * 0.5 + 0.2)),
      weight:          airW,
      available:       true,
      category:        'usage',
    });
  }

  // ── 12. HOME / AWAY SPLITS ────────────────────────────────────────────────────
  const homeAvg = prop.home_avg;
  const awayAvg = prop.away_avg;
  if (homeAvg != null || awayAvg != null) {
    const isHome   = prop.is_home ?? false;
    const splitAvg = isHome ? (homeAvg ?? awayAvg) : (awayAvg ?? homeAvg);
    const splitHR  = isHome ? (prop.home_hit_rate ?? prop.away_hit_rate) : (prop.away_hit_rate ?? prop.home_hit_rate);
    const splitG   = isHome ? (prop.home_games_count ?? 0) : (prop.away_games_count ?? 0);
    const locLabel = isHome ? 'Home' : 'Away';
    const splitsW  = adjW(10, 'splits', pg);
    criteria.push({
      label: splitAvg != null
        ? `${locLabel} Splits: ${splitAvg} avg, ${splitHR ?? '?'}% hit rate (${splitG}G)`
        : `${locLabel} Splits — insufficient data`,
      detail: splitAvg != null
        ? splitAvg > line
          ? `${locLabel} avg of ${splitAvg} exceeds the line — strong ${locLabel.toLowerCase()} performer`
          : `${locLabel} avg of ${splitAvg} is below the line`
        : `Not enough ${locLabel.toLowerCase()} games to assess split`,
      pass:            splitAvg != null && splitAvg > line,
      continuousScore: splitAvg != null ? formScore(splitAvg, line) : null,
      weight:          splitsW,
      available:       splitAvg != null,
      pending:         false,
      category:        'form',
    });
  }

  // ── 13. HEAD-TO-HEAD VS TONIGHT'S OPPONENT ────────────────────────────────────
  const allGameLogs = prop.game_logs_last_20 || prop.game_logs_last_10 || [];
  const opponent    = prop.opponent || '';
  const h2hGames    = allGameLogs.filter(g => g.opp === opponent);
  const h2hW        = adjW(7, 'h2h', pg);
  if (h2hGames.length >= 2) {
    const h2hVals = h2hGames.map(g => g.value);
    const h2hAvg  = Math.round(h2hVals.reduce((s, v) => s + v, 0) / h2hVals.length * 10) / 10;
    const h2hHits = h2hVals.filter(v => v > line).length;
    const h2hHR   = Math.round(h2hHits / h2hVals.length * 100);
    criteria.push({
      label:  `H2H vs ${opponent}: ${h2hAvg} avg, ${h2hHR}% hit rate (${h2hGames.length}G)`,
      detail: h2hAvg > line
        ? `Averaging ${h2hAvg} in ${h2hGames.length} matchups vs ${opponent} — strong historical record`
        : `Averaging only ${h2hAvg} vs ${opponent} — historically tough matchup`,
      pass:            h2hAvg > line,
      continuousScore: formScore(h2hAvg, line),
      weight:          h2hW,
      available:       true,
      category:        'form',
    });
  }

  // ── 14. EPA PER GAME ──────────────────────────────────────────────────────────
  const epaPerGame = prop.epa_per_game;
  const epaW       = adjW(6, 'epa', pg);
  if (epaPerGame != null) {
    const epaScore = Math.min(0.85, Math.max(0.15, 0.5 + epaPerGame / 12));
    criteria.push({
      label: `EPA/Game: ${epaPerGame > 0 ? '+' : ''}${epaPerGame}`,
      detail: epaPerGame > 0
        ? `Averaging +${epaPerGame} EPA/game — producing above expected value`
        : `Averaging ${epaPerGame} EPA/game — below expected value`,
      pass:            epaPerGame > 0,
      continuousScore: epaScore,
      weight:          epaW,
      available:       true,
      category:        'form',
    });
  }

  // ── 15. LINE MOVEMENT ─────────────────────────────────────────────────────────
  const prevLines = getPrevLines();
  const prevLine  = prevLines[`${prop.player_name}__${prop.prop_type}`];
  const lineMoveW = adjW(8, 'lineMove', pg);
  if (prevLine != null && prevLine !== line) {
    const diff        = line - prevLine;
    const sharpOnOver = diff > 0;
    criteria.push({
      label:  `Line Movement: ${prevLine} → ${line} (${diff > 0 ? '+' : ''}${diff.toFixed(1)})`,
      detail: sharpOnOver ? 'Line rose — sharp money on the OVER' : 'Line fell — sharp money on the UNDER',
      pass:      sharpOnOver,
      continuousScore: sharpOnOver ? 0.75 : 0.25,
      weight:    lineMoveW,
      available: true,
      category:  'matchup',
    });
  }

  // ── 16. CONSISTENCY (NEW) — bonus/penalty based on floor-ceiling spread ───────
  const consW = adjW(5, 'consistency', pg);
  if (cons != null && consW > 0) {
    // CV < 0.25 = very consistent, CV > 0.55 = boom-or-bust
    const consistent  = cons.cv < 0.30;
    const boomOrBust  = cons.cv > 0.55;
    const consScore   = Math.min(0.85, Math.max(0.15, 0.75 - cons.cv * 0.85));
    criteria.push({
      label: `Consistency: ±${cons.stdDev} std dev (${consistent ? 'consistent' : boomOrBust ? 'boom-or-bust' : 'moderate variance'})`,
      detail: consistent
        ? `Low game-to-game variance (±${cons.stdDev}) — dependable floor, easier to predict`
        : boomOrBust
        ? `High variance (±${cons.stdDev}) — boom-or-bust player, harder to project`
        : `Moderate variance (±${cons.stdDev}) — some unpredictability`,
      pass:            consistent,
      continuousScore: consScore,
      weight:          consW,
      available:       true,
      category:        'form',
    });
  }

  // ── 17. QB QUALITY (NEW) — WR / TE / RB receiving props ──────────────────────
  const qbW = adjW(10, 'qbQuality', pg);
  if (qbW > 0 && prop.team) {
    const teamKey  = (prop.team || '').toUpperCase().trim();
    const qbTier   = QB_TIER[teamKey];
    const qbScore  = qbTier ? (QB_TIER_SCORE[qbTier] ?? 0.52) : null;
    const tierLabel = { elite: 'Elite', above: 'Above Average', avg: 'Average', below: 'Below Average', poor: 'Poor' };
    if (qbScore != null) {
      criteria.push({
        label: `QB Quality: ${tierLabel[qbTier] ?? 'Unknown'} (${teamKey})`,
        detail: qbTier === 'elite' || qbTier === 'above'
          ? `High-quality QB — enables consistent passing-game volume and opportunity`
          : qbTier === 'avg'
          ? `Average QB — neutral signal for receiver props`
          : `Below-average QB — suppresses receiver ceilings and target quality`,
        pass:            qbScore >= 0.52,
        continuousScore: qbScore,
        weight:          qbW,
        available:       true,
        category:        'matchup',
      });
    } else {
      criteria.push({
        label: 'QB Quality — team not found',
        detail: 'Unable to determine QB quality tier',
        pass: true, continuousScore: 0.52, weight: qbW, available: false, pending: false, category: 'matchup',
      });
    }
  }

  // ── SCORING ───────────────────────────────────────────────────────────────────
  const rawOver  = impliedProbability(prop.over_odds ?? -110);
  const rawUnder = impliedProbability(prop.under_odds ?? -110);
  const marketProb = rawOver / (rawOver + rawUnder);

  const totalPossibleWeight = criteria.reduce((s, c) => s + c.weight, 0) || 100;
  const availableCriteria   = criteria.filter(c => c.available);
  const availableWeight     = availableCriteria.reduce((s, c) => s + c.weight, 0);
  const completeness        = availableWeight / totalPossibleWeight;

  const modelScore = availableWeight > 0
    ? availableCriteria.reduce((sum, c) => {
        const cs = c.continuousScore != null ? c.continuousScore : (c.pass ? 0.85 : 0.15);
        return sum + cs * c.weight;
      }, 0) / availableWeight
    : marketProb;

  // Blend: low completeness shrinks toward market to avoid false confidence
  const overProb = completeness * modelScore + (1 - completeness) * marketProb;

  criteria.forEach(c => {
    const cs = c.continuousScore != null ? c.continuousScore : (c.pass ? 0.85 : 0.15);
    c.factorScore = c.available ? Math.round(cs * c.weight * 10) / 10 : null;
  });

  const rawConf = Math.round(50 + Math.abs(overProb - 0.5) * 100);
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
    overProb:      Math.round(overProb * 100),
    underProb:     Math.round((1 - overProb) * 100),
    completeness:  Math.round(completeness * 100),
    totalCriteria: criteria.length,
    dataQuality:   hasRealData ? 'full' : completeness > 0.35 ? 'context' : 'market',
    overScore:     overProb,
    totalWeight:   totalPossibleWeight,
    posGroup:      pg,
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
    { label: 'Opponent Defense — loading...',       detail: 'Fetching defensive stats',    pass: false, weight: 0, available: false, pending: true, category: 'matchup' },
    { label: 'L10 / L5 Game Averages — loading...', detail: 'Game log data loading',       pass: false, weight: 0, available: false, pending: true, category: 'form' },
    { label: 'Season Stats — loading...',           detail: 'Season average loading',       pass: false, weight: 0, available: false, pending: true, category: 'season' },
    { label: 'Target Share / Usage — loading...',   detail: 'Checking snap counts',         pass: false, weight: 0, available: false, pending: true, category: 'usage' },
    { label: 'Spread / Game Total — loading...',    detail: 'Fetching spread and total',    pass: false, weight: 0, available: false, pending: true, category: 'rest' },
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
    const ewma = ewmaAvg(logs);
    const dynamicEdge = ewma != null ? Math.round((ewma - prop.line) * 100) / 100 : prop.edge;
    p = { ...prop, hit_rate_last_10: dynamicHitRate, edge: dynamicEdge };
  }
  const grade = gradeProp(p);
  const base  = grade.dataQuality === 'full' ? 1000 : grade.dataQuality === 'context' ? 500 : 0;
  const raw   = base + grade.confidence;

  // Penalize props with extreme odds imbalance — e.g., 5th-string WR +1730 to score TD.
  // When the over is priced at >+500, the sportsbook considers it near-impossible;
  // betting the under at -110 on a near-certain event is terrible value regardless of hit rate.
  const ov = prop.over_odds ?? -110;
  const un = prop.under_odds ?? -110;
  const ovImplied = ov > 0 ? 100 / (100 + ov) : Math.abs(ov) / (Math.abs(ov) + 100);
  const unImplied = un > 0 ? 100 / (100 + un) : Math.abs(un) / (Math.abs(un) + 100);

  let mult = 1.0;
  if      (ovImplied < 0.05) mult = 0.05;  // +1900+ : near-impossible over, no value either side
  else if (ovImplied < 0.10) mult = 0.20;  // +900–+1900
  else if (ovImplied < 0.18) mult = 0.45;  // +456–+900 : unlikely over
  else if (unImplied < 0.05) mult = 0.05;  // mirrored: near-impossible under
  else if (unImplied < 0.10) mult = 0.20;

  return raw * mult;
}
