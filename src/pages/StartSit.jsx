import React, { useState, useMemo } from 'react';
import { Trophy, Users, TrendingUp, ChevronDown, X, Search, Star, Plus } from 'lucide-react';
import { fantasyScore, compareStartSit, rankPlayers } from '@/lib/fantasyScoring';
import { mockPlayers, getAllProps, isDemoMode } from '@/lib/mockData';
import { getTeamLogoUrl } from '@/lib/teamLogos';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/common/TeamLogo';

// ─── Constants ───────────────────────────────────────────────────────────────

const PROP_LABELS = {
  passing_yards:   'Pass Yds',
  passing_tds:     'Pass TDs',
  rushing_yards:   'Rush Yds',
  rushing_tds:     'Rush TDs',
  receiving_yards: 'Rec Yds',
  receptions:      'Rec',
  receiving_tds:   'Rec TDs',
  fantasy_points:  'Fantasy Pts',
};

const POSITIONS = ['all', 'QB', 'RB', 'WR', 'TE'];

// ─── Sub-components ──────────────────────────────────────────────────────────

function VerdictChip({ verdict }) {
  return (
    <span className={cn(
      'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border',
      verdict === 'START' && 'bg-primary/20 border-primary/40 text-primary',
      verdict === 'FLEX'  && 'bg-amber-500/20 border-amber-500/40 text-amber-400',
      verdict === 'SIT'   && 'bg-red-500/20 border-red-500/40 text-red-400',
    )}>
      {verdict}
    </span>
  );
}

function GradeBadge({ grade }) {
  const isA = grade?.startsWith('A');
  const isB = grade?.startsWith('B');
  return (
    <span className={cn(
      'text-xs font-bold px-2 py-0.5 rounded-md border',
      isA && 'bg-primary/15 border-primary/30 text-primary',
      isB && 'bg-amber-500/15 border-amber-500/30 text-amber-400',
      !isA && !isB && 'bg-red-500/15 border-red-500/30 text-red-400',
    )}>
      {grade}
    </span>
  );
}

function ScoreBar({ total }) {
  return (
    <div className="h-1.5 rounded-full bg-white/5">
      <div
        style={{ width: `${Math.min(100, total)}%` }}
        className={cn(
          'h-full rounded-full transition-all duration-500',
          total >= 72 ? 'bg-primary' : total >= 52 ? 'bg-amber-500' : 'bg-red-500',
        )}
      />
    </div>
  );
}

function PlayerRankCard({ rank, player, prop, score, onCompare }) {
  const propLabel = PROP_LABELS[prop.prop_type] ?? prop.prop_type;

  return (
    <div className="rounded-2xl border border-white/6 bg-[hsl(222,47%,9%)] p-4 flex items-center gap-4 hover:border-white/12 transition-colors">
      {/* Rank */}
      <div className="w-8 text-center flex-shrink-0">
        <span className={cn(
          'text-sm font-bold',
          rank === 1 ? 'text-yellow-400' : rank <= 3 ? 'text-primary' : 'text-muted-foreground',
        )}>
          #{rank}
        </span>
      </div>

      {/* Logo */}
      <TeamLogo team={player.team} className="w-9 h-9" />

      {/* Player info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground truncate">{player.player_name}</span>
          <span className="text-[10px] bg-white/8 text-muted-foreground px-1.5 py-0.5 rounded font-medium">
            {player.position}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {player.team} vs {player.opponent} · {propLabel} {prop.line}
        </div>
        {/* Score bar */}
        <div className="mt-2">
          <ScoreBar total={score.total} />
        </div>
        {/* Ceiling / floor */}
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-[10px] text-muted-foreground">
            Floor <span className="text-foreground font-medium">{score.floor}</span>
          </span>
          <span className="text-[10px] text-muted-foreground">
            Ceiling <span className="text-foreground font-medium">{score.ceiling}</span>
          </span>
          <span className="text-[10px] text-muted-foreground">
            Proj <span className="text-primary font-medium">{score.projection}</span>
          </span>
        </div>
      </div>

      {/* Score + grade + verdict */}
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <div className="text-lg font-bold text-foreground">{score.total}</div>
        <GradeBadge grade={score.grade} />
        <VerdictChip verdict={score.verdict} />
      </div>

      {/* Compare button */}
      <button
        onClick={() => onCompare(player, prop)}
        className="flex-shrink-0 text-[11px] text-muted-foreground hover:text-primary border border-white/10 hover:border-primary/40 rounded-xl px-2.5 py-1.5 transition-colors"
      >
        Compare
      </button>
    </div>
  );
}

