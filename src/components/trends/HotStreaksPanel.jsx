import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Snowflake, Search, Loader2 } from 'lucide-react';
import { fetchLiveProps } from '@/lib/liveData';
import { loadSleeperHistory, computeAnalyticsFromSleeper } from '@/lib/sleeperHistory';
import { isTdProp } from '@/lib/grading';
import { formatMarket } from '@/lib/propLabels';
import PlayerAvatar from '@/components/common/PlayerAvatar';
import InjuryTag from '@/components/common/InjuryTag';
import { loadInjuryIndexByName, injuryForName } from '@/lib/injuries';
import { cn } from '@/lib/utils';

const MIN_GAMES   = 5;
const HOT_RATE    = 0.7; // cleared the line in 70%+ of recent games
const COLD_RATE   = 0.3; // cleared it in 30% or fewer

// Tiny last-N bar strip: green = cleared this week's line, red = missed.
function GameStrip({ games, line }) {
  const max = Math.max(...games, line, 1);
  return (
    <div className="flex items-end gap-[3px] h-7" aria-hidden>
      {games.map((v, i) => (
        <div
          key={i}
          className={cn('w-[5px] rounded-sm', v > line ? 'bg-emerald-400/80' : 'bg-rose-400/60')}
          style={{ height: `${Math.max(12, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

// Props whose recent game logs clear (or miss) today's line most of the time.
// Same Sleeper game-log source as AI Picks, so the numbers agree across tabs.
export default function HotStreaksPanel({ position = 'All' }) {
  const navigate = useNavigate();
  const [props, setProps]     = useState(null);
  const [mode, setMode]       = useState('hot');
  const [search, setSearch]   = useState('');
  const injuryIndex = useMemo(() => loadInjuryIndexByName(), []);

  useEffect(() => {
    Promise.all([fetchLiveProps(), loadSleeperHistory().catch(() => null)])
      .then(([data, history]) => {
        const raw = data?.props ?? [];
        setProps(history
          ? raw.map(p => {
              const an = computeAnalyticsFromSleeper(p.player_name, p.prop_type, p.line, history);
              return an ? { ...p, ...an } : p;
            })
          : raw);
      })
      .catch(() => setProps([]));
  }, []);

  const streaks = useMemo(() => {
    if (!props) return [];
    const out = [];
    for (const p of props) {
      // last_10_games is newest-first; show oldest → newest left to right
      const games = (p.last_10_games ?? []).slice(0, 10).reverse();
      if (games.length < MIN_GAMES || p.injury_status === 'out') continue;
      const hits = games.filter(v => v > p.line).length;
      const rate = hits / games.length;
      const isHot = rate >= HOT_RATE;
      const isCold = rate <= COLD_RATE && !isTdProp(p); // "never scores" isn't a streak
      if (mode === 'hot' ? !isHot : !isCold) continue;
      if (position !== 'All' && p.position !== position) continue;
      if (search.trim() && !p.player_name.toLowerCase().includes(search.toLowerCase())) continue;
      out.push({ prop: p, games, hits });
    }
    return out.sort((a, b) =>
      mode === 'hot'
        ? b.hits / b.games.length - a.hits / a.games.length || b.games.length - a.games.length
        : a.hits / a.games.length - b.hits / b.games.length || b.games.length - a.games.length,
    );
  }, [props, mode, position, search]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex gap-1 bg-white/4 rounded-xl p-1 flex-shrink-0">
          {[
            { key: 'hot',  label: 'Hot',  icon: Flame,     cls: 'text-orange-400' },
            { key: 'cold', label: 'Cold', icon: Snowflake, cls: 'text-sky-400' },
          ].map(m => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={cn(
                'flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-all',
                mode === m.key ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <m.icon className={cn('w-3.5 h-3.5', m.cls)} /> {m.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search player..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {mode === 'hot'
          ? 'Cleared this week’s line in 70%+ of recent games.'
          : 'Stayed under this week’s line in 70%+ of recent games.'}
      </p>

      {props === null ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading game logs…
        </div>
      ) : streaks.length === 0 ? (
        <div className="text-center text-muted-foreground text-sm py-12">
          No {mode} streaks{position !== 'All' ? ` at ${position}` : ''} on this week’s board.
        </div>
      ) : (
        <div className="space-y-2">
          {streaks.map(({ prop, games, hits }, i) => (
            <button
              key={`${prop.player_name}-${prop.prop_type}`}
              onClick={() => navigate(`/?player=${encodeURIComponent(prop.player_name)}&prop=${prop.prop_type}`)}
              className="w-full text-left rounded-2xl border border-white/6 bg-[hsl(222,47%,9%)] hover:border-white/18 transition-colors p-3.5 flex items-center gap-3"
            >
              <span className="w-6 text-xs font-bold text-muted-foreground tabular-nums flex-shrink-0">{i + 1}</span>
              <PlayerAvatar photo={prop.image_url} team={prop.team} className="w-10 h-10 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[15px] font-semibold text-foreground truncate">{prop.player_name}</span>
                  {(() => { const inj = injuryForName(injuryIndex, prop.player_name); return inj ? <InjuryTag player={inj} /> : null; })()}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {formatMarket(prop.prop_type)} {mode === 'hot' ? 'O' : 'U'} {prop.line} · {prop.team}{prop.opponent ? ` vs ${prop.opponent}` : ''}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className={cn('text-sm font-bold tabular-nums', mode === 'hot' ? 'text-orange-400' : 'text-sky-400')}>
                  {mode === 'hot' ? hits : games.length - hits}/{games.length}
                </span>
                <GameStrip games={games} line={prop.line} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
