// ── Prediction snapshot storage ───────────────────────────────────────────────
// Captures graded props before games start so accuracy can be reviewed afterward.
// All data lives in localStorage under locklab_pred_* keys.

const INDEX_KEY  = 'locklab_pred_index';
const SNAP_KEY   = (season, week) => `locklab_pred_${season}_w${week}`;
const MAX_WEEKS  = 20; // keep at most 20 weeks of history

import { buildNameToIdFull, normName } from './propsNoBackend';
import { getNFLWeek, getNFLSeason } from './nflWeek';

// Map prop_type → Sleeper stat field(s) for result lookup. Arrays are summed
// (Sleeper has no combined rush+rec field). Sleeper omits zero-valued stats,
// so a missing field on a player who played counts as 0.
const PROP_TO_SLEEPER = {
  receiving_yards:   'rec_yd',
  receptions:        'rec',
  rushing_yards:     'rush_yd',
  rushing_attempts:  'rush_att',
  passing_yards:     'pass_yd',
  passing_tds:       'pass_td',
  passing_ints:      'pass_int',
  rushing_tds:       'rush_td',
  receiving_tds:     'rec_td',
  rush_rec_yards:    ['rush_yd', 'rec_yd'],
  rush_rec_tds:      ['rush_td', 'rec_td'],
  fantasy_points:    'pts_half_ppr',
};

// A game is treated as final this long after kickoff.
const GAME_FINAL_MS = 4 * 60 * 60 * 1000;
// Older snapshots have no kickoff time; give the week this long before giving up.
const LEGACY_WAIT_MS = 7 * 24 * 60 * 60 * 1000;

export function propTypeToSleeperKey(propType) {
  return PROP_TO_SLEEPER[propType] ?? null;
}

function readStat(playerStats, key) {
  const keys = Array.isArray(key) ? key : [key];
  return keys.reduce((sum, k) => sum + (Number(playerStats[k]) || 0), 0);
}

// ── Index helpers ─────────────────────────────────────────────────────────────
function readIndex() {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) || '[]'); }
  catch { return []; }
}

function writeIndex(idx) {
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(idx)); } catch {}
}

// ── Save snapshot ─────────────────────────────────────────────────────────────
// Call this when fresh props are loaded and graded, BEFORE game start.
// `props` = array of graded prop objects from Props.jsx.
export function savePredictionSnapshot(season, week, props) {
  if (!season || !week || !props?.length) return;

  const items = props
    .filter(p => p.player_name && p.prop_type && p.line != null)
    .map(p => ({
      player_id:   p.player_id   ?? p.id ?? '',
      player_name: p.player_name,
      team:        p.team        ?? '',
      opponent:    p.opponent    ?? '',
      position:    p.position    ?? '',
      prop_type:   p.prop_type,
      line:        p.line,
      direction:   p.verdict === 'OVER' || p.verdict === 'UNDER' ? p.verdict : (p.lean ?? 'OVER'),
      confidence:  p.confidence  ?? 50,
      grade:       p.letterGrade ?? '',
      over_prob:   p.overProb    ?? 50,
      rank:        p.rankIdx     ?? 0,
      scheduled_at: p.scheduled_at ?? '',
      over_odds:   p.over_odds   ?? null,
      under_odds:  p.under_odds  ?? null,
    }));

  if (!items.length) return;

  try {
    localStorage.setItem(SNAP_KEY(season, week), JSON.stringify({
      season, week, ts: Date.now(), items,
    }));
  } catch { return; }

  // Update index
  const idx = readIndex().filter(e => !(e.season === season && e.week === week));
  idx.unshift({ season, week, ts: Date.now(), count: items.length });
  if (idx.length > MAX_WEEKS) {
    // Evict oldest
    const evicted = idx.splice(MAX_WEEKS);
    evicted.forEach(e => {
      try { localStorage.removeItem(SNAP_KEY(e.season, e.week)); } catch {}
    });
  }
  writeIndex(idx);
}

