// ── Prediction snapshot storage ───────────────────────────────────────────────
// Captures graded props before games start so accuracy can be reviewed afterward.
// All data lives in localStorage under locklab_pred_* keys.

const INDEX_KEY  = 'locklab_pred_index';
const SNAP_KEY   = (season, week) => `locklab_pred_${season}_w${week}`;
const MAX_WEEKS  = 20; // keep at most 20 weeks of history

// Map prop_type → Sleeper stat field for result lookup
const PROP_TO_SLEEPER = {
  receiving_yards:   'rec_yd',
  receptions:        'rec',
  rushing_yards:     'rush_yd',
  rushing_attempts:  'rush_att',
  passing_yards:     'pass_yd',
  passing_tds:       'pass_td',
  rush_rec_yards:    'rush_rec_yd',
};

export function propTypeToSleeperKey(propType) {
  return PROP_TO_SLEEPER[propType] ?? null;
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
export function scoreSnapshot(snapshot, actualStats) {
  if (!snapshot?.items || !actualStats) return null;

  return snapshot.items.map(pred => {
    const statKey = propTypeToSleeperKey(pred.prop_type);
    const playerStats = actualStats[pred.player_id] ?? null;
    const actualVal = statKey && playerStats ? (playerStats[statKey] ?? null) : null;

    let hit = null;           // did the player beat the line?
    let correct = null;       // did our prediction match?
    if (actualVal != null) {
      hit     = actualVal > pred.line;
      correct = (pred.direction === 'OVER') === hit;
    }

    return { ...pred, actualVal, hit, correct };
  });
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
