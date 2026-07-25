import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useLivePlayers } from '@/lib/useLivePlayers';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Clock, Target, Activity, Zap, Search, Flame, X, Wifi, WifiOff, Loader2 } from 'lucide-react';
import PlayerTrendChart from '@/components/trends/PlayerTrendChart';
import MinutesTrendChart from '@/components/trends/MinutesTrendChart';
import HotStreakCard from '@/components/trends/HotStreakCard';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/common/TeamLogo';

import { NFL_API } from '@/lib/config';

const labelMap = { points: 'PPG', rebounds: 'RPG', assists: 'APG', '3PM': '3PM', steals: 'SPG', blocks: 'BPG', PRA: 'PRA', 'P+R': 'P+R', 'P+A': 'P+A', 'A+R': 'A+R' };
const iconMap  = { points: TrendingUp, rebounds: Activity, assists: Target, '3PM': Zap, steals: Clock, blocks: Clock, PRA: TrendingUp };
const colorMap = { points: 'text-primary', rebounds: 'text-accent', assists: 'text-chart-3', '3PM': 'text-chart-4', steals: 'text-chart-3', blocks: 'text-destructive', PRA: 'text-primary' };

function getHotStreakPlayers(players) {
  const hot = [];
  players.forEach(player => {
    player.props.forEach(prop => {
      const hits = prop.last_10_games?.filter(v => v > prop.line).length || 0;
      if (hits >= 7) hot.push({ player, prop, hits });
    });
  });
  return hot.sort((a, b) => b.hits - a.hits).slice(0, 12);
}

