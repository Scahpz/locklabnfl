import React, { useState, useMemo, useEffect } from 'react';
import { X, Check, Clock, Zap, Home, Plane } from 'lucide-react';
import { cn } from '@/lib/utils';
import { gradeProp } from '@/lib/grading';
import TeamLogo from '@/components/common/TeamLogo';
import VerdictBadge from '@/components/props/VerdictBadge';
import PlayerTrendChart from '@/components/trends/PlayerTrendChart';
import { useParlay } from '@/lib/ParlayContext';

const propTypeLabels = {
  points: 'PTS', rebounds: 'REB', assists: 'AST',
  PRA: 'PRA', '3PM': '3PM', steals: 'STL', blocks: 'BLK',
  'P+R': 'P+R', 'P+A': 'P+A', 'A+R': 'A+R',
};

function fmtOdds(n) {
  if (n == null) return '—';
  return n > 0 ? `+${n}` : `${n}`;
}

function toLetterGrade(pass, available) {
  if (available === 0) return '?';
  const r = pass / available;
  if (r >= 0.92) return 'A+';
  if (r >= 0.83) return 'A';
  if (r >= 0.75) return 'A-';
  if (r >= 0.68) return 'B+';
  if (r >= 0.60) return 'B';
  if (r >= 0.55) return 'B-';
  if (r >= 0.48) return 'C+';
  if (r >= 0.42) return 'C';
  if (r >= 0.35) return 'C-';
  if (r >= 0.30) return 'D+';
  if (r >= 0.25) return 'D';
  if (r >= 0.20) return 'D-';
  return 'F';
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
  return (
    <div className="bg-secondary/60 rounded-xl p-3 text-center">
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
                {prop.team} vs {prop.opponent} · {prop.position} · {propTypeLabels[prop.prop_type] || prop.prop_type}
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
                    const avail = grade.criteria.filter(c => c.available).length;
                    const lg = toLetterGrade(grade.passCount, avail);
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
                </div>
              </div>
              <VerdictBadge
                verdict={grade.verdict}
                ai_confidence={grade.confidence}
                dataQuality={grade.dataQuality}
                loading={false}
              />
            </div>

            {/* Line slider */}
            <div className="bg-secondary/40 border border-border/60 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Adjust Line</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Drag to see how the analysis changes</p>
                </div>
                <div className="text-right">
                  <p className={cn('text-2xl font-bold leading-none', lineChanged ? 'text-chart-4' : 'text-foreground')}>
                    {adjustedLine}
                  </p>
                  {lineChanged && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">was {originalLine}</p>
                  )}
                </div>
              </div>

              <input
                type="range"
                min={sliderMin}
                max={sliderMax}
                step={0.5}
                value={adjustedLine}
                onChange={e => setAdjustedLine(parseFloat(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-primary bg-secondary"
                style={{
                  background: `linear-gradient(to right, hsl(142 71% 45%) ${sliderPct}%, hsl(217 33% 17%) ${sliderPct}%)`
                }}
              />

              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{sliderMin}</span>
                {lineChanged && (
                  <button
                    onClick={() => setAdjustedLine(originalLine)}
                    className="text-primary hover:underline"
                  >
                    reset to {originalLine}
                  </button>
                )}
                <span>{sliderMax}</span>
              </div>

              {/* Marker dots at L5, L10, projection */}
              {(prop.avg_last_5 != null || prop.avg_last_10 != null || prop.projection != null) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {prop.avg_last_10 != null && (
                    <button onClick={() => setAdjustedLine(Math.round(prop.avg_last_10 * 2) / 2)}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-secondary border border-border hover:border-primary/40 transition-colors">
                      Jump to L10 avg ({prop.avg_last_10})
                    </button>
                  )}
                  {prop.avg_last_5 != null && (
                    <button onClick={() => setAdjustedLine(Math.round(prop.avg_last_5 * 2) / 2)}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-secondary border border-border hover:border-primary/40 transition-colors">
                      Jump to L5 avg ({prop.avg_last_5})
                    </button>
                  )}
                  {prop.projection != null && (
                    <button onClick={() => setAdjustedLine(Math.round(prop.projection * 2) / 2)}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-secondary border border-border hover:border-primary/40 transition-colors">
                      Jump to projection ({prop.projection})
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Dynamic stats at adjusted line */}
            <div className="grid grid-cols-4 gap-2">
              <StatBox
                label="Hit Rate"
                value={dynamicHitRate != null ? `${dynamicHitRate}%` : '—'}
                sub={gameLogs.length > 0 ? `${hitCount}/${gameLogs.length} games` : null}
                good={dynamicHitRate != null && dynamicHitRate >= 60}
                neutral={dynamicHitRate == null}
              />
              <StatBox
                label="L5 Avg"
                value={prop.avg_last_5 ?? '—'}
                sub={prop.avg_last_5 != null ? `${prop.avg_last_5 > adjustedLine ? '+' : ''}${(prop.avg_last_5 - adjustedLine).toFixed(1)}` : null}
                good={prop.avg_last_5 != null && prop.avg_last_5 > adjustedLine}
                neutral={prop.avg_last_5 == null}
              />
              <StatBox
                label="L10 Avg"
                value={prop.avg_last_10 ?? '—'}
                sub={prop.avg_last_10 != null ? `${prop.avg_last_10 > adjustedLine ? '+' : ''}${(prop.avg_last_10 - adjustedLine).toFixed(1)}` : null}
                good={prop.avg_last_10 != null && prop.avg_last_10 > adjustedLine}
                neutral={prop.avg_last_10 == null}
              />
              <StatBox
                label="Projection"
                value={prop.projection ?? '—'}
                sub={prop.projection != null ? `${prop.projection > adjustedLine ? '+' : ''}${(prop.projection - adjustedLine).toFixed(1)}` : null}
                good={prop.projection != null && prop.projection > adjustedLine}
                neutral={prop.projection == null}
              />
            </div>

            {/* Chart: window + location filters */}
            {(gameLogs.length > 0 || prop.game_logs_last_20?.length > 0) && (() => {
              const allDetailLogs = prop.game_logs_last_20 || prop.game_logs_last_10 || [];

              // Derive home/away from matchup string — handles both NBA API ("LAL vs. BOS")
              // and ESPN fallback ("vs. BOS" / "@ LAL") formats
              const isHomeGame = (g) => {
                const m = (g.matchup || '').trim().toLowerCase();
                if (m.startsWith('vs.')) return true;
                if (m.includes(' vs. ')) return true;
                if (m.startsWith('@') || m.includes(' @ ')) return false;
                return g.isHome ?? false;
              };

              // Step 1: pick the time window
              const windowLogs = chartWindow === 'l5'
                ? allDetailLogs.slice(-5)
                : chartWindow === 'l20'
                ? allDetailLogs
                : (prop.game_logs_last_10 || allDetailLogs.slice(-10));

              // Step 2: apply location filter on top of the window
              const activeDetail = locationFilter === 'home'
                ? windowLogs.filter(g => isHomeGame(g))
                : locationFilter === 'away'
                ? windowLogs.filter(g => !isHomeGame(g))
                : windowLogs;

              const chartValues = activeDetail.map(g => g.value);
              const activeChartMeta = activeDetail.map(g => ({ isHome: g.isHome, opp: g.opp, date: g.date }));

              const hasL20 = allDetailLogs.length > 10;
              const hasHome = windowLogs.some(g => g.isHome);
              const hasAway = windowLogs.some(g => !g.isHome);

              const tabHR = chartValues.length > 0
                ? Math.round(chartValues.filter(v => v > adjustedLine).length / chartValues.length * 100)
                : null;
              const tabAvg = chartValues.length > 0
                ? Math.round(chartValues.reduce((s, v) => s + v, 0) / chartValues.length * 10) / 10
                : null;

              return (
                <div>
                  {/* Row 1: window selector */}
                  <div className="flex items-center gap-1.5 mb-2">
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

                    {/* Divider */}
                    <span className="w-px h-4 bg-white/10 mx-0.5" />

                    {/* Row 2 inline: location filter */}
                    {[
                      { key: 'all',  label: 'All' },
                      ...(hasHome ? [{ key: 'home', label: '🏠 Home' }] : []),
                      ...(hasAway ? [{ key: 'away', label: '✈ Away' }] : []),
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

                  {/* No games for this filter */}
                  {activeDetail.length === 0 && (
                    <div className="text-center py-6 text-[11px] text-muted-foreground/50">
                      No {locationFilter === 'home' ? 'home' : 'away'} games in this window
                    </div>
                  )}

                  {/* Chart */}
                  {chartValues.length > 0 && (
                    <PlayerTrendChart
                      games={chartValues}
                      line={adjustedLine}
                      propType={prop.prop_type}
                      gameLogs={activeChartMeta}
                    />
                  )}

                  {/* Game log table */}
                  {activeDetail.length > 0 && (
                    <div className="mt-3 bg-secondary/30 rounded-xl overflow-hidden border border-border/40">
                      <div className="grid grid-cols-4 text-[9px] text-muted-foreground uppercase px-4 py-2 border-b border-border/40 bg-secondary/40">
                        <span>Date</span>
                        <span>Matchup</span>
                        <span className="text-center">{propTypeLabels[prop.prop_type] || prop.prop_type}</span>
                        <span className="text-right">Result</span>
                      </div>
                      {[...activeDetail].reverse().map((g, i) => (
                        <div key={i} className={cn('grid grid-cols-4 text-xs px-4 py-2.5 items-center', i % 2 === 1 ? 'bg-secondary/20' : '')}>
                          <span className="text-muted-foreground text-[10px]">{g.date ? g.date.replace(/^\d{4}-/, '') : '—'}</span>
                          <span className="text-foreground text-[10px]">{isHomeGame(g) ? 'vs' : '@'} {g.opp}</span>
                          <span className={cn('text-center font-bold text-sm', g.value > adjustedLine ? 'text-primary' : 'text-destructive')}>
                            {g.value}
                          </span>
                          <span className={cn('text-right text-[10px] font-semibold', g.value > adjustedLine ? 'text-primary' : 'text-destructive')}>
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
                  const avail = grade.criteria.filter(c => c.available).length;
                  const lg = toLetterGrade(grade.passCount, avail);
                  return (
                    <span className={cn(
                      'text-xs font-bold px-2 py-0.5 rounded-full',
                      lg[0] === 'A' || lg === 'B+' || lg === 'B' ? 'bg-primary/20 text-primary' :
                      lg[0] === 'C' || lg === 'B-' ? 'bg-chart-4/20 text-chart-4' :
                      'bg-destructive/20 text-destructive'
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
                        <span className="text-[9px] text-muted-foreground flex-shrink-0">{c.weight}%</span>
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
                    ? 'bg-primary border-primary'
                    : isOverFavorable
                    ? 'bg-primary/10 border-primary/30 hover:bg-primary/20'
                    : 'bg-secondary border-border hover:bg-secondary/80'
                )}
              >
                <span className={cn('text-xs font-medium', isOverFavorable ? 'text-primary' : 'text-muted-foreground')}>
                  OVER {adjustedLine}
                </span>
                <span className={cn('text-xl font-bold mt-0.5', isOverFavorable ? 'text-primary' : 'text-foreground')}>
                  {fmtOdds(adjustedOdds.over)}
                </span>
                {lineChanged && <span className="text-[9px] text-muted-foreground/60 mt-0.5">est. odds</span>}
              </button>
              <button
                onClick={() => handlePick('under')}
                className={cn(
                  'flex flex-col items-center rounded-xl p-4 border transition-all',
                  isSelected(prop.player_name, prop.prop_type, 'under')
                    ? 'bg-destructive border-destructive'
                    : !isOverFavorable
                    ? 'bg-destructive/10 border-destructive/30 hover:bg-destructive/20'
                    : 'bg-secondary border-border hover:bg-secondary/80'
                )}
              >
                <span className={cn('text-xs font-medium', !isOverFavorable ? 'text-destructive' : 'text-muted-foreground')}>
                  UNDER {adjustedLine}
                </span>
                <span className={cn('text-xl font-bold mt-0.5', !isOverFavorable ? 'text-destructive' : 'text-foreground')}>
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
