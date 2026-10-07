import React from 'react';
import PlayerAvatar from '@/components/common/PlayerAvatar';
import InjuryTag from '@/components/common/InjuryTag';
import { DIFFICULTY_STYLE, difficultyColor } from '@/lib/fantasyOutlook';
import { cn } from '@/lib/utils';

const POS_LABEL = { DEF: 'D/ST' };

// Rest-of-season ranking row: ROS points, schedule grade, reason, and a mini
// week-by-week strip (tap for the full schedule chart).
export default function RosCard({ entry, onOpen }) {
  const { player, rank, rosPoints, perGame, sos, weeks, bye, reason } = entry;
  const grade = DIFFICULTY_STYLE[sos.grade];
  return (
    <div
      onClick={onOpen}
      className="rounded-2xl border border-white/6 bg-[hsl(222,47%,9%)] hover:border-white/18 hover:bg-white/2 transition-colors cursor-pointer p-3.5 sm:p-4 space-y-3"
    >
      <div className="flex items-center gap-3">
        <span className={cn(
          'w-7 text-sm font-bold tabular-nums flex-shrink-0',
          rank === 1 ? 'text-yellow-400' : rank <= 3 ? 'text-primary' : 'text-muted-foreground',
        )}>
          #{rank}
        </span>
        <PlayerAvatar photo={player.photo_url} team={player.team} className="w-10 h-10 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[15px] font-semibold text-foreground truncate">{player.player_name}</span>
            <InjuryTag player={player} />
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {POS_LABEL[player.position] ?? player.position} · {player.team}{bye ? ` · bye wk ${bye}` : ''}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-base font-bold text-foreground tabular-nums">{rosPoints}</div>
          <div className="text-[10px] text-muted-foreground tabular-nums">{perGame} / game</div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-md border', grade.cls)}>
          {grade.label} SOS · #{sos.rank}/{sos.of}
        </span>
        <div className="flex gap-[3px] items-center" aria-hidden>
          {weeks.map(w => (
            <span
              key={w.week}
              className="w-2.5 h-2.5 rounded-[3px]"
              style={w.bye ? { border: '1px dashed hsl(215 20% 35%)' } : { background: difficultyColor(w.ratio ?? 1) }}
            />
          ))}
        </div>
      </div>

      {reason && <p className="text-[11px] text-muted-foreground leading-snug">{reason}</p>}
    </div>
  );
}
