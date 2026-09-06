import React, { useState, useMemo, useEffect } from 'react';
import { X, Check, Clock, Zap, Home, Plane, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { gradeProp } from '@/lib/grading';
import TeamLogo from '@/components/common/TeamLogo';
import VerdictBadge from '@/components/props/VerdictBadge';
import PlayerTrendChart from '@/components/trends/PlayerTrendChart';
import { useParlay } from '@/lib/ParlayContext';

const propTypeLabels = {
  passing_yards: 'Pass Yds', passing_tds: 'Pass TDs', completions: 'Comp',
  rushing_yards: 'Rush Yds', rushing_tds: 'Rush TDs', rushing_attempts: 'Rush Att',
  receiving_yards: 'Rec Yds', receiving_tds: 'Rec TDs', receptions: 'Rec',
  fantasy_points: 'Fantasy Pts', kicking_points: 'Kick Pts',
  tackles: 'Tackles', sacks: 'Sacks', passing_ints: 'INTs Thrown',
  rush_rec_tds: 'Rush+Rec TDs', rush_rec_yards: 'Rush+Rec Yds',
  pass_rush_yards: 'Pass+Rush Yds', passing_long: 'Long Comp', rushing_long: 'Long Rush',
  q1_rush_rec_tds: '1Q R+R TDs', q1_receptions: '1Q Rec',
  h1_rush_rec_tds: '1H R+R TDs', h1_receptions: '1H Rec',
  q1_passing_yards: '1Q Pass Yds', q1_rushing_yards: '1Q Rush Yds', q1_receiving_yards: '1Q Rec Yds',
  h1_passing_yards: '1H Pass Yds', h1_rushing_yards: '1H Rush Yds', h1_receiving_yards: '1H Rec Yds',
};

function fmtOdds(n) {
  if (n == null) return '—';
  return n > 0 ? `+${n}` : `${n}`;
}

// Same formula as PropGradeChecklist — uses confidence + completeness cap
function toLetterGrade(confidence, completeness) {
  const eff = completeness < 25 ? Math.min(confidence, 62)
    : completeness < 45 ? Math.min(confidence, 70)
    : completeness < 65 ? Math.min(confidence, 80)
    : confidence;
  if (eff >= 88) return 'A+';
  if (eff >= 83) return 'A';
  if (eff >= 78) return 'A-';
  if (eff >= 74) return 'B+';
  if (eff >= 70) return 'B';
  if (eff >= 65) return 'B-';
  if (eff >= 61) return 'C+';
  if (eff >= 57) return 'C';
  return 'C-';
}

/** Convert American odds → implied probability (includes vig) */
function oddsToProb(odds) {
  if (odds == null) return null;
  return odds < 0 ? (-odds) / (-odds + 100) : 100 / (odds + 100);
}

/** Convert implied probability → American odds, rounded to nearest 5 */
function probToOdds(prob) {
  prob = Math.max(0.01, Math.min(0.99, prob));
  const raw = prob >= 0.5 ? -(prob / (1 - prob)) * 100 : ((1 - prob) / prob) * 100;
  return Math.round(raw / 5) * 5;
}

/**
 * Estimate fair book odds at a new line given:
 *  - fairOverProb: the hit-rate-derived probability at the new line (0–1)
 *  - originalOverOdds / originalUnderOdds: the book's original odds (used to extract vig)
 * Returns { over, under } as American integers, or null if original odds unavailable.
 */
function estimateAdjustedOdds(fairOverProb, originalOverOdds, originalUnderOdds) {
  if (fairOverProb == null) return { over: null, under: null };

  // Extract vig from original odds so we re-apply the same juice
  const origOverProb  = oddsToProb(originalOverOdds);
  const origUnderProb = oddsToProb(originalUnderOdds);
  const totalVig = (origOverProb != null && origUnderProb != null)
    ? Math.max(0, origOverProb + origUnderProb - 1)
    : 0.05; // default ~5% vig if original odds unknown

  const vigPerSide = totalVig / 2;
  const adjOverProb  = fairOverProb + vigPerSide;
  const adjUnderProb = (1 - fairOverProb) + vigPerSide;

  return {
    over:  probToOdds(adjOverProb),
    under: probToOdds(adjUnderProb),
  };
}

function StatBox({ label, value, sub, good, neutral }) {
  if (value == null) return null;
  return (
    <div className="bg-secondary/60 rounded-xl p-3 text-center flex-1 min-w-[72px]">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className={cn('text-base font-bold', neutral ? 'text-foreground' : good ? 'text-primary' : 'text-destructive')}>
        {value}
      </p>
      {sub && <p className="text-[9px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function PropDetailModal({ prop, onClose }) {
  const { addLeg, isSelected } = useParlay();
  const originalLine = prop.line;

  // Slider range: ±30% of line (min ±10), step 0.5
  const sliderRange = Math.max(10, Math.round(originalLine * 0.3));
  const sliderMin = Math.max(0.5, Math.round((originalLine - sliderRange) * 2) / 2);
  const sliderMax = Math.round((originalLine + sliderRange) * 2) / 2;

  const [adjustedLine, setAdjustedLine] = useState(originalLine);
  const [chartWindow, setChartWindow] = useState('l10'); // 'l5' | 'l10' | 'l20'
  const [locationFilter, setLocationFilter] = useState('all'); // 'all' | 'home' | 'away'

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const gameLogs = prop.last_10_games || [];

  // Estimate hit rate from avg/line ratio when no raw game logs are available
  function estimateHitRate(avg, line) {
    if (avg == null || avg === 0) return null;
    const r = line / avg;
    if (r >= 3.0) return 1;
    if (r >= 2.5) return 3;
    if (r >= 2.0) return 7;
    if (r >= 1.6) return 16;
    if (r >= 1.3) return 28;
    if (r >= 1.1) return 40;
    if (r >= 0.9) return 55;
    if (r >= 0.7) return 68;
    if (r >= 0.5) return 80;
    if (r >= 0.35) return 90;
    return 96;
  }

  // Recalculate hit_rate and edge at the adjusted line so gradeProp gets accurate inputs
  const adjustedProp = useMemo(() => {
    let dynamicHitRate;
    if (gameLogs.length > 0) {
      // Best case: recalculate from actual game values
      const hitCount = gameLogs.filter(v => v > adjustedLine).length;
      dynamicHitRate = Math.round(hitCount / gameLogs.length * 100);
    } else {
      // Fallback: estimate from avg vs line ratio
      dynamicHitRate = estimateHitRate(prop.avg_last_10, adjustedLine) ?? prop.hit_rate_last_10;
    }
    const base = prop.projection ?? prop.avg_last_10 ?? null;
    const dynamicEdge = base != null ? Math.round((base - adjustedLine) * 100) / 100 : prop.edge;
    return { ...prop, line: adjustedLine, hit_rate_last_10: dynamicHitRate, edge: dynamicEdge };
  }, [prop, adjustedLine, gameLogs]);

  // Grade at the original market line (used for delta comparison when line is adjusted)
  const marketGrade = useMemo(() => gradeProp(prop), [prop]);

  // Run the 4-factor grade engine
  const rawGrade = useMemo(() => gradeProp(adjustedProp), [adjustedProp]);

  // The grade engine now uses continuous scores for all line-dependent criteria,
  // so confidence moves smoothly and in the correct direction as the line changes.
  const grade = rawGrade;

  const isOverFavorable = grade.verdict === 'OVER';
  const lineChanged = adjustedLine !== originalLine;

  // Dynamic hit rate for the stat display boxes
  const hitCount = gameLogs.length > 0 ? gameLogs.filter(v => v > adjustedLine).length : 0;
  const dynamicHitRate = gameLogs.length > 0
    ? Math.round(hitCount / gameLogs.length * 100)
    : estimateHitRate(prop.avg_last_10, adjustedLine);

  // Adjusted odds at the new line — uses dynamic hit rate as the fair over probability
  const adjustedOdds = useMemo(() => {
    if (!lineChanged) return { over: prop.over_odds, under: prop.under_odds };
    const fairOverProb = dynamicHitRate != null ? dynamicHitRate / 100 : null;
    return estimateAdjustedOdds(fairOverProb, prop.over_odds, prop.under_odds);
  }, [lineChanged, dynamicHitRate, prop.over_odds, prop.under_odds]);

  // Chart data — game_logs_last_10 is already chronological (oldest first)
  const chartGameLogs = useMemo(() =>
    prop.game_logs_last_10?.map(g => ({ isHome: g.isHome, opp: g.opp, date: g.date }))
    || gameLogs.map((_, i) => ({ isHome: false, opp: `G${i + 1}` })),
    [prop.game_logs_last_10, gameLogs]
  );

  const handlePick = (pick) => {
    addLeg({ ...prop, line: adjustedLine }, pick);
    onClose();
  };

  // Slider fill percentage for styling
  const sliderPct = ((adjustedLine - sliderMin) / (sliderMax - sliderMin)) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet / Dialog */}
      <div className="relative w-full sm:max-w-xl max-h-[94dvh] sm:max-h-[90vh] flex flex-col bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">

        {/* Sticky header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-border bg-card/95 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <TeamLogo team={prop.team} className="w-10 h-10" />
            <div>
              <p className="font-bold text-foreground leading-tight">{prop.player_name}</p>
              <p className="text-xs text-muted-foreground">
                {prop.team} vs {prop.opponent} · {prop.position} · {propTypeLabels[prop.prop_type] || prop.prop_type.replace(/_/g, ' ')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary transition-colors flex-shrink-0">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="p-5 space-y-5">

            {/* OVER/UNDER probability + letter grade + verdict badge */}
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="flex items-baseline gap-2 mb-1.5 flex-wrap">
                  <span className={cn('text-3xl font-black leading-none tabular-nums', isOverFavorable ? 'text-emerald-400' : 'text-rose-400')}>
                    {isOverFavorable ? grade.overProb : grade.underProb}%
                  </span>
                  <span className="text-sm text-muted-foreground/50">{isOverFavorable ? 'OVER' : 'UNDER'}</span>
                  {(() => {
                    const lg = toLetterGrade(grade.confidence, grade.completeness);
                    const lgStyle = lg[0] === 'A' ? 'bg-emerald-500/15 text-emerald-400'
                      : lg[0] === 'B' ? 'bg-primary/20 text-primary'
                      : 'bg-amber-500/15 text-amber-400';
                    return <span className={cn('text-sm font-black px-2 py-0.5 rounded-lg', lgStyle)}>{lg}</span>;
                  })()}
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-300', isOverFavorable ? 'bg-emerald-500' : 'bg-rose-500')}
                    style={{ width: `${isOverFavorable ? grade.overProb : grade.underProb}%` }}
                  />
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[9px] text-emerald-400/70 font-semibold">▲ OVER {grade.overProb}%</span>
                  <span className="text-[9px] text-muted-foreground/30">·</span>
                  <span className="text-[9px] text-rose-400/70 font-semibold">▼ UNDER {grade.underProb}%</span>
                  <span className="text-[9px] text-muted-foreground/30">·</span>
                  <span className="text-[9px] text-muted-foreground/40">model estimate</span>
                </div>
              </div>
              <VerdictBadge
                verdict={grade.verdict}
                ai_confidence={grade.confidence}
                dataQuality={grade.dataQuality}
                loading={false}
              />
            </div>
            {grade.completeness < 40 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20">
                <span className="text-amber-400 text-sm leading-none flex-shrink-0">⚠</span>
                <p className="text-[10px] text-amber-300/80 leading-snug">
                  <span className="font-semibold">Limited data ({grade.completeness}% completeness)</span> — confidence is partially anchored to market odds. Treat this estimate with caution.
                </p>
              </div>
            )}

            {/* Line adjuster */}
            <div className="bg-secondary/40 border border-border/60 rounded-xl p-4 space-y-3">
              {/* Delta row — probability change since market line */}
              {lineChanged && (() => {
                const mktProb = isOverFavorable ? marketGrade.overProb : marketGrade.underProb;
                const adjProb = isOverFavorable ? grade.overProb     : grade.underProb;
                const delta   = adjProb - mktProb;
                const dir     = isOverFavorable ? 'OVER' : 'UNDER';
                return (
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold flex-wrap bg-black/20 rounded-lg px-3 py-2">
                    <span className="text-muted-foreground/50">Market {originalLine}</span>
                    <span className={cn(isOverFavorable ? 'text-emerald-400' : 'text-rose-400')}>{dir} {mktProb}%</span>
                    <span className="text-muted-foreground/25">→</span>
                    <span className="text-muted-foreground/50">Adjusted {adjustedLine}</span>
                    <span className={cn(isOverFavorable ? 'text-emerald-400' : 'text-rose-400')}>{dir} {adjProb}%</span>
                    <span className={cn('font-black ml-0.5', delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-muted-foreground')}>
                      ({delta > 0 ? '+' : ''}{delta}pp)
                    </span>
                  </div>
                );
              })()}

              {/* Label + typed input with ± steppers */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Adjust Line</p>
                  <p className="text-[10px] text-muted-foreground/55 mt-0.5">
                    {lineChanged ? `was ${originalLine} · market line` : 'Drag, type, or step with ±'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setAdjustedLine(v => Math.max(sliderMin, Math.round((v - 0.5) * 2) / 2))}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground hover:border-white/20 transition-colors"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="number"
                    step={0.5}
                    min={sliderMin}
                    max={sliderMax}
                    value={adjustedLine}
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) setAdjustedLine(Math.max(sliderMin, Math.min(sliderMax, Math.round(v * 2) / 2)));
                    }}
                    className={cn(
                      'w-20 text-center text-xl font-bold bg-transparent border rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                      lineChanged ? 'border-chart-4/50 text-chart-4' : 'border-border text-foreground'
                    )}
                  />
                  <button
                    onClick={() => setAdjustedLine(v => Math.min(sliderMax, Math.round((v + 0.5) * 2) / 2))}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground hover:border-white/20 transition-colors"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  {lineChanged && (
                    <button
                      onClick={() => setAdjustedLine(originalLine)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-secondary border border-border text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors ml-0.5"
                      title="Reset to market line"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Range slider */}
              <input
                type="range"
                min={sliderMin}
                max={sliderMax}
                step={0.5}
                value={adjustedLine}
                onChange={e => setAdjustedLine(parseFloat(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-primary"
                style={{
                  background: `linear-gradient(to right, hsl(142 71% 45%) ${sliderPct}%, hsl(217 33% 17%) ${sliderPct}%)`
                }}
              />
              <div className="flex justify-between text-[9px] text-muted-foreground/35">
                <span>{sliderMin}</span>
                <span>{sliderMax}</span>
              </div>

              {/* Preset snap buttons */}
              {(prop.avg_last_5 != null || prop.avg_last_10 != null || prop.projection != null) && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <button
                    onClick={() => setAdjustedLine(originalLine)}
                    className={cn(
                      'text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all',
                      adjustedLine === originalLine
                        ? 'bg-primary/20 border-primary/40 text-primary'
                        : 'bg-secondary/60 border-border text-muted-foreground hover:text-foreground hover:border-white/15'
                    )}
                  >
                    Market {originalLine}
                  </button>
                  {prop.avg_last_10 != null && (
                    <button
                      onClick={() => setAdjustedLine(Math.round(prop.avg_last_10 * 2) / 2)}
                      className={cn(
                        'text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all',
                        adjustedLine === Math.round(prop.avg_last_10 * 2) / 2
                          ? 'bg-primary/20 border-primary/40 text-primary'
                          : 'bg-secondary/60 border-border text-muted-foreground hover:text-foreground hover:border-white/15'
                      )}
                    >
                      L10 avg {prop.avg_last_10}
                    </button>
                  )}
                  {prop.avg_last_5 != null && (
                    <button
                      onClick={() => setAdjustedLine(Math.round(prop.avg_last_5 * 2) / 2)}
                      className={cn(
                        'text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all',
                        adjustedLine === Math.round(prop.avg_last_5 * 2) / 2
                          ? 'bg-primary/20 border-primary/40 text-primary'
                          : 'bg-secondary/60 border-border text-muted-foreground hover:text-foreground hover:border-white/15'
                      )}
                    >
                      L5 avg {prop.avg_last_5}
                    </button>
                  )}
                  {prop.projection != null && (
                    <button
                      onClick={() => setAdjustedLine(Math.round(prop.projection * 2) / 2)}
                      className={cn(
                        'text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all',
                        adjustedLine === Math.round(prop.projection * 2) / 2
                          ? 'bg-primary/20 border-primary/40 text-primary'
                          : 'bg-secondary/60 border-border text-muted-foreground hover:text-foreground hover:border-white/15'
                      )}
                    >
                      Proj {prop.projection}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Dynamic stats at adjusted line */}
            <div className="flex flex-wrap gap-2">
              <StatBox
                label="Hit Rate"
                value={dynamicHitRate != null ? `${dynamicHitRate}%` : null}
                sub={gameLogs.length > 0 ? `${hitCount}/${gameLogs.length} games` : null}
                good={dynamicHitRate != null && dynamicHitRate >= 60}
                neutral={false}
              />
              {/* L5: prefer EWMA from raw logs so this tile matches the grading engine */}
              {(() => {
                const ewmaL5 = gameLogs.length >= 3
                  ? (() => {
                      const vals = gameLogs.slice(0, 5);
                      let wSum = 0, vSum = 0;
                      vals.forEach((v, i) => { const w = Math.exp(-0.18 * i); vSum += v * w; wSum += w; });
                      return Math.round(vSum / wSum * 10) / 10;
                    })()
                  : null;
                const display = ewmaL5 ?? prop.avg_last_5;
                const label = ewmaL5 != null ? 'L5 Wtd' : 'L5 Avg';
                return display != null ? (
                  <StatBox
                    label={label}
                    value={display}
                    sub={`${display > adjustedLine ? '+' : ''}${(display - adjustedLine).toFixed(1)}`}
                    good={display > adjustedLine}
                    neutral={false}
                  />
                ) : null;
              })()}
              {/* L10: prefer EWMA from raw logs */}
              {(() => {
                const ewmaL10 = gameLogs.length >= 3
                  ? (() => {
                      let wSum = 0, vSum = 0;
                      gameLogs.forEach((v, i) => { const w = Math.exp(-0.18 * i); vSum += v * w; wSum += w; });
                      return Math.round(vSum / wSum * 10) / 10;
                    })()
                  : null;
                const display = ewmaL10 ?? prop.avg_last_10;
                const label = ewmaL10 != null ? 'L10 Wtd' : 'L10 Avg';
                return display != null ? (
                  <StatBox
                    label={label}
                    value={display}
                    sub={`${display > adjustedLine ? '+' : ''}${(display - adjustedLine).toFixed(1)}`}
                    good={display > adjustedLine}
                    neutral={false}
                  />
                ) : null;
              })()}
              <StatBox
                label="Projection"
                value={prop.projection ?? null}
                sub={prop.projection != null ? `${prop.projection > adjustedLine ? '+' : ''}${(prop.projection - adjustedLine).toFixed(1)}` : null}
                good={prop.projection != null && prop.projection > adjustedLine}
                neutral={false}
              />
            </div>

            {/* Chart: window + location filters */}
            {(gameLogs.length > 0 || prop.game_logs_last_20?.length > 0) && (() => {
              // allDetailLogs: most-recent-first from backend (index 0 = most recent)
              const allDetailLogs = prop.game_logs_last_20 || prop.game_logs_last_10 || [];

              // Home/away detection — checks matchup string then falls back to isHome field
              const isHomeGame = (g) => {
                const m = (g.matchup || '').trim().toLowerCase();
                if (m.startsWith('vs.') || m.includes(' vs. ')) return true;
                if (m.startsWith('@') || m.includes(' @ ')) return false;
                return g.isHome ?? true;
              };

              // NFL week helper for table/header labels
              const getWeekLabel = (g) => {
                if (g?.week) return `'25 W${g.week}`;
                if (g?.date) {
                  try {
                    const d = new Date(g.date);
                    if (isNaN(d.getTime())) return g.date?.replace(/^\d{4}-/, '') || '—';
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  } catch { return '—'; }
                }
                return '—';
              };

              // Step 1: pick the time window (still most-recent-first)
              const windowLogs = chartWindow === 'l5'
                ? allDetailLogs.slice(0, 5)
                : chartWindow === 'l20'
                ? allDetailLogs
                : allDetailLogs.slice(0, 10);

              // Step 2: apply location filter
              const activeDetail = locationFilter === 'home'
                ? windowLogs.filter(g => isHomeGame(g))
                : locationFilter === 'away'
                ? windowLogs.filter(g => !isHomeGame(g))
                : windowLogs;

              // For chart: reverse to oldest-first so oldest is leftmost point
              const chartDetail = [...activeDetail].reverse();
              const chartValues = chartDetail.map(g => g.value);
              const activeChartMeta = chartDetail.map(g => ({
                isHome: isHomeGame(g),
                opp: g.opp,
                date: g.date,
                week: g.week,
              }));

              // For table: newest-first (most recent at top)
              const tableDetail = [...activeDetail]; // already most-recent-first

              const hasL20 = allDetailLogs.length > 10;

              // Season header — derive week range from windowLogs
              const weeks = windowLogs.map(g => g.week).filter(Boolean);
              const minWk = weeks.length ? Math.min(...weeks) : null;
              const maxWk = weeks.length ? Math.max(...weeks) : null;
              const seasonLabel = minWk && maxWk
                ? `2025 Regular Season · Weeks ${minWk}–${maxWk}`
                : '2025 Regular Season';

              const tabHR = activeDetail.length > 0
                ? Math.round(activeDetail.filter(g => g.value > adjustedLine).length / activeDetail.length * 100)
                : null;
              const tabAvg = activeDetail.length > 0
                ? Math.round(activeDetail.reduce((s, g) => s + g.value, 0) / activeDetail.length * 10) / 10
                : null;

              return (
                <div>
                  {/* Season header */}
                  <p className="text-[9px] font-semibold text-muted-foreground/40 uppercase tracking-widest mb-2">
                    {seasonLabel}
                  </p>

                  {/* Window + location filter row */}
                  <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                    {[
                      { key: 'l5',  label: 'L5' },
                      { key: 'l10', label: 'L10' },
                      ...(hasL20 ? [{ key: 'l20', label: 'L20' }] : []),
                    ].map(t => (
                      <button
                        key={t.key}
                        onClick={() => { setChartWindow(t.key); setLocationFilter('all'); }}
                        className={cn(
                          "text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all",
                          chartWindow === t.key
                            ? "bg-primary/20 border-primary/40 text-primary"
                            : "bg-secondary/40 border-border/50 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {t.label}
                      </button>
                    ))}

                    <span className="w-px h-4 bg-white/10 mx-0.5" />

                    {/* Always show All / Home / Away */}
                    {[
                      { key: 'all',  label: 'All' },
                      { key: 'home', label: '🏠 Home' },
                      { key: 'away', label: '✈ Away' },
                    ].map(f => (
                      <button
                        key={f.key}
                        onClick={() => setLocationFilter(f.key)}
                        className={cn(
                          "text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all",
                          locationFilter === f.key
                            ? "bg-chart-4/20 border-chart-4/40 text-chart-4"
                            : "bg-secondary/40 border-border/50 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {f.label}
                      </button>
                    ))}

                    {tabAvg != null && (
                      <span className="text-[10px] text-muted-foreground/60 ml-auto flex-shrink-0">
                        avg {tabAvg} · {tabHR}% hit
                      </span>
                    )}
                  </div>

                  {/* Empty state for location filter */}
                  {activeDetail.length === 0 && (
                    <div className="text-center py-6 text-[11px] text-muted-foreground/50">
                      No {locationFilter} games in this window
                    </div>
                  )}

                  {/* Chart — receives oldest-first data */}
                  {chartValues.length > 0 && (
                    <PlayerTrendChart
                      games={chartValues}
                      line={adjustedLine}
                      originalLine={lineChanged ? originalLine : undefined}
                      propType={prop.prop_type}
                      gameLogs={activeChartMeta}
                    />
                  )}

                  {/* Game log table — newest at top */}
                  {activeDetail.length > 0 && (
                    <div className="mt-3 bg-secondary/30 rounded-xl overflow-hidden border border-border/40">
                      <div className="grid grid-cols-4 text-[9px] text-muted-foreground uppercase px-4 py-2 border-b border-border/40 bg-secondary/40">
                        <span>Wk</span>
                        <span>Matchup</span>
                        <span className="text-center">{propTypeLabels[prop.prop_type] || prop.prop_type.replace(/_/g, ' ')}</span>
                        <span className="text-right">Result</span>
                      </div>
                      {tableDetail.map((g, i) => (
                        <div key={i} className={cn('grid grid-cols-4 text-xs px-4 py-2.5 items-center', i % 2 === 1 ? 'bg-secondary/20' : '')}>
                          <span className="text-muted-foreground text-[10px]">{getWeekLabel(g)}</span>
                          <span className="text-foreground text-[10px]">{isHomeGame(g) ? 'vs' : '@'} {g.opp}</span>
                          <span className={cn('text-center font-bold text-sm', g.value > adjustedLine ? 'text-emerald-400' : 'text-rose-400')}>
                            {g.value}
                          </span>
                          <span className={cn('text-right text-[10px] font-semibold', g.value > adjustedLine ? 'text-emerald-400' : 'text-rose-400')}>
                            {g.value > adjustedLine ? '✓ HIT' : '✗ MISS'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Grade breakdown — fully expanded */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Grade Breakdown</p>
                {(() => {
                  const lg = toLetterGrade(grade.confidence, grade.completeness);
                  return (
                    <span className={cn(
                      'text-xs font-bold px-2 py-0.5 rounded-full',
                      lg[0] === 'A' ? 'bg-emerald-500/15 text-emerald-400' :
                      lg[0] === 'B' ? 'bg-primary/20 text-primary' :
                      'bg-amber-500/15 text-amber-400'
                    )}>
                      {lg}
                    </span>
                  );
                })()}
              </div>
              <div className="bg-secondary/30 rounded-xl border border-border/40 p-4 space-y-4">
                {grade.criteria.map((c, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className={cn(
                      'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                      c.pending    ? 'bg-secondary border border-border'
                      : !c.available ? 'bg-white/4'
                      : c.pass     ? 'bg-primary/20'
                      :               'bg-destructive/20'
                    )}>
                      {c.pending
                        ? <Clock className="w-3 h-3 text-muted-foreground" />
                        : !c.available
                        ? <span className="text-[9px] leading-none text-muted-foreground/30">—</span>
                        : c.pass
                          ? <Check className="w-3 h-3 text-primary" />
                          : <X className="w-3 h-3 text-destructive" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn(
                          'text-xs font-medium leading-tight',
                          c.pending ? 'text-muted-foreground' : c.pass ? 'text-foreground' : 'text-muted-foreground'
                        )}>
                          {c.label}
                        </p>
                        <span className="text-[9px] text-muted-foreground flex-shrink-0">{Math.round(c.weight / (grade.totalWeight || 100) * 100)}%</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{c.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Streak */}
            {prop.streak_info && (
              <div className="flex items-center gap-2 px-1">
                <Zap className="w-3.5 h-3.5 text-chart-4 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">{prop.streak_info}</p>
              </div>
            )}

            {/* Bet buttons */}
            <div className="grid grid-cols-2 gap-3 pb-2">
              <button
                onClick={() => handlePick('over')}
                className={cn(
                  'flex flex-col items-center rounded-xl p-4 border transition-all',
                  isSelected(prop.player_name, prop.prop_type, 'over')
                    ? 'bg-emerald-500 border-emerald-500 text-white shadow-[0_0_14px_rgba(16,185,129,0.35)]'
                    : isOverFavorable
                    ? 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20'
                    : 'bg-secondary border-border hover:bg-secondary/80'
                )}
              >
                <span className={cn('text-xs font-medium', isOverFavorable ? 'text-emerald-400' : 'text-muted-foreground')}>
                  OVER {adjustedLine}
                </span>
                <span className={cn('text-xl font-bold mt-0.5', isOverFavorable ? 'text-emerald-400' : 'text-foreground')}>
                  {fmtOdds(adjustedOdds.over)}
                </span>
                {lineChanged && <span className="text-[9px] text-muted-foreground/60 mt-0.5">est. odds</span>}
              </button>
              <button
                onClick={() => handlePick('under')}
                className={cn(
                  'flex flex-col items-center rounded-xl p-4 border transition-all',
                  isSelected(prop.player_name, prop.prop_type, 'under')
                    ? 'bg-rose-500 border-rose-500 text-white shadow-[0_0_14px_rgba(239,68,68,0.35)]'
                    : !isOverFavorable
                    ? 'bg-rose-500/10 border-rose-500/30 hover:bg-rose-500/20'
                    : 'bg-secondary border-border hover:bg-secondary/80'
                )}
              >
                <span className={cn('text-xs font-medium', !isOverFavorable ? 'text-rose-400' : 'text-muted-foreground')}>
                  UNDER {adjustedLine}
                </span>
                <span className={cn('text-xl font-bold mt-0.5', !isOverFavorable ? 'text-rose-400' : 'text-foreground')}>
                  {fmtOdds(adjustedOdds.under)}
                </span>
                {lineChanged && <span className="text-[9px] text-muted-foreground/60 mt-0.5">est. odds</span>}
              </button>
            </div>
            {lineChanged && (
              <p className="text-[10px] text-muted-foreground/50 text-center -mt-3 pb-1">
                Estimated odds at adjusted line · Original: {fmtOdds(prop.over_odds)} / {fmtOdds(prop.under_odds)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
