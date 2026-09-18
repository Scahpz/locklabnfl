import React, { useState, useEffect, useCallback } from 'react';
import {
  getSnapshotIndex, getSnapshot, fetchActualResults, scoreSnapshot,
  deleteSnapshot, clearAllSnapshots,
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

function WeekView({ entry }) {
  const [scored, setScored] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'correct' | 'wrong' | 'pending'

  const load = useCallback(async () => {
    const snap = getSnapshot(entry.season, entry.week);
    if (!snap) return;
    setLoading(true);
    const actual = await fetchActualResults(entry.season, entry.week);
    setScored(scoreSnapshot(snap, actual || {}));
    setLoading(false);
  }, [entry.season, entry.week]);

  useEffect(() => { load(); }, [load]);

  const withResults = scored ? scored.filter(i => i.correct != null) : [];
  const correct     = withResults.filter(i => i.correct).length;
  const pending     = scored ? scored.filter(i => i.correct == null).length : 0;

  const shown = !scored ? [] : scored.filter(i => {
    if (filter === 'correct') return i.correct === true;
    if (filter === 'wrong')   return i.correct === false;
    if (filter === 'pending') return i.correct == null;
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
            <ConfidenceBucket items={scored} />
          </div>
        </div>
      )}

      {/* Filter bar */}
      {scored && (
        <div style={{ padding: '8px 18px', borderBottom: '1px solid #1e293b', display: 'flex', gap: 6 }}>
          {['all', 'correct', 'wrong', 'pending'].map(f => (
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
          const resultColor = item.correct === true ? '#22c55e' : item.correct === false ? '#ef4444' : '#64748b';
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
              <span style={{ color: resultColor, fontSize: 12, fontWeight: 700 }}>
                {item.correct === true ? 'CORRECT' : item.correct === false ? 'WRONG' : 'Pending'}
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
