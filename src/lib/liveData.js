const CACHE_KEY = 'locklab_live_props_v45';
const CACHE_TS_KEY = 'locklab_live_props_ts_v45';
const FRESH_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

try {
  for (let i = 1; i <= 44; i++) {
    localStorage.removeItem(`locklab_live_props_v${i}`);
    localStorage.removeItem(`locklab_live_props_date_v${i}`);
    localStorage.removeItem(`locklab_live_props_ts_v${i}`);
  }
  // Clear old name→id cache so it gets rebuilt with normalized keys
  localStorage.removeItem('locklab_nfl_nameid_v1');
  localStorage.removeItem('locklab_nfl_nameid_ts_v1');
} catch {}

import { NFL_API } from './config';
import { isDemoMode, getMockPayload } from './mockData';
import { fetchPropsNoBackend, fetchUnderdogDirect } from './propsNoBackend';

// True when the API URL points to localhost but the browser is on a real domain.
// This happens in Vercel production builds where .env has VITE_API_URL=http://localhost:8000
// embedded at build time. Calling localhost from a remote domain always 503s.
export function isBackendReachable() {
  const apiIsLocal = NFL_API.includes('localhost') || NFL_API.includes('127.0.0.1');
  if (!apiIsLocal) return true; // external URL — assume reachable
  if (typeof window === 'undefined') return true; // SSR / build — skip check
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

export function isCacheValid() {
  try {
    const ts = Number(localStorage.getItem(CACHE_TS_KEY) || 0);
    return Date.now() - ts < FRESH_TTL_MS && !!localStorage.getItem(CACHE_KEY);
  } catch { return false; }
}

export function getCachedProps() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
}

function saveCache(payload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
  } catch { /* QuotaExceededError — payload still returned, just not cached */ }
}

export function clearLiveCache() {
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(CACHE_TS_KEY);
}

export function getStoredApiKey() { return null; }
export function setStoredApiKey() {}