// ── Read snapshot ─────────────────────────────────────────────────────────────
export function getSnapshot(season, week) {
  try {
    const raw = localStorage.getItem(SNAP_KEY(season, week));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function getSnapshotIndex() {
  return readIndex();
}

// ── Fetch Sleeper actual results for a week ───────────────────────────────────
export async function fetchActualResults(season, week) {
  try {
    const res = await fetch(
      `https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    return await res.json(); // { player_id: { stat_key: value, ... }, ... }
  } catch { return null; }
}

// ── Score a snapshot against actual results ───────────────────────────────────
// Props come from Underdog and carry no Sleeper ID, so players are matched by
// name. Each item gets a `status`:
//   correct | wrong | push   — graded
//   pending                  — game not final yet
//   void                     — game over but player has no stat line (DNP / unmatched)
//   untracked                — prop type Sleeper doesn't report (quarters, longest, etc.)
export function scoreSnapshot(snapshot, actualStats, nameToId = {}, now = Date.now()) {
  if (!snapshot?.items || !actualStats) return null;

  return snapshot.items.map(pred => {
    const statKey = propTypeToSleeperKey(pred.prop_type);
    const base = { ...pred, actualVal: null, hit: null, correct: null };
    if (!statKey) return { ...base, status: 'untracked' };

    const kickoff = pred.scheduled_at ? Date.parse(pred.scheduled_at) : NaN;
    const isFinal = Number.isFinite(kickoff)
      ? now > kickoff + GAME_FINAL_MS
      : null; // unknown for legacy snapshots
    if (isFinal === false) return { ...base, status: 'pending' };

    const pid = actualStats[pred.player_id] ? pred.player_id : nameToId[normName(pred.player_name)];
    const playerStats = pid ? actualStats[pid] : null;
    const played = playerStats && Number(playerStats.gp ?? 1) > 0;

    if (!played) {
      const stillWaiting = isFinal === null && now < (snapshot.ts ?? 0) + LEGACY_WAIT_MS;
      return { ...base, status: stillWaiting ? 'pending' : 'void' };
    }

    const actualVal = Math.round(readStat(playerStats, statKey) * 100) / 100;
    if (actualVal === pred.line) return { ...base, actualVal, status: 'push' };

    const hit = actualVal > pred.line;
    const correct = (pred.direction === 'OVER') === hit;
    return { ...base, actualVal, hit, correct, status: correct ? 'correct' : 'wrong' };
  });
}

// Fetches results + name map and scores in one call.
export async function scoreWeek(season, week) {
  const snap = getSnapshot(season, week);
  if (!snap) return null;
  const [actual, nameToId] = await Promise.all([
    fetchActualResults(season, week),
    buildNameToIdFull().catch(() => ({})),
  ]);
  return scoreSnapshot(snap, actual || {}, nameToId);
}

// ── Delete a snapshot ─────────────────────────────────────────────────────────
export function deleteSnapshot(season, week) {
  try { localStorage.removeItem(SNAP_KEY(season, week)); } catch {}
  const idx = readIndex().filter(e => !(e.season === season && e.week === week));
  writeIndex(idx);
}

export function clearAllSnapshots() {
  const idx = readIndex();
  idx.forEach(e => {
    try { localStorage.removeItem(SNAP_KEY(e.season, e.week)); } catch {}
  });
  try { localStorage.removeItem(INDEX_KEY); } catch {}
}

// ── Grade arbitrary saved picks (parlay legs, tracked props) ──────────────────
// picks: [{ player_name, prop_type, line, direction: 'OVER'|'UNDER', scheduled_at }]
// Returns a parallel array of statuses (same values as scoreSnapshot). Picks
// without a kickoff time can't be placed in a week and stay 'pending'.
export async function gradePicks(picks) {
  const byWeek = {};
  picks.forEach((p, i) => {
    const week = getNFLWeek(p.scheduled_at);
    if (!week) return;
    const key = `${getNFLSeason(p.scheduled_at)}_${week}`;
    (byWeek[key] ??= []).push(i);
  });

  const statuses = picks.map(() => 'pending');
  const keys = Object.keys(byWeek);
  if (!keys.length) return statuses;

  const nameToId = await buildNameToIdFull().catch(() => ({}));
  await Promise.all(keys.map(async key => {
    const [season, week] = key.split('_').map(Number);
    const actual = await fetchActualResults(season, week);
    if (!actual) return;
    const idx = byWeek[key];
    const scored = scoreSnapshot(
      { ts: Date.now(), items: idx.map(i => ({ ...picks[i], direction: String(picks[i].direction).toUpperCase() })) },
      actual,
      nameToId,
    );
    scored.forEach((r, j) => { statuses[idx[j]] = r.status; });
  }));
  return statuses;
}
