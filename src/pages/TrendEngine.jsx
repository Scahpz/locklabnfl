import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Flame, Activity, Search } from 'lucide-react';
import { fetchTrendScores, TAG_META } from '@/lib/trendEngine';
import { fetchLivePlayers } from '@/lib/nflLiveData';
import { fantasyScore } from '@/lib/fantasyScoring';
import { getLeagueSettings } from '@/lib/leagueSettings';
import { mockPlayers, isDemoMode } from '@/lib/mockData';
import PlayerAvatar from '@/components/common/PlayerAvatar';
import TeamLogo from '@/components/common/TeamLogo';
import PlayerBreakdownModal from '@/components/PlayerBreakdownModal';
import { cn } from '@/lib/utils';

const POSITIONS = ['All', 'QB', 'RB', 'WR', 'TE'];

const TABS = [
  { key: 'stock_up',   label: 'Stock Up',   icon: TrendingUp,  metric: 'momentum' },
  { key: 'stock_down', label: 'Stock Down', icon: TrendingDown, metric: 'momentum' },
  { key: 'buy_low',    label: 'Buy Low',    icon: DollarSign,  metric: 'fpoe' },
  { key: 'sell_high',  label: 'Sell High',  icon: Flame,       metric: 'fpoe' },
];

const TAG_CHIP_CLS = {
  stock_up:   'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
  stock_down: 'bg-red-500/15 border-red-500/30 text-red-400',
  buy_low:    'bg-sky-500/15 border-sky-500/30 text-sky-400',
  sell_high:  'bg-amber-500/15 border-amber-500/30 text-amber-400',
};

