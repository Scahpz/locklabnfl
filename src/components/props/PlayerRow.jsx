import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, BookmarkPlus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/common/TeamLogo';
import RankedPropCard from '@/components/props/RankedPropCard';
import { gradeProp } from '@/lib/grading';
import { calcEVVerdict, TIER_CONFIG } from '@/lib/verdict';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

function PlayerAvatar({ prop, name }) {
  const [imgError, setImgError] = React.useState(false);
  const url = !imgError && prop.image_url ? prop.image_url : null;
  if (url) {
    return (
      <div className="w-9 h-9 rounded-full overflow-hidden bg-secondary flex-shrink-0 border border-white/8">
        <img src={url} alt={name} className="w-full h-full object-cover object-top" onError={() => setImgError(true)} />
      </div>
    );
  }
  return <TeamLogo team={prop.team} className="w-9 h-9 flex-shrink-0" />;
}

const propTypeLabels = {
  // NFL full-game
  passing_yards: 'Pass Yds', passing_tds: 'Pass TDs', completions: 'Comp',
  rushing_yards: 'Rush Yds', rushing_tds: 'Rush TDs', rushing_attempts: 'Rush Att',
  receiving_yards: 'Rec Yds', receiving_tds: 'Rec TDs', receptions: 'Rec',
  fantasy_points: 'Fant Pts', kicking_points: 'Kick Pts',
  tackles: 'Tackles', sacks: 'Sacks',
  passing_ints: 'INTs Thrown',   // QB interceptions thrown (not defensive)
  rush_rec_tds: 'Rush+Rec TDs',  // combined rushing + receiving touchdowns
  pass_rush_yards: 'Pass+Rush Yds',
  passing_long: 'Long Comp',
  rushing_long: 'Long Rush',
  // NFL 1st quarter
  q1_passing_yards: '1Q Pass Yds', q1_rushing_yards: '1Q Rush Yds', q1_receiving_yards: '1Q Rec Yds',
  // NFL 1st half
  h1_passing_yards: '1H Pass Yds', h1_rushing_yards: '1H Rush Yds', h1_receiving_yards: '1H Rec Yds',
  // NFL season-long (futures / best-ball markets)
  season_passing_yards: 'Pass Yds (Season)', season_passing_tds: 'Pass TDs (Season)',
  season_rushing_yards: 'Rush Yds (Season)', season_rushing_tds: 'Rush TDs (Season)',
  season_receiving_yards: 'Rec Yds (Season)', season_receiving_tds: 'Rec TDs (Season)',
  season_receptions: 'Rec (Season)', season_sacks: 'Sacks (Season)',
  // NBA
  points: 'PTS', rebounds: 'REB', assists: 'AST', PRA: 'PRA',
  '3PM': '3PM', steals: 'STL', blocks: 'BLK', turnovers: 'TO',
  'P+R': 'P+R', 'P+A': 'P+A', 'A+R': 'A+R',
};

