// Player Trend Engine (Phase 1: Stock Up / Stock Down) — client for /api/trend-scores.
// See backend/main.py's "Player Trend Engine" section for what's actually computed and why.

import { NFL_API } from './config';

const CACHE_KEY = 'locklab_trend_v1';
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4h

export const TAG_META = {
  stock_up:   { label: 'Stock Up',   short: 'UP',   arrow: '↑' },
  stock_down: { label: 'Stock Down', short: 'DOWN', arrow: '↓' },
};

const METRIC_LABEL = {
  snap_share:   'Snap %',
  target_share: 'Tgt %',
  carry_share:  'Carry %',
};

export function metricLabel(metric) {
  return METRIC_LABEL[metric] ?? metric;
}

export async function fetchTrendScores() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
    if (cached.ts && Date.now() - cached.ts < CACHE_TTL && cached.data?.data_loaded) {
      return cached.data;
    }
  } catch { /* fall through to fetch */ }

  try {
    const res = await fetch(`${NFL_API}/api/trend-scores`);
    if (!res.ok) return { data_loaded: false, players: [] };
    const data = await res.json();
    if (data.data_loaded) {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch { /* quota */ }
    }
    return data;
  } catch {
    return { data_loaded: false, players: [] };
  }
}

// player_id -> trend entry, for O(1) lookup against player.id (both are the
// same Sleeper player_id — nflLiveData.js builds player.id from the same
// api.sleeper.app/v1/players/nfl keys this backend endpoint uses).
export function indexTrendByPlayerId(trendData) {
  const index = {};
  for (const p of trendData?.players ?? []) {
    index[p.player_id] = p;
  }
  return index;
}
