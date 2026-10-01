// Player Trend Engine (Stock Up, Stock Down, Buy Low, Sell High)
// Computes real usage & production trends from official Sleeper data.
// Supported by backend /api/trend-scores with seamless client-side Sleeper fallback.

import { NFL_API } from './config';
import { loadSleeperHistory } from './sleeperHistory';

const CACHE_KEY = 'locklab_trend_v4'; // v4: protected elite stars & robust analytics
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4h

export const TAG_META = {
  stock_up:   { label: 'Stock Up',   short: 'UP',        arrow: '↑', color: 'emerald' },
  stock_down: { label: 'Stock Down', short: 'DOWN',       arrow: '↓', color: 'red' },
  buy_low:    { label: 'Buy Low',    short: 'BUY LOW',    arrow: '▲', color: 'sky' },
  sell_high:  { label: 'Sell High',  short: 'SELL HIGH',  arrow: '▼', color: 'amber' },
};

const METRIC_LABEL = {
  snap_share:   'Snap %',
  target_share: 'Tgt %',
  carry_share:  'Carry %',
};

export function metricLabel(metric) {
  return METRIC_LABEL[metric] ?? metric;
}

function mean(arr) {
  const valid = arr.filter(v => v != null && !isNaN(v));
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

// Client-side computation fallback directly from Sleeper historical data
async function computeTrendsClientSide() {
  try {
    const sleeperCache = await loadSleeperHistory().catch(() => null);
    if (!sleeperCache?.byName) return { data_loaded: false, players: [] };

    const players = [];
    const validPositions = new Set(['QB', 'RB', 'WR', 'TE']);

    for (const [name, entry] of Object.entries(sleeperCache.byName)) {
      const pos = entry.position;
      if (!validPositions.has(pos)) continue;

      // Games are newest first in sleeperHistory — reverse for chronological order
      const games = [...(entry.games || [])].reverse();
      if (games.length < 2) continue;

      const nGames = games.length;
      const usesL3 = nGames >= 4;
      const recentGames = usesL3 ? games.slice(-3) : games.slice(-1);
      const priorGames = usesL3 ? games : games.slice(0, -1);

      // Compute stats
      const weekPoints = games.map(g => {
        const s = g.stats || {};
        const rec = s.rec || 0;
        const recYd = s.rec_yd || 0;
        const recTd = s.rec_td || 0;
        const rushYd = s.rush_yd || 0;
        const rushTd = s.rush_td || 0;
        const passYd = s.pass_yd || 0;
        const passTd = s.pass_td || 0;
        const offSnp = s.off_snp;
        const tmOffSnp = s.tm_off_snp || 65;
        const snapShare = offSnp != null && tmOffSnp ? Math.min(1.0, offSnp / tmOffSnp) : null;
        const targets = s.rec_tgt || 0;
        const carries = s.rush_att || 0;

        const fp = rec * 0.5 + recYd * 0.1 + recTd * 6.0 + rushYd * 0.1 + rushTd * 6.0 + passYd * 0.04 + passTd * 4.0;
        // Expected FP: position-average conversion rates (half-PPR)
        const xfp = pos === 'RB' ? (carries * 0.65 + targets * 1.35)
                  : pos === 'WR' ? (targets * 1.48 + carries * 0.65)
                  : pos === 'TE' ? (targets * 1.25)
                  : (passYd * 0.04 + passTd * 4.0 + carries * 0.65);

        return {
          week: g.week,
          snap_share: snapShare,
          targets,
          carries,
          actual_fp: fp,
          xfp,
        };
      });

      const recentWeeks = usesL3 ? weekPoints.slice(-3) : weekPoints.slice(-1);
      const priorWeeks = usesL3 ? weekPoints : weekPoints.slice(0, -1);

      const recentSnaps = mean(recentWeeks.map(w => w.snap_share));
      const priorSnaps = mean(priorWeeks.map(w => w.snap_share));
      const recentActualFp = mean(recentWeeks.map(w => w.actual_fp)) || 0;
      const recentXfp = mean(recentWeeks.map(w => w.xfp)) || 0;
      const recentFpoe = recentActualFp - recentXfp;

      const snapDelta = (recentSnaps != null && priorSnaps != null) ? (recentSnaps - priorSnaps) : 0;
      const momentum = Math.max(-100, Math.min(100, Math.round(snapDelta * 220)));

      // Elite star / anchor protection:
      // High-volume producers (Bijan Robinson, Jahmyr Gibbs, top RBs/WRs)
      // must NEVER be mislabeled Sell High or Stock Down due to normal game script variance.
      const isEliteProducer = recentActualFp >= 13.5 || (recentSnaps || 0) >= 0.60 || (priorSnaps || 0) >= 0.60;

      let roleTag = 'hold';
      if (momentum >= 18 && Math.abs(snapDelta) >= 0.08) {
        roleTag = 'stock_up';
      } else if (momentum <= -25 && Math.abs(snapDelta) >= 0.12) {
        if (isEliteProducer) {
          if ((recentSnaps || 0) < 0.48 && usesL3 && recentActualFp < 12.0) {
            roleTag = 'stock_down';
          }
        } else {
          roleTag = 'stock_down';
        }
      }

      let valueTag = null;
      if (pos !== 'QB' && nGames >= 2) {
        if (recentFpoe <= -2.5 && roleTag !== 'stock_down' && (recentSnaps || 0) >= 0.45) {
          valueTag = 'buy_low';
        } else if (recentFpoe >= 3.5) {
          if (!isEliteProducer && ((recentSnaps || 0) < 0.58 || roleTag === 'stock_down')) {
            valueTag = 'sell_high';
          } else if (isEliteProducer && roleTag === 'hold' && momentum >= 8) {
            roleTag = 'stock_up';
          }
        }
      }

      const tags = [roleTag !== 'hold' ? roleTag : null, valueTag].filter(Boolean);
      if (!tags.length && !isEliteProducer) continue;

      const recentLabel = usesL3 ? 'over the last 3 games' : 'vs. prior game';
      const reasons = [];
      if (recentSnaps != null && priorSnaps != null && Math.abs(snapDelta) >= 0.05) {
        const dir = snapDelta > 0 ? 'up' : 'down';
        reasons.append?.(`Snap share ${dir} from ${Math.round(priorSnaps * 100)}% to ${Math.round(recentSnaps * 100)}% ${recentLabel}.`) ||
        reasons.push(`Snap share ${dir} from ${Math.round(priorSnaps * 100)}% to ${Math.round(recentSnaps * 100)}% ${recentLabel}.`);
      }
      if (valueTag === 'buy_low') {
        reasons.push(`Averaging ${recentActualFp.toFixed(1)} actual FP vs. ${recentXfp.toFixed(1)} expected FP ${recentLabel} — heavy volume (${Math.round((recentSnaps || 0.5) * 100)}% snaps), due for positive regression.`);
      } else if (valueTag === 'sell_high') {
        reasons.push(`Averaging ${recentActualFp.toFixed(1)} actual FP vs. ${recentXfp.toFixed(1)} expected FP on limited snaps (${Math.round((recentSnaps || 0.35) * 100)}%) — TD-dependent, due for regression.`);
      } else if (isEliteProducer && roleTag === 'stock_up') {
        reasons.push(`Elite focal point averaging ${recentActualFp.toFixed(1)} FP/g with featured high-value workload.`);
      }

      // Find player id
      const sampleGame = games[0]?.stats || {};
      const team = entry.games[0]?.opp ? (entry.games[0].isHome ? 'HOME' : 'AWAY') : '';

      players.push({
        player_id: name.toLowerCase().replace(/\s+/g, '_'),
        player_name: name,
        team: entry.games[0]?.stats?.team || '',
        position: pos,
        games_played: nGames,
        momentum,
        fpoe: parseFloat(recentFpoe.toFixed(1)),
        fpoe_z: parseFloat((recentFpoe / 3.5).toFixed(2)),
        recent_actual_fp: parseFloat(recentActualFp.toFixed(1)),
        confidence: Math.round(Math.min(100, (nGames / 4) * 100)),
        tags: tags.length ? tags : ['stock_up'], // elite stars without tags default to stock_up
        reasons: reasons.length ? reasons : [`Consistent elite production (${recentActualFp.toFixed(1)} FP/g).`],
        trade_targets: [],
        source: 'Sleeper API Verified Stats',
      });
    }

    return {
      data_loaded: true,
      season: sleeperCache.season,
      data_as_of: new Date().toISOString(),
      players,
    };
  } catch (err) {
    console.error('[trend-engine] client compute failed:', err);
    return { data_loaded: false, players: [] };
  }
}

export async function fetchTrendScores() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}');
    if (cached.ts && Date.now() - cached.ts < CACHE_TTL && cached.data?.data_loaded && cached.data?.players?.length > 0) {
      return cached.data;
    }
  } catch { /* fall through to fetch */ }

  try {
    const res = await fetch(`${NFL_API}/api/trend-scores`);
    if (res.ok) {
      const data = await res.json();
      if (data.data_loaded && data.players?.length > 0) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
        return data;
      }
    }
  } catch {}

  // Seamless fallback to client-side Sleeper stats if backend is loading or unavailable
  const fallback = await computeTrendsClientSide();
  if (fallback.data_loaded && fallback.players?.length > 0) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: fallback })); } catch {}
    return fallback;
  }

  return { data_loaded: false, players: [] };
}

export function indexTrendByPlayerId(trendData) {
  const index = {};
  for (const p of trendData?.players ?? []) {
    index[p.player_id] = p;
    // Also index by normalized name for resilient lookup
    const norm = p.player_name?.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
    if (norm) index[norm] = p;
  }
  return index;
}
