import React, { useState } from 'react';
import { useParlay } from '@/lib/ParlayContext';
import { useNavigate } from 'react-router-dom';
import { Layers, X, ChevronUp, ChevronDown, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/common/TeamLogo';
import { formatMarket } from '@/lib/propLabels';

export default function MiniParlayBar() {
  const { legs, removeLeg, removeGameLeg, clearLegs } = useParlay();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  if (legs.length === 0) return null;

  return (
    <div className="fixed above-mobile-nav md:bottom-0 left-0 right-0 z-40">
      {/* Expanded legs */}
      {expanded && (
        <div className="mx-3 md:mx-0 mb-1 md:mb-0 bg-[hsl(222,47%,9%)] border border-white/8 rounded-2xl md:rounded-none md:rounded-t-xl overflow-hidden shadow-2xl">
          <div className="p-3 max-h-52 overflow-y-auto space-y-1.5">
            {legs.map((leg, i) => (
              <div key={i} className="flex items-center gap-2.5 bg-white/5 rounded-xl px-3 py-2">
                <TeamLogo team={leg.team} className="w-6 h-6 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{leg.player_name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {leg.is_game_bet ? (
                      <span className="font-bold text-primary">{formatMarket(leg.prop_type)} · {leg.odds > 0 ? '+' : ''}{leg.odds}</span>
                    ) : (
                      <>
                        <span className={cn("font-bold", leg.pick === 'over' ? 'text-primary' : 'text-destructive')}>
                          {leg.pick.toUpperCase()}
                        </span>
                        {' '}{leg.line} {formatMarket(leg.prop_type)} · <span className="text-muted-foreground">{leg.odds > 0 ? '+' : ''}{leg.odds}</span>
                      </>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => leg.is_game_bet ? removeGameLeg(leg.leg_id) : removeLeg(leg.player_name, leg.prop_type)}
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all flex-shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bar */}
      <div
        className="bg-[hsl(222,47%,9%)] border-t border-white/8 shadow-[0_-8px_32px_rgba(0,0,0,0.4)] flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Left: icon + count */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="relative">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Layers className="w-4 h-4 text-primary" />
            </div>
            <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
              {legs.length}
            </span>
          </div>
          <div>
            <p className="text-sm font-bold text-foreground leading-none">My Parlay</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{legs.length} leg{legs.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Middle: previews */}
        <div className="hidden sm:flex items-center gap-1.5 flex-1 overflow-hidden min-w-0">
          {legs.slice(0, 3).map((leg, i) => (
            <div key={i} className="bg-white/5 rounded-lg px-2 py-1 text-[10px] whitespace-nowrap">
              {leg.is_game_bet ? (
                <span className="font-bold text-primary">{leg.player_name}</span>
              ) : (
                <>
                  <span className={cn("font-bold", leg.pick === 'over' ? 'text-primary' : 'text-destructive')}>
                    {leg.pick === 'over' ? 'O' : 'U'}
                  </span>
                  <span className="text-muted-foreground"> {leg.player_name.split(' ').pop()} {leg.line}</span>
                </>
              )}
            </div>
          ))}
          {legs.length > 3 && <span className="text-[10px] text-muted-foreground">+{legs.length - 3}</span>}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
          <button
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); clearLegs(); }}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-lg hover:bg-destructive/10"
          >
            Clear
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); navigate('/parlay'); }}
            className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 active:scale-95 text-primary-foreground text-xs font-bold px-3 py-2 rounded-xl transition-all"
          >
            Build <ArrowRight className="w-3 h-3" />
          </button>
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>
    </div>
  );
}
