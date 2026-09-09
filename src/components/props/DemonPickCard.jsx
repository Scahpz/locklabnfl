import React from 'react';
import { Flame, TrendingUp, Zap, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import PlayerAvatar from '@/components/common/PlayerAvatar';
import { formatMarket } from '@/lib/propLabels';
import { useParlay } from '@/lib/ParlayContext';
import { Link } from 'react-router-dom';

function fmtOdds(n) {
  if (n == null) return '—';
  return n > 0 ? `+${n}` : `${n}`;
}

const propTypeLabels = {
  points: 'PTS', rebounds: 'REB', assists: 'AST', PRA: 'PRA',
  '3PM': '3PM', steals: 'STL', blocks: 'BLK',
  'P+R': 'P+R', 'P+A': 'P+A', 'A+R': 'A+R',
};

export default function DemonPickCard({ pick, onOpenDetail }) {
  const { addLeg, isSelected } = useParlay();
  if (!pick) return null;

  const { prop, reason, coldStreakLen, seasonAvg, boomLine, boomScore } = pick;
  const label = propTypeLabels[prop.prop_type] || formatMarket(prop.prop_type);
  const picked = isSelected(prop.player_name, prop.prop_type, 'over');

  return (
    <div className="relative rounded-2xl overflow-hidden border border-orange-500/25 bg-[hsl(222,47%,9%)] glow-orange">
      {/* Top gradient bar */}
      <div className="h-0.5 w-full bg-gradient-to-r from-orange-600/0 via-orange-500 to-red-500/0" />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
              <Flame className="w-4.5 h-4.5 text-orange-400" />
            </div>
            <div>
              <p className="text-xs font-bold text-orange-400 uppercase tracking-widest leading-none">Demon Pick</p>
              <p className="text-[10px] text-orange-400/50 mt-0.5">Bounce-back Alert</p>
            </div>
          </div>
          {/* Boom score */}
          <div className="flex flex-col items-center justify-center w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20">
            <p className="text-lg font-black text-orange-400 leading-none">{boomScore}</p>
            <p className="text-[8px] text-orange-400/60 uppercase tracking-wider leading-none mt-0.5">Boom</p>
          </div>
        </div>

        {/* Player */}
        <div className="flex items-center gap-3 mb-4">
          <PlayerAvatar photo={prop.image_url} team={prop.team} className="w-11 h-11" />
          <div className="flex-1 min-w-0">
            <Link to={`/trends?player=${encodeURIComponent(prop.player_name)}`}
              className="font-bold text-sm text-foreground hover:text-orange-400 transition-colors">
              {prop.player_name}
            </Link>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">{prop.team} vs {prop.opponent} · {prop.position}</p>
          </div>
        </div>

        {/* Demon line block */}
        <div className="bg-orange-500/5 border border-orange-500/15 rounded-2xl p-4 mb-4">
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="text-[9px] text-orange-400/60 font-bold uppercase tracking-wider mb-1">Demon Line · {label}</p>
              <p className="text-4xl font-black text-orange-400 leading-none">{boomLine}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] text-muted-foreground/50 uppercase mb-1">Book Line</p>
              <p className="text-xl font-bold text-muted-foreground/40 line-through">{prop.line}</p>
            </div>
          </div>
          <button
            onClick={() => addLeg({ ...prop, line: boomLine }, 'over')}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-xl py-2.5 transition-all active:scale-[0.98] font-bold text-sm border",
              picked
                ? "bg-orange-500 border-orange-500 text-white shadow-[0_0_16px_hsl(25,100%,50%,0.3)]"
                : "bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/25 text-orange-400"
            )}
          >
            <TrendingUp className="w-4 h-4" />
            OVER {boomLine} · {fmtOdds(prop.over_odds)}
          </button>
        </div>

        {/* Why section */}
        <div className="bg-white/3 border border-white/5 rounded-xl p-3 mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="w-3 h-3 text-orange-400" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400/80">Why They'll Explode</p>
          </div>
          <p className="text-xs text-muted-foreground/80 leading-relaxed">{reason}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="text-center bg-white/3 rounded-xl py-2.5">
            <p className="text-[9px] text-muted-foreground/50 uppercase font-semibold">L10 Avg</p>
            <p className={cn("text-sm font-bold mt-0.5", (prop.avg_last_10 || 0) > prop.line ? 'text-primary' : 'text-destructive')}>
              {prop.avg_last_10 ?? '—'}
            </p>
          </div>
          <div className="text-center bg-white/3 rounded-xl py-2.5">
            <p className="text-[9px] text-muted-foreground/50 uppercase font-semibold">Season</p>
            <p className={cn("text-sm font-bold mt-0.5", (seasonAvg || 0) > prop.line ? 'text-primary' : 'text-muted-foreground')}>
              {seasonAvg ?? '—'}
            </p>
          </div>
          <div className="text-center bg-orange-500/8 border border-orange-500/15 rounded-xl py-2.5">
            <p className="text-[9px] text-orange-400/60 uppercase font-semibold">Cold Streak</p>
            <p className="text-sm font-bold text-orange-400 mt-0.5">
              {coldStreakLen > 0 ? `${coldStreakLen}G Under` : 'Slumping'}
            </p>
          </div>
        </div>

        <button onClick={onOpenDetail}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-orange-400/60 hover:text-orange-400 border border-orange-500/15 hover:border-orange-500/30 rounded-xl py-2.5 transition-all bg-orange-500/3 hover:bg-orange-500/8">
          Full Analysis <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
