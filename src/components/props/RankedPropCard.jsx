import React, { useState } from 'react';

import { cn } from '@/lib/utils';
import { Lock, AlertTriangle, Award, Zap, ChevronDown, ChevronUp, Check, TrendingUp, TrendingDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import TeamLogo from '@/components/common/TeamLogo';
import { useParlay } from '@/lib/ParlayContext';
import VerdictBadge from '@/components/props/VerdictBadge';
import PropGradeChecklist from '@/components/props/PropGradeChecklist';
import { gradeProp } from '@/lib/grading';
import { calcEVVerdict, TIER_CONFIG } from '@/lib/verdict';
import { SOURCE_META } from '@/lib/liveData';

function fmtOdds(n) {
  if (n == null) return '—';
  return n > 0 ? `+${n}` : `${n}`;
}

const propTypeLabels = {
  points: 'PTS', rebounds: 'REB', assists: 'AST', PRA: 'PRA',
  '3PM': '3PM', steals: 'STL', blocks: 'BLK', turnovers: 'TO',
  'P+R': 'P+R', 'P+A': 'P+A', 'A+R': 'A+R',
};

// Recalculate streak from the actual game log values so it always matches
// the active line (platform-specific or consensus) and the most recent data.
// last_10_games from backend is oldest-first; we work newest-first.
function calcStreakFromLogs(last10games, line) {
  if (!last10games || last10games.length === 0) return null;
  const recent = [...last10games].reverse(); // newest first
  const dir = recent[0] > line ? 'over' : 'under';
  let count = 0;
  for (const v of recent) {
    if ((dir === 'over' && v > line) || (dir === 'under' && v <= line)) count++;
    else break;
  }
  return count >= 2 ? `${count} game ${dir} streak` : null;
}

export default function RankedPropCard({ prop, rank, aiVerdict, aiLoading, activeSource, playerProps, onOpenDetail }) {
  const { addLeg, isSelected } = useParlay();
  const [showBooks, setShowBooks] = useState(false);
  const [selectedBook, setSelectedBook] = useState(null);
  // Which prop type is active on this card (null = base prop passed in)
  const [selectedType, setSelectedType] = useState(null);

  // The "base" prop — either the user-switched sibling or the original prop
  const baseProp = React.useMemo(() => {
    if (!selectedType || !playerProps) return prop;
    return playerProps.find(p => p.prop_type === selectedType) ?? prop;
  }, [selectedType, playerProps, prop]);

  // When a single platform is filtered, use that book's specific line
  const platformBook = React.useMemo(() => {
    if (!activeSource) return null;
    const books = /** @type {{key:string,line:number|null,over_odds:number|null,under_odds:number|null,title:string}[]} */ (baseProp.all_books || []);
    return books.find((b) => b.key === activeSource) ?? null;
  }, [activeSource, baseProp.all_books]);

  // gradedProp: applies platform-specific line (if active) + recalculates hit rate / edge
  const gradedProp = React.useMemo(() => {
    const line       = platformBook?.line      ?? baseProp.line;
    const overOdds   = platformBook?.over_odds  ?? baseProp.over_odds;
    const underOdds  = platformBook?.under_odds ?? baseProp.under_odds;
    const base       = baseProp.projection ?? baseProp.avg_last_10 ?? null;
    const logs       = baseProp.last_10_games || [];
    const hitCount   = logs.filter(v => v > line).length;
    const dynamicHitRate = logs.length > 0 ? Math.round(hitCount / logs.length * 100) : baseProp.hit_rate_last_10;
    const dynamicEdge    = base != null ? Math.round((base - line) * 100) / 100 : baseProp.edge;
    return { ...baseProp, line, over_odds: overOdds, under_odds: underOdds, hit_rate_last_10: dynamicHitRate, edge: dynamicEdge };
  }, [baseProp, platformBook]);

  // Streak recalculated from live log data + active line (never stale)
  const streakInfo = React.useMemo(
    () => calcStreakFromLogs(gradedProp.last_10_games, gradedProp.line),
    [gradedProp.last_10_games, gradedProp.line]
  );

  const grade          = gradeProp(gradedProp);
  const evVerdict      = calcEVVerdict(gradedProp, grade);
  const isOverFavorable = evVerdict.direction === 'OVER';
  const hasBooks       = (baseProp.all_books?.length ?? 0) > 1;

  // Top 2 factors by impact (weight × score) — the hidden complexity made visible
  const topWhyFactors = React.useMemo(() => {
    return (grade.criteria ?? [])
      .filter(c => c.available !== false && !c.pending && c.weight > 0 && c.detail)
      .map(c => ({
        ...c,
        impact: c.weight * (c.continuousScore != null ? c.continuousScore : c.pass ? 1 : 0),
      }))
      .filter(c => c.impact > 0)
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 2);
  }, [grade.criteria]);

  const activeBook      = selectedBook ? baseProp.all_books?.find(b => b.key === selectedBook) : platformBook;
  const displayOverOdds  = activeBook?.over_odds  ?? gradedProp.over_odds;
  const displayUnderOdds = activeBook?.under_odds ?? gradedProp.under_odds;
  const displayLine      = activeBook?.line       ?? gradedProp.line;

  const overOddsValues  = (baseProp.all_books || []).map(b => b.over_odds).filter(v => v != null);
  const underOddsValues = (baseProp.all_books || []).map(b => b.under_odds).filter(v => v != null);
  const bestOverOdds    = overOddsValues.length  ? Math.max(...overOddsValues)  : null;
  const worstOverOdds   = overOddsValues.length  ? Math.min(...overOddsValues)  : null;
  const bestUnderOdds   = underOddsValues.length ? Math.max(...underOddsValues) : null;
  const worstUnderOdds  = underOddsValues.length ? Math.min(...underOddsValues) : null;

  const handlePick = (pick) => {
    addLeg({ ...gradedProp, over_odds: displayOverOdds, under_odds: displayUnderOdds, line: displayLine, bookmaker: activeBook?.title ?? baseProp.bookmaker }, pick);
  };

  const rankStyle = rank <= 3
    ? 'text-chart-4 bg-chart-4/10 border-chart-4/25'
    : rank <= 10
    ? 'text-primary bg-primary/10 border-primary/15'
    : 'text-muted-foreground bg-white/5 border-white/8';

  const overSelected  = isSelected(baseProp.player_name, baseProp.prop_type, 'over');
  const underSelected = isSelected(baseProp.player_name, baseProp.prop_type, 'under');

  // Sibling prop types for the switcher (exclude current)
  const siblingTypes = React.useMemo(() => {
    if (!playerProps || playerProps.length <= 1) return [];
    return playerProps
      .map(p => p.prop_type)
      .filter((t, i, arr) => arr.indexOf(t) === i); // dedupe
  }, [playerProps]);

  const activePropType = selectedType ?? prop.prop_type;

  return (
    <div className={cn(
      "rounded-2xl border bg-[hsl(222,47%,9%)] transition-all duration-200 overflow-hidden",
      "hover:border-white/12 hover:shadow-[0_4px_24px_rgba(0,0,0,0.3)]",
      baseProp.is_lock ? "border-primary/20 shadow-[0_0_20px_hsl(142,71%,45%,0.06)]" : "border-white/6"
    )}>
      {baseProp.is_lock && <div className="h-0.5 w-full bg-gradient-to-r from-primary/0 via-primary to-primary/0" />}

      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold border flex-shrink-0", rankStyle)}>
              {rank}
            </div>
            <TeamLogo team={baseProp.team} className="w-9 h-9" />
            <div>
              <Link to={`/trends?player=${encodeURIComponent(baseProp.player_name)}`}
                className="font-semibold text-sm text-foreground hover:text-primary transition-colors">
                {baseProp.player_name}
              </Link>
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">{baseProp.team} vs {baseProp.opponent} · {baseProp.position}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {baseProp.is_lock     && <Lock          className="w-3.5 h-3.5 text-primary"     />}
            {baseProp.trap_warning && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
            {baseProp.best_value  && <Award         className="w-3.5 h-3.5 text-chart-4"     />}
            <span
              title={`${evVerdict.label} · ${evVerdict.direction} · ${evVerdict.edgePP > 0 ? '+' : ''}${evVerdict.edgePP}% edge`}
              className={cn(
                "flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-lg border cursor-help",
                TIER_CONFIG[evVerdict.tier]?.badge
              )}
            >
              <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', TIER_CONFIG[evVerdict.tier]?.dot)} />
              {evVerdict.label}
            </span>
          </div>
        </div>

        {/* Prop type switcher — shown when player has multiple prop types loaded */}
        {siblingTypes.length > 1 && (
          <div className="flex gap-1 overflow-x-auto pb-1 mb-2 scrollbar-none -mx-1 px-1">
            {siblingTypes.map(t => (
              <button
                key={t}
                onClick={() => { setSelectedType(t); setSelectedBook(null); }}
                className={cn(
                  "text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all flex-shrink-0",
                  activePropType === t
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-white/5 border-white/8 text-muted-foreground/70 hover:text-foreground hover:border-white/15"
                )}
              >
                {propTypeLabels[t] || t}
              </button>
            ))}
          </div>
        )}

        {/* Verdict */}
        <div className="mb-3">
          <VerdictBadge evVerdict={evVerdict} loading={false} />
          {/* Top 2 highest-impact factors — hidden complexity made visible */}
          {topWhyFactors.length > 0 ? (
            <div className="mt-2 space-y-1">
              {topWhyFactors.map((factor, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground/80 leading-snug">
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full mt-[3px] flex-shrink-0',
                    factor.pass ? 'bg-primary/80' : 'bg-destructive/80'
                  )} />
                  {factor.detail}
                </div>
              ))}
            </div>
          ) : grade.dataQuality === 'full' && aiVerdict?.reason ? (
            <p className="text-[11px] text-muted-foreground/70 mt-2 leading-snug">{aiVerdict.reason}</p>
          ) : null}
        </div>

        {/* Line + Bet buttons */}
        <div className="flex items-center justify-between bg-white/4 rounded-xl p-3 border border-white/5">
          <div>
            <p className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wider">
              {propTypeLabels[gradedProp.prop_type] || gradedProp.prop_type}
            </p>
            <p className="text-2xl font-bold text-foreground mt-0.5 leading-none">{displayLine}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => handlePick('over')} className={cn(
              "flex flex-col items-center border rounded-xl px-4 py-2.5 transition-all min-w-[62px] active:scale-95",
              overSelected
                ? "bg-primary border-primary text-primary-foreground shadow-[0_0_12px_hsl(142,71%,45%,0.3)]"
                : isOverFavorable
                ? "bg-primary/10 hover:bg-primary/15 border-primary/25 text-primary"
                : "bg-white/5 hover:bg-white/8 border-white/8 text-muted-foreground"
            )}>
              <span className="text-[10px] font-bold">OVER</span>
              <span className="text-sm font-bold">{fmtOdds(displayOverOdds)}</span>
            </button>
            <button onClick={() => handlePick('under')} className={cn(
              "flex flex-col items-center border rounded-xl px-4 py-2.5 transition-all min-w-[62px] active:scale-95",
              underSelected
                ? "bg-destructive border-destructive text-destructive-foreground shadow-[0_0_12px_hsl(0,84%,60%,0.3)]"
                : !isOverFavorable
                ? "bg-destructive/10 hover:bg-destructive/15 border-destructive/25 text-destructive"
                : "bg-white/5 hover:bg-white/8 border-white/8 text-muted-foreground"
            )}>
              <span className="text-[10px] font-bold">UNDER</span>
              <span className="text-sm font-bold">{fmtOdds(displayUnderOdds)}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stats row — uses gradedProp so numbers match the active line */}
      {(() => {
        const stillLoading = !gradedProp.has_analytics && !gradedProp.data_unavailable;
        const Skeleton = () => <span className="inline-block w-10 h-3.5 rounded bg-white/10 animate-pulse mt-0.5" />;
        return (
          <div className="px-4 pb-3 grid grid-cols-3 gap-2">
            <div className="bg-white/3 rounded-xl p-2.5 text-center">
              <p className="text-[9px] text-muted-foreground/60 uppercase font-semibold tracking-wider">Projection</p>
              <p className="text-sm font-bold text-foreground mt-0.5">
                {stillLoading ? <Skeleton /> : (gradedProp.projection ?? '—')}
              </p>
            </div>
            <div className="bg-white/3 rounded-xl p-2.5 text-center">
              <p className="text-[9px] text-muted-foreground/60 uppercase font-semibold tracking-wider">Edge</p>
              <p className={cn("text-sm font-bold flex items-center justify-center gap-0.5 mt-0.5", isOverFavorable ? 'text-primary' : 'text-destructive')}>
                {stillLoading ? <Skeleton /> : (
                  <>
                    {isOverFavorable ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {gradedProp.edge != null ? `${gradedProp.edge > 0 ? '+' : ''}${gradedProp.edge}` : '—'}
                  </>
                )}
              </p>
            </div>
            <div className="bg-white/3 rounded-xl p-2.5 text-center">
              <p className="text-[9px] text-muted-foreground/60 uppercase font-semibold tracking-wider">Hit Rate</p>
              <p className="text-sm font-bold text-foreground mt-0.5">
                {stillLoading ? <Skeleton /> : (gradedProp.hit_rate_last_10 != null ? `${gradedProp.hit_rate_last_10}%` : '—')}
              </p>
            </div>
          </div>
        );
      })()}

      {/* Platform badges */}
      {baseProp.sources?.length > 0 && (
        <div className="px-4 pb-2 flex items-center gap-1.5 flex-wrap">
          {/** @type {string[]} */ (baseProp.sources).map(src => {
            const m = SOURCE_META[src];
            if (!m) return null;
            return (
              <span key={src} className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-md border', m.cls)}>
                {m.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Streak — recalculated from live logs against active line */}
      {streakInfo && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-1.5 bg-chart-4/8 border border-chart-4/15 rounded-xl px-3 py-1.5">
            <Zap className="w-3 h-3 text-chart-4 flex-shrink-0" />
            <p className="text-[11px] text-chart-4 font-medium">{streakInfo}</p>
          </div>
        </div>
      )}

      {/* Grade Checklist — uses gradedProp so all values match active line */}
      <PropGradeChecklist prop={gradedProp} />

      {/* Deep Dive */}
      <div className="px-4 pb-4">
        <button onClick={onOpenDetail}
          className="w-full text-xs font-semibold text-muted-foreground hover:text-primary border border-white/8 hover:border-primary/25 rounded-xl py-2.5 transition-all bg-white/3 hover:bg-primary/5">
          Full Analysis + Line Adjuster →
        </button>
      </div>

      {/* Book comparison */}
      {hasBooks && (
        <div className="border-t border-white/5">
          <button onClick={() => setShowBooks(s => !s)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors">
            {showBooks ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showBooks ? 'Hide' : 'Compare'} {baseProp.all_books.length} books
          </button>
          {showBooks && (
            <div className="px-4 pb-4 space-y-1.5">
              <div className="grid grid-cols-5 text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-2 px-1">
                <span className="col-span-2">Book</span>
                <span className="text-center">Line</span>
                <span className="text-center">Over</span>
                <span className="text-center">Under</span>
              </div>
              {baseProp.all_books.map(b => {
                const isActive = selectedBook === b.key || (!selectedBook && b.key === baseProp.all_books[0]?.key);
                return (
                  <button key={b.key} onClick={() => setSelectedBook(selectedBook === b.key ? null : b.key)}
                    className={cn(
                      "w-full grid grid-cols-5 text-xs rounded-xl px-3 py-2 items-center transition-all",
                      isActive ? "bg-primary/10 border border-primary/20" : "bg-white/3 hover:bg-white/6 border border-transparent"
                    )}>
                    <span className={cn("col-span-2 text-[10px] truncate font-semibold", isActive ? "text-primary" : "text-muted-foreground")}>
                      {isActive && <Check className="w-2.5 h-2.5 inline mr-1" />}
                      {b.title}
                    </span>
                    <span className="text-center font-mono text-foreground">{b.line ?? '—'}</span>
                    <span className={cn("text-center font-mono font-bold",
                      b.over_odds === bestOverOdds ? "text-primary" : b.over_odds === worstOverOdds ? "text-destructive" : "text-foreground")}>
                      {fmtOdds(b.over_odds)}
                    </span>
                    <span className={cn("text-center font-mono font-bold",
                      b.under_odds === bestUnderOdds ? "text-primary" : b.under_odds === worstUnderOdds ? "text-destructive" : "text-foreground")}>
                      {fmtOdds(b.under_odds)}
                    </span>
                  </button>
                );
              })}
              <p className="text-[9px] text-muted-foreground/40 text-center pt-1">Tap a book to use its odds in your parlay</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
