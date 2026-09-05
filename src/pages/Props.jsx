import React, { useState, useMemo, useEffect, useRef } from 'react';
import { fetchLiveProps, getCachedProps, isCacheValid, clearLiveCache, SOURCE_META } from '@/lib/liveData';
import { isDemoMode } from '@/lib/mockData';
import { getAIVerdicts } from '@/lib/aiVerdicts';
import LockCards from '@/components/props/LockCards';
import DemonPickCard from '@/components/props/DemonPickCard';
import { RefreshCw, Wifi, WifiOff, Zap, SlidersHorizontal, Search, X, Info, LayoutGrid, List, TrendingUp, TrendingDown } from 'lucide-react';
import TeamLogo from '@/components/common/TeamLogo';
import { calcEVVerdict } from '@/lib/verdict';
import PlayerRow from '@/components/props/PlayerRow';
import { cn } from '@/lib/utils';
import { rankScore, gradeProp } from '@/lib/grading';
import { NFL_API } from '@/lib/config';
import { TEAM_STATS } from '@/lib/teamStats';
import PropDetailModal from '@/components/props/PropDetailModal';

// ── Game-log localStorage cache ───────────────────────────────────────────────
const GL_CACHE_PREFIX = 'locklab_gl_v9_';
const GL_TTL_MS = 2 * 60 * 60 * 1000; // 2-hour TTL per entry
// Wipe all older cache versions on load
for (let i = localStorage.length - 1; i >= 0; i--) {
  const k = localStorage.key(i);
  if (k && k.startsWith('locklab_gl_') && !k.startsWith('locklab_gl_v9_')) {
    localStorage.removeItem(k);
  }
}
function glCacheGet(name) {
  try {
    const item = JSON.parse(localStorage.getItem(GL_CACHE_PREFIX + name));
    if (!item) return null;
    if (Date.now() - item.ts > GL_TTL_MS) { localStorage.removeItem(GL_CACHE_PREFIX + name); return null; }
    return item.data;
  } catch { return null; }
}
function glCacheSet(name, data) {
  try { localStorage.setItem(GL_CACHE_PREFIX + name, JSON.stringify({ data, ts: Date.now() })); } catch {}
}
// playerProps: [{name, prop_type, line}]
async function fetchBulkGameLogs(playerProps) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${NFL_API}/api/player-gamelogs-bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerProps }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
  finally { clearTimeout(timer); }
}

const propTypeLabels = {
  // Full-game
  passing_yards: 'Pass Yds', passing_tds: 'Pass TDs', completions: 'Comp',
  rushing_yards: 'Rush Yds', rushing_tds: 'Rush TDs', rushing_attempts: 'Rush Att',
  receiving_yards: 'Rec Yds', receiving_tds: 'Rec TDs', receptions: 'Rec',
  fantasy_points: 'Fantasy Pts', sacks: 'Sacks', tackles: 'Tackles',
  kicking_points: 'Kick Pts', interceptions: 'INTs',
  passing_ints: 'INTs Thrown',
  rush_rec_tds: 'Rush+Rec TDs',
  rush_rec_yards: 'Rush+Rec Yds',
  pass_rush_yards: 'Pass+Rush Yds',
  q1_receptions: '1Q Rec', q1_rush_rec_tds: '1Q Rush+Rec TDs',
  h1_receptions: '1H Rec', h1_rush_rec_tds: '1H Rush+Rec TDs',
  passing_long: 'Long Comp',
  rushing_long: 'Long Rush',
  // 1st quarter
  q1_passing_yards: '1Q Pass Yds', q1_rushing_yards: '1Q Rush Yds', q1_receiving_yards: '1Q Rec Yds',
  // 1st half
  h1_passing_yards: '1H Pass Yds', h1_rushing_yards: '1H Rush Yds', h1_receiving_yards: '1H Rec Yds',
  // Season-long futures / best-ball markets
  season_passing_yards: 'Pass Yds (Season)', season_passing_tds: 'Pass TDs (Season)',
  season_rushing_yards: 'Rush Yds (Season)', season_rushing_tds: 'Rush TDs (Season)',
  season_receiving_yards: 'Rec Yds (Season)', season_receiving_tds: 'Rec TDs (Season)',
  season_receptions: 'Rec (Season)', season_sacks: 'Sacks (Season)',
};

// PROP_TYPES is now derived dynamically from loaded props — see propTypeOptions useMemo below.
const SORT_OPTIONS = [
  { value: 'ai_rank', label: 'AI Rank' },
  { value: 'confidence', label: 'Confidence' },
  { value: 'edge', label: 'Edge' },
  { value: 'hit_rate', label: 'Hit Rate' },
];

function toLetterGrade(confidence, completeness) {
  const eff = completeness < 25 ? Math.min(confidence, 62)
    : completeness < 45 ? Math.min(confidence, 70)
    : completeness < 65 ? Math.min(confidence, 80)
    : confidence;
  if (eff >= 88) return 'A+';
  if (eff >= 83) return 'A';
  if (eff >= 78) return 'A-';
  if (eff >= 74) return 'B+';
  if (eff >= 70) return 'B';
  if (eff >= 65) return 'B-';
  if (eff >= 61) return 'C+';
  if (eff >= 57) return 'C';
  return 'C-';
}

