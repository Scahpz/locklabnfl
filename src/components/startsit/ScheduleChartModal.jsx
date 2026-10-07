import React from 'react';
import { X } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Cell,
} from 'recharts';
import PlayerAvatar from '@/components/common/PlayerAvatar';
import InjuryTag from '@/components/common/InjuryTag';
import { difficultyColor, DIFFICULTY_STYLE } from '@/lib/fantasyOutlook';
import { cn } from '@/lib/utils';

const POS_LABEL = { DEF: 'D/ST' };

// One bar per remaining week: height = matchup difficulty (100 = league average,
// taller = tougher), colored green → red. Bye weeks render as an empty gap.
function ScheduleTooltip({ active, payload, position }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (d.bye) return null;
  const m = d.matchup;
  return (
    <div className="rounded-lg border border-white/10 bg-[hsl(222,47%,9%)] px-3 py-2 text-[11px] shadow-xl">
      <div className="font-semibold text-foreground">Week {d.week} · {d.label}</div>
      {m ? (
        <>
          <div className="text-muted-foreground mt-0.5">
            #{m.rank} of {m.teams} in FP allowed to {POS_LABEL[position] ?? position}s
            <span className="text-muted-foreground/60"> (1 = most allowed)</span>
          </div>
          <div className="text-muted-foreground">
            Allows <span className="text-foreground font-medium">{m.allowed.toFixed(1)}</span> FP/g · league avg {m.leagueAvg.toFixed(1)}
          </div>
        </>
      ) : (
        <div className="text-muted-foreground mt-0.5">No data on this opponent yet</div>
      )}
      {d.proj > 0 && <div className="text-muted-foreground">Projected {d.adjusted.toFixed(1)} FP</div>}
    </div>
  );
}

export default function ScheduleChartModal({ entry, onClose }) {
  if (!entry) return null;
  const { player, sos, weeks } = entry;
  const position = player.position;
  const data = weeks.map(w => ({
    week: w.week,
    bye: !!w.bye,
    label: w.bye ? 'BYE' : `${w.opponent}`,
    tick: w.bye ? `${w.week}\nBYE` : `${w.week}\n${w.opponent}`,
    difficulty: w.bye ? null : Math.round((w.ratio ?? 1) * 100),
    ratio: w.ratio,
    matchup: w.matchup,
    proj: w.proj ?? 0,
    adjusted: w.adjusted ?? 0,
  }));
  const grade = DIFFICULTY_STYLE[sos.grade];

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[hsl(218,58%,6%)] shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-white/6">
          <div className="flex items-center gap-3 min-w-0">
            <PlayerAvatar photo={player.photo_url} team={player.team} className="w-10 h-10 flex-shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-foreground truncate">{player.player_name}</span>
                <InjuryTag player={player} />
              </div>
              <div className="text-[11px] text-muted-foreground">
                {POS_LABEL[position] ?? position} · {player.team} · {entry.rosPoints} ROS pts · {entry.perGame}/g
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3 overflow-y-auto">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-md border', grade.cls)}>
              {grade.label} schedule
            </span>
            <span className="text-[11px] text-muted-foreground">
              #{sos.rank} of {sos.of} {POS_LABEL[position] ?? position}s (1 = easiest)
            </span>
            <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="w-4 border-t border-dashed border-slate-400" /> League avg
            </span>
          </div>

          <div className="h-56 sm:h-64 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 18, left: 0 }}>
                <XAxis
                  dataKey="tick"
                  interval={0}
                  tickLine={false}
                  axisLine={false}
                  tick={({ x, y, payload }) => {
                    const [wk, opp] = String(payload.value).split('\n');
                    return (
                      <g transform={`translate(${x},${y + 8})`}>
                        <text textAnchor="middle" fontSize={9} fill="hsl(215 20% 55%)">{wk}</text>
                        <text textAnchor="middle" y={11} fontSize={9} fontWeight={600} fill={opp === 'BYE' ? 'hsl(215 20% 45%)' : 'hsl(210 40% 90%)'}>{opp}</text>
                      </g>
                    );
                  }}
                />
                <YAxis hide domain={[0, dataMax => Math.max(140, dataMax)]} />
                <Tooltip content={<ScheduleTooltip position={position} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <ReferenceLine y={100} stroke="hsl(215 20% 60%)" strokeDasharray="4 4" />
                <Bar dataKey="difficulty" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {data.map(d => <Cell key={d.week} fill={d.bye ? 'transparent' : difficultyColor(d.ratio ?? 1)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Bar height = matchup difficulty vs. {POS_LABEL[position] ?? position}s based on fantasy points each opponent has allowed this season
            (dashed line = league average). Green is easy, red is hard; gaps are bye weeks. Updates as each week’s results come in.
          </p>
          {entry.reason && <p className="text-xs text-foreground/90">{entry.reason}</p>}
        </div>
      </div>
    </div>
  );
}