/** Fetch real game logs for a player from the backend (all prop types at once) */
async function fetchPlayerGameLogs(playerName) {
  const res = await fetch(`${NFL_API}/api/player-gamelogs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerName }),
  });
  if (!res.ok) throw new Error(`Status ${res.status}`);
  return res.json();
}

export default function Trends() {
  const urlParams = new URLSearchParams(window.location.search);
  const playerParam = urlParams.get('player');

  const { players, isLive, loading } = useLivePlayers();

  const [selectedPlayer, setSelectedPlayer] = useState(playerParam || null);
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef(null);

  // Real game-log data fetched on demand
  const [gameLogs, setGameLogs] = useState({});      // { [playerName]: analytics dict }
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError]   = useState(null);

  const defaultPlayerName = players[0]?.player_name;
  const resolvedSelected  = selectedPlayer || defaultPlayerName;

  const basePlayer = useMemo(
    () => players.find(p => p.player_name === resolvedSelected) || players[0],
    [players, resolvedSelected]
  );

  // Merge real game logs into the player's props
  const player = useMemo(() => {
    if (!basePlayer) return null;
    const logs = gameLogs[basePlayer.player_name];
    if (!logs) return basePlayer;
    return {
      ...basePlayer,
      props: basePlayer.props.map(prop => {
        const realAnalytics = logs[prop.prop_type];
        if (!realAnalytics) return prop;
        return {
          ...prop,
          avg_last_5:        realAnalytics.avg_last_5,
          avg_last_10:       realAnalytics.avg_last_10,
          hit_rate_last_10:  realAnalytics.hit_rate_last_10,
          projection:        realAnalytics.projection,
          edge:              realAnalytics.edge,
          confidence_score:  realAnalytics.confidence_score,
          season_avg:        realAnalytics.season_avg,
          season_games:      realAnalytics.season_games,
          season_hit_rate:   realAnalytics.season_hit_rate,
          streak_info:       realAnalytics.streak_info,
          last_10_games:     realAnalytics.last_10_games,
          last_5_games:      realAnalytics.last_5_games,
          game_logs_last_10: realAnalytics.game_logs_last_10,
          minutes_last_5:    realAnalytics.minutes_last_5,
        };
      }),
    };
  }, [basePlayer, gameLogs]);

  // Load game logs whenever selected player changes
  useEffect(() => {
    if (!resolvedSelected) return;
    if (gameLogs[resolvedSelected]) return; // already loaded

    setLogsLoading(true);
    setLogsError(null);
    fetchPlayerGameLogs(resolvedSelected)
      .then(data => {
        setGameLogs(prev => ({ ...prev, [resolvedSelected]: data.analytics }));
      })
      .catch(e => setLogsError(e.message))
      .finally(() => setLogsLoading(false));
  }, [resolvedSelected]);

  const hotPlayers = useMemo(() => getHotStreakPlayers(players), [players]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return players.filter(p =>
      p.player_name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [search, players]);

  useEffect(() => {
    function handleClick(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowDropdown(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function selectPlayer(name) {
    setSelectedPlayer(name);
    setSearch('');
    setShowDropdown(false);
  }

  function buildGameLogs(prop) {
    if (prop?.game_logs_last_10?.length > 0) {
      return prop.game_logs_last_10.map(g => ({ isHome: g.isHome, opp: g.opp }));
    }
    return (prop?.last_10_games || []).map((_, i) => ({ isHome: false, opp: `G${i + 1}` }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!loading && players.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
          <Flame className="w-7 h-7 text-orange-400" /> Streaks & Trends
        </h1>
        <div className="text-center py-20 text-muted-foreground">
          <Flame className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-lg font-medium">No player data available today</p>
          <p className="text-sm mt-1">Trends will appear here once live props are available.</p>
        </div>
      </div>
    );
  }

  if (!player) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            <Flame className="w-7 h-7 text-orange-400" /> Streaks & Trends
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            {isLive
              ? <><Wifi className="w-3.5 h-3.5 text-primary" /><span className="text-primary font-medium">Live — today's players</span></>
              : <><WifiOff className="w-3.5 h-3.5" />Hot streaks, recent form & performance analysis</>
            }
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72" ref={searchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search any player or team…"
            value={search}
            onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            className="w-full pl-9 pr-8 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {search && (
            <button onClick={() => { setSearch(''); setShowDropdown(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute top-full mt-1 w-full bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden">
              {searchResults.map(p => (
                <button key={p.id} onClick={() => selectPlayer(p.player_name)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-secondary transition-colors text-left">
                  <TeamLogo team={p.team} className="w-7 h-7" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{p.player_name}</p>
                    <p className="text-[10px] text-muted-foreground">{p.team} · {p.position}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Hot Streak Cards */}
      {hotPlayers.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-4 h-4 text-orange-400" />
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">On Fire — Hot Streaks</h2>
            <span className="text-xs text-muted-foreground">(7+ hits in last 10)</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {hotPlayers.map(({ player: hp, prop }) => (
              <HotStreakCard key={`${hp.id}-${prop.prop_type}`} player={hp} prop={prop}
                isSelected={resolvedSelected === hp.player_name} onClick={() => selectPlayer(hp.player_name)} />
            ))}
          </div>
        </div>
      )}

      {/* Player Header */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-4 mb-4">
          <TeamLogo team={player.team} className="w-16 h-16" bgClass="bg-secondary border-2 border-border" />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-foreground">{player.player_name}</h2>
            <p className="text-sm text-muted-foreground">{player.team} · {player.position}</p>
            {logsLoading && (
              <p className="text-xs text-primary flex items-center gap-1 mt-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading game data…
              </p>
            )}
            {logsError && !logsLoading && (
              <p className="text-xs text-muted-foreground mt-1">Using season averages (live logs unavailable)</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(() => {
            const statsToShow = [
              { key: 'minutes', label: 'MIN', value: player.props[0]?.minutes_avg || '—', icon: Clock, color: 'text-chart-3' },
              ...player.props.slice(0, 3).map(prop => ({
                key: prop.prop_type,
                label: labelMap[prop.prop_type] || prop.prop_type.toUpperCase(),
                value: prop.avg_last_10 ?? prop.line,
                icon: iconMap[prop.prop_type] || TrendingUp,
                color: colorMap[prop.prop_type] || 'text-primary',
              })),
            ].slice(0, 4);
            return statsToShow.map(stat => (
              <div key={stat.key} className="bg-secondary/50 rounded-lg p-3 text-center">
                <stat.icon className={`w-4 h-4 mx-auto ${stat.color} mb-1`} />
                <p className="text-lg font-bold text-foreground">{stat.value}</p>
                <p className="text-[10px] text-muted-foreground uppercase">{stat.label}</p>
              </div>
            ));
          })()}
        </div>
      </div>

      {/* Prop Charts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {player.props.map((prop, i) => {
          const games = prop.last_10_games;
          const logs  = buildGameLogs(prop);
          return (
            <div key={i} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold text-foreground uppercase">{prop.prop_type}</h3>
                  <Badge variant="outline" className="border-border text-xs">Line: {prop.line}</Badge>
                </div>
                {prop.streak_info && (
                  <span className="text-xs text-primary font-medium flex items-center gap-1">
                    <Zap className="w-3 h-3" />{prop.streak_info}
                  </span>
                )}
              </div>

              {logsLoading ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" /> Fetching game logs…
                </div>
              ) : games && games.length > 0 ? (
                <PlayerTrendChart games={games} line={prop.line} propType={prop.prop_type} gameLogs={logs} />
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <Activity className="w-8 h-8 opacity-30" />
                  <p className="text-sm">No game log data available</p>
                </div>
              )}

              <div className="grid grid-cols-4 gap-3 mt-4">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Avg L5</p>
                  <p className={cn("text-sm font-bold", (prop.avg_last_5 ?? prop.line) > prop.line ? 'text-primary' : 'text-destructive')}>
                    {prop.avg_last_5 ?? '—'}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Avg L10</p>
                  <p className={cn("text-sm font-bold", (prop.avg_last_10 ?? prop.line) > prop.line ? 'text-primary' : 'text-destructive')}>
                    {prop.avg_last_10 ?? '—'}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Hit Rate</p>
                  <p className="text-sm font-bold text-foreground">
                    {prop.hit_rate_last_10 != null ? `${prop.hit_rate_last_10}%` : '—'}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Edge</p>
                  <p className={cn("text-sm font-bold", (prop.edge ?? 0) > 0 ? 'text-primary' : 'text-destructive')}>
                    {prop.edge != null ? `${prop.edge > 0 ? '+' : ''}${prop.edge}` : '—'}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Minutes Trend */}
      {player.props[0]?.minutes_last_5?.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-lg font-bold text-foreground mb-4">Minutes Trend (Last 5)</h3>
          <MinutesTrendChart minutes={player.props[0].minutes_last_5} />
        </div>
      )}
    </div>
  );
}