function strengthDotClass(completeness) {
  if (completeness == null || completeness < 20) return 'bg-white/20';
  if (completeness < 50) return 'bg-rose-500';
  if (completeness < 80) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function letterGradeStyle(letter) {
  const g = letter[0];
  if (g === 'A') return 'text-emerald-400';
  if (g === 'B') return 'text-primary';
  return 'text-amber-400';
}

function fmtTipoff(scheduledAt) {
  if (!scheduledAt) return null;
  try {
    const d = new Date(scheduledAt);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  } catch { return null; }
}

function localDateStr(utcIso) {
  if (!utcIso) return null;
  return new Date(utcIso).toLocaleDateString('en-CA'); // YYYY-MM-DD in local tz
}

// NFL week number for a given date. Week 1 starts the Thursday after Labor Day.
function getNFLWeek(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const year = d.getUTCFullYear();
  const sep1 = new Date(Date.UTC(year, 8, 1));
  // Labor Day = first Monday of September
  const daysToMonday = (1 - sep1.getUTCDay() + 7) % 7;
  const laborDay = new Date(Date.UTC(year, 8, 1 + daysToMonday));
  // Week 1 kicks off the Thursday after Labor Day
  const week1Start = new Date(laborDay.getTime() + 3 * 24 * 60 * 60 * 1000);
  if (d < week1Start) return null; // preseason
  const weekNum = Math.floor((d.getTime() - week1Start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return weekNum >= 1 && weekNum <= 18 ? weekNum : null;
}

const todayLocalStr    = new Date().toLocaleDateString('en-CA');
const tomorrowLocalStr = new Date(Date.now() + 86400000).toLocaleDateString('en-CA');

export default function Props() {
  const [rawProps, setRawProps] = useState([]);
  const [gameDate, setGameDate] = useState(null);
  const [gamesSummary, setGamesSummary] = useState([]);
  const [loading, setLoading] = useState(() => !getCachedProps()); // skip spinner if stale cache exists
  const [slowLoad, setSlowLoad] = useState(false); // true after 10s — shows "warming up" message
  const [refreshing, setRefreshing] = useState(false); // subtle background refresh indicator
  const [retryIn, setRetryIn] = useState(null); // countdown seconds until auto-retry, null = not retrying
  const retryTimerRef = useRef(null);
  const [isLive, setIsLive] = useState(false);
  // Restore filter state from sessionStorage so navigating away and back preserves selections
  const savedFilters = (() => { try { return JSON.parse(sessionStorage.getItem('props_filters') || '{}'); } catch { return {}; } })();
  const [selectedGames, setSelectedGames] = useState(savedFilters.selectedGames ?? []);
  const [selectedType, setSelectedType] = useState(savedFilters.selectedType ?? 'all');
  const [sortBy, setSortBy] = useState(savedFilters.sortBy ?? 'ai_rank');
  const [verdicts, setVerdicts] = useState({});
  const [aiLoading, setAiLoading] = useState(false);
  const [playerAnalytics, setPlayerAnalytics] = useState({});
  const [playerSearch, setPlayerSearch] = useState('');
  const [showPlayerDrop, setShowPlayerDrop] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState(savedFilters.selectedPlayers ?? []);
  const [selectedSources, setSelectedSources] = useState(savedFilters.selectedSources ?? []);
  const [selectedWeeks, setSelectedWeeks] = useState(savedFilters.selectedWeeks ?? [1]);
  const [detailKey, setDetailKey] = useState(null); // { player_name, prop_type }
  const [detailDemon, setDetailDemon] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
  const [lastFetchedAt, setLastFetchedAt] = useState(null); // Date when odds last loaded
  const searchRef = useRef(null);
  // Pre-seed with hardcoded stats so pace/defense show immediately
  const [teamContext, setTeamContext] = useState({ teams: TEAM_STATS, injuries: {}, back_to_back: [], game_spreads: {} });
  const [weatherData, setWeatherData] = useState({});
  const fetchedPlayers = useRef(new Set());

  // Persist filter state to sessionStorage so it survives navigation
  useEffect(() => {
    sessionStorage.setItem('props_filters', JSON.stringify({ selectedGames, selectedType, sortBy, selectedPlayers, selectedSources, selectedWeeks }));
  }, [selectedGames, selectedType, sortBy, selectedPlayers, selectedSources]);

  const applyData = (data, skipAI = false) => {
    if (!data?.props?.length) return false;
    const realProps = data.props.filter(p => p.injury_status !== 'out');
    setRawProps(realProps);
    setGameDate(data.game_date);
    setGamesSummary(data.games_summary || []);
    setIsLive(true);
    setLastFetchedAt(new Date());
    if (!skipAI) {
      setAiLoading(true);
      getAIVerdicts(realProps.slice(0, 50)).then(v => {
        setVerdicts(v);
        setAiLoading(false);
      }).catch(() => setAiLoading(false));
    }
    return true;
  };

  const startRetryCountdown = (seconds = 25) => {
    if (retryTimerRef.current) clearInterval(retryTimerRef.current);
    setRetryIn(seconds);
    let remaining = seconds;
    retryTimerRef.current = setInterval(() => {
      remaining -= 1;
      setRetryIn(remaining);
      if (remaining <= 0) {
        clearInterval(retryTimerRef.current);
        retryTimerRef.current = null;
        setRetryIn(null);
        loadData(true);
      }
    }, 1000);
  };

  const cancelRetry = () => {
    if (retryTimerRef.current) { clearInterval(retryTimerRef.current); retryTimerRef.current = null; }
    setRetryIn(null);
  };

  const loadData = async (forceRefresh = false) => {
    cancelRetry();
    if (forceRefresh) {
      clearLiveCache();
      setPlayerAnalytics({});
      setTeamContext({ teams: TEAM_STATS, injuries: {}, back_to_back: [], game_spreads: {} });
      fetchedPlayers.current = new Set();
    }

    const stale = getCachedProps();
    const cacheIsFresh = !forceRefresh && isCacheValid();
    if (stale && !forceRefresh) {
      applyData(stale, /* skipAI= */ !cacheIsFresh);
      setLoading(false);
      if (cacheIsFresh) return;
      setRefreshing(true);
    } else {
      setLoading(true);
      setSlowLoad(false);
    }

    const slowTimer = setTimeout(() => setSlowLoad(true), 10000);

    let gotData = false;
    let fetchFailed = false;
    try {
      const data = await fetchLiveProps();
      gotData = applyData(data);
    } catch {
      fetchFailed = true;
      if (!stale) setRawProps([]);
    } finally {
      clearTimeout(slowTimer);
      setLoading(false);
      setSlowLoad(false);
      setRefreshing(false);
    }

    // Only retry on actual fetch failures — not when backend cleanly returns empty
    // (empty = offseason / no games today, not a server problem)
    if (!gotData && !getCachedProps() && fetchFailed) {
      startRetryCountdown(25);
    }
  };

  // Fetch live team context (injuries, back-to-back, spreads) — merges on top of hardcoded stats
  useEffect(() => {
    if (!rawProps.length || isDemoMode()) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    fetch(`${NFL_API}/api/team-context`, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : null)
      .then(ctx => {
        if (!ctx) return;
        setTeamContext(prev => ({
          teams:        { ...TEAM_STATS, ...ctx.teams },   // live data wins, fallback fills gaps
          injuries:     ctx.injuries    || {},
          back_to_back: ctx.back_to_back || [],
          game_spreads: ctx.game_spreads || {},
        }));
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
    return () => ctrl.abort();
  }, [rawProps.length]);

  // Fetch weather for each unique home team (Open-Meteo via backend, cached 3h)
  useEffect(() => {
    if (!rawProps.length) return;
    const homeTeams = [...new Set(rawProps.map(p => p.home).filter(Boolean))];
    homeTeams.forEach(team => {
      if (weatherData[team] !== undefined) return;
      fetch(`${NFL_API}/api/weather/${team}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setWeatherData(prev => ({ ...prev, [team]: data })); })
        .catch(() => {});
    });
  }, [rawProps]);

  // Auto-fetch game logs for all players in one bulk request
  useEffect(() => {
    if (!rawProps.length || isDemoMode()) return;
    const names = [...new Set(rawProps.map(p => p.player_name))];
    const pending = names.filter(n => !fetchedPlayers.current.has(n));
    if (!pending.length) return;

    // Apply cached data immediately
    const withCache = pending.filter(n => glCacheGet(n));
    if (withCache.length) {
      const updates = {};
      withCache.forEach(n => { updates[n] = glCacheGet(n).analytics; fetchedPlayers.current.add(n); });
      setPlayerAnalytics(prev => ({ ...prev, ...updates }));
    }

    const needsFetch = pending.filter(n => !glCacheGet(n));
    if (!needsFetch.length) return;
    needsFetch.forEach(n => fetchedPlayers.current.add(n));

    // Single batch: fetch the first 50 visible players, mark the rest null immediately
    // so factors never stay on "loading…" when the backend returns empty analytics.
    const TOP = 50;
    const batch = needsFetch.slice(0, TOP);

    if (needsFetch.length > TOP) {
      const skipUpdates = {};
      needsFetch.slice(TOP).forEach(n => { skipUpdates[n] = null; });
      setPlayerAnalytics(prev => ({ ...prev, ...skipUpdates }));
    }

    // Build playerProps: every prop row for players in this batch
    const playerProps = rawProps
      .filter(p => batch.includes(p.player_name))
      .map(p => ({ name: p.player_name, prop_type: p.prop_type, line: p.line }));

    fetchBulkGameLogs(playerProps).then(data => {
      const updates = {};
      if (data?.analytics) {
        Object.entries(data.analytics).forEach(([name, playerData]) => {
          // playerData is {prop_type: analyticsObj, ...}
          if (playerData && typeof playerData === 'object' && Object.keys(playerData).length > 0) {
            updates[name] = playerData;
            glCacheSet(name, { analytics: playerData });
          }
        });
      }
      batch.forEach(n => { if (!(n in updates)) updates[n] = null; });
      setPlayerAnalytics(prev => ({ ...prev, ...updates }));
    }).catch(() => {
      const updates = {};
      batch.forEach(n => { updates[n] = null; });
      setPlayerAnalytics(prev => ({ ...prev, ...updates }));
    });
  }, [rawProps]);

  // Merge game logs + team context + injury data into each prop
  const enrichedProps = useMemo(() => {
    const ctx = teamContext || {};
    const teams     = ctx.teams      || {};
    const injuries  = ctx.injuries   || {};
    const b2b       = new Set(ctx.back_to_back || []);
    const spreads   = ctx.game_spreads || {};

    return rawProps.map(prop => {
      // 1. Game log analytics
      // playerAnalytics[name] === undefined  → not yet fetched (show loading)
      // playerAnalytics[name] === null       → fetched, player not found (show "not available")
      // playerAnalytics[name] is an object   → fetched, has data
      const analyticsEntry = playerAnalytics[prop.player_name];
      const analytics = (analyticsEntry != null) ? analyticsEntry?.[prop.prop_type] : undefined;
      // If the prop was pre-enriched with Sleeper stats (has_analytics: true on the raw prop),
      // a null backend response should NOT override it as data_unavailable.
      const propPreEnriched = prop.has_analytics === true && prop.avg_last_10 != null;
      const dataUnavailable = !propPreEnriched && (
        analyticsEntry === null
        || (analyticsEntry !== undefined && analyticsEntry !== null && analytics === undefined)
      );
      const cs = analytics?.confidence_score || prop.confidence_score || 5;
      const base = analytics ? {
        ...prop,
        has_analytics: true,
        avg_last_5:        analytics.avg_last_5,
        avg_last_10:       analytics.avg_last_10,
        hit_rate_last_10:  analytics.hit_rate_last_10,
        projection:        analytics.projection,
        edge:              analytics.edge,
        confidence_score:  cs,
        season_avg:        analytics.season_avg,
        season_games:      analytics.season_games,
        season_hit_rate:   analytics.season_hit_rate,
        streak_info:       analytics.streak_info,
        last_10_games:     analytics.last_10_games,
        last_5_games:      analytics.last_5_games,
        game_logs_last_10: analytics.game_logs_last_10,
        avg_last_20:       analytics.avg_last_20,
        hit_rate_last_20:  analytics.hit_rate_last_20,
        last_20_games:     analytics.last_20_games,
        game_logs_last_20: analytics.game_logs_last_20,
        home_avg:          analytics.home_avg,
        away_avg:          analytics.away_avg,
        home_hit_rate:     analytics.home_hit_rate,
        away_hit_rate:     analytics.away_hit_rate,
        home_games_count:  analytics.home_games_count,
        away_games_count:  analytics.away_games_count,
        confidence_tier:   cs >= 8 ? 'A' : cs >= 6 ? 'B' : 'C',
        is_lock:           cs === 10,
        best_value:        (analytics.edge || 0) > 8,
      } : propPreEnriched
        ? { ...prop } // Sleeper analytics already on the raw prop — preserve as-is
        : { ...prop, data_unavailable: dataUnavailable };

      // 2. Team context
      const team    = prop.team || prop.player_team || '';
      const opp     = prop.opponent    || '';
      const oppData = teams[opp]  || {};
      const tmData  = teams[team] || {};
      const isHome  = team === prop.home;
      const gameId  = `${prop.away || ''}@${prop.home || ''}`;
      const homeSpread = spreads[gameId];
      const playerSpread = homeSpread != null
        ? (isHome ? homeSpread : -homeSpread)
        : null;

      // Pick the defensive stat column that matches this prop type + position
      const propType = prop.prop_type || '';
      const posUpper = (prop.position || base.position || '').toUpperCase();
      let defStatKey = 'pass_yds_allowed'; // default (QB props)
      if (propType === 'rushing_yards' || propType === 'rushing_tds' || propType === 'rushing_attempts') {
        defStatKey = 'rush_yds_allowed';
      } else if (
        propType === 'receiving_yards' || propType === 'receiving_tds' ||
        propType === 'receptions'      || propType === 'rush_rec_yards'
      ) {
        defStatKey = posUpper === 'TE' ? 'rec_yds_allowed_te'
                   : posUpper === 'RB' ? 'rec_yds_allowed_rb'
                   : 'rec_yds_allowed_wr';
      } else if (propType === 'rush_rec_tds') {
        defStatKey = posUpper === 'RB' ? 'rush_yds_allowed' : 'rec_yds_allowed_wr';
      }
      // opp_def_stat = the specific yards-allowed figure used by gradeWithContext criterion 1
      const oppDefStat = oppData[defStatKey] ?? null;

      // 3. Injury context — find injured teammates and opponents
      const teamUpper = team.toUpperCase();
      const oppUpper  = opp.toUpperCase();
      const injuredTeammates = Object.entries(injuries)
        .filter(([name, info]) => (info.team || '').toUpperCase() === teamUpper && name !== prop.player_name)
        .map(([name]) => name);
      const injuryContext = injuredTeammates.length > 0
        ? injuredTeammates.slice(0, 2).join(', ') + (injuredTeammates.length > 2 ? ` +${injuredTeammates.length - 2} more` : '') + ' (Out)'
        : null;

      const injuredOpponents = Object.entries(injuries)
        .filter(([, info]) => oppUpper && (info.team || '').toUpperCase() === oppUpper)
        .map(([name]) => name);
      const oppInjuryContext = injuredOpponents.length > 0
        ? injuredOpponents.slice(0, 2).join(', ') + (injuredOpponents.length > 2 ? ` +${injuredOpponents.length - 2} more` : '') + ' (Out)'
        : null;

      return {
        ...base,
        // Use the prop-type-specific yard-allowed stat as the primary defense rating.
        // Non-null whenever the opponent abbreviation matches a known team — this is what
        // triggers gradeWithContext instead of the market-only fallback.
        opponent_def_rating: oppDefStat,
        opp_def_stat:        oppDefStat,
        pos_def_rating:      oppDefStat,
        pos_category:        posUpper,
        opponent_pace:       oppData.pace ?? null,
        player_team_pace:    tmData.pace  ?? null,
        is_home:             isHome,
        is_back_to_back:     b2b.has(team),
        spread:               playerSpread,
        injury_context:       injuryContext,
        injury_count:         injuredTeammates.length,
        opp_injury_context:   oppInjuryContext,
        opp_injury_count:     injuredOpponents.length,
        // New fields from nfl_data_py analytics
        target_share:  analytics?.target_share  ?? prop.target_share  ?? null,
        snap_pct:      analytics?.snap_pct      ?? prop.snap_pct      ?? null,
        adot:          analytics?.adot          ?? prop.adot          ?? null,
        epa_per_game:  analytics?.epa_per_game  ?? prop.epa_per_game  ?? null,
        // Weather for this game (keyed by home team)
        weather:      weatherData[prop.home || ''] ?? null,
      };
    });
  }, [rawProps, playerAnalytics, teamContext, weatherData]);

  useEffect(() => {
    loadData();
    return () => { if (retryTimerRef.current) clearInterval(retryTimerRef.current); };
  }, []);

  // Which NFL week numbers are represented in the loaded data
  const availableWeeks = useMemo(() => {
    const weeks = new Set();
    enrichedProps.forEach(p => {
      const w = getNFLWeek(p.scheduled_at);
      if (w != null) weeks.add(w);
    });
    return Array.from(weeks).sort((a, b) => a - b);
  }, [enrichedProps]);

  // Current real-world NFL week (null = preseason/offseason)
  const todaysNFLWeek = useMemo(() => getNFLWeek(new Date().toISOString()), []);
  // Season banner: preseason if no current week; early-season for weeks 1-3 where
  // the model still runs on prior-year data because current-year logs haven't accumulated.
  const seasonBanner = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const priorYear   = currentYear - 1;
    if (todaysNFLWeek === null) {
      return { type: 'preseason', priorYear };
    }
    if (todaysNFLWeek <= 3) {
      return { type: 'early', week: todaysNFLWeek, priorYear };
    }
    return null;
  }, [todaysNFLWeek]);

  // Auto-correct: if the default [1] has no data, jump to first available week
  useEffect(() => {
    if (!availableWeeks.length) return;
    const hasData = selectedWeeks.some(w => availableWeeks.includes(w));
    if (!hasData) setSelectedWeeks([availableWeeks[0]]);
  }, [availableWeeks]);

  // Props filtered to selected weeks (empty = all weeks)
  const weekFilteredProps = useMemo(() => {
    if (selectedWeeks.length === 0) return enrichedProps;
    return enrichedProps.filter(p => {
      const w = getNFLWeek(p.scheduled_at);
      return w != null && selectedWeeks.includes(w);
    });
  }, [enrichedProps, selectedWeeks]);

  const toggleWeek = (w) => {
    setSelectedWeeks(prev => prev.includes(w) ? prev.filter(x => x !== w) : [...prev, w]);
    setSelectedGames([]);
  };

  const toggleGame = (g) => {
    const key = `${(g.away || '').toUpperCase()}@${(g.home || '').toUpperCase()}`;
    setSelectedGames(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  // Derive games from week-filtered props so game filter only shows relevant matchups
  const sortedGames = useMemo(() => {
    const seen = new Map();
    weekFilteredProps.forEach(p => {
      const away = (p.away || '').toUpperCase();
      const home = (p.home || '').toUpperCase();
      if (!away || !home) return;
      const k = `${away}@${home}`;
      if (!seen.has(k)) seen.set(k, { home: p.home, away: p.away, scheduled_at: p.scheduled_at });
    });
    return Array.from(seen.values()).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  }, [weekFilteredProps]);

  // Split sorted games into today / tomorrow / other for the filter UI.
  // "Other" games are shown in the filter but never affect Locks / Demon Pick (today-only).
  const { todayGames, tomorrowGames, otherGames } = useMemo(() => {
    const today = [], tomorrow = [], other = [];
    sortedGames.forEach(g => {
      const d = localDateStr(g.scheduled_at);
      if (!d || d === todayLocalStr)   today.push(g);
      else if (d === tomorrowLocalStr) tomorrow.push(g);
      else other.push(g);
    });
    return { todayGames: today, tomorrowGames: tomorrow, otherGames: other };
  }, [sortedGames]);

  const hasBeyondTomorrow = otherGames.length > 0;

  // Team abbreviations playing TODAY only.
  // Returns null when there are no non-today games loaded (no filtering needed).
  const todayTeams = useMemo(() => {
    const s = new Set();
    // Nothing non-today → all loaded props are today's, no need to filter
    if (tomorrowGames.length === 0 && !hasBeyondTomorrow) return null;
    todayGames.forEach(g => {
      if (g.away) s.add(g.away.toUpperCase());
      if (g.home) s.add(g.home.toUpperCase());
    });
    return s;
  }, [todayGames, tomorrowGames, hasBeyondTomorrow]);

  const isTodayProp = (p) => {
    if (!todayTeams) return true; // no tomorrow split → all are today
    const team = (p.team || p.player_team || '').toUpperCase();
    return todayTeams.has(team);
  };

  // Picks of the day: top 2 props by AI confidence (≥75%) with real game log data — TODAY only
  const locks = useMemo(() => {
    const getConfidence = (p) => {
      const logs = p.last_10_games || [];
      if (logs.length === 0 && p.avg_last_10 == null) return 0;
      const hitCount = logs.length > 0 ? logs.filter(v => v > p.line).length : 0;
      const dynamicHitRate = logs.length > 0 ? Math.round(hitCount / logs.length * 100) : p.hit_rate_last_10;
      const base = p.projection ?? p.avg_last_10 ?? null;
      const dynamicEdge = base != null ? Math.round((base - p.line) * 100) / 100 : p.edge;
      return gradeProp({ ...p, hit_rate_last_10: dynamicHitRate, edge: dynamicEdge }).confidence;
    };

    return [...weekFilteredProps]
      .filter(p => p.avg_last_10 != null && isTodayProp(p) && getConfidence(p) >= 75)
      .sort((a, b) => rankScore(b) - rankScore(a))
      .slice(0, 2);
  }, [weekFilteredProps, todayTeams]);

  // Demon Pick: player on a cold streak BUT the line is set too low vs their season avg —
  // AI predicts a bounce-back explosion because books overreacted to the slump.
  // Hidden scoring factors drive selection (not shown as explicit criteria in UI).
  const demonPick = useMemo(() => {
    // Parse minutes string "32:15" or "32" → float
    const parseMins = (m) => {
      if (m == null) return 0;
      const s = String(m);
      const parts = s.split(':');
      return parseFloat(parts[0]) + (parts[1] ? parseFloat(parts[1]) / 60 : 0);
    };

    const AVG_DEF = 113.5;
    const AVG_PACE = 98.5;

    const candidates = weekFilteredProps
      .filter(p => p.avg_last_10 != null && p.season_avg != null && isTodayProp(p))
      .filter(p => {
        // Must be in a cold streak (under streak of 2+ games OR L5 meaningfully below L10)
        const underMatch = (p.streak_info || '').match(/^(\d+) game under streak/i);
        const coldStreak = underMatch && parseInt(underMatch[1], 10) >= 2;
        const l5Slump = p.avg_last_5 != null && p.avg_last_5 < p.avg_last_10 * 0.92;
        if (!coldStreak && !l5Slump) return false;

        // Factor 9: Fluke filter — if most under games had low minutes, skip (not a real slump)
        const gameLogs = p.game_logs_last_10 || [];
        const underGames = gameLogs.filter(g => g.value != null && g.value <= p.line);
        if (underGames.length >= 2) {
          const flukePct = underGames.filter(g => parseMins(g.minutes) < 20).length / underGames.length;
          if (flukePct > 0.5) return false; // >50% of unders were limited-minute games — skip
        }

        // Season avg must be meaningfully above the line — both relatively AND absolutely.
        // Percentage alone allows trivial picks like 0.5→1.0; absolute floor prevents that.
        const absGap = p.season_avg - p.line;
        const minAbsGap = ['points', 'PRA', 'P+R', 'P+A', 'A+R'].includes(p.prop_type) ? 4 : 2;
        if (p.season_avg < p.line * 1.15) return false;  // must be 15%+ above line
        if (absGap < minAbsGap) return false;             // must be meaningful in actual units
        if (p.line < 3) return false;                     // no micro-lines (0.5 AST, 0.5 3PM)

        // AI must still lean OVER (grade engine agrees despite cold streak)
        const logs = p.last_10_games || [];
        const hitCount = logs.filter(v => v > p.line).length;
        const dynamicHitRate = logs.length > 0 ? Math.round(hitCount / logs.length * 100) : p.hit_rate_last_10;
        const base = p.projection ?? p.avg_last_10 ?? null;
        const dynamicEdge = base != null ? Math.round((base - p.line) * 100) / 100 : p.edge;
        const g = gradeProp({ ...p, hit_rate_last_10: dynamicHitRate, edge: dynamicEdge });
        return g.lean === 'OVER';
      })
      .map(p => {
        const underMatch = (p.streak_info || '').match(/^(\d+) game under streak/i);
        const coldStreakLen = underMatch ? parseInt(underMatch[1], 10) : 0;
        const label = (propTypeLabels[p.prop_type] || p.prop_type).toUpperCase();
        const boomLine = Math.round(p.season_avg * 2) / 2;
        const gap = +(p.season_avg - p.line).toFixed(1);

        // ── Hidden multi-factor score ──────────────────────────────────────
        let score = 0;
        const signals = [];

        // Factor 1: Season vs Recent Gap — core bounce signal (0–25)
        const recentAvg = p.avg_last_5 ?? p.avg_last_10;
        const dropPct = p.season_avg > 0 ? (p.season_avg - recentAvg) / p.season_avg : 0;
        const gapPts = Math.min(25, Math.round(dropPct * 80));
        score += gapPts;
        if (dropPct >= 0.15) signals.push(`down ${Math.round(dropPct * 100)}% from season avg`);

        // Factor 2: Minutes/role stability — slump is variance not role loss (0–15)
        const minsArr = p.minutes_last_5 || [];
        if (minsArr.length >= 3) {
          const avgMins = minsArr.reduce((a, b) => a + b, 0) / minsArr.length;
          if (avgMins >= 28) { score += 15; signals.push(`still logging ${avgMins.toFixed(0)}+ min/game`); }
          else if (avgMins >= 22) { score += 8; }
        }

        // Factor 4: Teammate injuries — more opportunity (0–15)
        const injBoost = Math.min(15, (p.injury_count || 0) * 8);
        score += injBoost;
        if (injBoost > 0) signals.push(`${p.injury_count} teammate${p.injury_count > 1 ? 's' : ''} out`);

        // Factor 5: Matchup advantage — weak opposing defense (0–15)
        const defRating = p.pos_def_rating ?? p.opponent_def_rating;
        if (defRating != null && defRating > AVG_DEF) {
          const defBoost = Math.min(15, Math.round((defRating - AVG_DEF) * 2.5));
          score += defBoost;
          if (defRating > AVG_DEF + 3) signals.push(`weak opp defense (${defRating.toFixed(1)} pts/100)`);
        }

        // Factor 6: Line vs season average gap (0–20)
        const lineGapPct = p.season_avg > 0 ? (p.season_avg - p.line) / p.season_avg : 0;
        score += Math.min(20, Math.round(lineGapPct * 65));

        // Factor 7: Fast-paced game — more possessions (0–8)
        const avgPace = p.opponent_pace && p.player_team_pace
          ? (p.opponent_pace + p.player_team_pace) / 2 : null;
        if (avgPace != null && avgPace >= AVG_PACE + 1) { score += 8; signals.push('fast-paced game'); }
        else if (avgPace != null && avgPace >= AVG_PACE) { score += 4; }

        // Factor 9: Genuine cold streak (not flukes) — cold in full-minute games (0–10)
        const gameLogs = p.game_logs_last_10 || [];
        const fullMinsGames = gameLogs.filter(g => parseMins(g.minutes) >= 20);
        const genuineUnders = fullMinsGames.filter(g => g.value != null && g.value <= p.line).length;
        if (fullMinsGames.length >= 3 && genuineUnders / fullMinsGames.length >= 0.6) {
          score += 10; // Genuine slump in healthy games → strongest bounce signal
        }

        const boomScore = Math.min(99, score);

        // ── Reason narrative ────────────────────────────────────────────────
        let reason = `${p.player_name} averages ${p.season_avg} ${label} this season but the line is only ${p.line} — books overreacted to a cold streak.`;
        if (coldStreakLen >= 2) {
          reason += ` ${coldStreakLen}-game under streak, but the slump is variance: ${signals.length > 0 ? signals.join(', ') + '.' : 'role and minutes unchanged.'}`;
        } else {
          reason += ` L5 avg dropped to ${p.avg_last_5} but ${signals.length > 0 ? signals.join(', ') + '.' : 'role unchanged.'}`;
        }
        reason += ` Season average of ${p.season_avg} is ${gap} above tonight's line — prime bounce-back spot vs ${p.opponent}.`;

        return { prop: p, coldStreakLen, seasonAvg: p.season_avg, boomLine, boomScore, reason };
      })
      .sort((a, b) => b.boomScore - a.boomScore);

    return candidates[0] || null;
  }, [weekFilteredProps, todayTeams]);

  // All prop types per player (from the full unfiltered set) — passed to each card
  // so it can show a prop-type switcher without having to know about filtered siblings
  const propsByPlayer = useMemo(() => {
    const map = {};
    weekFilteredProps.forEach(p => {
      if (!map[p.player_name]) map[p.player_name] = [];
      map[p.player_name].push(p);
    });
    return map;
  }, [weekFilteredProps]);

  // Dynamic prop-type filter chips — only types that have actual data in the feed.
  // Grouped: Passing → Rushing → Receiving → Combo/Other → Period
  const propTypeOptions = useMemo(() => {
    const inFeed = new Set(weekFilteredProps.map(p => p.prop_type));
    const ORDER = [
      'passing_yards', 'passing_tds', 'passing_ints', 'pass_rush_yards', 'passing_long',
      'rushing_yards', 'rushing_tds', 'rushing_long', 'rushing_attempts',
      'receiving_yards', 'receiving_tds', 'receptions',
      'rush_rec_tds', 'rush_rec_yards', 'fantasy_points', 'sacks', 'tackles',
      'q1_passing_yards', 'q1_rushing_yards', 'q1_receiving_yards', 'q1_receptions', 'q1_rush_rec_tds',
      'h1_passing_yards', 'h1_rushing_yards', 'h1_receiving_yards', 'h1_receptions', 'h1_rush_rec_tds',
    ];
    return ORDER.filter(t => inFeed.has(t));
  }, [weekFilteredProps]);

  // Unique betting platforms present in the current prop set, in display order
  const availableSources = useMemo(() => {
    const seen = new Set();
    weekFilteredProps.forEach(p => (p.sources || []).forEach(s => seen.add(s)));
    const ORDER = ['fanduel', 'draftkings', 'betmgm', 'caesars', 'pointsbetus', 'prizepicks', 'underdog'];
    return ORDER.filter(s => seen.has(s));
  }, [weekFilteredProps]);

  // Unique player names for search suggestions
  const allPlayerNames = useMemo(() => {
    const seen = new Set();
    return weekFilteredProps
      .map(p => p.player_name)
      .filter(n => { if (seen.has(n)) return false; seen.add(n); return true; })
      .sort();
  }, [weekFilteredProps]);

  const playerSuggestions = useMemo(() => {
    if (!playerSearch.trim()) return [];
    const q = playerSearch.toLowerCase();
    return allPlayerNames.filter(n => n.toLowerCase().includes(q)).slice(0, 8);
  }, [playerSearch, allPlayerNames]);

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowPlayerDrop(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const filteredAndRanked = useMemo(() => {
    let result = weekFilteredProps;

    if (selectedPlayers.length > 0) {
      result = result.filter(p => selectedPlayers.includes(p.player_name));
    }

    if (selectedSources.length > 0) {
      result = result.filter(p =>
        (p.sources || []).some(s => selectedSources.includes(s))
      );
    }

    if (selectedGames.length > 0) {
      result = result.filter(p => {
        const pTeam = (p.team || '').toUpperCase();
        const pOpp = (p.opponent || '').toUpperCase();
        return selectedGames.some(key => {
          const [away, home] = key.split('@');
          return (pTeam === away || pTeam === home) && (pOpp === away || pOpp === home);
        });
      });
    }

    if (selectedType !== 'all' && propTypeOptions.includes(selectedType)) {
      result = result.filter(p => p.prop_type === selectedType);
    }

    result = [...result].sort((a, b) => {
      if (sortBy === 'ai_rank') return rankScore(b) - rankScore(a);
      if (sortBy === 'confidence') return (b.confidence_score || 0) - (a.confidence_score || 0);
      if (sortBy === 'edge') return (b.edge || 0) - (a.edge || 0);
      if (sortBy === 'hit_rate') return (b.hit_rate_last_10 || 0) - (a.hit_rate_last_10 || 0);
      return 0;
    });

    // Diversity cap: max 3 props per team so a single favorable matchup can't
    // flood the top of the list. Only applies to AI Rank sort with no active filters.
    const isUnfiltered = selectedGames.length === 0 && selectedPlayers.length === 0 && selectedType === 'all' && selectedSources.length === 0;
    if (sortBy === 'ai_rank' && isUnfiltered) {
      const teamCount = {};
      const capped = [];
      const overflow = [];
      for (const p of result) {
        const t = (p.team || '').toUpperCase();
        teamCount[t] = (teamCount[t] || 0) + 1;
        if (teamCount[t] <= 3) capped.push(p);
        else overflow.push(p);
      }
      // Append overflow after all capped props so nothing is hidden — just reordered
      return [...capped, ...overflow];
    }

    return result;
  }, [weekFilteredProps, selectedGames, selectedType, sortBy, selectedPlayers, selectedSources]);

  // Group ranked props by player, preserving the rank of their best prop
  const playerGroups = useMemo(() => {
    const seen = new Map();
    const groups = [];
    filteredAndRanked.forEach((prop) => {
      const name = prop.player_name;
      if (!seen.has(name)) {
        seen.set(name, groups.length);
        // rank = sequential group position (1, 2, 3...) — avoids gaps from multi-prop players
        groups.push({ playerName: name, rank: groups.length + 1, props: [] });
      }
      groups[seen.get(name)].props.push(prop);
    });
    return groups;
  }, [filteredAndRanked]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">
          {slowLoad ? 'Server warming up after inactivity…' : 'Fetching today\'s props…'}
        </span>
        {slowLoad && (
          <span className="text-xs text-muted-foreground/50 max-w-xs">
            This happens once after the server goes idle. Usually takes 30–45s — hang tight.
          </span>
        )}
      </div>
    );
  }

  return (
    <>
    <div className="space-y-6">
      {/* Demo mode banner */}
      {isDemoMode() && (
        <div className="flex items-center gap-2 text-xs px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 font-medium">
          <Zap className="w-3.5 h-3.5 flex-shrink-0" />
          Demo Mode — showing example props with mock data. Remove <code className="font-mono bg-amber-500/20 px-1 rounded">?demo</code> from the URL to see live props.
        </div>
      )}

      {/* Season state banner */}
      {seasonBanner && (
        <div className="flex items-start gap-2.5 text-xs px-4 py-3 rounded-xl bg-sky-500/8 border border-sky-500/20 text-sky-300/80">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-sky-400" />
          <div>
            {seasonBanner.type === 'preseason' ? (
              <>
                <span className="font-semibold text-sky-300">Preseason — </span>
                model predictions use <span className="font-semibold">{seasonBanner.priorYear} season history</span> until regular-season games begin.
                Confidence scores will sharpen as {new Date().getFullYear()} game data accumulates.
              </>
            ) : (
              <>
                <span className="font-semibold text-sky-300">Week {seasonBanner.week} model — </span>
                grading is anchored to <span className="font-semibold">{seasonBanner.priorYear} season history</span>.
                Confidence improves week-over-week as {new Date().getFullYear()} logs accumulate (full signal by Week 4).
              </>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            <Zap className="w-7 h-7 text-primary" />
            NFL Props
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            {isLive ? (
              <><Wifi className="w-3.5 h-3.5 text-primary" /><span className="text-primary font-medium">Live</span>{gameDate && <span className="text-muted-foreground">· {gameDate}</span>}</>
            ) : (
              <><WifiOff className="w-3.5 h-3.5" />No live data available</>
            )}
            {(aiLoading || refreshing) && <span className="text-muted-foreground flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" />{refreshing ? 'Updating…' : 'AI analyzing…'}</span>}
          </p>
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-foreground bg-secondary hover:bg-secondary/80 transition-all disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Week selector — shown when multiple weeks have data, or always once data is loaded */}
      {availableWeeks.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mr-1">Week</span>
          {availableWeeks.map(w => {
            const active = selectedWeeks.includes(w);
            return (
              <button
                key={w}
                onClick={() => toggleWeek(w)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-lg border transition-all font-semibold",
                  active
                    ? "bg-primary/20 border-primary/50 text-primary"
                    : "bg-secondary/60 border-border text-muted-foreground hover:text-foreground hover:border-white/15"
                )}
              >
                Week {w}
              </button>
            );
          })}
          {selectedWeeks.length > 0 && (
            <button
              onClick={() => setSelectedWeeks([])}
              className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors ml-1"
            >
              All weeks
            </button>
          )}
        </div>
      )}

      {/* Game filter — split by Today / Tomorrow */}
      {sortedGames.length > 0 && (
        <div className="space-y-2">
          {/* Today's games */}
          {todayGames.length > 0 && (
            <div>
              {tomorrowGames.length > 0 && (
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Today</p>
              )}
              <div className="chip-scroll-fade flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap scrollbar-none">
                {todayGames.map((g, i) => {
                  const key = `${(g.away || '').toUpperCase()}@${(g.home || '').toUpperCase()}`;
                  const active = selectedGames.includes(key);
                  const tipoff = fmtTipoff(g.scheduled_at) || g.tipoff;
                  return (
                    <button key={i} onClick={() => toggleGame(g)}
                      className={cn(
                        "flex items-center gap-2 border rounded-lg px-3 py-2 text-xs transition-all flex-shrink-0 whitespace-nowrap",
                        active ? "bg-primary/15 border-primary/50 text-foreground" : "bg-secondary/60 border-border text-foreground hover:border-primary/30"
                      )}
                    >
                      <span className="font-bold">{g.away} @ {g.home}</span>
                      {tipoff && <span className="text-muted-foreground">{tipoff}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tomorrow's games */}
          {tomorrowGames.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Tomorrow</p>
              <div className="chip-scroll-fade flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap scrollbar-none">
                {tomorrowGames.map((g, i) => {
                  const key = `${(g.away || '').toUpperCase()}@${(g.home || '').toUpperCase()}`;
                  const active = selectedGames.includes(key);
                  const tipoff = fmtTipoff(g.scheduled_at) || g.tipoff;
                  return (
                    <button key={i} onClick={() => toggleGame(g)}
                      className={cn(
                        "flex items-center gap-2 border rounded-lg px-3 py-2 text-xs transition-all flex-shrink-0 whitespace-nowrap",
                        active ? "bg-primary/15 border-primary/50 text-foreground" : "bg-secondary/60 border-border text-foreground hover:border-primary/30"
                      )}
                    >
                      <span className="font-bold">{g.away} @ {g.home}</span>
                      {tipoff && <span className="text-muted-foreground">{tipoff}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Other days — grouped by date so Week 1 / Week 2 / Week 3 each get their own label */}
          {otherGames.length > 0 && (() => {
            const byDate = {};
            otherGames.forEach(g => {
              const d = localDateStr(g.scheduled_at) || 'unknown';
              if (!byDate[d]) byDate[d] = [];
              byDate[d].push(g);
            });
            return Object.entries(byDate)
              .sort(([a], [b]) => (a < b ? -1 : 1))
              .map(([dateKey, dayGames]) => {
                const label = dayGames[0]?.scheduled_at
                  ? new Date(dayGames[0].scheduled_at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
                  : dateKey;
                return (
                  <div key={dateKey}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">{label}</p>
                    <div className="chip-scroll-fade flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap scrollbar-none">
                      {dayGames.map((g, i) => {
                        const key = `${(g.away || '').toUpperCase()}@${(g.home || '').toUpperCase()}`;
                        const active = selectedGames.includes(key);
                        const tipoff = fmtTipoff(g.scheduled_at) || g.tipoff;
                        return (
                          <button key={i} onClick={() => toggleGame(g)}
                            className={cn(
                              "flex items-center gap-2 border rounded-lg px-3 py-2 text-xs transition-all flex-shrink-0 whitespace-nowrap",
                              active ? "bg-primary/15 border-primary/50 text-foreground" : "bg-secondary/60 border-border text-foreground hover:border-primary/30"
                            )}
                          >
                            <span className="font-bold">{g.away} @ {g.home}</span>
                            {tipoff && <span className="text-muted-foreground">{tipoff}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              });
          })()}

          {selectedGames.length > 0 && (
            <button onClick={() => setSelectedGames([])} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* Empty state — no data at all (fetch failed or offseason) */}
      {enrichedProps.length === 0 && (
        <div className="text-center py-20 text-muted-foreground space-y-3">
          <Zap className="w-12 h-12 mx-auto opacity-20" />
          {retryIn != null ? (
            <>
              <p className="text-base font-medium text-foreground">Couldn't load props</p>
              <p className="text-sm">The server may still be warming up. Retrying in <span className="text-primary font-bold">{retryIn}s</span>…</p>
              <div className="flex items-center justify-center gap-3 mt-2">
                <button
                  onClick={() => { cancelRetry(); loadData(true); }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 transition-all font-medium"
                >
                  Retry Now
                </button>
                <button
                  onClick={cancelRetry}
                  className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-base font-medium">No props available today</p>
              <p className="text-sm">Check back closer to game time once props are posted.</p>
              <button
                onClick={() => loadData(true)}
                className="mt-1 text-xs px-3 py-1.5 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground transition-all"
              >
                <RefreshCw className="w-3 h-3 inline mr-1.5" />
                Try again
              </button>
            </>
          )}
        </div>
      )}

      {/* Empty state — data loaded but week filter has no props */}
      {enrichedProps.length > 0 && weekFilteredProps.length === 0 && (
        <div className="text-center py-16 text-muted-foreground space-y-2">
          <Zap className="w-10 h-10 mx-auto opacity-20" />
          <p className="text-base font-medium">No props for the selected week{selectedWeeks.length !== 1 ? 's' : ''}</p>
          <button
            onClick={() => setSelectedWeeks(availableWeeks.length ? [availableWeeks[0]] : [])}
            className="mt-1 text-xs px-3 py-1.5 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground transition-all"
          >
            Show available weeks
          </button>
        </div>
      )}

      {enrichedProps.length > 0 && weekFilteredProps.length > 0 && (
        <>
          {/* Locks of the Day */}
          <LockCards locks={locks} verdicts={verdicts} aiLoading={aiLoading} />

          {/* Demon Pick */}
          {demonPick && (
            <DemonPickCard
              pick={demonPick}
              onOpenDetail={() => setDetailDemon(true)}
            />
          )}

          {/* Filters */}
          <div className="flex flex-col gap-2" ref={searchRef}>
            {/* Platform switcher */}
            {availableSources.length > 0 && (() => {
              const hasOnlyFreeSources = availableSources.every(s => SOURCE_META[s]?.free);
              const activeMeta = selectedSources[0] ? (SOURCE_META[selectedSources[0]] || { label: selectedSources[0] }) : null;
              return (
                <div className="space-y-1">
                  <div className="chip-scroll-fade flex items-center gap-1.5 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-1 scrollbar-none">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 flex-shrink-0 self-center mr-0.5">
                      Platform
                    </span>
                    {/* All — clears platform filter */}
                    <button
                      onClick={() => setSelectedSources([])}
                      className={cn(
                        "text-xs px-3 py-1.5 rounded-lg border transition-all flex-shrink-0 whitespace-nowrap font-medium",
                        selectedSources.length === 0
                          ? "bg-white/12 border-white/30 text-foreground"
                          : "bg-secondary/40 border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                      )}
                    >
                      All
                    </button>
                    {availableSources.map(src => {
                      const meta = SOURCE_META[src] || { label: src, cls: 'text-muted-foreground bg-white/5 border-white/10' };
                      const active = selectedSources[0] === src;
                      return (
                        <button
                          key={src}
                          onClick={() => setSelectedSources(active ? [] : [src])}
                          className={cn(
                            "text-xs px-3 py-1.5 rounded-lg border transition-all flex-shrink-0 whitespace-nowrap font-medium",
                            active ? meta.cls : "bg-secondary/40 border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                          )}
                        >
                          {meta.label}
                        </button>
                      );
                    })}
                    {activeMeta && (
                      <span className="text-[10px] text-muted-foreground/50 flex-shrink-0 self-center ml-1 whitespace-nowrap">
                        · grading against {activeMeta.label} lines
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Prop type pills — dynamically generated from what's in the feed */}
            <div className="chip-scroll-fade flex gap-1.5 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap pb-1 scrollbar-none">
              <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 self-center" />
              {['all', ...propTypeOptions].map(t => (
                <button
                  key={t}
                  onClick={() => setSelectedType(t)}
                  className={cn(
                    "text-xs px-3 py-2 rounded-lg border transition-all flex-shrink-0 whitespace-nowrap",
                    selectedType === t
                      ? "bg-primary/20 border-primary/40 text-primary font-medium"
                      : "bg-secondary/60 border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t === 'all' ? 'All Props' : (propTypeLabels[t] || t)}
                </button>
              ))}
            </div>


            {/* Row 2: player search + sort */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Player search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder={selectedPlayers.length > 0 ? 'Add player…' : 'Search player…'}
                  value={playerSearch}
                  onChange={e => { setPlayerSearch(e.target.value); setShowPlayerDrop(true); }}
                  onFocus={() => setShowPlayerDrop(true)}
                  className="w-44 pl-8 pr-7 py-1.5 text-xs bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {playerSearch && (
                  <button
                    onClick={() => { setPlayerSearch(''); setShowPlayerDrop(false); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
                {showPlayerDrop && playerSuggestions.length > 0 && (
                  <div className="absolute top-full mt-1 w-64 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                    {playerSuggestions.filter(name => !selectedPlayers.includes(name)).map(name => {
                      const p = weekFilteredProps.find(ep => ep.player_name === name);
                      const propCount = weekFilteredProps.filter(ep => ep.player_name === name).length;
                      return (
                        <button
                          key={name}
                          onClick={() => { setSelectedPlayers(prev => [...prev, name]); setPlayerSearch(''); setShowPlayerDrop(false); }}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-secondary transition-colors text-left"
                        >
                          <div>
                            <p className="text-sm font-medium text-foreground">{name}</p>
                            <p className="text-[10px] text-muted-foreground">{p?.team} · {p?.position}</p>
                          </div>
                          <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{propCount}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Sort */}
              <span className="text-xs text-muted-foreground flex-shrink-0">Sort:</span>
              {(() => {
                const hasEdge      = weekFilteredProps.some(p => p.edge != null && p.edge !== 0);
                const hasHitRate   = weekFilteredProps.some(p => p.hit_rate_last_10 != null);
                const hasConf      = weekFilteredProps.some(p => (p.confidence_score || 0) > 5);
                const disabled = {
                  confidence: !hasConf,
                  edge:       !hasEdge,
                  hit_rate:   !hasHitRate,
                };
                return (
                  <div className="flex items-center gap-1">
                    {SORT_OPTIONS.map(o => {
                      const off = disabled[o.value] === true;
                      const active = sortBy === o.value;
                      return (
                        <button
                          key={o.value}
                          disabled={off}
                          onClick={() => !off && setSortBy(o.value)}
                          title={off ? `No ${o.label.toLowerCase()} data yet — loads once analytics are available` : undefined}
                          className={cn(
                            'text-xs px-2.5 py-1.5 rounded-lg border transition-all font-medium whitespace-nowrap',
                            off
                              ? 'opacity-35 cursor-not-allowed bg-secondary/30 border-border/30 text-muted-foreground/40'
                              : active
                              ? 'bg-primary/20 border-primary/40 text-primary'
                              : 'bg-secondary/40 border-border text-muted-foreground hover:text-foreground hover:border-white/15'
                          )}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Selected player chips */}
              {selectedPlayers.map(name => (
                <button
                  key={name}
                  onClick={() => setSelectedPlayers(prev => prev.filter(n => n !== name))}
                  className="flex items-center gap-1 text-xs bg-primary/15 border border-primary/30 text-primary px-2.5 py-1 rounded-full hover:bg-primary/25 transition-colors whitespace-nowrap"
                >
                  {name} <X className="w-3 h-3" />
                </button>
              ))}
              {selectedPlayers.length > 1 && (
                <button
                  onClick={() => setSelectedPlayers([])}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Ranked props list — collapsed by player */}
          <div>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <p className="text-xs text-muted-foreground flex-1 min-w-0">
                {playerGroups.length} players · {filteredAndRanked.length} props · ranked by {SORT_OPTIONS.find(o => o.value === sortBy)?.label}
                {lastFetchedAt && (() => {
                  const mins = Math.round((Date.now() - lastFetchedAt.getTime()) / 60000);
                  return <span className="text-muted-foreground/40 ml-1">· odds {mins <= 0 ? 'just updated' : `updated ${mins}m ago`}</span>;
                })()}
              </p>
              {/* View toggle */}
              <div className="flex items-center gap-0.5 bg-secondary/60 border border-border rounded-lg p-0.5 flex-shrink-0">
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn('p-1.5 rounded transition-all', viewMode === 'grid' ? 'bg-white/12 text-foreground' : 'text-muted-foreground/50 hover:text-muted-foreground')}
                  title="Grid view"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={cn('p-1.5 rounded transition-all', viewMode === 'table' ? 'bg-white/12 text-foreground' : 'text-muted-foreground/50 hover:text-muted-foreground')}
                  title="Table view"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {/* Active filter pills */}
              {selectedType !== 'all' && (
                <button
                  onClick={() => setSelectedType('all')}
                  className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/12 border border-primary/25 text-primary hover:bg-primary/20 transition-colors"
                >
                  {propTypeLabels[selectedType] || selectedType} <X className="w-2.5 h-2.5" />
                </button>
              )}
              {selectedGames.map(key => {
                const [away, home] = key.split('@');
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedGames(prev => prev.filter(k => k !== key))}
                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/8 border border-white/12 text-foreground/70 hover:text-foreground hover:border-white/20 transition-colors"
                  >
                    {away} @ {home} <X className="w-2.5 h-2.5" />
                  </button>
                );
              })}
              {selectedSources.map(src => (
                <button
                  key={src}
                  onClick={() => setSelectedSources(prev => prev.filter(s => s !== src))}
                  className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/8 border border-white/12 text-foreground/70 hover:text-foreground hover:border-white/20 transition-colors"
                >
                  {SOURCE_META[src]?.label ?? src} <X className="w-2.5 h-2.5" />
                </button>
              ))}
              {(selectedType !== 'all' || selectedGames.length > 0 || selectedSources.length > 0 || selectedPlayers.length > 0) && (
                <button
                  onClick={() => { setSelectedType('all'); setSelectedGames([]); setSelectedSources([]); setSelectedPlayers([]); }}
                  className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {playerGroups.map(({ playerName, rank, props }) => (
                  <PlayerRow
                    key={playerName}
                    playerName={playerName}
                    props={props}
                    allPlayerProps={propsByPlayer[playerName] ?? props}
                    rank={rank}
                    totalCount={playerGroups.length}
                    verdicts={verdicts}
                    aiLoading={aiLoading}
                    activeSource={selectedSources.length === 1 ? selectedSources[0] : null}
                    onOpenDetail={(pName, pType) => setDetailKey({ player_name: pName, prop_type: pType })}
                  />
                ))}
              </div>
            ) : (
              /* Compact table view */
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-secondary/40">
                        <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 w-8">#</th>
                        <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Player</th>
                        <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Prop · Line</th>
                        <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Probability</th>
                        <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Grade</th>
                        <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Edge</th>
                        <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Data</th>
                        <th className="px-3 py-2.5 w-24" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/4">
                      {filteredAndRanked.map((prop, i) => {
                        const g = gradeProp(prop);
                        const ev = calcEVVerdict(prop, g);
                        const isOver = ev.direction === 'OVER';
                        const prob = isOver ? g.overProb : g.underProb;
                        const lg = toLetterGrade(g.confidence, g.completeness);
                        const lgCls = letterGradeStyle(lg);
                        const dotCls = strengthDotClass(g.completeness);
                        const propLabel = propTypeLabels[prop.prop_type] || prop.prop_type;
                        return (
                          <tr
                            key={`${prop.player_name}-${prop.prop_type}`}
                            className="hover:bg-white/3 transition-colors cursor-pointer"
                            onClick={() => setDetailKey({ player_name: prop.player_name, prop_type: prop.prop_type })}
                          >
                            <td className="px-3 py-2.5">
                              <span className="text-[10px] font-bold text-muted-foreground/40">#{i + 1}</span>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <TeamLogo team={prop.team} className="w-6 h-6 flex-shrink-0" />
                                <div className="min-w-0">
                                  <p className="font-semibold text-foreground truncate max-w-[120px]">{prop.player_name}</p>
                                  <p className="text-[10px] text-muted-foreground/55">{prop.position} · {prop.team} vs {prop.opponent}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <p className="font-semibold text-foreground">{propLabel}</p>
                              <p className="text-[10px] font-mono text-muted-foreground/60">{prop.line}</p>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1.5">
                                {isOver
                                  ? <TrendingUp className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                                  : <TrendingDown className="w-3 h-3 text-rose-400 flex-shrink-0" />
                                }
                                <span className={cn('font-black tabular-nums', isOver ? 'text-emerald-400' : 'text-rose-400')}>
                                  {prob}%
                                </span>
                                <span className={cn('text-[10px] font-semibold', isOver ? 'text-emerald-400/50' : 'text-rose-400/50')}>
                                  {ev.direction}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={cn('font-black text-sm', lgCls)}>{lg}</span>
                            </td>
                            <td className="px-3 py-2.5">
                              {prop.edge != null && prop.edge !== 0 ? (
                                <span className={cn('font-semibold tabular-nums', prop.edge > 0 ? 'text-emerald-400' : 'text-rose-400')}>
                                  {prop.edge > 0 ? '+' : ''}{prop.edge}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/25">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1.5" title={`${g.completeness}% data completeness`}>
                                <div className={cn('w-2 h-2 rounded-full flex-shrink-0', dotCls)} />
                                <span className="text-[10px] text-muted-foreground/40">{g.completeness}%</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {}}
                                  className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 transition-colors whitespace-nowrap"
                                >
                                  OVER {prop.over_odds > 0 ? '+' : ''}{prop.over_odds ?? ''}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>

    {/* Prop detail modal — looks up live enriched prop so analytics update even if modal was opened early */}
    {detailKey && (() => {
      const liveProp = weekFilteredProps.find(p => p.player_name === detailKey.player_name && p.prop_type === detailKey.prop_type);
      return liveProp ? <PropDetailModal prop={liveProp} onClose={() => setDetailKey(null)} /> : null;
    })()}
    {detailDemon && demonPick && (
      <PropDetailModal prop={demonPick.prop} onClose={() => setDetailDemon(false)} />
    )}

    {/* Parlay bar is handled globally by MiniParlayBar in AppLayout */}
    </>
  );
}