function MomentumBar({ momentum }) {
  const pct   = Math.min(100, Math.max(0, ((momentum ?? 0) + 100) / 2));
  const color = momentum >= 25 ? 'bg-emerald-500' : momentum <= -25 ? 'bg-red-500' : 'bg-amber-500';
  return (
    <div className="relative h-1.5 bg-white/8 rounded-full overflow-hidden">
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20" />
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function TrendPlayerRow({ entry, highlightMetric, onOpen }) {
  const { trend, player } = entry;
  const showMomentum = highlightMetric === 'momentum' && trend.momentum != null;
  return (
    <button
      onClick={onOpen}
      disabled={!player}
      className={cn(
        'w-full text-left rounded-2xl border border-white/6 bg-[hsl(222,47%,9%)] transition-colors p-4 flex items-center gap-4',
        player ? 'hover:border-white/18 hover:bg-white/2 cursor-pointer' : 'opacity-70 cursor-default',
      )}
    >
      <PlayerAvatar photo={player?.photo_url} team={trend.team} className="w-10 h-10 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground truncate">{trend.player_name}</span>
          <span className="text-[10px] bg-white/8 text-muted-foreground px-1.5 py-0.5 rounded font-medium">
            {trend.position}
          </span>
          <TeamLogo team={trend.team} className="w-4 h-4" />
          {(trend.tags ?? []).map(tag => (
            <span key={tag} className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-wide', TAG_CHIP_CLS[tag])}>
              {TAG_META[tag]?.arrow} {TAG_META[tag]?.label}
            </span>
          ))}
        </div>
        {showMomentum && <div className="mt-1.5"><MomentumBar momentum={trend.momentum} /></div>}
        {trend.reasons?.[0] && (
          <p className="text-[11px] text-muted-foreground mt-1.5 truncate">{trend.reasons[0]}</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {highlightMetric === 'fpoe' ? (
          <span className={cn('text-lg font-bold tabular-nums', trend.fpoe > 0 ? 'text-amber-400' : 'text-sky-400')}>
            {trend.fpoe > 0 ? '+' : ''}{trend.fpoe} FP
          </span>
        ) : (
          <span className="text-lg font-bold text-foreground tabular-nums">
            {trend.momentum > 0 ? '+' : ''}{trend.momentum}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground">{trend.confidence}% conf</span>
      </div>
    </button>
  );
}

export default function TrendEngine() {
  const [trendData, setTrendData]     = useState(null);
  const [livePlayers, setLivePlayers] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState('stock_up');
  const [position, setPosition]       = useState('All');
  const [search, setSearch]           = useState('');
  const [breakdownEntry, setBreakdownEntry] = useState(null);

  useEffect(() => {
    Promise.all([
      fetchTrendScores(),
      isDemoMode()
        ? Promise.resolve({ players: mockPlayers })
        : fetchLivePlayers().catch(() => ({ players: mockPlayers })),
    ]).then(([trend, live]) => {
      setTrendData(trend);
      setLivePlayers(live.players ?? mockPlayers);
      setLoading(false);
    });
  }, []);

  const livePlayerById = useMemo(() => {
    const map = {};
    (livePlayers ?? []).forEach(p => { map[p.id] = p; });
    return map;
  }, [livePlayers]);

  const entries = useMemo(() => {
    if (!trendData?.players) return [];
    return trendData.players.map(trend => ({ trend, player: livePlayerById[trend.player_id] }));
  }, [trendData, livePlayerById]);

  const activeTabMeta = TABS.find(t => t.key === activeTab);

  const filtered = useMemo(() => {
    let result = entries.filter(e => e.trend.tags?.includes(activeTab));
    if (position !== 'All') result = result.filter(e => e.trend.position === position);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e => e.trend.player_name.toLowerCase().includes(q));
    }
    const sortKey = activeTabMeta?.metric === 'fpoe'
      ? (e) => Math.abs(e.trend.fpoe_z ?? 0)
      : (e) => Math.abs(e.trend.momentum ?? 0);
    return result.sort((a, b) => sortKey(b) - sortKey(a));
  }, [entries, activeTab, position, search, activeTabMeta]);

  function openPlayer(entry) {
    const { player, trend } = entry;
    if (!player) return; // no live-roster match (e.g. deep bench) — nothing to open a breakdown on
    const settings = getLeagueSettings();
    const topProp = [...(player.props ?? [])].sort(
      (a, b) => (b.confidence_score ?? 0) - (a.confidence_score ?? 0),
    )[0];
    if (!topProp) return;
    const score = fantasyScore(player, topProp, settings);
    if (!score) return;
    setBreakdownEntry({ player, prop: topProp, score, trend });
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Activity className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Player Trend Engine</h1>
          <p className="text-sm text-muted-foreground">
            {trendData?.data_loaded && trendData.data_as_of
              ? `Data as of ${new Date(trendData.data_as_of).toLocaleString()} · real usage & production trend, not gut feel`
              : 'Real usage & production trend — snap %, target %, carry %, and actual-vs-expected points'}
          </p>
        </div>
      </div>

      {/* Tag tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-3.5 py-2 rounded-xl border text-[12px] font-semibold flex-shrink-0 transition-all flex items-center gap-1.5',
              activeTab === tab.key
                ? 'bg-primary/20 border-primary/40 text-primary'
                : 'border-white/8 text-muted-foreground hover:border-white/18 hover:text-foreground',
            )}
          >
            {tab.icon && <tab.icon className="w-3.5 h-3.5" />}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'buy_low' || activeTab === 'sell_high' ? (
        <p className="text-[11px] text-muted-foreground/60 -mt-2">
          Based on real targets/carries priced at this season's league-average conversion rate (RB/WR/TE only) vs. actual points —
          not yet weighted for market/trade value.
        </p>
      ) : null}

      {!trendData?.data_loaded && !loading ? (
        <div className="text-center text-muted-foreground text-sm py-16 rounded-2xl border border-dashed border-white/10">
          Could not reach the trend engine — check your connection and reload.
        </div>
      ) : (
        <>
          {/* Position filter + search */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1">
              {POSITIONS.map(pos => (
                <button
                  key={pos}
                  onClick={() => setPosition(pos)}
                  className={cn(
                    'px-3 py-1 text-[11px] font-semibold rounded-lg transition-colors',
                    position === pos
                      ? 'bg-primary/20 text-primary border border-primary/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent',
                  )}
                >
                  {pos}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search player..."
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            <span className="text-[11px] text-muted-foreground/60">{filtered.length} player{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-white/6 bg-[hsl(222,47%,9%)] p-4 h-20 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(entry => (
                <TrendPlayerRow
                  key={entry.trend.player_id}
                  entry={entry}
                  highlightMetric={activeTabMeta?.metric}
                  onOpen={() => openPlayer(entry)}
                />
              ))}
              {filtered.length === 0 && (
                <div className="text-center text-muted-foreground text-sm py-12">
                  No {activeTabMeta?.label.toLowerCase()} players{position !== 'All' ? ` at ${position}` : ''} right now.
                </div>
              )}
            </div>
          )}
        </>
      )}

      <PlayerBreakdownModal entry={breakdownEntry} onClose={() => setBreakdownEntry(null)} />
    </div>
  );
}
