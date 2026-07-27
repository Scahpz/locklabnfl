import React, { useState, useEffect, useCallback, useMemo } from 'react';
import GameOddsCard from '@/components/odds/GameOddsCard';
import GameBreakdownModal from '@/components/odds/GameBreakdownModal';
import { RefreshCw, Activity, Clock, WifiOff, Key, Check, Zap, AlertTriangle, ChevronRight } from 'lucide-react';
import { analyzeGame } from '@/lib/gameAnalysis';
import { useSeasonStats } from '@/lib/nflSeasonStats';
import TeamLogo from '@/components/common/TeamLogo';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import { NFL_API } from '@/lib/config';
import { isBackendReachable } from '@/lib/liveData';
const REFRESH_MS = 5 * 60 * 1000;

const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

function espnDateStr(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// Fetches both preseason (current) and upcoming regular-season Week 1 games in parallel,
// merges them, and deduplicates by game id.
async function fetchESPNGames() {
  async function tryUrl(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return mapESPNToGames(data);
    } catch { return []; }
  }

  // Upcoming regular season year (July+ = this year, otherwise last year)
  const now  = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;

  // Fetch preseason (current week) and Week 1 regular season simultaneously
  const [currentGames, week1Games] = await Promise.all([
    tryUrl(ESPN_SCOREBOARD),                                                    // whatever ESPN serves now (may be preseason)
    tryUrl(`${ESPN_SCOREBOARD}?dates=${year}0901-${year}0930&limit=50`),       // Week 1 regular season
  ]);

  // Merge and deduplicate by game id
  const seen = new Set();
  return [...currentGames, ...week1Games].filter(g => {
    if (seen.has(g.id)) return false;
    seen.add(g.id);
    return true;
  });
}

// Maps ESPN scoreboard response to the shape GameOddsCard expects.
// Maps ESPN scoreboard response to the shape GameOddsCard expects.
// ESPN embeds DraftKings odds — moneyline/pointSpread/total subfields, no key required.
function mapESPNToGames(espn) {
  if (!espn?.events?.length) return [];
  return espn.events.flatMap(event => {
    const comp = event.competitions?.[0];
    if (!comp) return [];
    const home = comp.competitors?.find(c => c.homeAway === 'home');
    const away = comp.competitors?.find(c => c.homeAway === 'away');
    if (!home?.team?.abbreviation || !away?.team?.abbreviation) return [];

    const homeAbv  = home.team.abbreviation;
    const awayAbv  = away.team.abbreviation;
    const odds     = comp.odds?.[0] ?? null;
    const provider = odds?.provider?.name ?? 'DraftKings';

    const toNum = str => { if (str == null) return null; const n = parseFloat(str); return isNaN(n) ? null : n; };

    // Moneylines: odds.moneyline.home/away.close.odds (string like "-198", "+164")
    const homeMl = toNum(odds?.moneyline?.home?.close?.odds);
    const awayMl = toNum(odds?.moneyline?.away?.close?.odds);

    // Spread: odds.pointSpread.home/away.close.line (string like "-3.5", "+3.5")
    const homeSpread     = toNum(odds?.pointSpread?.home?.close?.line) ?? (odds?.spread ?? null);
    const awaySpread     = toNum(odds?.pointSpread?.away?.close?.line) ?? (homeSpread != null ? -homeSpread : null);
    const homeSpreadOdds = toNum(odds?.pointSpread?.home?.close?.odds) ?? -110;
    const awaySpreadOdds = toNum(odds?.pointSpread?.away?.close?.odds) ?? -110;

    // Total: odds.overUnder (float) + odds.total.over/under.close.odds
    const totalLine      = odds?.overUnder ?? null;
    const totalOverOdds  = toNum(odds?.total?.over?.close?.odds)  ?? (totalLine != null ? -110 : null);
    const totalUnderOdds = toNum(odds?.total?.under?.close?.odds) ?? (totalLine != null ? -110 : null);

    const hasOdds = homeMl != null || homeSpread != null || totalLine != null;
    const allBooks = hasOdds ? [{
      key:              'dk',
      title:            provider,
      ml_home:          homeMl,
      ml_away:          awayMl,
      spread_home:      homeSpread,
      spread_away:      awaySpread,
      spread_home_odds: homeSpreadOdds,
      spread_away_odds: awaySpreadOdds,
      total_line:       totalLine,
      total_over_odds:  totalOverOdds,
      total_under_odds: totalUnderOdds,
    }] : [];

    const seasonType = event.season?.type;         // 1 = preseason, 2 = regular
    const seasonSlug = event.season?.slug ?? '';
    const weekNum    = event.week?.number ?? null;
    const isPreseason = seasonType === 1 || seasonSlug.toLowerCase().includes('pre');

    return [{
      id:            comp.id,
      commence_time: event.date,
      homeAbv,
      awayAbv,
      moneyline: { home: homeMl, away: awayMl, bookmaker: provider },
      spread:    { home: homeSpread, homeOdds: homeSpreadOdds, away: awaySpread, awayOdds: awaySpreadOdds },
      total:     { line: totalLine, overOdds: totalOverOdds, underOdds: totalUnderOdds },
      allBooks,
      is_preseason:  isPreseason,
      week:          weekNum,
    }];
  });
}

