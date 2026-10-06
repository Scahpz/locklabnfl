import React, { useState, useEffect, useCallback } from 'react';
import {
  getSnapshotIndex, scoreWeek, deleteSnapshot, clearAllSnapshots,
} from '@/lib/predictionLog';

// ── Change this PIN to whatever you want ──────────────────────────────────────
const DEV_PIN = 'locklab88';
const SESSION_KEY = 'locklab_dev_auth';

const STAT_LABELS = {
  receiving_yards:  'Rec Yds',
  receptions:       'Rec',
  rushing_yards:    'Rush Yds',
  rushing_attempts: 'Rush Att',
  passing_yards:    'Pass Yds',
  passing_tds:      'Pass TD',
  rush_rec_yards:   'Rush+Rec Yds',
  passing_ints:     'INT',
  rushing_tds:      'Rush TD',
  receiving_tds:    'Rec TD',
  rush_rec_tds:     'Rush+Rec TD',
  fantasy_points:   'Fantasy Pts',
};

const RECHECK_MS = 5 * 60 * 1000; // re-check results while games are still pending

const STATUS_STYLE = {
  correct:   { label: 'CORRECT',   color: '#22c55e' },
  wrong:     { label: 'WRONG',     color: '#ef4444' },
  push:      { label: 'PUSH',      color: '#eab308' },
  pending:   { label: 'Pending',   color: '#64748b' },
  void:      { label: 'DNP/Void',  color: '#475569' },
  untracked: { label: 'No stat',   color: '#475569' },
};

function AccuracyBar({ correct, total }) {
  if (!total) return <span className="text-gray-500 text-xs">No results yet</span>;
  const pct = Math.round((correct / total) * 100);
  const color = pct >= 60 ? '#22c55e' : pct >= 50 ? '#eab308' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      <span style={{ color, fontWeight: 700, fontSize: 13, minWidth: 36 }}>{pct}%</span>
      <span style={{ color: '#64748b', fontSize: 12 }}>{correct}/{total}</span>
    </div>
  );
}

function ConfidenceBucket({ items }) {
  const buckets = [
    { label: '90–100%', min: 90, max: 100 },
    { label: '80–89%',  min: 80, max: 89  },
    { label: '70–79%',  min: 70, max: 79  },
    { label: '60–69%',  min: 60, max: 69  },
    { label: '<60%',    min: 0,  max: 59  },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {buckets.map(b => {
        const group = items.filter(i => i.confidence >= b.min && i.confidence <= b.max && i.correct != null);
        const correct = group.filter(i => i.correct).length;
        return (
          <div key={b.label} style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 8, alignItems: 'center' }}>
            <span style={{ color: '#94a3b8', fontSize: 12 }}>{b.label}</span>
            <AccuracyBar correct={correct} total={group.length} />
          </div>
        );
      })}
    </div>
  );
}

// TD props and anything on a 0.5 line are mostly "will a backup score?" —
// the UNDER hits so often it inflates accuracy without saying much.
const isGimme = i => /_tds$/.test(i.prop_type) || i.line <= 0.5;

// Same rule as the rest of the app (grading.js isHiddenTdUnder): a TD UNDER only
// counts when the UNDER was the underdog side. Older snapshots have no odds saved,
// so their TD UNDERs are always excluded.
const implied = o => (o > 0 ? 100 / (100 + o) : Math.abs(o) / (Math.abs(o) + 100));
const isHiddenTdUnder = i =>
  /_tds$/.test(i.prop_type) && i.direction === 'UNDER' &&
  !(i.over_odds != null && i.under_odds != null && implied(i.under_odds) < implied(i.over_odds));

const selectStyle = {
  background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155',
  borderRadius: 6, fontSize: 12, padding: '3px 6px', cursor: 'pointer',
};

