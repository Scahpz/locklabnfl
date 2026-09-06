import React, { useState } from 'react';
import { TrendingUp, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LineChart, Line, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';
import { formatMarket } from '@/lib/propLabels';

const COLORS = ['hsl(142 71% 45%)', 'hsl(263 70% 58%)', 'hsl(199 89% 48%)'];

function MiniSparkline({ games, line, color }) {
  if (!games || games.length === 0) return null;
  const data = games.map((v, i) => ({ i, v }));
  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <Tooltip
            contentStyle={{ background: 'hsl(222 47% 9%)', border: '1px solid hsl(217 33% 20%)', borderRadius: '6px', fontSize: 10 }}
            formatter={(v) => [v, 'Value']}
            labelFormatter={() => ''}
          />
          <ReferenceLine y={line} stroke="hsl(263 70% 58%)" strokeDasharray="3 3" strokeWidth={1} />
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function PropCell({ prop, color, isWinner }) {
  if (!prop) {
    return (
      <div className="flex-1 rounded-xl border border-dashed border-border bg-secondary/20 p-4 flex items-center justify-center">
        <span className="text-xs text-muted-foreground">No prop</span>
      </div>
    );
  }

  const oddsDisplay = (o) => o > 0 ? `+${o}` : o;

  return (
    <div className={cn(
      'flex-1 rounded-xl border p-4 space-y-3 transition-all',
      isWinner ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
    )}>
      {/* Line & Odds */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xl font-bold text-foreground">{prop.line}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Line</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-primary">{oddsDisplay(prop.over_odds)} O</p>
          <p className="text-xs text-muted-foreground">{oddsDisplay(prop.under_odds)} U</p>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="bg-secondary/50 rounded p-1.5">
          <p className="text-[10px] text-muted-foreground">Proj</p>
          <p className="text-xs font-bold text-foreground">{prop.projection}</p>
        </div>
        <div className="bg-secondary/50 rounded p-1.5">
          <p className="text-[10px] text-muted-foreground">Edge</p>
          <p className={cn('text-xs font-bold', prop.edge > 0 ? 'text-primary' : 'text-destructive')}>
            {prop.edge > 0 ? '+' : ''}{prop.edge}%
          </p>
        </div>
        <div className="bg-secondary/50 rounded p-1.5">
          <p className="text-[10px] text-muted-foreground">Hit%</p>
          <p className="text-xs font-bold text-foreground">{prop.hit_rate_last_10}%</p>
        </div>
      </div>

      {/* Sparkline */}
      <MiniSparkline games={prop.last_10_games} line={prop.line} color={color} />

      {/* Averages */}
      <div className="flex gap-2 text-center">
        <div className="flex-1 bg-secondary/30 rounded p-1.5">
          <p className="text-[10px] text-muted-foreground">Avg L5</p>
          <p className={cn('text-xs font-semibold', prop.avg_last_5 > prop.line ? 'text-primary' : 'text-destructive')}>
            {prop.avg_last_5}
          </p>
        </div>
        <div className="flex-1 bg-secondary/30 rounded p-1.5">
          <p className="text-[10px] text-muted-foreground">Avg L10</p>
          <p className={cn('text-xs font-semibold', prop.avg_last_10 > prop.line ? 'text-primary' : 'text-destructive')}>
            {prop.avg_last_10}
          </p>
        </div>
        <div className="flex-1 bg-secondary/30 rounded p-1.5">
          <p className="text-[10px] text-muted-foreground">Conf</p>
          <p className="text-xs font-semibold text-foreground">{prop.confidence_score}/10</p>
        </div>
      </div>

      {/* Streak */}
      {prop.streak_info && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Zap className="w-3 h-3 text-chart-4 flex-shrink-0" />
          {prop.streak_info}
        </p>
      )}
    </div>
  );
}

export default function ComparePropRow({ propType, players }) {
  const [expanded, setExpanded] = useState(true);

  const props = players.map(p => p.props.find(pr => pr.prop_type === propType) || null);

  // Determine winner: highest edge among players that have this prop
  const edges = props.map(p => p?.edge ?? -Infinity);
  const maxEdge = Math.max(...edges);
  const winnerIdx = maxEdge > 0 ? edges.indexOf(maxEdge) : -1;

  return (
    <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-foreground uppercase tracking-wider">
            {formatMarket(propType)}
          </span>
          {winnerIdx >= 0 && (
            <span className="text-[10px] text-primary font-medium flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Best edge: {players[winnerIdx]?.player_name?.split(' ').pop()}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {/* Cells */}
      {expanded && (
        <div className="px-4 pb-4 flex gap-3">
          {players.map((player, i) => (
            <PropCell
              key={player.id}
              prop={props[i]}
              color={COLORS[i]}
              isWinner={i === winnerIdx}
            />
          ))}
        </div>
      )}
    </div>
  );
}