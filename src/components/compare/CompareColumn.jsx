import React from 'react';
import { Zap, Crosshair, Activity, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

const matchupColors = {
  elite: 'text-primary bg-primary/10',
  favorable: 'text-chart-3 bg-chart-3/10',
  neutral: 'text-muted-foreground bg-secondary',
  tough: 'text-chart-5 bg-chart-5/10',
  elite_defense: 'text-destructive bg-destructive/10',
};

export default function CompareColumn({ player }) {
  const firstProp = player.props[0];

  // Derive target/carry share from any prop on this player
  const shareVal = (() => {
    const p = player.props.find(pr => pr.target_share != null || pr.snap_pct != null);
    if (!p) return '—';
    if (p.target_share != null) return `${Math.round(p.target_share * 100)}%`;
    if (p.snap_pct != null) return `${Math.round(p.snap_pct * 100)}%`;
    return '—';
  })();

  const snapVal = (() => {
    const p = player.props.find(pr => pr.snap_pct != null);
    return p ? `${Math.round(p.snap_pct * 100)}%` : '—';
  })();

  const stats = [
    { icon: Zap,       label: 'Snap %',      value: snapVal,                                               color: 'text-chart-3' },
    { icon: Crosshair, label: 'Tgt/Carry %', value: shareVal,                                              color: 'text-accent'  },
    { icon: Activity,  label: 'Snap Trend',  value: firstProp?.snap_trend ?? '—',                          color: 'text-chart-4' },
    { icon: Target,    label: 'Implied Tot', value: firstProp?.game_total != null ? firstProp.game_total : (firstProp?.over_odds != null ? '—' : '—'), color: 'text-primary' },
  ];

  const matchupKey = firstProp?.matchup_rating || 'neutral';

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {stats.map(s => (
          <div key={s.label} className="bg-secondary/50 rounded-lg p-2.5 text-center">
            <s.icon className={cn('w-3.5 h-3.5 mx-auto mb-1', s.color)} />
            <p className="text-sm font-bold text-foreground">{s.value}</p>
            <p className="text-[10px] text-muted-foreground uppercase">{s.label}</p>
          </div>
        ))}
      </div>

      {firstProp?.matchup_note && (
        <div className={cn('rounded-lg px-3 py-2 text-xs font-medium', matchupColors[matchupKey])}>
          {firstProp.matchup_note}
        </div>
      )}
    </div>
  );
}