// Accuracy per prop type, next to what blindly taking the UNDER would have hit.
// If the AI isn't beating that baseline, the accuracy number is hollow.
function PropTypeBreakdown({ items }) {
  const rows = Object.entries(
    items.filter(i => i.correct != null).reduce((acc, i) => {
      (acc[i.prop_type] ??= []).push(i);
      return acc;
    }, {}),
  ).sort((a, b) => b[1].length - a[1].length);
  if (!rows.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px', gap: 8, color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        <span>Prop</span><span>AI accuracy</span><span style={{ textAlign: 'right' }}>Always-UNDER</span>
      </div>
      {rows.map(([type, group]) => {
        const correct = group.filter(i => i.correct).length;
        const underRate = Math.round(group.filter(i => i.hit === false).length / group.length * 100);
        const aiRate = Math.round(correct / group.length * 100);
        const beats = aiRate > Math.max(underRate, 100 - underRate);
        return (
          <div key={type} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px', gap: 8, alignItems: 'center' }}>
            <span style={{ color: '#94a3b8', fontSize: 12 }}>{STAT_LABELS[type] ?? type}</span>
            <AccuracyBar correct={correct} total={group.length} />
            <span style={{ color: beats ? '#64748b' : '#eab308', fontSize: 12, textAlign: 'right' }} title={beats ? '' : 'AI is not beating the simplest blind pick on this prop'}>
              {underRate}%{beats ? '' : ' ⚠'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function WeekView({ entry }) {
  const [scored, setScored] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'correct' | 'wrong' | 'pending' | 'other'
  const [checkedAt, setCheckedAt] = useState(null);
  const [hideGimmes, setHideGimmes] = useState(true);
  const [propType, setPropType] = useState('all');
  const [minConf, setMinConf] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await scoreWeek(entry.season, entry.week);
    if (result) setScored(result);
    setCheckedAt(new Date());
    setLoading(false);
  }, [entry.season, entry.week]);

  // Everything below (accuracy, buckets, counts) is computed from the filtered set.
  const base = !scored ? [] : scored.filter(i =>
    !isHiddenTdUnder(i) &&
    (!hideGimmes || !isGimme(i)) &&
    (propType === 'all' || i.prop_type === propType) &&
    i.confidence >= minConf,
  );
  const propTypes   = scored ? [...new Set(scored.map(i => i.prop_type))].sort() : [];
  const gimmeCount  = scored ? scored.filter(isGimme).length : 0;
  const withResults = base.filter(i => i.correct != null);
  const correct     = withResults.filter(i => i.correct).length;
  const pending     = base.filter(i => i.status === 'pending').length;
  const anyPending  = scored ? scored.some(i => i.status === 'pending') : false;
  const other       = base.filter(i => ['push', 'void', 'untracked'].includes(i.status)).length;

  useEffect(() => { load(); }, [load]);

  // Keep grading automatically as games finish.
  useEffect(() => {
    if (!anyPending) return;
    const t = setInterval(load, RECHECK_MS);
    return () => clearInterval(t);
  }, [anyPending, load]);

  const shown = base.filter(i => {
    if (filter === 'correct') return i.status === 'correct';
    if (filter === 'wrong')   return i.status === 'wrong';
    if (filter === 'pending') return i.status === 'pending';
    if (filter === 'other')   return ['push', 'void', 'untracked'].includes(i.status);
    return true;
  });

  return (
    <div style={{ background: '#0f172a', borderRadius: 12, border: '1px solid #1e293b', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: 15 }}>
            Week {entry.week} · {entry.season} Season
          </span>
          <span style={{ color: '#64748b', fontSize: 12, marginLeft: 10 }}>
            {entry.count} predictions · saved {new Date(entry.ts).toLocaleDateString()}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {loading && <span style={{ color: '#64748b', fontSize: 12 }}>Loading results...</span>}
          {withResults.length > 0 && (
            <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 13 }}>
              {correct}/{withResults.length} correct ({Math.round(correct / withResults.length * 100)}%)
            </span>
          )}
          {pending > 0 && (
            <span style={{ color: '#94a3b8', fontSize: 12 }}>{pending} pending</span>
          )}
          {!loading && checkedAt && (
            <button
              onClick={load}
              title={`Last checked ${checkedAt.toLocaleTimeString()}`}
              style={{ background: 'none', border: '1px solid #334155', borderRadius: 6, color: '#94a3b8', fontSize: 11, padding: '2px 8px', cursor: 'pointer' }}
            >
              Re-check
            </button>
          )}
        </div>
      </div>

      {/* Summary row */}
      {scored && withResults.length > 0 && (
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #1e293b', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <p style={{ color: '#64748b', fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Overall Accuracy</p>
            <AccuracyBar correct={correct} total={withResults.length} />
          </div>
          <div>
            <p style={{ color: '#64748b', fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>By Confidence Level</p>
            <ConfidenceBucket items={base} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <p style={{ color: '#64748b', fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>By Prop Type</p>
            <PropTypeBreakdown items={base} />
          </div>
        </div>
      )}

      {/* Prop filters */}
      {scored && (
        <div style={{ padding: '8px 18px', borderBottom: '1px solid #1e293b', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={hideGimmes} onChange={e => setHideGimmes(e.target.checked)} />
            Hide TD &amp; 0.5-line props ({gimmeCount})
          </label>
          <select value={propType} onChange={e => setPropType(e.target.value)} style={selectStyle}>
            <option value="all">All prop types</option>
            {propTypes.map(t => <option key={t} value={t}>{STAT_LABELS[t] ?? t}</option>)}
          </select>
          <select value={minConf} onChange={e => setMinConf(Number(e.target.value))} style={selectStyle}>
            <option value={0}>Any confidence</option>
            <option value={60}>60%+ confidence</option>
            <option value={70}>70%+ confidence</option>
            <option value={80}>80%+ confidence</option>
          </select>
          <span style={{ color: '#475569', fontSize: 12 }}>Showing {base.length} of {scored.length}</span>
        </div>
      )}

      {/* Filter bar */}
      {scored && (
        <div style={{ padding: '8px 18px', borderBottom: '1px solid #1e293b', display: 'flex', gap: 6 }}>
          {['all', 'correct', 'wrong', 'pending', 'other'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '3px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                background: filter === f ? '#3b82f6' : '#1e293b',
                color: filter === f ? '#fff' : '#94a3b8',
                border: 'none',
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'correct' && withResults.length > 0 ? ` (${correct})` : ''}
              {f === 'wrong'   && withResults.length > 0 ? ` (${withResults.length - correct})` : ''}
              {f === 'pending' && pending > 0 ? ` (${pending})` : ''}
              {f === 'other'   && other > 0 ? ` (${other})` : ''}
            </button>
          ))}
        </div>
      )}

      {/* Predictions table */}
      <div style={{ maxHeight: 480, overflowY: 'auto' }}>
        {!scored && !loading && (
          <p style={{ color: '#64748b', fontSize: 13, padding: '16px 18px' }}>Loading...</p>
        )}
        {shown.map((item, i) => {
          const statLabel = STAT_LABELS[item.prop_type] ?? item.prop_type;
          const st = STATUS_STYLE[item.status] ?? STATUS_STYLE.pending;
          const dirBg = item.direction === 'OVER' ? '#16a34a22' : '#dc262622';
          const dirColor = item.direction === 'OVER' ? '#22c55e' : '#ef4444';
          return (
            <div
              key={i}
              style={{
                padding: '10px 18px',
                borderBottom: '1px solid #1e293b',
                display: 'grid',
                gridTemplateColumns: '2fr 90px 90px 80px 80px 70px 70px',
                alignItems: 'center',
                gap: 8,
                background: item.correct === true ? '#22c55e08' : item.correct === false ? '#ef444408' : 'transparent',
              }}
            >
              <div>
                <span style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600 }}>{item.player_name}</span>
                <span style={{ color: '#64748b', fontSize: 11, marginLeft: 6 }}>{item.team} · {item.position}</span>
                <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 6 }}>vs {item.opponent}</span>
              </div>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>{statLabel}</span>
              <span style={{ color: '#f1f5f9', fontSize: 12 }}>Line: {item.line}</span>
              <span style={{ background: dirBg, color: dirColor, fontSize: 11, padding: '2px 7px', borderRadius: 5, fontWeight: 700, textAlign: 'center' }}>
                {item.direction}
              </span>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>Conf: {item.confidence}%</span>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>
                {item.actualVal != null ? `Act: ${item.actualVal}` : '—'}
              </span>
              <span style={{ color: st.color, fontSize: 12, fontWeight: 700 }}>
                {st.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── PIN gate ───────────────────────────────────────────────────────────────────
function PinGate({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [err, setErr]  = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (pin === DEV_PIN) {
      sessionStorage.setItem(SESSION_KEY, '1');
      onUnlock();
    } else {
      setErr(true);
      setPin('');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#020817', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <form onSubmit={submit} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16, padding: 36, width: 320, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
        <p style={{ color: '#f8fafc', fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Dev Access</p>
        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 24 }}>LockLab prediction history</p>
        <input
          type="password"
          value={pin}
          onChange={e => { setPin(e.target.value); setErr(false); }}
          placeholder="Enter PIN"
          autoFocus
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${err ? '#ef4444' : '#334155'}`,
            background: '#1e293b', color: '#f1f5f9', fontSize: 15, boxSizing: 'border-box', marginBottom: 8, outline: 'none',
          }}
        />
        {err && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>Incorrect PIN</p>}
        <button type="submit" style={{
          width: '100%', padding: '10px 0', borderRadius: 8, background: '#3b82f6', color: '#fff',
          border: 'none', fontWeight: 700, fontSize: 15, cursor: 'pointer',
        }}>
          Unlock
        </button>
      </form>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DevAdmin() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1');
  const [index, setIndex]   = useState([]);
  const [openWeeks, setOpenWeeks] = useState({});
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (authed) setIndex(getSnapshotIndex());
  }, [authed]);

  if (!authed) return <PinGate onUnlock={() => setAuthed(true)} />;

  const toggleWeek = (key) => setOpenWeeks(p => ({ ...p, [key]: !p[key] }));

  const handleDelete = (season, week) => {
    deleteSnapshot(season, week);
    setIndex(getSnapshotIndex());
  };

  const handleClearAll = () => {
    clearAllSnapshots();
    setIndex([]);
    setConfirmClear(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#020817', color: '#f1f5f9', fontFamily: 'system-ui, sans-serif', padding: '24px 16px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>LockLab · Prediction History</h1>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
            Dev-only view · {index.length} week{index.length !== 1 ? 's' : ''} saved · Not visible to other users
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { sessionStorage.removeItem(SESSION_KEY); setAuthed(false); }}
            style={{ padding: '6px 14px', borderRadius: 8, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}
          >
            Lock
          </button>
          {!confirmClear ? (
            <button
              onClick={() => setConfirmClear(true)}
              style={{ padding: '6px 14px', borderRadius: 8, background: '#1e293b', border: '1px solid #7f1d1d', color: '#ef4444', fontSize: 13, cursor: 'pointer' }}
            >
              Clear All
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={handleClearAll} style={{ padding: '6px 14px', borderRadius: 8, background: '#991b1b', border: 'none', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
                Confirm Delete
              </button>
              <button onClick={() => setConfirmClear(false)} style={{ padding: '6px 14px', borderRadius: 8, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* No snapshots */}
      {!index.length && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>📭</p>
          <p style={{ color: '#94a3b8', fontSize: 15, fontWeight: 600 }}>No prediction snapshots yet</p>
          <p style={{ color: '#475569', fontSize: 13, marginTop: 6 }}>
            Load the Props page before games start — snapshots are captured automatically.
          </p>
        </div>
      )}

      {/* Week list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {index.map(entry => {
          const key = `${entry.season}_${entry.week}`;
          const open = openWeeks[key] ?? true; // default open
          return (
            <div key={key}>
              <div
                onClick={() => toggleWeek(key)}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', marginBottom: open ? 8 : 0 }}
              >
                <span style={{ color: '#3b82f6', fontWeight: 700, fontSize: 14 }}>
                  {open ? '▼' : '▶'} Week {entry.week} · {entry.season}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(entry.season, entry.week); }}
                  style={{ background: 'none', border: 'none', color: '#475569', fontSize: 12, cursor: 'pointer' }}
                >
                  Delete
                </button>
              </div>
              {open && <WeekView entry={entry} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
