import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/common/TeamLogo';
import { fmtOdds } from '@/lib/oddsData';
import { useParlay } from '@/lib/ParlayContext';

function BookDropdown({ books, activeKey, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const active = books.find(b => b.key === activeKey) || books[0];

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!books || books.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors bg-secondary/60 hover:bg-secondary rounded-md px-2 py-1"
      >
        <span className="font-medium">{active?.title ?? 'Book'}</span>
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] bg-popover border border-border rounded-lg shadow-xl overflow-hidden">
          {books.map(b => (
            <button
              key={b.key}
              onClick={() => { onSelect(b.key); setOpen(false); }}
              className={cn(
                "w-full flex items-center justify-between gap-2 px-3 py-2 text-xs transition-colors hover:bg-secondary text-left",
                b.key === activeKey ? "text-primary font-semibold" : "text-foreground"
              )}
            >
              <span>{b.title}</span>
              {b.key === activeKey && <Check className="w-3 h-3 text-primary flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Risk classification based on American odds:
 * - "good"   : heavy favorite (odds <= -140) — likely outcome, green
 * - "neutral": near pick'em (-139 to -101 or +100 to +150) — slight favorite/coin flip, grey
 * - "risky"  : underdog (+151 and above) — unlikely, red
 */
function riskLevel(oddsNum) {
  if (oddsNum == null) return 'neutral';
  if (oddsNum <= -140) return 'good';
  if (oddsNum >= 151) return 'risky';
  return 'neutral';
}

const riskStyles = {
  good:    { idle: 'bg-green-500/10 border-green-500/20 hover:bg-green-500/20', text: 'text-green-400' },
  neutral: { idle: 'bg-secondary/50 border-transparent hover:border-primary/30 hover:bg-primary/5', text: 'text-foreground' },
  risky:   { idle: 'bg-red-500/10 border-red-500/20 hover:bg-red-500/20', text: 'text-red-400' },
};

function OddsButton({ label, value, sub, legId, leg }) {
  const { addGameLeg, isGameLegSelected } = useParlay();
  const selected = isGameLegSelected(legId);
  const risk = riskLevel(leg?.odds);
  const style = riskStyles[risk];

  if (!value || value === '—') {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg px-2 py-2 min-w-[60px] bg-secondary/30">
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
        <p className="text-sm font-bold text-muted-foreground">—</p>
      </div>
    );
  }

  return (
    <button
      onClick={() => addGameLeg({ ...leg, leg_id: legId })}
      className={cn(
        "flex flex-col items-center justify-center rounded-lg px-2 py-2 min-w-[60px] transition-all border",
        selected
          ? "bg-primary/20 border-primary/50"
          : style.idle
      )}
    >
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
      <p className={cn("text-sm font-bold", selected ? "text-primary" : style.text)}>{value}</p>
      {sub && <p className="text-[9px] text-muted-foreground">{sub}</p>}
      {selected && <Check className="w-2.5 h-2.5 text-primary mt-0.5" />}
    </button>
  );
}

function TeamRow({ game, teamAbv, ml, spread, spreadOdds, isHome }) {
  const side = isHome ? 'home' : 'away';
  const opponent = isHome ? game.awayAbv : game.homeAbv;

  return (
    <div className="flex items-center gap-3">
      <TeamLogo team={teamAbv} className="w-9 h-9 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground">{teamAbv}</p>
        <p className="text-[10px] text-muted-foreground">{isHome ? 'Home' : 'Away'}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <OddsButton
          label="ML"
          value={fmtOdds(ml)}
          legId={`${game.id}_${side}_ml`}
          leg={{
            is_game_bet: true,
            bet_type: 'moneyline',
            player_name: `${teamAbv} ML`,
            team: teamAbv,
            opponent,
            prop_type: 'moneyline',
            line: null,
            pick: side,
            odds: ml,
          }}
        />
        {spread != null && (
          <OddsButton
            label="Spread"
            value={spread > 0 ? `+${spread}` : `${spread}`}
            sub={fmtOdds(spreadOdds)}
            legId={`${game.id}_${side}_spread`}
            leg={{
              is_game_bet: true,
              bet_type: 'spread',
              player_name: `${teamAbv} ${spread > 0 ? '+' : ''}${spread}`,
              team: teamAbv,
              opponent,
              prop_type: 'spread',
              line: spread,
              pick: side,
              odds: spreadOdds,
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function GameOddsCard({ game }) {
  const [showBooks, setShowBooks] = useState(false);
  const [activeBookKey, setActiveBookKey] = useState(game.allBooks?.[0]?.key ?? null);

  const gameDate = new Date(game.commence_time);
  const tipoff = gameDate.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York'
  }) + ' ET';
  const dateStr = gameDate.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York'
  });

  const isToday = gameDate.toLocaleDateString() === new Date().toLocaleDateString();
  const isTomorrow = gameDate.toLocaleDateString() === new Date(Date.now() + 86400000).toLocaleDateString();

  // Resolve odds from selected book (or default primary)
  const activeBook = game.allBooks?.find(b => b.key === activeBookKey);
  const awayMl = activeBook?.ml_away ?? game.moneyline?.away;
  const homeMl = activeBook?.ml_home ?? game.moneyline?.home;
  const awaySpread = activeBook?.spread_away ?? game.spread?.away;
  const awaySpreadOdds = activeBook?.spread_away_odds ?? game.spread?.awayOdds;
  const homeSpread = activeBook?.spread_home ?? game.spread?.home;
  const homeSpreadOdds = activeBook?.spread_home_odds ?? game.spread?.homeOdds;
  const totalLine = activeBook?.total_line ?? game.total?.line;
  const totalOver = activeBook?.total_over_odds ?? game.total?.overOdds;
  const totalUnder = activeBook?.total_under_odds ?? game.total?.underOdds;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden hover:border-primary/20 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-secondary/30 border-b border-border">
        <div className="flex items-center gap-2">
          <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full",
            isToday ? "bg-primary/20 text-primary" :
            isTomorrow ? "bg-chart-3/20 text-chart-3" :
            "bg-secondary text-muted-foreground"
          )}>
            {isToday ? 'TODAY' : isTomorrow ? 'TOMORROW' : dateStr}
          </span>
          <span className="text-xs text-muted-foreground">{tipoff}</span>
          {game.is_preseason && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 uppercase tracking-wide">
              Preseason
            </span>
          )}
          {!game.is_preseason && game.week != null && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20 uppercase tracking-wide">
              Week {game.week}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {game.allBooks?.length > 0 ? (
            <BookDropdown
              books={game.allBooks}
              activeKey={activeBookKey}
              onSelect={setActiveBookKey}
            />
          ) : game.moneyline?.bookmaker ? (
            <span className="text-[10px] text-muted-foreground">{game.moneyline.bookmaker}</span>
          ) : null}

        </div>
      </div>

      {/* Teams + Odds */}
      <div className="p-4 space-y-3">
        <TeamRow
          game={game}
          teamAbv={game.awayAbv}
          ml={awayMl}
          spread={awaySpread}
          spreadOdds={awaySpreadOdds}
          isHome={false}
        />
        <div className="border-t border-border/50" />
        <TeamRow
          game={game}
          teamAbv={game.homeAbv}
          ml={homeMl}
          spread={homeSpread}
          spreadOdds={homeSpreadOdds}
          isHome={true}
        />
      </div>

      {/* Total */}
      {totalLine != null && (
        <div className="px-4 pb-3 flex items-center gap-3">
          <div className="flex-1 border-t border-border/50" />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">O/U {totalLine}</span>
            <span className="text-primary">O {fmtOdds(totalOver)}</span>
            <span className="text-destructive">U {fmtOdds(totalUnder)}</span>
          </div>
          <div className="flex-1 border-t border-border/50" />
        </div>
      )}

      {/* Line Shopping Toggle */}
      {game.allBooks?.length > 1 && (
        <div className="border-t border-border">
          <button
            onClick={() => setShowBooks(b => !b)}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {showBooks ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showBooks ? 'Hide' : 'Compare'} {game.allBooks.length} books
          </button>
          {showBooks && (() => {
            const awayMls = game.allBooks.map(b => b.ml_away).filter(v => v != null);
            const homeMls = game.allBooks.map(b => b.ml_home).filter(v => v != null);
            const bestAwayMl = awayMls.length ? Math.max(...awayMls) : null;
            const worstAwayMl = awayMls.length ? Math.min(...awayMls) : null;
            const bestHomeMl = homeMls.length ? Math.max(...homeMls) : null;
            const worstHomeMl = homeMls.length ? Math.min(...homeMls) : null;

            return (
              <div className="px-4 pb-3 space-y-1.5">
                <div className="grid grid-cols-5 text-[9px] text-muted-foreground uppercase tracking-wider mb-1 px-1">
                  <span className="col-span-2">Book</span>
                  <span className="text-center">{game.awayAbv} ML</span>
                  <span className="text-center">{game.homeAbv} ML</span>
                  <span className="text-center">O/U</span>
                </div>
                {game.allBooks.map(b => {
                  const isBestAway = b.ml_away === bestAwayMl;
                  const isWorstAway = b.ml_away === worstAwayMl && worstAwayMl !== bestAwayMl;
                  const isBestHome = b.ml_home === bestHomeMl;
                  const isWorstHome = b.ml_home === worstHomeMl && worstHomeMl !== bestHomeMl;
                  const isActive = b.key === activeBookKey;
                  return (
                    <button
                      key={b.key}
                      onClick={() => setActiveBookKey(b.key)}
                      className={cn(
                        "w-full grid grid-cols-5 text-xs rounded-lg px-3 py-1.5 items-center transition-all text-left",
                        isActive ? "bg-primary/15 border border-primary/30" : "bg-secondary/40 hover:bg-secondary/70"
                      )}
                    >
                      <span className={cn("col-span-2 text-[10px] truncate font-medium", isActive ? "text-primary" : "text-muted-foreground")}>
                        {isActive && <Check className="w-2.5 h-2.5 inline mr-1" />}
                        {b.title}
                      </span>
                      <span className={cn("text-center font-mono font-bold",
                        isBestAway ? "text-primary" : isWorstAway ? "text-destructive" : "text-foreground"
                      )}>{fmtOdds(b.ml_away)}</span>
                      <span className={cn("text-center font-mono font-bold",
                        isBestHome ? "text-primary" : isWorstHome ? "text-destructive" : "text-foreground"
                      )}>{fmtOdds(b.ml_home)}</span>
                      <span className="text-center font-mono font-medium text-foreground">{b.total_line ?? '—'}</span>
                    </button>
                  );
                })}
                <p className="text-[9px] text-muted-foreground text-center pt-0.5">
                  <span className="text-primary font-medium">Green</span> = best odds · <span className="text-destructive font-medium">Red</span> = worst odds · tap to switch
                </p>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}