export default function PlayerRow({ playerName, props, allPlayerProps, rank, verdicts, aiLoading, activeSource, onOpenDetail }) {
  const [expanded, setExpanded] = useState(false);
  const [activeType, setActiveType] = useState(() => props[0]?.prop_type);
  const [tracked, setTracked] = useState(false);

  // If activeType is no longer in the filtered set, fall back gracefully
  const activeProp = useMemo(() => {
    return props.find(p => p.prop_type === activeType) ?? props[0];
  }, [props, activeType]);

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
  const stillLoading = !gradedProp.has_analytics && !gradedProp.data_unavailable;

  const handleTrack = async (e) => {
    e.stopPropagation();
    try {
      await base44.entities.PropHistory.create({
        player_name:  playerName,
        team:         gradedProp.team || gradedProp.player_team || '',
        opponent:     gradedProp.opponent || '',
        prop_type:    gradedProp.prop_type,
        line:         gradedProp.line,
        direction:    evVerdict.direction,
        grade_label:  evVerdict.label,
        tier:         evVerdict.tier,
        game_date:    new Date().toLocaleDateString('en-CA'),
        result:       'pending',
      });
      setTracked(true);
      toast.success(`Tracking ${playerName} ${evVerdict.direction} ${gradedProp.line} ${gradedProp.prop_type}`);
    } catch {
      toast.error('Failed to track prop');
    }
  };

  const rankStyle = rank <= 3
    ? 'text-chart-4 bg-chart-4/10 border-chart-4/25'
    : rank <= 10
    ? 'text-primary bg-primary/10 border-primary/15'
    : 'text-muted-foreground bg-white/5 border-white/8';

  return (
    <div className={cn(
      "rounded-2xl border bg-[hsl(222,47%,9%)] overflow-hidden transition-all duration-200",
      expanded ? "border-white/12 shadow-[0_4px_20px_rgba(0,0,0,0.25)]" : "border-white/6 hover:border-white/10"
    )}>
      {/* Collapsed header — always visible. Click whole header to expand/collapse. */}
      <div className="p-3 cursor-pointer select-none" onClick={() => setExpanded(e => !e)}>
        {/* Top row: rank + player info + verdict + chevron */}
        <div className="flex items-center gap-2">
          <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold border flex-shrink-0", rankStyle)}>
            {rank}
          </div>
          <PlayerAvatar prop={activeProp} name={playerName} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-semibold text-sm text-foreground truncate leading-tight">{playerName}</p>
              {activeProp.position && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/20 flex-shrink-0">
                  {activeProp.position}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground/60 leading-tight">
              {activeProp.team
                ? `${activeProp.team}${activeProp.opponent ? ` vs ${activeProp.opponent}` : ''}`
                : activeProp.position || ''}
              {activeProp.scheduled_at && (
                <span> · {new Date(activeProp.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              )}
            </p>
          </div>
          <span className={cn(
            "flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg border flex-shrink-0",
            TIER_CONFIG[evVerdict.tier]?.badge
          )}>
            <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', TIER_CONFIG[evVerdict.tier]?.dot)} />
            {evVerdict.label}
          </span>
          <button
            onClick={handleTrack}
            title={tracked ? 'Tracked!' : 'Track this prop'}
            className={cn(
              "w-6 h-6 flex items-center justify-center rounded-lg transition-all flex-shrink-0",
              tracked
                ? "bg-primary/15 text-primary"
                : "bg-white/5 text-muted-foreground hover:bg-primary/10 hover:text-primary"
            )}
          >
            {tracked ? <Check className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
          </button>
          <div className="w-6 h-6 flex items-center justify-center rounded-lg bg-white/5 text-muted-foreground flex-shrink-0">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </div>

        {/* Prop type pills — each shows the line. Stop propagation so clicks don't toggle expand. */}
        <div
          className="flex items-center gap-1.5 mt-2.5 overflow-x-auto scrollbar-none"
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
                  "flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all flex-shrink-0 whitespace-nowrap",
                  isActive
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "bg-white/5 border-white/8 text-muted-foreground/70 hover:text-foreground hover:border-white/15"
                )}
              >
                {label}
                <span className={cn("font-mono text-[9px]", isActive ? "text-primary/80" : "text-muted-foreground/50")}>
                  {pLine ?? '—'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Edge / hit rate summary for the active prop */}
        <div className="flex items-center gap-2 mt-1.5">
          {isOver
            ? <TrendingUp className="w-3 h-3 text-primary flex-shrink-0" />
            : <TrendingDown className="w-3 h-3 text-destructive flex-shrink-0" />
          }
          <span className={cn("text-[10px] font-semibold", isOver ? "text-primary" : "text-destructive")}>
            {evVerdict.direction} {gradedProp.line}
          </span>
          {stillLoading ? (
            <span className="inline-block w-24 h-2.5 rounded bg-white/8 animate-pulse" />
          ) : (
            <>
              {gradedProp.edge != null && (
                <span className="text-[10px] text-muted-foreground/50">
                  {gradedProp.edge > 0 ? '+' : ''}{gradedProp.edge} edge
                </span>
              )}
              {gradedProp.hit_rate_last_10 != null && (
                <span className="text-[10px] text-muted-foreground/50">
                  · {gradedProp.hit_rate_last_10}% hit L10
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Expanded: full RankedPropCards for each filtered prop */}
      {expanded && (
        <div className="border-t border-white/5 p-3 space-y-3">
          {props.map((p, i) => {
            const key = `${p.player_name}__${p.prop_type}__${p.line}`;
            return (
              <RankedPropCard
                key={key}
                prop={p}
                rank={rank + i}
                aiVerdict={verdicts[key]}
                aiLoading={aiLoading}
                activeSource={activeSource}
                playerProps={allPlayerProps}
                onOpenDetail={() => onOpenDetail(p.player_name, p.prop_type)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
