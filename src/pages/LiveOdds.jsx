import React, { useState, useEffect, useCallback } from 'react';
import GameOddsCard from '@/components/odds/GameOddsCard';
import { RefreshCw, Activity, Clock, WifiOff, Key, Check, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import { NFL_API } from '@/lib/config';
import { isBackendReachable } from '@/lib/liveData';
const REFRESH_MS = 5 * 60 * 1000;

const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

function espnDateStr(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// Tries multiple ESPN endpoints in sequence until we get games.
// Order: current week → preseason → next 60-day window (early regular season lines).
async function fetchESPNGames() {
  async function tryUrl(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const mapped = mapESPNToGames(data);
      return mapped.length ? mapped : null;
    } catch { return null; }
  }

  // 1. Current week (works once the season is active)
  const current = await tryUrl(ESPN_SCOREBOARD);
  if (current) return current;

  // 2. Preseason (NFL preseason typically starts early August)
  const preseason = await tryUrl(`${ESPN_SCOREBOARD}?seasontype=1&limit=50`);
  if (preseason) return preseason;

  // 3. Next 60 days — catches early regular-season lines posted in the offseason
  const today = new Date();
  const start  = espnDateStr(today);
  const end    = espnDateStr(new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000));
  const upcoming = await tryUrl(`${ESPN_SCOREBOARD}?dates=${start}-${end}&limit=50`);
  if (upcoming) return upcoming;

  // 4. Explicit regular season Week 1 for upcoming year
  const year = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1; // July+ = upcoming season
  const week1 = await tryUrl(`${ESPN_SCOREBOARD}?seasontype=2&week=1&year=${year}&limit=20`);
  if (week1) return week1;

  return [];
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

    const toNum = str => str != null ? parseFloat(str) : null;

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

    return [{
      id:            comp.id,
      commence_time: event.date,
      homeAbv,
      awayAbv,
      moneyline: { home: homeMl, away: awayMl, bookmaker: provider },
      spread:    { home: homeSpread, homeOdds: homeSpreadOdds, away: awaySpread, awayOdds: awaySpreadOdds },
      total:     { line: totalLine, overOdds: totalOverOdds, underOdds: totalUnderOdds },
      allBooks,
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
    if (!isBackendReachable()) {
      setLoading(true);
      setError(null);
      try {
        const mapped = await fetchESPNGames();
        setGames(mapped);
        setOddsSource(mapped.length ? 'odds_api' : null);
        setLastUpdated(new Date());
      } catch {
        setGames([]);
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    setError(null);
    setCountdown(REFRESH_MS / 1000);
    try {
      const s = await fetch(`${NFL_API}/api/settings`).then(r => r.json()).catch(() => ({}));
      const books = s.bookmakers || selectedBooks.join(',');
      const hasKey = !!s.odds_api_key;

      const res = await fetch(`${NFL_API}/api/odds/games?bookmakers=${encodeURIComponent(books)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to fetch');
      }
      const gamesData = await res.json();

      setOddsSource(hasKey ? 'odds_api' : 'underdog');
      setGames(Array.isArray(gamesData) ? gamesData : []);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e.message || 'Failed to fetch');
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
  const filtered = games.filter(g => {
    const gDate = new Date(g.commence_time).toLocaleDateString();
    if (filter === 'today') return gDate === today;
    if (filter === 'upcoming') return gDate !== today;
    return true;
  });
  const todayCount = games.filter(g => new Date(g.commence_time).toLocaleDateString() === today).length;

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
        <div className="flex items-center gap-1.5">
          {[
            { key: 'all',      label: `All Games (${games.length})` },
            { key: 'today',    label: `Today (${todayCount})` },
            { key: 'upcoming', label: `Upcoming (${games.length - todayCount})` },
          ].map(tab => (
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
          {filtered.map(game => <GameOddsCard key={game.id} game={game} />)}
        </div>
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
