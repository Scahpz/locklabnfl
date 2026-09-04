import React, { useState, useMemo } from 'react';
import { ChevronDown, TrendingUp, TrendingDown, BookmarkPlus, Check, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/common/TeamLogo';
import PropGradeChecklist from '@/components/props/PropGradeChecklist';
import { gradeProp } from '@/lib/grading';
import { calcEVVerdict, TIER_CONFIG } from '@/lib/verdict';
import { useParlay } from '@/lib/ParlayContext';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

function getNFLWeek(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const year = d.getUTCFullYear();
  const sep1 = new Date(Date.UTC(year, 8, 1));
  const daysToMonday = (1 - sep1.getUTCDay() + 7) % 7;
  const laborDay = new Date(Date.UTC(year, 8, 1 + daysToMonday));
  const week1Start = new Date(laborDay.getTime() + 3 * 24 * 60 * 60 * 1000);
  if (d < week1Start) return null;
  const n = Math.floor((d.getTime() - week1Start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return n >= 1 && n <= 18 ? n : null;
}

function PlayerAvatar({ prop, name }) {
  const [err, setErr] = React.useState(false);
  const url = !err && prop.image_url ? prop.image_url : null;
  if (url) {
    return (
      <div className="w-11 h-11 rounded-full overflow-hidden bg-secondary flex-shrink-0 border border-white/10">
        <img src={url} alt={name} className="w-full h-full object-cover object-top" onError={() => setErr(true)} />
      </div>
    );
  }
  return <TeamLogo team={prop.team} className="w-11 h-11 flex-shrink-0" />;
}

function fmtOdds(n) {
  if (n == null) return '';
  return n > 0 ? `+${n}` : `${n}`;
}

const propTypeLabels = {
  passing_yards: 'Pass Yds', passing_tds: 'Pass TDs', completions: 'Comp',
  rushing_yards: 'Rush Yds', rushing_tds: 'Rush TDs', rushing_attempts: 'Rush Att',
  receiving_yards: 'Rec Yds', receiving_tds: 'Rec TDs', receptions: 'Rec',
  fantasy_points: 'Fant Pts', kicking_points: 'Kick Pts',
  tackles: 'Tackles', sacks: 'Sacks',
  passing_ints: 'INTs Thrown',
  rush_rec_tds: 'Rush+Rec TDs', rush_rec_yards: 'Rush+Rec Yds',
  pass_rush_yards: 'Pass+Rush Yds',
  passing_long: 'Long Comp', rushing_long: 'Long Rush',
  q1_receptions: '1Q Rec', q1_rush_rec_tds: '1Q R+R TDs',
  h1_receptions: '1H Rec', h1_rush_rec_tds: '1H R+R TDs',
  q1_passing_yards: '1Q Pass Yds', q1_rushing_yards: '1Q Rush Yds', q1_receiving_yards: '1Q Rec Yds',
  h1_passing_yards: '1H Pass Yds', h1_rushing_yards: '1H Rush Yds', h1_receiving_yards: '1H Rec Yds',
};

export default function PlayerRow({ playerName, props, allPlayerProps, rank, verdicts, aiLoading, activeSource, onOpenDetail }) {
  const [expanded, setExpanded] = useState(false);
  const [activeType, setActiveType] = useState(() => props[0]?.prop_type);
  const [tracked, setTracked] = useState(false);
  const { addLeg, isSelected } = useParlay();

  const activeProp = useMemo(
    () => props.find(p => p.prop_type === activeType) ?? props[0],
    [props, activeType]
  );

  const platformBook = useMemo(() => {
    if (!activeSource) return null;
    return (activeProp.all_books || []).find(b => b.key === activeSource) ?? null;
  }, [activeSource, activeProp]);

  const gradedProp = useMemo(() => {
    const line      = platformBook?.line      ?? activeProp.line;
    const overOdds  = platformBook?.over_odds  ?? activeProp.over_odds;
    const underOdds = platformBook?.under_odds ?? activeProp.under_odds;
    const base      = activeProp.projection ?? activeProp.avg_last_10 ?? null;
    const logs      = activeProp.last_10_games || [];
    const hitCount  = logs.filter(v => v > line).length;
    const dynamicHitRate = logs.length > 0 ? Math.round(hitCount / logs.length * 100) : activeProp.hit_rate_last_10;
    const dynamicEdge    = base != null ? Math.round((base - line) * 100) / 100 : activeProp.edge;
    return { ...activeProp, line, over_odds: overOdds, under_odds: underOdds, hit_rate_last_10: dynamicHitRate, edge: dynamicEdge };
  }, [activeProp, platformBook]);

  const grade     = gradeProp(gradedProp);
  const evVerdict = calcEVVerdict(gradedProp, grade);
  const isOver    = evVerdict.direction === 'OVER';

  const weekNum = getNFLWeek(activeProp.scheduled_at);
  const displayLabel = evVerdict.tier === 'PRESEASON' && weekNum != null
    ? `WK ${weekNum}`
    : evVerdict.label;


  const hasStats    = gradedProp.avg_last_10 != null || gradedProp.hit_rate_last_10 != null;
  const isMarketOnly = evVerdict.tier === 'PRESEASON' || activeProp.data_unavailable === true;

  const selectedOver  = isSelected(playerName, gradedProp.prop_type, 'over');
  const selectedUnder = isSelected(playerName, gradedProp.prop_type, 'under');

  const gameDate = activeProp.scheduled_at
    ? new Date(activeProp.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  const rankStyle = rank <= 3
    ? 'text-chart-4 bg-chart-4/10 border-chart-4/25'
    : rank <= 10
    ? 'text-primary bg-primary/10 border-primary/15'
    : 'text-muted-foreground bg-white/5 border-white/8';

  const handleTrack = async (e) => {
    e.stopPropagation();
    try {
      await base44.entities.PropHistory.create({
        player_name: playerName,
        team:        gradedProp.team || '',
        opponent:    gradedProp.opponent || '',
        prop_type:   gradedProp.prop_type,
        line:        gradedProp.line,
        direction:   evVerdict.direction,
        grade_label: evVerdict.label,
        tier:        evVerdict.tier,
        game_date:   new Date().toLocaleDateString('en-CA'),
        result:      'pending',
      });
      setTracked(true);
      toast.success(`Tracking ${playerName} ${evVerdict.direction} ${gradedProp.line}`);
    } catch {
      toast.error('Failed to track prop');
    }
  };

  return (
    <div className={cn(
      "rounded-2xl border bg-[hsl(222,47%,9%)] overflow-hidden transition-all duration-200 flex flex-col",
      expanded
        ? "border-white/12 shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
        : "border-white/6 hover:border-white/12"
    )}>
      {/* ── Card face ──────────────────────────────────────────── */}
      <div className="p-4 cursor-pointer select-none flex-1" onClick={() => setExpanded(e => !e)}>

        {/* Player header */}
        <div className="flex items-center gap-2.5 mb-3">
          <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold border flex-shrink-0", rankStyle)}>
            {rank}
          </div>
          <PlayerAvatar prop={activeProp} name={playerName} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-bold text-sm text-foreground leading-tight">{playerName}</p>
              {activeProp.position && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/20 flex-shrink-0">
                  {activeProp.position}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">
              {activeProp.team && activeProp.opponent
                ? `${activeProp.team} vs ${activeProp.opponent}`
                : activeProp.team || ''}
              {gameDate && ` · ${gameDate}`}
            </p>
          </div>
          <button
            onClick={handleTrack}
            title={tracked ? 'Tracked!' : 'Track this prop'}
            className={cn(
              "w-7 h-7 flex items-center justify-center rounded-lg transition-all flex-shrink-0",
              tracked ? "bg-primary/15 text-primary" : "bg-white/5 text-muted-foreground hover:bg-primary/10 hover:text-primary"
            )}
          >
            {tracked ? <Check className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Prop type tabs */}
        <div
          className="flex items-center gap-1.5 mb-3 overflow-x-auto scrollbar-none"
          onClick={e => e.stopPropagation()}
        >
          {props.map(p => {
            const label   = propTypeLabels[p.prop_type] || p.prop_type;
            const isActive = p.prop_type === activeProp?.prop_type;
            const pLine   = activeSource
              ? ((p.all_books || []).find(b => b.key === activeSource)?.line ?? p.line)
              : p.line;
            return (
              <button
                key={p.prop_type}
                onClick={() => setActiveType(p.prop_type)}
                className={cn(
                  "flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all flex-shrink-0 whitespace-nowrap",
                  isActive
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-white/5 border-white/8 text-muted-foreground/60 hover:text-foreground hover:border-white/15"
                )}
              >
                {label}
                <span className={cn("font-mono text-[9px]", isActive ? "text-primary/70" : "text-muted-foreground/40")}>
                  {pLine ?? '—'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Direction banner */}
        <div className={cn(
          "rounded-xl p-3 flex items-center justify-between mb-2.5",
          isOver
            ? "bg-emerald-500/10 border border-emerald-500/25"
            : "bg-rose-500/10 border border-rose-500/25"
        )}>
          <div className="flex items-center gap-2.5">
            {isOver
              ? <TrendingUp className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              : <TrendingDown className="w-4 h-4 text-rose-400 flex-shrink-0" />
            }
            <div>
              <div className="flex items-baseline gap-1.5">
                <p className={cn("text-xl font-black leading-none tracking-tight tabular-nums", isOver ? "text-emerald-400" : "text-rose-400")}>
                  {isOver ? grade.overProb : grade.underProb}%
                </p>
                <p className={cn("text-[11px] font-bold leading-none", isOver ? "text-emerald-400/55" : "text-rose-400/55")}>
                  {evVerdict.direction}
                </p>
              </div>
              <p className="text-xs font-semibold text-foreground/55 font-mono leading-tight mt-0.5">
                {gradedProp.line ?? '—'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className={cn(
              "text-[10px] font-bold px-2.5 py-1.5 rounded-lg border inline-block",
              TIER_CONFIG[evVerdict.tier]?.badge
            )}>
              {displayLabel}
            </span>
            {isMarketOnly && (
              <p className="text-[9px] text-muted-foreground/40 mt-1">Market lean · no history</p>
            )}
          </div>
        </div>

        {/* OVER / UNDER bet buttons with devigged market probabilities */}
        <div className="flex gap-2 mb-2.5" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => addLeg(gradedProp, 'over')}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5",
              selectedOver
                ? "bg-emerald-500 border-emerald-500 text-white shadow-[0_0_14px_rgba(16,185,129,0.35)]"
                : "bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 active:scale-[0.98]"
            )}
          >
            <TrendingUp className="w-3 h-3 flex-shrink-0" />
            OVER {fmtOdds(gradedProp.over_odds)}
          </button>
          <button
            onClick={() => addLeg(gradedProp, 'under')}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5",
              selectedUnder
                ? "bg-rose-500 border-rose-500 text-white shadow-[0_0_14px_rgba(239,68,68,0.35)]"
                : "bg-rose-500/10 border-rose-500/25 text-rose-400 hover:bg-rose-500/20 active:scale-[0.98]"
            )}
          >
            <TrendingDown className="w-3 h-3 flex-shrink-0" />
            UNDER {fmtOdds(gradedProp.under_odds)}
          </button>
        </div>

        {/* Stats row — only when historical data is available */}
        {hasStats && (
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60 mb-2 flex-wrap">
            {gradedProp.avg_last_10 != null && (
              <span>L10 avg <span className="text-foreground/80 font-semibold">{gradedProp.avg_last_10}</span></span>
            )}
            {gradedProp.hit_rate_last_10 != null && (
              <span>Hit rate <span className="text-foreground/80 font-semibold">{gradedProp.hit_rate_last_10}%</span></span>
            )}
            {gradedProp.edge != null && gradedProp.edge !== 0 && (
              <span>Edge <span className={cn("font-semibold", gradedProp.edge > 0 ? "text-emerald-400" : "text-rose-400")}>
                {gradedProp.edge > 0 ? '+' : ''}{gradedProp.edge}
              </span></span>
            )}
          </div>
        )}

        {/* Expand toggle */}
        <div className="flex items-center justify-end pt-1 border-t border-white/5">
          <span className="text-[10px] text-muted-foreground/40 flex items-center gap-1">
            {expanded ? 'Hide breakdown' : 'Grade breakdown'}
            <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", expanded && "rotate-180")} />
          </span>
        </div>
      </div>

      {/* ── Expanded: grade checklist + analysis button (no duplicate header) ── */}
      {expanded && (
        <div className="border-t border-white/6 bg-black/10">
          <PropGradeChecklist prop={activeProp} initialOpen={true} />
          <div className="px-4 pb-4">
            <button
              onClick={(e) => { e.stopPropagation(); onOpenDetail(activeProp.player_name, activeProp.prop_type); }}
              className="w-full py-2.5 text-xs font-semibold rounded-xl border border-primary/20 text-primary/70 hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-center gap-1.5"
            >
              Full Analysis + Line Adjuster
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