const ALL_BOOKS = [
  { key: 'draftkings',    label: 'DraftKings' },
  { key: 'fanduel',       label: 'FanDuel' },
  { key: 'betmgm',        label: 'BetMGM' },
  { key: 'caesars',       label: 'Caesars' },
  { key: 'pointsbetus',   label: 'PointsBet' },
  { key: 'betrivers',     label: 'BetRivers' },
  { key: 'williamhill_us',label: 'William Hill' },
  { key: 'unibet_us',     label: 'Unibet' },
];

export default function LiveOdds() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [filter, setFilter] = useState('all');
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);
  const [oddsSource, setOddsSource] = useState(null); // 'prizepicks' | 'odds_api' | 'season_avg'
  const [breakdownGame, setBreakdownGame] = useState(null);
  const liveStats = useSeasonStats(); // null during off-season → uses 2024 fallback

  // Settings state
  const [settings, setSettings] = useState({ odds_api_key: '', bookmakers: 'draftkings,fanduel,betmgm,caesars,pointsbetus' });
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [selectedBooks, setSelectedBooks] = useState(['draftkings', 'fanduel', 'betmgm', 'caesars', 'pointsbetus']);

  // Load settings on mount (skip if backend not reachable)
  useEffect(() => {
    if (!isBackendReachable()) return;
    fetch(`${NFL_API}/api/settings`)
      .then(r => r.json())
      .then(s => {
        setSettings(s);
        setApiKeyInput(s.odds_api_key || '');
        if (s.bookmakers) setSelectedBooks(s.bookmakers.split(',').map(b => b.trim()));
      })
      .catch(() => {});
  }, []);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const newSettings = { odds_api_key: apiKeyInput.trim(), bookmakers: selectedBooks.join(',') };
      await fetch(`${NFL_API}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      setSettings(newSettings);
      toast.success('Settings saved!');
      setShowSettings(false);
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const toggleBook = (key) => {
    setSelectedBooks(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCountdown(REFRESH_MS / 1000);

    // Try backend /api/odds/games first (returns real multi-book data when ODDS_API_KEY is set)
    if (isBackendReachable()) {
      try {
        const s = await fetch(`${NFL_API}/api/settings`).then(r => r.json()).catch(() => ({}));
        const books = s.bookmakers || selectedBooks.join(',');
        const hasKey = !!s.odds_api_key;

        const res = await fetch(`${NFL_API}/api/odds/games?bookmakers=${encodeURIComponent(books)}`);
        if (res.ok) {
          const gamesData = await res.json();
          if (Array.isArray(gamesData) && gamesData.length > 0) {
            setOddsSource(hasKey ? 'odds_api' : 'underdog');
            setGames(gamesData);
            setLastUpdated(new Date());
            setLoading(false);
            return;
          }
        }
      } catch {
        // fall through to ESPN
      }
    }

    // ESPN free fallback — always works, carries DraftKings lines
    try {
      const mapped = await fetchESPNGames();
      setGames(mapped);
      setOddsSource(mapped.length ? 'odds_api' : null);
      setLastUpdated(new Date());
    } catch {
      setGames([]);
      setError('Failed to load odds');
    } finally {
      setLoading(false);
    }
  }, [selectedBooks]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!isBackendReachable()) return;
    const iv = setInterval(load, REFRESH_MS);
    return () => clearInterval(iv);
  }, [load]);
  useEffect(() => {
    if (loading) return;
    const tick = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(tick);
  }, [loading]);

  const today = new Date().toLocaleDateString();
  const preseasonCount = games.filter(g => g.is_preseason).length;
  const todayCount     = games.filter(g => new Date(g.commence_time).toLocaleDateString() === today).length;

  // Identify top 1-2 upset watch candidates across all loaded games
  const upsetWatchGames = useMemo(() => {
    if (!games.length) return [];
    return games
      .map(g => ({ game: g, analysis: analyzeGame(g, liveStats) }))
      .filter(({ analysis }) => analysis.upsetWatch != null && analysis.upsetWatch.upsetScore >= 30)
      .sort((a, b) => b.analysis.upsetWatch.upsetScore - a.analysis.upsetWatch.upsetScore)
      .slice(0, 2);
  }, [games, liveStats]);

  // Collect distinct week numbers from regular season games, sorted ascending
  const weekNumbers = [...new Set(
    games.filter(g => !g.is_preseason && g.week != null).map(g => g.week)
  )].sort((a, b) => a - b);

  const filtered = games.filter(g => {
    const gDate = new Date(g.commence_time).toLocaleDateString();
    if (filter === 'preseason') return g.is_preseason;
    if (filter.startsWith('week_')) {
      const wk = parseInt(filter.split('_')[1], 10);
      return !g.is_preseason && g.week === wk;
    }
    if (filter === 'today')    return gDate === today;
    if (filter === 'upcoming') return gDate !== today;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            <Activity className="w-7 h-7 text-primary" /> Live NFL Odds
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Moneyline · Spread · Totals — updated every 5 min</p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && !loading && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              <span>Next refresh in {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}</span>
            </div>
          )}
          {/* API key settings only relevant when a custom backend is configured */}
          {isBackendReachable() && (
            <button
              onClick={() => setShowSettings(v => !v)}
              className={cn(
                "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all border",
                showSettings ? "bg-primary/10 border-primary/40 text-primary" : "bg-secondary border-border text-foreground hover:bg-secondary/80"
              )}
            >
              <Key className="w-3.5 h-3.5" />
              {settings.odds_api_key ? 'Settings' : 'Add API Key'}
            </button>
          )}
          <button
            onClick={load} disabled={loading}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all border border-border",
              loading ? "text-muted-foreground bg-secondary/50" : "text-foreground bg-secondary hover:bg-secondary/80"
            )}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Settings Panel — only when a custom backend is wired up */}
      {showSettings && isBackendReachable() && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" /> Sportsbook Settings
          </h3>

          {/* API Key */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">
              The Odds API Key —{' '}
              <a
                href="https://the-odds-api.com"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                Get a free key at the-odds-api.com
              </a>
              {' '}(500 req/month free)
            </label>
            <input
              type="text"
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              placeholder="Paste your API key here…"
              className="w-full px-3 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Bookmaker selector */}
          <div>
            <label className="text-xs text-muted-foreground block mb-2">Select Sportsbooks</label>
            <div className="flex flex-wrap gap-2">
              {ALL_BOOKS.map(book => {
                const active = selectedBooks.includes(book.key);
                return (
                  <button
                    key={book.key}
                    onClick={() => toggleBook(book.key)}
                    className={cn(
                      "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all",
                      active
                        ? "bg-primary/15 border-primary/50 text-primary font-medium"
                        : "bg-secondary/60 border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {active && <Check className="w-3 h-3" />}
                    {book.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={saveSettings}
            disabled={savingSettings}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {savingSettings ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Save Settings
          </button>
        </div>
      )}

      {/* Upgrade hint — only when backend is configured and no paid key */}
      {isBackendReachable() && !settings.odds_api_key && !showSettings && oddsSource === 'prizepicks' && (
        <div className="rounded-xl border border-chart-3/20 bg-chart-3/5 px-4 py-3 flex items-start gap-3">
          <Zap className="w-4 h-4 text-chart-3 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Live lines from PrizePicks — free &amp; no key needed</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Want lines from DraftKings, FanDuel, or BetMGM?{' '}
              <button onClick={() => setShowSettings(true)} className="text-primary underline">Add a free Odds API key</button>
              {' '}(500 req/month at the-odds-api.com).
            </p>
          </div>
        </div>
      )}

      {/* Real error */}
      {error && error !== 'add_key' && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <WifiOff className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Filter tabs */}
      {games.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: 'all',      label: `All (${games.length})` },
            preseasonCount > 0 && { key: 'preseason', label: `Preseason (${preseasonCount})` },
            ...weekNumbers.map(w => ({
              key:   `week_${w}`,
              label: `Week ${w} (${games.filter(g => !g.is_preseason && g.week === w).length})`,
            })),
            todayCount > 0 && { key: 'today', label: `Today (${todayCount})` },
          ].filter(Boolean).map(tab => (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                filter === tab.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              )}>
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Upset Watch of the Week banner */}
      {upsetWatchGames.length > 0 && !loading && (
        <div className="rounded-xl border border-orange-500/25 bg-orange-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-bold text-foreground">Upset Watch</h3>
            <span className="text-[10px] text-muted-foreground ml-1">
              — {upsetWatchGames.length === 1 ? '1 game' : `${upsetWatchGames.length} games`} the model flags as genuine upset risks this week
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {upsetWatchGames.map(({ game, analysis }) => {
              const uw = analysis.upsetWatch;
              const udIsHome = uw.underdog === analysis.hA;
              const udTeamAbv = udIsHome ? game.homeAbv : game.awayAbv;
              const favTeamAbv = udIsHome ? game.awayAbv : game.homeAbv;
              return (
                <button
                  key={game.id}
                  onClick={() => setBreakdownGame(game)}
                  className="rounded-lg bg-white/4 border border-orange-500/20 p-3 text-left hover:border-orange-500/40 hover:bg-white/6 transition-all group"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <TeamLogo team={udTeamAbv} className="w-8 h-8" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={cn(
                          'text-xs font-black',
                          uw.tierColor === 'red' ? 'text-red-400' :
                          uw.tierColor === 'orange' ? 'text-orange-400' : 'text-amber-400'
                        )}>🚨 {uw.underdog}</span>
                        <span className="text-[10px] text-muted-foreground">vs {uw.favored}</span>
                        {uw.udIsHome && (
                          <span className="text-[9px] bg-white/10 text-foreground px-1 py-0.5 rounded-full">Home Dog</span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {uw.udWinPct}% win probability · Score {uw.upsetScore}/100
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <TeamLogo team={favTeamAbv} className="w-6 h-6 opacity-50" />
                    </div>
                  </div>

                  {/* Upset probability bar */}
                  <div className="h-1.5 rounded-full bg-white/8 mb-2 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full',
                        uw.tierColor === 'red' ? 'bg-red-500' :
                        uw.tierColor === 'orange' ? 'bg-orange-500' : 'bg-amber-500'
                      )}
                      style={{ width: `${uw.udWinPct}%` }}
                    />
                  </div>

                  <p className="text-[11px] text-foreground/80 leading-snug mb-2">
                    {uw.reasons[0]}
                  </p>

                  {/* Key factors inline */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {uw.keyFactors.slice(0, 3).map((f, i) => (
                      <span key={i} className={cn(
                        'text-[9px] font-medium px-1.5 py-0.5 rounded-full border',
                        uw.tierColor === 'red'    ? 'bg-red-500/15 border-red-500/20 text-red-400' :
                        uw.tierColor === 'orange' ? 'bg-orange-500/15 border-orange-500/20 text-orange-400' :
                                                    'bg-amber-500/15 border-amber-500/20 text-amber-400'
                      )}>
                        {f.label}
                      </span>
                    ))}
                  </div>

                  <span className="text-[10px] text-primary group-hover:text-primary/80 flex items-center gap-1 transition-colors">
                    Full Upset Analysis <ChevronRight className="w-3 h-3" />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Games grid */}
      {!loading && filtered.length === 0 && error !== 'add_key' && !error && (
        <div className="text-center py-16 text-muted-foreground">
          <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No games found for this filter.</p>
        </div>
      )}

      {loading && games.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card h-52 animate-pulse" />
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(game => (
            <GameOddsCard key={game.id} game={game} onOpen={setBreakdownGame} liveStats={liveStats} />
          ))}
        </div>
      )}

      {breakdownGame && (
        <GameBreakdownModal game={breakdownGame} onClose={() => setBreakdownGame(null)} liveStats={liveStats} />
      )}

      {lastUpdated && (
        <p className="text-center text-[11px] text-muted-foreground flex items-center justify-center gap-2">
          Last updated: {lastUpdated.toLocaleTimeString()}
          {oddsSource === 'odds_api' && <span className="text-primary font-medium">· {isBackendReachable() ? 'Live sportsbook odds' : 'Via ESPN (free)'}</span>}
          {oddsSource === 'underdog' && (
            <span className="flex items-center gap-1 text-chart-3 font-medium">
              <Zap className="w-3 h-3" />· Powered by Underdog Fantasy (free live lines)
            </span>
          )}
          {oddsSource === 'prizepicks' && (
            <span className="flex items-center gap-1 text-chart-3 font-medium">
              <Zap className="w-3 h-3" />· Powered by PrizePicks (free live lines)
            </span>
          )}
          {oddsSource === 'season_avg' && <span className="text-muted-foreground">· Season averages (no live odds)</span>}
        </p>
      )}
    </div>
  );
}
