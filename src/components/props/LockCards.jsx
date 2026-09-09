import React from 'react';
import { Lock, TrendingUp, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import PlayerAvatar from '@/components/common/PlayerAvatar';
import { formatMarket } from '@/lib/propLabels';
import { useParlay } from '@/lib/ParlayContext';
import VerdictBadge from '@/components/props/VerdictBadge';
import { gradeProp } from '@/lib/grading';
import { calcEVVerdict } from '@/lib/verdict';

function fmtOdds(n) {
  if (n == null) return '—';
  return n > 0 ? `+${n}` : `${n}`;
}

function LockCard({ prop, aiVerdict, aiLoading }) {
  const { addLeg } = useParlay();

  const logs = prop.last_10_games || [];
  const gradedProp = (() => {
    if (logs.length === 0) return prop;
    const hitCount = logs.filter(v => v > prop.line).length;
    const dynamicHitRate = Math.round(hitCount / logs.length * 100);
    const base = prop.projection ?? prop.avg_last_10 ?? null;
    const dynamicEdge = base != null ? Math.round((base - prop.line) * 100) / 100 : prop.edge;
    return { ...prop, hit_rate_last_10: dynamicHitRate, edge: dynamicEdge };
  })();
  const grade = gradeProp(gradedProp);
  const evVerdict = calcEVVerdict(gradedProp, grade);

  return (
    <div className="relative rounded-2xl border border-primary/20 bg-[hsl(222,47%,9%)] overflow-hidden glow-green">
      {/* Top bar */}
      <div className="h-0.5 w-full bg-gradient-to-r from-primary/0 via-primary to-primary/0" />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Lock className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest leading-none">Pick of the Day</p>
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground/60 bg-white/5 border border-white/8 rounded-lg px-2 py-0.5 font-medium">
            10/10 confidence
          </span>
        </div>

        {/* Player */}
        <div className="flex items-center gap-3 mb-4">
          <PlayerAvatar photo={prop.image_url} team={prop.team} className="w-12 h-12" bgClass="bg-white/5 border border-white/8" />
          <div>
            <p className="font-bold text-foreground">{prop.player_name}</p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">{prop.team} vs {prop.opponent}</p>
          </div>
        </div>

        <VerdictBadge evVerdict={evVerdict} loading={aiLoading && !aiVerdict} />
        {aiVerdict?.reason && (
          <p className="text-[11px] text-muted-foreground/70 mt-2 leading-snug">{aiVerdict.reason}</p>
        )}

        {/* Line block */}
        <div className="flex items-center justify-between bg-white/4 border border-white/6 rounded-xl p-3 mt-3">
          <div>
            <p className="text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wider">{formatMarket(prop.prop_type)}</p>
            <p className="text-2xl font-bold text-foreground mt-0.5 leading-none">{evVerdict.direction === 'OVER' ? 'Over' : 'Under'} {prop.line}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-primary">{evVerdict.direction === 'OVER' ? fmtOdds(prop.over_odds) : fmtOdds(prop.under_odds)}</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">{evVerdict.direction === 'OVER' ? gradedProp.hit_rate_last_10 : 100 - (gradedProp.hit_rate_last_10 ?? 50)}% hit rate</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-white/3 rounded-xl p-2.5 text-center">
            <p className="text-[9px] text-muted-foreground/50 uppercase font-semibold">Projection</p>
            <p className="text-sm font-bold text-primary mt-0.5">{prop.projection ?? '—'}</p>
          </div>
          <div className="bg-white/3 rounded-xl p-2.5 text-center">
            <p className="text-[9px] text-muted-foreground/50 uppercase font-semibold">Edge</p>
            <p className="text-sm font-bold text-primary mt-0.5">{prop.edge != null ? `+${prop.edge}%` : '—'}</p>
          </div>
          <div className="bg-white/3 rounded-xl p-2.5 text-center">
            <p className="text-[9px] text-muted-foreground/50 uppercase font-semibold">Avg L5</p>
            <p className="text-sm font-bold text-foreground mt-0.5">{prop.avg_last_5 ?? '—'}</p>
          </div>
        </div>

        {prop.streak_info && (
          <div className="flex items-center gap-1.5 bg-primary/8 border border-primary/15 rounded-xl px-3 py-1.5 mt-3">
            <Zap className="w-3 h-3 text-primary flex-shrink-0" />
            <p className="text-[11px] text-primary font-medium">{prop.streak_info}</p>
          </div>
        )}

        <button
          onClick={() => addLeg(prop, evVerdict.direction === 'OVER' ? 'over' : 'under')}
          className="w-full mt-3 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/15 active:scale-[0.98] border border-primary/25 text-primary text-xs font-bold transition-all flex items-center justify-center gap-1.5"
        >
          <TrendingUp className="w-3.5 h-3.5" />
          Add {evVerdict.direction === 'OVER' ? 'Over' : 'Under'} to Parlay
        </button>
      </div>
    </div>
  );
}

export default function LockCards({ locks, verdicts, aiLoading }) {
  if (!locks || locks.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
          <Lock className="w-3.5 h-3.5 text-primary" />
        </div>
        <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
          Pick{locks.length > 1 ? 's' : ''} of the Day
        </h2>
        <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-lg font-bold">
          {locks.length}
        </span>
      </div>
      <div className={cn("grid gap-4", locks.length > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3")}>
        {locks.map((prop, i) => {
          const key = `${prop.player_name}__${prop.prop_type}__${prop.line}`;
          return (
            <LockCard key={i} prop={prop} aiVerdict={verdicts[key]} aiLoading={aiLoading} />
          );
        })}
      </div>
    </div>
  );
}