// Human-readable display info keyed by the book/source key the backend uses.
// Keys match what the Odds API returns (or our own keys for PP/UD).
export const SOURCE_META = {
  // ── Free sources (no API key needed) ─────────────────────────────────────────
  prizepicks:    { label: 'PrizePicks', cls: 'text-purple-400  bg-purple-500/15  border-purple-500/30',  free: true  },
  underdog:      { label: 'Underdog',   cls: 'text-rose-400    bg-rose-500/15    border-rose-500/30',    free: true  },
  draftkings:    { label: 'DraftKings', cls: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30', free: true  },
  // ── Sportsbooks (require Odds API key) ─────────────────────────────────────
  fanduel:       { label: 'FanDuel',    cls: 'text-sky-400     bg-sky-500/15     border-sky-500/30'     },
  betmgm:        { label: 'BetMGM',    cls: 'text-orange-400  bg-orange-500/15  border-orange-500/30'  },
  caesars:       { label: 'Caesars',    cls: 'text-yellow-400  bg-yellow-500/15  border-yellow-500/30'  },
  bet365:        { label: 'Bet365',     cls: 'text-lime-400    bg-lime-500/15    border-lime-500/30'    },
  pointsbetus:   { label: 'PointsBet',  cls: 'text-indigo-400  bg-indigo-500/15  border-indigo-500/30'  },
  betonlineag:   { label: 'BetOnline',  cls: 'text-cyan-400    bg-cyan-500/15    border-cyan-500/30'    },
  mybookieag:    { label: 'MyBookie',   cls: 'text-teal-400    bg-teal-500/15    border-teal-500/30'    },
  bovada:        { label: 'Bovada',     cls: 'text-amber-400   bg-amber-500/15   border-amber-500/30'   },
  williamhill_us:{ label: 'WilliamHill',cls: 'text-blue-400    bg-blue-500/15    border-blue-500/30'    },
};

function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

function enrichProp(prop, index) {
  // Backend sends prop.team (player's team) and prop.opponent separately.
  // Fall back chain: team > player_team > home (old NBA-era fallback, wrong for NFL).
  const team     = prop.team || prop.player_team || '';
  const opponent = prop.opponent || (team && team !== prop.home ? prop.home : prop.away) || '';

  const hasRealAnalytics = prop.avg_last_10 != null && prop.hit_rate_last_10 != null;
  const avg_last_10 = prop.avg_last_10 ?? null;
  const avg_last_5  = prop.avg_last_5  ?? null;
  const hit_rate    = prop.hit_rate_last_10 ?? null;
  const projection  = prop.projection ?? null;
  const edge        = hasRealAnalytics ? (prop.edge ?? 0) : null;
  const confidence_score = hasRealAnalytics ? (prop.confidence_score ?? 5) : 5;
  const isHome = team === prop.home;

  return {
    ...prop,
    team, opponent, is_home: isHome,
    player_id: `live_${index}`,
    photo_url: prop.image_url || null,
    image_url: prop.image_url || null,
    position: prop.position || '',
    is_starter: true,
    injury_status: 'healthy',
    confidence_score, edge, avg_last_10, avg_last_5, hit_rate_last_10: hit_rate, projection,
    streak_info: prop.streak_info ?? null,
    last_10_games: prop.last_10_games ?? null,
    last_5_games:  prop.last_5_games  ?? null,
    game_logs_last_10: prop.game_logs_last_10 ?? null,
    minutes_avg: null, minutes_last_5: null, usage_rate: null,
    def_rank_vs_pos: null, matchup_rating: null, pace_rating: null, game_total: null,
    has_analytics: hasRealAnalytics,
    is_top_pick: hasRealAnalytics && confidence_score >= 8,
    is_lock: hasRealAnalytics && confidence_score === 10,
    best_value: hasRealAnalytics && (edge ?? 0) > 8,
    trap_warning: false,
    confidence_tier: hasRealAnalytics
      ? (confidence_score >= 8 ? 'A' : confidence_score >= 6 ? 'B' : 'C')
      : 'C',
    // all_books preserved from merge step; sources array drives platform filter
    all_books: prop.all_books || [],
    sources:   prop.sources   || [],
  };
}

// ── Line movement tracking ────────────────────────────────────────────────────
const LINE_PREV_KEY = 'locklab_prev_lines_v1';

export function getPrevLines() {
  try { return JSON.parse(sessionStorage.getItem(LINE_PREV_KEY) || '{}'); } catch { return {}; }
}

export function savePrevLines(props) {
  const map = {};
  props.forEach(p => {
    const k = `${p.player_name}__${p.prop_type}`;
    if (p.line != null) map[k] = p.line;
  });
  try { sessionStorage.setItem(LINE_PREV_KEY, JSON.stringify(map)); } catch {}
}

// ── Multi-source merge ────────────────────────────────────────────────────────
// Fetches all available sources in parallel and merges into one deduplicated list.
// Each merged prop carries:
//   sources   — string[] of platform keys (e.g. ['fanduel', 'draftkings', 'prizepicks'])
//   all_books — book objects from every source that carries this prop
//   line      — median across all books (consensus)
//   over_odds / under_odds — best (highest) across all books

function mergeSources(oddsData, ppData, udData, dkData) {
  // key = "PlayerName__prop_type"
  const map = {};

  function upsert(prop, bookKey, bookTitle) {
    const key = `${prop.player_name}__${prop.prop_type}`;
    if (!map[key]) {
      map[key] = { ...prop, sources: new Set(), all_books: [] };
    }
    const m = map[key];
    // Fill in team/game info when an earlier source left it blank (e.g. DraftKings)
    if (!m.team && prop.team) m.team = prop.team;
    if (!m.opponent && prop.opponent) m.opponent = prop.opponent;
    if (!m.player_team && prop.player_team) m.player_team = prop.player_team;
    if (!m.home && prop.home) m.home = prop.home;
    if (!m.away && prop.away) m.away = prop.away;
    if (!m.position && prop.position) m.position = prop.position;
    if (!m.image_url && prop.image_url) m.image_url = prop.image_url;
    if (!m.scheduled_at && prop.scheduled_at) m.scheduled_at = prop.scheduled_at;
    if (!m.sources.has(bookKey)) {
      m.sources.add(bookKey);
      m.all_books.push({
        key:        bookKey,
        title:      bookTitle,
        line:       prop.line,
        over_odds:  prop.over_odds,
        under_odds: prop.under_odds,
      });
    }
  }

  // Odds API props — each prop has its own bookmakers array
  if (oddsData?.rawProps?.length) {
    for (const prop of oddsData.rawProps) {
      const books = prop.bookmakers || [];
      if (books.length === 0) {
        upsert(prop, 'odds', 'Sportsbook');
      } else {
        for (const b of books) {
          upsert(
            { ...prop, line: b.line ?? prop.line, over_odds: b.over_odds ?? prop.over_odds, under_odds: b.under_odds ?? prop.under_odds },
            b.key,
            b.title,
          );
        }
      }
    }
  }

  // DraftKings (free, scraped directly)
  if (dkData?.rawProps?.length) {
    for (const prop of dkData.rawProps) {
      upsert(prop, 'draftkings', 'DraftKings');
    }
  }

  // PrizePicks
  if (ppData?.rawProps?.length) {
    for (const prop of ppData.rawProps) {
      upsert(prop, 'prizepicks', 'PrizePicks');
    }
  }

  // Underdog
  if (udData?.rawProps?.length) {
    for (const prop of udData.rawProps) {
      upsert(prop, 'underdog', 'Underdog');
    }
  }

  return Object.values(map).map(m => {
    const books = m.all_books;
    // Consensus line: median
    const lines = books.map(b => b.line).filter(l => l != null).sort((a, b) => a - b);
    const line = lines.length ? lines[Math.floor(lines.length / 2)] : m.line;
    // Best odds: highest value across books
    const overOdds  = books.reduce((best, b) => b.over_odds  != null && b.over_odds  > best ? b.over_odds  : best, m.over_odds  ?? -110);
    const underOdds = books.reduce((best, b) => b.under_odds != null && b.under_odds > best ? b.under_odds : best, m.under_odds ?? -110);

    return {
      ...m,
      line,
      over_odds:  overOdds,
      under_odds: underOdds,
      sources:    Array.from(m.sources),
    };
  });
}

// ── In-flight promise deduplication ──────────────────────────────────────────
let _fetchPromise = null;

async function _doFetch() {
  // If the configured API URL is localhost but we're running on a real domain,
  // fall back to public APIs (PrizePicks + Sleeper) instead of failing.
  if (!isBackendReachable()) {
    const fallback = await fetchPropsNoBackend();
    if (fallback) {
      const payload = { ...fallback, props: fallback.props.map((p, i) => enrichProp(p, i)) };
      saveCache(payload);
      return payload;
    }
    // No NFL props available right now (offseason / no games today)
    return { game_date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }), games_summary: [], props: [] };
  }

  const defaultBookmakers = 'draftkings,fanduel,betmgm,caesars,pointsbetus';

  // 20s timeout — Railway free tier can take 15s+ on cold start.
  const TIMEOUT = 20000;
  const [settingsResult, ppResult, udResult, dkResult] = await Promise.allSettled([
    fetchWithTimeout(`${NFL_API}/api/settings`, {}, TIMEOUT).then(r => r.json()).catch(() => ({})),
    fetchWithTimeout(`${NFL_API}/api/prizepicks/props`, {}, TIMEOUT).then(r => r.ok ? r.json() : null).catch(() => null),
    fetchWithTimeout(`${NFL_API}/api/underdog/props`, {}, TIMEOUT).then(r => r.ok ? r.json() : null).catch(() => null),
    fetchWithTimeout(`${NFL_API}/api/draftkings/props`, {}, TIMEOUT).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);

  const settings    = settingsResult.status === 'fulfilled' ? settingsResult.value : {};
  const hasOddsKey  = !!settings?.odds_api_key;
  const bookmakers  = settings?.bookmakers || defaultBookmakers;
  const ppData      = ppResult.status === 'fulfilled' ? ppResult.value : null;
  const udData      = udResult.status === 'fulfilled' ? udResult.value : null;
  const dkData      = dkResult.status === 'fulfilled' ? dkResult.value : null;

  let oddsData = null;
  if (hasOddsKey) {
    oddsData = await fetchWithTimeout(
      `${NFL_API}/api/odds/props?bookmakers=${encodeURIComponent(bookmakers)}`, {}, 10000
    ).then(r => r.ok ? r.json() : null).catch(() => null);
  }

  // Merge all sources
  let rawProps = mergeSources(oddsData, ppData, udData, dkData);

  // Last-resort fallback
  if (!rawProps.length) {
    const fallback = await fetchWithTimeout(`${NFL_API}/api/live-props`, {}, TIMEOUT)
      .then(r => r.ok ? r.json() : null).catch(() => null);
    if (fallback?.rawProps?.length) {
      rawProps = fallback.rawProps.map(p => ({ ...p, sources: [], all_books: [] }));
    }
  }

  if (!rawProps.length) {
    // Railway path returned nothing — try direct Underdog browser fetch as final fallback.
    const udDirect = await fetchUnderdogDirect();
    if (udDirect?.props?.length) {
      const props = udDirect.props.map((p, i) => enrichProp(p, i));
      const payload = { game_date: udDirect.game_date || new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }), games_summary: [], props };
      saveCache(payload);
      return payload;
    }
    return { game_date: new Date().toLocaleDateString(), games_summary: [], props: [] };
  }

  const gameDate     = oddsData?.game_date || ppData?.game_date || udData?.game_date || dkData?.game_date
    || new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const gamesSummary = oddsData?.games_summary || ppData?.games_summary || udData?.games_summary || dkData?.games_summary || [];

  const props = rawProps.map((prop, i) => enrichProp(prop, i));
  const payload = { game_date: gameDate, games_summary: gamesSummary, props };
  saveCache(payload);
  return payload;
}

export async function fetchLiveProps() {
  if (isDemoMode()) return getMockPayload();
  if (isCacheValid()) return getCachedProps();
  if (_fetchPromise) return _fetchPromise;
  _fetchPromise = _doFetch()
    .catch(async (err) => {
      console.error('[LockLab] props fetch failed, trying direct Underdog:', err);
      try {
        const ud = await fetchUnderdogDirect();
        if (ud?.props?.length) {
          const payload = { ...ud, props: ud.props.map((p, i) => enrichProp(p, i)) };
          saveCache(payload);
          return payload;
        }
      } catch {}
      return { game_date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }), games_summary: [], props: [] };
    })
    .finally(() => { _fetchPromise = null; });
  return _fetchPromise;
}

// ── Eager prefetch ────────────────────────────────────────────────────────────
if (!isDemoMode() && !isCacheValid()) {
  fetchLiveProps().catch(() => {});
}