// ─── Comparison slot ─────────────────────────────────────────────────────────

function PlayerSlot({ label, player, prop, score, availableProps, onChangeProp, onClear, onPick }) {
  if (!player) {
    return (
      <button
        onClick={onPick}
        className="flex-1 rounded-2xl border-2 border-dashed border-white/12 bg-[hsl(222,47%,9%)] p-6 flex flex-col items-center justify-center gap-2 hover:border-primary/40 hover:bg-primary/5 transition-all min-h-[140px]"
      >
        <Plus className="w-6 h-6 text-muted-foreground" />
        <span className="text-sm text-muted-foreground font-medium">+ Pick a Player</span>
        <span className="text-xs text-muted-foreground/60">{label}</span>
      </button>
    );
  }

  return (
    <div className="flex-1 rounded-2xl border border-white/6 bg-[hsl(222,47%,9%)] p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">{label}</span>
        <button onClick={onClear} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Player */}
      <div className="flex items-center gap-3">
        <TeamLogo team={player.team} className="w-10 h-10" />
        <div>
          <div className="font-semibold text-foreground text-sm">{player.player_name}</div>
          <div className="text-[11px] text-muted-foreground">{player.team} · {player.position}</div>
        </div>
      </div>

      {/* Prop selector */}
      {availableProps?.length > 1 && (
        <div className="relative">
          <select
            value={prop?.prop_type ?? ''}
            onChange={e => {
              const selected = availableProps.find(p => p.prop_type === e.target.value);
              if (selected) onChangeProp(selected);
            }}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-foreground appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40"
          >
            {availableProps.map(p => (
              <option key={p.prop_type} value={p.prop_type}>
                {PROP_LABELS[p.prop_type] ?? p.prop_type} {p.line}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
        </div>
      )}

      {/* Score + verdict */}
      {score && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-foreground">{score.total}</span>
            <GradeBadge grade={score.grade} />
          </div>
          <VerdictChip verdict={score.verdict} />
        </div>
      )}

      {/* Mini score bar */}
      {score && <ScoreBar total={score.total} />}
    </div>
  );
}

// ─── Comparison result ───────────────────────────────────────────────────────

function ComparisonResult({ result, playerA, playerB }) {
  if (!result) return null;

  const { winner, dimensions, reasoning, confidence, scoreA, scoreB } = result;
  const winnerName = winner === 'A' ? playerA?.player_name : winner === 'B' ? playerB?.player_name : null;

  return (
    <div className="rounded-2xl border border-white/6 bg-[hsl(222,47%,9%)] p-4 space-y-4">
      {/* Winner banner */}
      <div className={cn(
        'rounded-xl p-3 flex items-center justify-between',
        winner === 'toss-up' ? 'bg-white/5' : 'bg-primary/10 border border-primary/20',
      )}>
        <div>
          {winnerName ? (
            <>
              <div className="text-xs text-muted-foreground mb-0.5">Recommendation</div>
              <div className="font-bold text-foreground">Start {winnerName}</div>
            </>
          ) : (
            <div className="font-bold text-muted-foreground">Toss-Up Decision</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border',
            confidence === 'High'   && 'bg-primary/20 border-primary/40 text-primary',
            confidence === 'Medium' && 'bg-amber-500/20 border-amber-500/40 text-amber-400',
            confidence === 'Low'    && 'bg-red-500/20 border-red-500/40 text-red-400',
          )}>
            {confidence} Confidence
          </span>
        </div>
      </div>

      {/* Dimension table */}
      <div className="space-y-1">
        <div className="flex items-center text-[10px] text-muted-foreground uppercase tracking-wider mb-2 px-1">
          <div className="w-1/4 text-left">{playerA?.player_name?.split(' ')[1]}</div>
          <div className="flex-1 text-center">Category</div>
          <div className="w-1/4 text-right">{playerB?.player_name?.split(' ')[1]}</div>
        </div>

        {dimensions.map((dim) => (
          <div key={dim.label} className="flex items-center py-1.5 px-1 rounded-lg hover:bg-white/3 transition-colors">
            {/* Value A */}
            <div className={cn(
              'w-1/4 text-left text-xs font-medium truncate',
              dim.winner === 'A' ? 'text-primary' : dim.winner === 'tie' ? 'text-muted-foreground' : 'text-red-400',
            )}>
              {typeof dim.valueA === 'number' ? dim.valueA : String(dim.valueA ?? '—')}
            </div>

            {/* Label */}
            <div className="flex-1 text-center text-[11px] text-muted-foreground">{dim.label}</div>

            {/* Value B */}
            <div className={cn(
              'w-1/4 text-right text-xs font-medium truncate',
              dim.winner === 'B' ? 'text-primary' : dim.winner === 'tie' ? 'text-muted-foreground' : 'text-red-400',
            )}>
              {typeof dim.valueB === 'number' ? dim.valueB : String(dim.valueB ?? '—')}
            </div>
          </div>
        ))}
      </div>

      {/* Reasoning */}
      <div className="border-t border-white/6 pt-3 space-y-1.5">
        {reasoning.map((line, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="text-primary mt-0.5">•</span>
            <span>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Player Picker Modal ─────────────────────────────────────────────────────

function PlayerPickerModal({ onSelect, onClose, excludePlayerId }) {
  const [search, setSearch]       = useState('');
  const [posFilter, setPosFilter] = useState('all');

  const players = useMemo(() => {
    return mockPlayers
      .filter(p => p.id !== excludePlayerId)
      .filter(p => posFilter === 'all' || p.position === posFilter)
      .filter(p =>
        !search.trim() ||
        p.player_name.toLowerCase().includes(search.toLowerCase()) ||
        p.team.toLowerCase().includes(search.toLowerCase())
      );
  }, [search, posFilter, excludePlayerId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[hsl(222,47%,7%)] shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/6 flex-shrink-0">
          <h3 className="font-semibold text-foreground">Pick a Player</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-white/6 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search player or team..."
              autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>
        </div>

        {/* Position tabs */}
        <div className="flex gap-1 p-3 border-b border-white/6 flex-shrink-0">
          {POSITIONS.map(pos => (
            <button
              key={pos}
              onClick={() => setPosFilter(pos)}
              className={cn(
                'flex-1 py-1 text-[11px] font-semibold rounded-lg transition-colors capitalize',
                posFilter === pos
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
              )}
            >
              {pos === 'all' ? 'All' : pos}
            </button>
          ))}
        </div>

        {/* Player list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {players.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8">No players found</div>
          )}
          {players.map(player => {
            const topProp = [...(player.props ?? [])].sort(
              (a, b) => (b.confidence_score ?? 0) - (a.confidence_score ?? 0)
            )[0];
            const sc = topProp ? fantasyScore(player, topProp) : null;

            return (
              <button
                key={player.id}
                onClick={() => onSelect(player)}
                className="w-full flex items-center gap-3 rounded-xl p-2.5 hover:bg-white/5 transition-colors text-left"
              >
                <TeamLogo team={player.team} className="w-8 h-8 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground truncate">{player.player_name}</span>
                    <span className="text-[10px] bg-white/8 text-muted-foreground px-1.5 py-0.5 rounded font-medium">
                      {player.position}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {player.team} · {topProp ? `${PROP_LABELS[topProp.prop_type] ?? topProp.prop_type} ${topProp.line}` : ''}
                  </div>
                </div>
                {sc && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-sm font-bold text-foreground">{sc.total}</span>
                    <GradeBadge grade={sc.grade} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function StartSit() {
  const [position, setPosition]               = useState('all');
  const [compareA, setCompareA]               = useState(null);
  const [compareB, setCompareB]               = useState(null);
  const [propA, setPropA]                     = useState(null);
  const [propB, setPropB]                     = useState(null);
  const [showComparePicker, setShowComparePicker] = useState(null); // 'A' | 'B' | null
  const [searchQuery, setSearchQuery]         = useState('');

  // Rankings
  const rankings = useMemo(() => rankPlayers(mockPlayers, position), [position]);

  // Filtered rankings by search
  const filteredRankings = useMemo(() => {
    if (!searchQuery.trim()) return rankings;
    const q = searchQuery.toLowerCase();
    return rankings.filter(({ player }) =>
      player.player_name.toLowerCase().includes(q) ||
      player.team.toLowerCase().includes(q)
    );
  }, [rankings, searchQuery]);

  // Scores for comparison players
  const scoreA = useMemo(() => (compareA && propA ? fantasyScore(compareA, propA) : null), [compareA, propA]);
  const scoreB = useMemo(() => (compareB && propB ? fantasyScore(compareB, propB) : null), [compareB, propB]);

  // Comparison result
  const compResult = useMemo(() => {
    if (!compareA || !propA || !compareB || !propB) return null;
    return compareStartSit(compareA, propA, compareB, propB);
  }, [compareA, propA, compareB, propB]);

  // Handlers
  function handlePickerSelect(player) {
    const topProp = [...(player.props ?? [])].sort(
      (a, b) => (b.confidence_score ?? 0) - (a.confidence_score ?? 0)
    )[0];

    if (showComparePicker === 'A') {
      setCompareA(player);
      setPropA(topProp ?? null);
    } else {
      setCompareB(player);
      setPropB(topProp ?? null);
    }
    setShowComparePicker(null);
  }

  function handleCompareFromRanking(player, prop) {
    if (!compareA) {
      setCompareA(player);
      setPropA(prop);
    } else if (!compareB) {
      setCompareB(player);
      setPropB(prop);
    } else {
      // Replace A
      setCompareA(player);
      setPropA(prop);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-8">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Trophy className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Fantasy Start/Sit</h1>
          <p className="text-sm text-muted-foreground">AI-powered start/sit decisions for your lineup</p>
        </div>
      </div>

      {/* ── Head-to-Head Panel ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          Head-to-Head Comparison
        </h2>

        {/* Two slots + VS */}
        <div className="flex gap-3 items-stretch">
          <PlayerSlot
            label="Player A"
            player={compareA}
            prop={propA}
            score={scoreA}
            availableProps={compareA?.props}
            onChangeProp={setPropA}
            onClear={() => { setCompareA(null); setPropA(null); }}
            onPick={() => setShowComparePicker('A')}
          />

          <div className="flex items-center justify-center w-10 flex-shrink-0">
            <span className="text-xs font-bold text-muted-foreground bg-white/5 rounded-full w-8 h-8 flex items-center justify-center border border-white/8">
              VS
            </span>
          </div>

          <PlayerSlot
            label="Player B"
            player={compareB}
            prop={propB}
            score={scoreB}
            availableProps={compareB?.props}
            onChangeProp={setPropB}
            onClear={() => { setCompareB(null); setPropB(null); }}
            onPick={() => setShowComparePicker('B')}
          />
        </div>

        {/* Comparison result */}
        {compResult && (
          <ComparisonResult
            result={compResult}
            playerA={compareA}
            playerB={compareB}
          />
        )}

        {/* Prompt when one slot is empty */}
        {(compareA || compareB) && (!compareA || !compareB) && (
          <div className="text-center text-xs text-muted-foreground py-2">
            Pick a second player to see the full comparison
          </div>
        )}
      </section>

      {/* ── Rankings Section ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Fantasy Rankings
          </h2>

          {/* Position filter tabs */}
          <div className="flex gap-1">
            {POSITIONS.map(pos => (
              <button
                key={pos}
                onClick={() => setPosition(pos)}
                className={cn(
                  'px-3 py-1 text-[11px] font-semibold rounded-lg transition-colors capitalize',
                  position === pos
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5 border border-transparent',
                )}
              >
                {pos === 'all' ? 'All' : pos}
              </button>
            ))}
          </div>
        </div>

        {/* Search within rankings */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filter rankings by player or team..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>

        {/* Stats bar */}
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>
            <span className="text-primary font-medium">
              {filteredRankings.filter(r => r.score?.verdict === 'START').length}
            </span> Starts
          </span>
          <span>
            <span className="text-amber-400 font-medium">
              {filteredRankings.filter(r => r.score?.verdict === 'FLEX').length}
            </span> Flex
          </span>
          <span>
            <span className="text-red-400 font-medium">
              {filteredRankings.filter(r => r.score?.verdict === 'SIT').length}
            </span> Sits
          </span>
          <span className="text-muted-foreground/50">· {filteredRankings.length} players</span>
        </div>

        {/* Ranked list */}
        <div className="space-y-2">
          {filteredRankings.map(({ player, prop, score }, idx) => (
            <PlayerRankCard
              key={player.id}
              rank={idx + 1}
              player={player}
              prop={prop}
              score={score}
              onCompare={handleCompareFromRanking}
            />
          ))}

          {filteredRankings.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-12">
              No players found for this position
            </div>
          )}
        </div>
      </section>

      {/* ── Player Picker Modal ── */}
      {showComparePicker && (
        <PlayerPickerModal
          onSelect={handlePickerSelect}
          onClose={() => setShowComparePicker(null)}
          excludePlayerId={showComparePicker === 'A' ? compareB?.id : compareA?.id}
        />
      )}
    </div>
  );
}
