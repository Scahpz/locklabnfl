import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

function fmtDate(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch { return null; }
}

function fmtWeek(log, index) {
  if (log?.week) return `W${log.week}`;
  return `G${index + 1}`;
}

export default function PlayerTrendChart({ games, line, propType, gameLogs }) {
  // games and gameLogs are already in chronological order (oldest first, newest last)
  const data = games.map((val, i) => {
    const log = gameLogs?.[i];
    const prefix = log?.isHome ? 'vs' : '@';
    const opp = log?.opp || `G${i + 1}`;
    const date = log?.date ? fmtDate(log.date) : null;
    // Fall back to week label or game index when date is missing/invalid
    const topLine = date || fmtWeek(log, i);
    const botLine = log?.opp ? opp : null;
    return {
      game: botLine ? `${topLine}\n${botLine}` : topLine,
      label: log ? `${prefix} ${opp}${date ? ` (${date})` : ''}` : `Game ${i + 1}`,
      value: val,
      hit: val > line,
    };
  });

  return (
    <div className="w-full">
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 20%)" />
            <XAxis
              dataKey="game"
              tick={({ x, y, payload }) => {
                const parts = payload.value.split('\n');
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text x={0} y={0} dy={10} textAnchor="middle" fill="hsl(215 20% 55%)" fontSize={10}>{parts[0]}</text>
                    {parts[1] && (
                      <text x={0} y={0} dy={22} textAnchor="middle" fill="hsl(142 71% 45%)" fontSize={10} fontWeight="600">{parts[1]}</text>
                    )}
                  </g>
                );
              }}
              height={40}
              interval={0}
            />
            <YAxis tick={{ fill: 'hsl(215 20% 55%)', fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                background: 'hsl(222 47% 9%)',
                border: '1px solid hsl(217 33% 20%)',
                borderRadius: '8px',
                color: 'hsl(210 40% 98%)',
                fontSize: 12,
              }}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ''}
              formatter={(value) => [value, propType?.toUpperCase() || 'Value']}
            />
            <ReferenceLine y={line} stroke="hsl(263 70% 58%)" strokeDasharray="5 5" label={{ value: `Line: ${line}`, fill: 'hsl(263 70% 58%)', fontSize: 10, position: 'right' }} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="hsl(142 71% 45%)"
              strokeWidth={2}
              dot={(props) => {
                const { cx, cy, payload } = props;
                const color = payload.hit ? 'hsl(142 71% 45%)' : 'hsl(0 84% 60%)';
                return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill={color} stroke={color} strokeWidth={2} />;
              }}
              activeDot={{ r: 6, fill: 'hsl(142 71% 45%)', stroke: 'hsl(142 71% 45%)' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-muted-foreground text-right mt-1 pr-1">older ← → most recent</p>
    </div>
  );
}
