import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp, Check, TrendingUp, Zap, ChevronRight, BarChart2 as BarChart2Icon } from 'lucide-react';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/common/TeamLogo';
import { fmtOdds } from '@/lib/oddsData';
import { useParlay } from '@/lib/ParlayContext';
import { analyzeGame, getGameIndicators } from '@/lib/gameAnalysis';

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

// -- Win-probability helpers -----------------------------------------------
function mlToRaw(ml) {
  if (ml == null || isNaN(ml)) return null;
  return ml < 0 ? Math.abs(ml) / (Math.abs(ml) + 100) : 100 / (ml + 100);
}
function removeVig(homeRaw, awayRaw) {
  if (homeRaw == null || awayRaw == null) return null;
  const total = homeRaw + awayRaw;
  return total === 0 ? null : { home: homeRaw / total, away: awayRaw / total };
}
function spreadToHomeProb(spread) {
  if (spread == null || isNaN(spread)) return null;
  // logistic calibration: -3 ≈ 60%, -7 ≈ 73%, 0 = 50%
  return 1 / (1 + Math.exp(spread / 7));
}

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
        {spread != null && !isNaN(spread) && (
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

export default function GameOddsCard({ game, onOpen }) {
  const [showBooks, setShowBooks] = useState(false);
  const [activeBookKey, setActiveBookKey] = useState(game.allBooks?.[0]?.key ?? null);
  const analysis   = useMemo(() => analyzeGame(game), [game]);
  const indicators = useMemo(() => getGameIndicators(analysis), [analysis]);

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

  // Win probability model
  const vigFree   = removeVig(mlToRaw(homeMl), mlToRaw(awayMl));
  const mlHomeProb  = vigFree?.home ?? null;
  const mlAwayProb  = vigFree?.away ?? null;
  const spHomeProb  = spreadToHomeProb(homeSpread);
  const spAwayProb  = spHomeProb != null ? 1 - spHomeProb : null;

  // Upset alert: underdog's spread-implied prob > ML-implied by >8%
  const upsetAlert = (() => {
    if (mlHomeProb == null || spHomeProb == null) return null;
    const homeFavored    = mlHomeProb > 0.5;
    const udSpreadProb   = homeFavored ? spAwayProb  : spHomeProb;
    const udMlProb       = homeFavored ? mlAwayProb  : mlHomeProb;
    const udTeam         = homeFavored ? game.awayAbv : game.homeAbv;
    const delta          = udSpreadProb - udMlProb;
    return delta > 0.08 ? { team: udTeam, delta } : null;
  })();

  // Bar uses ML when available, falls back to spread-derived
  const barAwayProb = mlAwayProb ?? spAwayProb;
  const barHomeProb = mlHomeProb ?? spHomeProb;
  const showWinBar  = barAwayProb != null && barHomeProb != null;

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
          {upsetAlert && (
            <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 uppercase tracking-wide">
              <Zap className="w-2.5 h-2.5" />
              Upset Alert · {upsetAlert.team}
            </span>
          )}
          {indicators.map(ind => (
            <span key={ind.label} className={cn(
              'text-[9px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-wide',
              ind.color === 'amber'   ? 'bg-amber-500/15 border-amber-500/20 text-amber-400' :
              ind.color === 'orange'  ? 'bg-orange-500/15 border-orange-500/20 text-orange-400' :
              ind.color === 'emerald' ? 'bg-emerald-500/15 border-emerald-500/20 text-emerald-400' :
              ind.color === 'blue'    ? 'bg-blue-500/15 border-blue-500/20 text-blue-400' :
              ind.color === 'red'     ? 'bg-red-500/15 border-red-500/20 text-red-400' :
              'bg-secondary text-muted-foreground border-border'
            )}>
              {ind.icon} {ind.label}
            </span>
          ))}
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

      {/* Best-line banner — only when a better ML exists on another book */}
      {game.allBooks?.length > 1 && (() => {
        const books = game.allBooks;
        const bestAway = books.filter(b => b.ml_away != null).sort((a, b) => b.ml_away - a.ml_away)[0];
        const bestHome = books.filter(b => b.ml_home != null).sort((a, b) => b.ml_home - a.ml_home)[0];
        const awayBetter = bestAway && bestAway.key !== activeBookKey && bestAway.ml_away > (activeBook?.ml_away ?? -Infinity);
        const homeBetter = bestHome && bestHome.key !== activeBookKey && bestHome.ml_home > (activeBook?.ml_home ?? -Infinity);
        if (!awayBetter && !homeBetter) return null;
        return (
          <div className="px-4 pb-2">
            <div className="rounded-lg bg-emerald-500/8 border border-emerald-500/20 px-3 py-1.5 flex items-center gap-2 flex-wrap">
              <TrendingUp className="w-3 h-3 text-emerald-400 flex-shrink-0" />
              <span className="text-[10px] text-emerald-400 font-semibold">Better line:</span>
              {awayBetter && (
                <span className="text-[10px] text-foreground">
                  {game.awayAbv} <span className="text-emerald-400 font-bold">{fmtOdds(bestAway.ml_away)}</span>
                  <span className="text-muted-foreground"> @ {bestAway.title}</span>
                </span>
              )}
              {awayBetter && homeBetter && <span className="text-muted-foreground text-[10px]">·</span>}
              {homeBetter && (
                <span className="text-[10px] text-foreground">
                  {game.homeAbv} <span className="text-emerald-400 font-bold">{fmtOdds(bestHome.ml_home)}</span>
                  <span className="text-muted-foreground"> @ {bestHome.title}</span>
                </span>
              )}
            </div>
          </div>
        );
      })()}

      {/* Win Probability Bar */}
      {showWinBar && (() => {
        const awayPct = Math.round(barAwayProb * 100);
        const homePct = 100 - awayPct;
        return (
          <div className="px-4 pb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-blue-400">{game.awayAbv} {awayPct}%</span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wide">Win Probability</span>
              <span className="text-[10px] font-semibold text-green-400">{homePct}% {game.homeAbv}</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden flex bg-secondary/50">
              <div className="bg-blue-500 rounded-l-full transition-all" style={{ width: `${Math.max(awayPct, 8)}%` }} />
              <div className="bg-green-500 flex-1 rounded-r-full transition-all" />
            </div>
            {upsetAlert && (
              <p className="text-[9px] text-amber-400 text-center mt-1.5 font-medium">
                Spread gives {upsetAlert.team} +{Math.round(upsetAlert.delta * 100)}% edge over their ML odds
              </p>
            )}
            {/* AI prediction summary strip */}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/6">
              <span className="text-[10px] text-muted-foreground">
                AI Pick: <span className="text-primary font-bold">{analysis.spreadPick} −{Math.abs(analysis.ourSpread).toFixed(1)}</span>
              </span>
              <span className="text-[10px] text-muted-foreground">
                Total: <span className={cn('font-bold', analysis.ouPick === 'OVER' ? 'text-emerald-400' : 'text-red-400')}>{analysis.ouPick}</span>
              </span>
              <span className="text-[10px] text-muted-foreground">
                Conf: <span className="text-foreground font-bold">{analysis.confidence}%</span>
              </span>
            </div>
          </div>
        );
      })()}

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

      {/* Scouting Report button */}
      {onOpen && (
        <div className="border-t border-border">
          <button
            onClick={() => onOpen(game)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold text-primary hover:text-primary/80 hover:bg-primary/5 transition-colors"
          >
            <BarChart2Icon className="w-3.5 h-3.5" />
            Full Scouting Report &amp; Breakdown
            <ChevronRight className="w-3 h-3" />
          </button>
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