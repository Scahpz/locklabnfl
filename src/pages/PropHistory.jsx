import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { ClipboardList, CheckCircle2, XCircle, Clock, Trash2, ChevronDown, ChevronUp, RefreshCw, BarChart2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/common/TeamLogo';
import { toast } from 'sonner';
import { TIER_CONFIG } from '@/lib/verdict';

const RESULT_CFG = {
  pending: { label: 'Pending', Icon: Clock,        cls: 'text-chart-4     bg-chart-4/10     border-chart-4/20'     },
  hit:     { label: 'Hit ✅',  Icon: CheckCircle2, cls: 'text-primary     bg-primary/10     border-primary/20'     },
  miss:    { label: 'Miss ❌', Icon: XCircle,      cls: 'text-destructive bg-destructive/10 border-destructive/20' },
};

const propTypeLabels = {
  passing_yards: 'Pass Yds', passing_tds: 'Pass TDs', rushing_yards: 'Rush Yds',
  rushing_tds: 'Rush TDs', receiving_yards: 'Rec Yds', receptions: 'Rec',
  receiving_tds: 'Rec TDs', targets: 'Targets', completions: 'Completions',
  interceptions: 'INTs', fantasy_points: 'Fantasy Pts', sacks: 'Sacks',
  tackles: 'Tackles', kicking_points: 'Kicking Pts',
};

function PropHistoryCard({ entry, onSettle, onDelete }) {
  const r = RESULT_CFG[entry.result] || RESULT_CFG.pending;
  const { Icon } = r;
  const tierCfg = TIER_CONFIG[entry.tier] || TIER_CONFIG.YELLOW;

  return (
    <div className={cn(
      "rounded-2xl border bg-[hsl(222,47%,9%)] p-4 transition-all",
      entry.result === 'hit'  ? "border-primary/20"     :
      entry.result === 'miss' ? "border-destructive/20" : "border-white/6"
    )}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <TeamLogo team={entry.team} className="w-8 h-8 flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{entry.player_name}</p>
            <p className="text-[10px] text-muted-foreground">
              {entry.team} vs {entry.opponent} · {propTypeLabels[entry.prop_type] || entry.prop_type}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Badge variant="outline" className={cn("text-[10px] flex items-center gap-1", r.cls)}>
            <Icon className="w-3 h-3" />
            {r.label}
          </Badge>
          <button onClick={() => onDelete(entry.id)} className="text-muted-foreground hover:text-destructive transition-colors p-0.5">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Grade + line row */}
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
        <span className={cn("flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg border", tierCfg.badge)}>
          <span className={cn("w-1.5 h-1.5 rounded-full", tierCfg.dot)} />
          {entry.grade_label}
        </span>
        <span className="text-[10px] text-muted-foreground font-semibold">
          {entry.direction} {entry.line} {propTypeLabels[entry.prop_type] || entry.prop_type}
        </span>
        {entry.actual_value != null && (
          <span className={cn(
            "text-[10px] font-bold px-2 py-0.5 rounded-md",
            entry.result === 'hit' ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'
          )}>
            Actual: {entry.actual_value}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground/50 ml-auto">{entry.game_date}</span>
      </div>

      {/* Settle buttons */}
      {entry.result === 'pending' && (
        <div className="flex gap-1.5">
          <button
            onClick={() => onSettle(entry.id, 'hit')}
            className="text-[10px] bg-primary/10 hover:bg-primary/20 text-primary px-2.5 py-1 rounded-lg transition-all font-semibold"
          >
            Mark Hit ✓
          </button>
          <button
            onClick={() => onSettle(entry.id, 'miss')}
            className="text-[10px] bg-destructive/10 hover:bg-destructive/20 text-destructive px-2.5 py-1 rounded-lg transition-all font-semibold"
          >
            Mark Miss ✗
          </button>
        </div>
      )}
    </div>
  );
}

function AccuracyBar({ label, hit, total, color, predicted }) {
  const pct = total > 0 ? Math.round((hit / total) * 100) : null;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground font-medium">{label}</span>
          {predicted && (
            <span className="text-[9px] text-muted-foreground/40 font-normal">model {predicted}</span>
          )}
        </div>
        <span className={cn("font-bold", color)}>
          {pct != null ? `${pct}%` : '—'} <span className="text-muted-foreground/50 font-normal">({total}G)</span>
        </span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", pct != null && pct >= 60 ? 'bg-primary' : pct != null && pct >= 40 ? 'bg-chart-4' : 'bg-destructive')}
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
    </div>
  );
}

const FILTERS = ['all', 'pending', 'hit', 'miss'];
const FILTER_ACTIVE = {
  all:     'bg-white/12 border-white/25 text-foreground',
  pending: 'bg-chart-4/20 border-chart-4/40 text-chart-4',
  hit:     'bg-primary/20 border-primary/40 text-primary',
  miss:    'bg-destructive/20 border-destructive/40 text-destructive',
};

export default function PropHistory() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);
  const [filter, setFilter] = useState('all');
  const [showAccuracy, setShowAccuracy] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await base44.entities.PropHistory.list();
      const sorted = Array.isArray(data)
        ? [...data].sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))
        : [];
      setEntries(sorted);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  async function autoSettle() {
    setSettling(true);
    try {
      const res = await base44.entities.PropHistory.settle();
      if (res.settled > 0) {
        toast.success(`Auto-settled ${res.settled} prop${res.settled > 1 ? 's' : ''}!`);
        await load();
      } else {
        toast.info('No props to settle yet — check back after games finish.');
      }
    } catch {
      toast.error('Auto-settle failed');
    } finally {
      setSettling(false);
    }
  }

  const handleSettle = async (id, result) => {
    await base44.entities.PropHistory.update(id, { result });
    setEntries(prev => prev.map(e => e.id === id ? { ...e, result } : e));
    toast.success(`Prop marked as ${result}!`);
  };

  const handleDelete = async (id) => {
    await base44.entities.PropHistory.delete(id);
    setEntries(prev => prev.filter(e => e.id !== id));
    toast.success('Entry removed');
  };

  const settled = entries.filter(e => e.result !== 'pending');
  const hits    = entries.filter(e => e.result === 'hit');
  const misses  = entries.filter(e => e.result === 'miss');
  const pending = entries.filter(e => e.result === 'pending');

  const overallHitRate = settled.length > 0 ? Math.round((hits.length / settled.length) * 100) : null;

  // Accuracy by grade tier — match on tier field (GREEN/YELLOW/RED/TRAP) or
  // fall back to grade_label prefix for backwards-compat with old entries
  const byTier = useMemo(() => {
    const TIERS = [
      { tier: 'GREEN',  label: 'BET IT', predicted: '65-78%' },
      { tier: 'YELLOW', label: 'LEAN',   predicted: '57-64%' },
      { tier: 'RED',    label: 'SKIP',   predicted: '<57%'   },
      { tier: 'TRAP',   label: 'TRAP',   predicted: '~60% (flip dir.)' },
    ];
    return TIERS.map(({ tier, label, predicted }) => {
      const tierEntries = settled.filter(e =>
        e.tier === tier || (e.grade_label || '').startsWith(label)
      );
      const tierHits = tierEntries.filter(e => e.result === 'hit');
      return { label, hit: tierHits.length, total: tierEntries.length, predicted };
    }).filter(t => t.total > 0);
  }, [settled]);

  // Accuracy by stat type
  const byStat = useMemo(() => {
    const types = ['points', 'rebounds', 'assists', '3PM', 'PRA', 'steals', 'blocks'];
    return types.map(t => {
      const typeEntries = settled.filter(e => e.prop_type === t);
      const typeHits    = typeEntries.filter(e => e.result === 'hit');
      return { label: propTypeLabels[t] || t, hit: typeHits.length, total: typeEntries.length };
    }).filter(t => t.total > 0);
  }, [settled]);

  const visible = filter === 'all' ? entries : entries.filter(e => e.result === filter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="w-7 h-7 text-primary" />
            Prop History
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Track LockLab grades vs actual results</p>
        </div>
        <button
          onClick={autoSettle}
          disabled={settling}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-foreground bg-secondary hover:bg-secondary/80 transition-all disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", settling && "animate-spin")} />
          Auto-Settle
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Tracked',  value: entries.length,    neutral: true },
          { label: 'Hit Rate', value: overallHitRate != null ? `${overallHitRate}%` : '—', green: (overallHitRate ?? 0) >= 55, red: overallHitRate != null && overallHitRate < 55 },
          { label: 'Hits',     value: hits.length,        green: hits.length > 0 },
          { label: 'Pending',  value: pending.length,     neutral: true },
        ].map(s => (
          <div key={s.label} className="bg-white/3 border border-white/6 rounded-xl p-3 text-center">
            <p className={cn(
              "text-xl font-bold leading-none",
              s.neutral ? 'text-foreground' : s.green ? 'text-primary' : s.red ? 'text-destructive' : 'text-foreground'
            )}>
              {s.value}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Model Accuracy Dashboard */}
      {settled.length >= 3 && (
        <div className="bg-white/3 border border-white/6 rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowAccuracy(a => !a)}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm text-foreground">Model Accuracy</span>
              <span className="text-[10px] text-muted-foreground/60">{settled.length} settled props</span>
            </div>
            {showAccuracy ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {showAccuracy && (
            <div className="px-4 pb-4 space-y-5 border-t border-white/5">
              {/* By tier */}
              {byTier.length > 0 && (
                <div className="pt-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-3">By Grade Tier</p>
                  <div className="space-y-2.5">
                    {byTier.map(t => (
                      <AccuracyBar
                        key={t.label}
                        label={t.label}
                        hit={t.hit}
                        total={t.total}
                        color={t.label === 'BET IT' ? 'text-primary' : t.label === 'LEAN' ? 'text-chart-4' : t.label === 'TRAP' ? 'text-orange-400' : 'text-destructive'}
                        predicted={t.predicted}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* By stat type */}
              {byStat.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-3">By Stat Type</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                    {byStat.map(t => (
                      <AccuracyBar key={t.label} label={t.label} hit={t.hit} total={t.total} color="text-foreground" />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map(f => {
          const count = f === 'all' ? entries.length : entries.filter(e => e.result === f).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-lg border transition-all font-medium capitalize flex items-center gap-1.5",
                filter === f
                  ? FILTER_ACTIVE[f]
                  : "bg-secondary/40 border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {f}
              {count > 0 && <span className={cn("text-[9px] font-bold", filter === f ? 'opacity-80' : 'opacity-50')}>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl bg-white/3 border border-white/6 animate-pulse" />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-14 text-center text-muted-foreground">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">No tracked props yet</p>
          <p className="text-xs mt-1 opacity-60">Click "Track" on any prop card to start logging grades vs results</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-muted-foreground">
          <p className="text-sm">No {filter} props.</p>
          <button onClick={() => setFilter('all')} className="text-xs text-primary hover:text-primary/80 transition-colors mt-2">Show all</button>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(e => (
            <PropHistoryCard key={e.id} entry={e} onSettle={handleSettle} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
