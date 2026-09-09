import React from 'react';
import { Flame, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/common/TeamLogo';
import { formatMarket } from '@/lib/propLabels';

export default function HotStreakCard({ player, prop, onClick, isSelected }) {
  const hits = prop.last_10_games?.filter(v => v > prop.line).length || 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/5 min-w-[140px]",
        isSelected ? "border-primary/50 bg-primary/10" : "border-border bg-card"
      )}
    >
      <div className="flex items-center gap-2">
        <TeamLogo team={player.team} className="w-8 h-8" />
        <div className="min-w-0">
          <p className="text-xs font-bold text-foreground truncate">{player.player_name.split(' ').pop()}</p>
          <p className="text-[10px] text-muted-foreground">{player.team}</p>
        </div>
        <Flame className="w-3.5 h-3.5 text-orange-400 ml-auto flex-shrink-0" />
      </div>
      <div className="bg-secondary/60 rounded-lg px-2 py-1.5 text-center">
        <p className="text-[10px] text-muted-foreground uppercase">{formatMarket(prop.prop_type)}</p>
        <p className="text-base font-bold text-primary">{hits}/10</p>
        <p className="text-[10px] text-muted-foreground">hit rate</p>
      </div>
      {prop.streak_info && (
        <p className="text-[10px] text-primary font-medium flex items-center gap-1 leading-tight">
          <TrendingUp className="w-3 h-3 flex-shrink-0" />
          <span className="line-clamp-1">{prop.streak_info}</span>
        </p>
      )}
    </button>
  );
}