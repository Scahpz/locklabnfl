import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Layers, Clock, CheckCircle2, XCircle, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/common/TeamLogo';
import { toast } from 'sonner';

const STATUS = {
  pending: { label: 'Pending', Icon: Clock,        cls: 'text-chart-4     bg-chart-4/10     border-chart-4/20'     },
  won:     { label: 'Won',     Icon: CheckCircle2, cls: 'text-primary     bg-primary/10     border-primary/20'     },
  lost:    { label: 'Lost',    Icon: XCircle,      cls: 'text-destructive bg-destructive/10 border-destructive/20' },
};

function ParlayCard({ parlay, onSettle, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const s = STATUS[parlay.status] || STATUS.pending;
  const { Icon } = s;
  const profit = parlay.status === 'won'
    ? (parlay.potential_payout || 0) - (parlay.wager || 0)
    : parlay.status === 'lost'
    ? -(parlay.wager || 0)
    : null;

  return (
    <div className={cn(
      "rounded-2xl border bg-[hsl(222,47%,9%)] p-4 transition-all",
      parlay.status === 'won'  ? "border-primary/20"     :
      parlay.status === 'lost' ? "border-destructive/20" : "border-white/6"
    )}>
      {/* Header row */}
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">
            {parlay.name || `${parlay.legs?.length}-Leg Parlay`}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {parlay.game_date} · {parlay.legs?.length} legs · ${parlay.wager} wager
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Badge variant="outline" className={cn("text-[10px] flex items-center gap-1", s.cls)}>
            <Icon className="w-3 h-3" />
            {s.label}
          </Badge>
          <button
            onClick={() => onDelete(parlay.id)}
            className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Legs */}
      <div className="space-y-1 mb-3">
        {parlay.legs?.slice(0, expanded ? undefined : 3).map((leg, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
            <TeamLogo team={leg.team} className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium text-foreground truncate">{leg.player_name}</span>
            <span className={cn("font-bold flex-shrink-0", leg.pick === 'over' ? 'text-primary' : 'text-muted-foreground')}>
              {leg.pick?.toUpperCase()}
            </span>
            <span className="flex-shrink-0">{leg.line} {leg.prop_type?.toUpperCase()}</span>
            <span className="flex-shrink-0 text-muted-foreground/50">
              ({leg.odds > 0 ? '+' : ''}{leg.odds})
            </span>
          </div>
        ))}
        {(parlay.legs?.length ?? 0) > 3 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors pl-6 font-medium"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Show less' : `+${parlay.legs.length - 3} more legs`}
          </button>
        )}
      </div>

      {/* Footer: odds + payout + P&L + settle */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">
            <span className="font-bold text-foreground">{parlay.combined_odds}</span> odds
          </span>
          <span className="text-muted-foreground">
            → <span className="font-bold text-primary">${parlay.potential_payout?.toFixed(2)}</span>
          </span>
          {profit != null && (
            <span className={cn("font-bold", profit >= 0 ? 'text-primary' : 'text-destructive')}>
              {profit >= 0 ? '+' : '−'}${Math.abs(profit).toFixed(2)}
            </span>
          )}
        </div>
        {parlay.status === 'pending' && (
          <div className="flex gap-1.5">
            <button
              onClick={() => onSettle(parlay.id, 'won')}
              className="text-[10px] bg-primary/10 hover:bg-primary/20 text-primary px-2.5 py-1 rounded-lg transition-all font-semibold"
            >
              Won ✓
            </button>
            <button
              onClick={() => onSettle(parlay.id, 'lost')}
              className="text-[10px] bg-destructive/10 hover:bg-destructive/20 text-destructive px-2.5 py-1 rounded-lg transition-all font-semibold"
            >
              Lost ✗
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const FILTER_TABS = ['all', 'pending', 'won', 'lost'];

const FILTER_ACTIVE = {
  all:     'bg-white/12 border-white/25 text-foreground',
  pending: 'bg-chart-4/20 border-chart-4/40 text-chart-4',
  won:     'bg-primary/20 border-primary/40 text-primary',
  lost:    'bg-destructive/20 border-destructive/40 text-destructive',
};

export default function ParlayHistoryTab({ refreshKey }) {
  const [parlays, setParlays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => { load(); }, [refreshKey]);

  async function load() {
    setLoading(true);
    try {
      // Grade any finished games first so results show up without manual settling
      await base44.entities.SavedParlay.settle().catch(() => {});
      const data = await base44.entities.SavedParlay.list();
      // Sort newest first (fallback: reverse insertion order)
      const sorted = Array.isArray(data)
        ? [...data].sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))
        : [];
      setParlays(sorted);
    } catch {
      setParlays([]);
    } finally {
      setLoading(false);
    }
  }

  const handleSettle = async (id, status) => {
    await base44.entities.SavedParlay.update(id, { status });
    setParlays(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    toast.success(`Parlay marked as ${status}!`);
  };

  const handleDelete = async (id) => {
    await base44.entities.SavedParlay.delete(id);
    setParlays(prev => prev.filter(p => p.id !== id));
    toast.success('Parlay deleted');
  };

  // Derived stats
  const wins    = parlays.filter(p => p.status === 'won');
  const losses  = parlays.filter(p => p.status === 'lost');
  const settled = wins.length + losses.length;
  const pending = parlays.filter(p => p.status === 'pending');

  const winRate = settled > 0 ? `${Math.round((wins.length / settled) * 100)}%` : '—';

  const totalWagered = (wins.length > 0 || losses.length > 0)
    ? [...wins, ...losses].reduce((s, p) => s + (p.wager || 0), 0)
    : 0;
  const pnl = wins.reduce((s, p) => s + (p.potential_payout || 0) - (p.wager || 0), 0)
            - losses.reduce((s, p) => s + (p.wager || 0), 0);
  const pnlStr = totalWagered > 0
    ? `${pnl >= 0 ? '+' : '−'}$${Math.abs(pnl).toFixed(0)}`
    : '—';
  const roi = totalWagered > 0
    ? `${pnl >= 0 ? '+' : ''}${Math.round((pnl / totalWagered) * 100)}%`
    : '—';

  const visible = filter === 'all' ? parlays : parlays.filter(p => p.status === filter);

  return (
    <div className="space-y-5">
      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Win Rate', value: winRate,           green: parseFloat(winRate) >= 50, red: parseFloat(winRate) < 50 && winRate !== '—' },
          { label: 'P&L',      value: pnlStr,            green: pnl > 0,                   red: pnl < 0 },
          { label: 'ROI',      value: roi,               green: parseFloat(roi) > 0,        red: parseFloat(roi) < 0 },
          { label: 'Pending',  value: pending.length,    neutral: true },
        ].map(s => (
          <div key={s.label} className="bg-white/3 border border-white/6 rounded-xl p-3 text-center">
            <p className={cn(
              "text-lg font-bold leading-none",
              s.neutral ? 'text-foreground' :
              s.green   ? 'text-primary'    :
              s.red     ? 'text-destructive': 'text-foreground'
            )}>
              {s.value}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* W/L row */}
      {settled > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center justify-between bg-primary/5 border border-primary/15 rounded-xl px-4 py-2.5">
            <span className="text-xs text-muted-foreground">Wins</span>
            <span className="text-sm font-bold text-primary">{wins.length}</span>
          </div>
          <div className="flex items-center justify-between bg-destructive/5 border border-destructive/15 rounded-xl px-4 py-2.5">
            <span className="text-xs text-muted-foreground">Losses</span>
            <span className="text-sm font-bold text-destructive">{losses.length}</span>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTER_TABS.map(f => {
          const count = f === 'all' ? parlays.length : parlays.filter(p => p.status === f).length;
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
              {count > 0 && (
                <span className={cn("text-[9px] font-bold", filter === f ? 'opacity-80' : 'opacity-50')}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Parlay list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 rounded-2xl bg-white/3 border border-white/6 animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-muted-foreground">
          <Layers className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">
            {filter === 'all' ? 'No parlays yet — build one!' : `No ${filter} parlays.`}
          </p>
          {filter !== 'all' && (
            <button onClick={() => setFilter('all')} className="text-xs text-primary hover:text-primary/80 transition-colors mt-2">
              Show all
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(p => (
            <ParlayCard key={p.id} parlay={p} onSettle={handleSettle} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
