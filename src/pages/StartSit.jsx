import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Trophy, TrendingUp, Users, ChevronDown, X, Search, Plus,
  Settings, Shield, Zap, AlertTriangle, Link2, Loader2, RefreshCw, Wifi, GitCompare,
} from 'lucide-react';
import { fantasyScore, compareStartSit, rankPlayers, rankWaiverWire, computeConfidence } from '@/lib/fantasyScoring';
import { mockPlayers, isDemoMode } from '@/lib/mockData';
import { getLeagueSettings, saveLeagueSettings, SCORING_FORMATS } from '@/lib/leagueSettings';
import { fetchLivePlayers, clearLiveCache } from '@/lib/nflLiveData';
import { fetchTrendScores, indexTrendByPlayerId, TAG_META } from '@/lib/trendEngine';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/common/TeamLogo';
import PlayerAvatar from '@/components/common/PlayerAvatar';
import PlayerBreakdownModal from '@/components/PlayerBreakdownModal';
import LeagueConnectModal from '@/components/LeagueConnectModal';
import InjuryTag from '@/components/common/InjuryTag';
import RosCard from '@/components/startsit/RosCard';
import MyTeamPanel from '@/components/myteam/MyTeamPanel';
import ScheduleChartModal from '@/components/startsit/ScheduleChartModal';
import { fetchOutlook, attachOutlookContext } from '@/lib/fantasyOutlook';
import { buildRosRankings } from '@/lib/rosRankings';
import PageTabs, { useTabParam } from '@/components/common/PageTabs';
import {
  getLeagueConnection, refreshLeagueConnection, isConnectionStale, getMyTeam, getRosteredIds,
} from '@/lib/leagueConnect';

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

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'D/ST'];

// ─── Shared UI primitives ─────────────────────────────────────────────────────

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

const TAG_CHIP_CLS = {
  emerald: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
  red:     'bg-red-500/15 border-red-500/30 text-red-400',
  sky:     'bg-sky-500/15 border-sky-500/30 text-sky-400',
  amber:   'bg-amber-500/15 border-amber-500/30 text-amber-400',
};

// Trend Engine tag chips — a player can carry a role tag (Stock Up/Down) and a
// value tag (Buy Low/Sell High) at once. Greyed out below ~40 confidence per
// spec ("show low-confidence tags greyed out").
function TrendTagChip({ trend }) {
  if (!trend?.tags?.length) return null;
  const lowConfidence = (trend.confidence ?? 0) < 40;
  return (
    <>
      {trend.tags.map(tag => {
        const meta = TAG_META[tag];
        if (!meta) return null;
        return (
          <span
            key={tag}
            title={`${meta.label} · ${trend.confidence}% confidence`}
            className={cn(
              'text-[9px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-wide flex items-center gap-0.5',
              TAG_CHIP_CLS[meta.color],
              lowConfidence && 'opacity-50',
            )}
          >
            {meta.arrow} {meta.short}
          </span>
        );
      })}
    </>
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

function GameChip({ game, selected, onSelect }) {
  const [t1, t2] = game.teams;
  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold flex-shrink-0 transition-all',
        selected
          ? 'bg-primary/20 border-primary/40 text-primary'
          : 'border-white/8 bg-white/3 text-muted-foreground hover:border-white/18 hover:text-foreground',
      )}
    >
      <TeamLogo team={t1} className="w-4 h-4" />
      <span>{t1}</span>
      <span className="text-muted-foreground/40 font-normal">vs</span>
      <TeamLogo team={t2} className="w-4 h-4" />
      <span>{t2}</span>
    </button>
  );
}

// ─── Settings Modal ───────────────────────────────────────────────────────────

function SettingsModal({ settings, onSave, onClose }) {
  const [local, setLocal] = useState({ ...settings });

  function set(key, val) {
    setLocal(prev => {
      const next = { ...prev, [key]: val };
      if (key === 'scoring') {
        const fmt = SCORING_FORMATS.find(f => f.value === val);
        if (fmt) next.recPts = fmt.recPts;
      }
      return next;
    });
  }

  function ToggleGroup({ label, options, value, onChange }) {
    return (
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="flex gap-1 bg-white/4 rounded-xl p-1">
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={cn(
                'flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-all',
                value === opt.value
                  ? 'bg-primary/25 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function BoolToggle({ label, description, value, onChange }) {
    return (
      <div className="flex items-center justify-between py-2">
        <div>
          <div className="text-sm font-medium text-foreground">{label}</div>
          {description && <div className="text-[11px] text-muted-foreground">{description}</div>}
        </div>
        <button
          onClick={() => onChange(!value)}
          className={cn(
            'relative w-11 h-6 rounded-full transition-colors flex-shrink-0',
            value ? 'bg-primary' : 'bg-white/15',
          )}
        >
          <span className={cn(
            'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all',
            value ? 'left-6' : 'left-1',
          )} />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[hsl(218,58%,6%)] shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-white/6 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground">League Settings</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <ToggleGroup
            label="Scoring Format"
            options={SCORING_FORMATS.map(f => ({ value: f.value, label: f.label }))}
            value={local.scoring}
            onChange={v => set('scoring', v)}
          />

          <ToggleGroup
            label="QB Pass TD Points"
            options={[{ value: 4, label: '4 pts' }, { value: 6, label: '6 pts' }]}
            value={local.passTDPts}
            onChange={v => set('passTDPts', v)}
          />

          <ToggleGroup
            label="League Size"
            options={[8, 10, 12, 14].map(n => ({ value: n, label: String(n) }))}
            value={local.leagueSize}
            onChange={v => set('leagueSize', v)}
          />

          <ToggleGroup
            label="Flex Slot"
            options={[
              { value: 'RB/WR',       label: 'RB/WR' },
              { value: 'RB/WR/TE',    label: 'RB/WR/TE' },
              { value: 'RB/WR/TE/QB', label: '+QB' },
            ]}
            value={local.flexType}
            onChange={v => set('flexType', v)}
          />

          <div className="space-y-0 pt-1 border-t border-white/6">
            <BoolToggle
              label="TE Premium"
              description="+0.5 PPR for tight ends"
              value={local.tePremium}
              onChange={v => set('tePremium', v)}
            />
            <BoolToggle
              label="Superflex"
              description="QB eligible in flex spot"
              value={local.superflex}
              onChange={v => set('superflex', v)}
            />
          </div>

          <div className="rounded-xl bg-primary/8 border border-primary/15 p-3 text-[11px] text-muted-foreground space-y-0.5">
            <div><span className="text-primary font-medium">Scoring:</span> {SCORING_FORMATS.find(f => f.value === local.scoring)?.description}</div>
            <div><span className="text-primary font-medium">Pass TD:</span> {local.passTDPts} pts · <span className="text-primary font-medium">League:</span> {local.leagueSize} teams</div>
            {local.tePremium && <div className="text-amber-400">TE Premium active (+0.5 rec pts for TEs)</div>}
            {local.superflex && <div className="text-amber-400">Superflex active — QB value elevated</div>}
          </div>
        </div>

        <div className="p-4 border-t border-white/6 flex gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-white/10 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { onSave(local); onClose(); }}
            className="flex-1 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Top Matchups Row ─────────────────────────────────────────────────────────

function TopMatchupsRow({ rankings, onOpen }) {
  const picks = useMemo(() =>
    rankings
      .filter(({ player, score }) =>
        (player.def_rank_vs_pos ?? 0) >= 21 &&
        score.verdict !== 'SIT' &&
        (player.depth_chart_order ?? 99) <= 1,
      )
      .sort((a, b) =>
        (b.player.def_rank_vs_pos ?? 0) - (a.player.def_rank_vs_pos ?? 0) ||
        b.score.projection - a.score.projection,
      )
      .slice(0, 7),
  [rankings]);

  if (picks.length < 2) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Shield className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-xs font-semibold text-foreground">Top Matchups This Week</span>
        <span className="text-[10px] text-muted-foreground/60">starters vs soft defenses</span>
      </div>
      <div
        className="flex gap-2 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {picks.map(({ player, prop, score }) => {
          const mg      = matchupGrade(player.def_rank_vs_pos);
          const reasons = getMatchupReasons(player, prop);
          return (
            <button
              key={player.id}
              onClick={() => onOpen({ player, prop, score })}
              className="flex-shrink-0 w-[148px] rounded-xl border border-white/8 bg-[hsl(222,47%,9%)] hover:border-primary/30 hover:bg-white/4 transition-all p-3 text-left"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <TeamLogo team={player.team} className="w-6 h-6 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-foreground truncate">
                      {player.player_name.split(' ').slice(-1)[0]}
                    </div>
                    <div className="text-[9px] text-muted-foreground">{player.position}</div>
                  </div>
                </div>
                {mg && <span className={cn('text-base font-black flex-shrink-0', mg.color)}>{mg.letter}</span>}
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-muted-foreground">vs {player.opponent} #{player.def_rank_vs_pos}</span>
                <VerdictChip verdict={score.verdict} />
              </div>
              {reasons.length > 0 && (
                <div className="text-[9px] text-muted-foreground/70 leading-tight mt-1">
                  {reasons.join(' · ')}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Player Rank Card ─────────────────────────────────────────────────────────

// A-F matchup grade based on defensive rank vs this position
// rank 25-32 = soft = A, rank 1-8 = elite = F
function matchupGrade(rank) {
  if (rank == null || rank === 0) return null;
  if (rank >= 25) return { letter: 'A', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' };
  if (rank >= 17) return { letter: 'B', color: 'text-sky-400',     bg: 'bg-sky-500/15 border-sky-500/30'       };
  if (rank >= 11) return { letter: 'C', color: 'text-amber-400',   bg: 'bg-amber-500/15 border-amber-500/30'   };
  if (rank >= 5)  return { letter: 'D', color: 'text-orange-400',  bg: 'bg-orange-500/15 border-orange-500/30' };
  return              { letter: 'F', color: 'text-red-400',     bg: 'bg-red-500/15 border-red-500/30'       };
}

// Up to 2 short reasons explaining the matchup / trend signal
function getMatchupReasons(player, prop) {
  const reasons = [];
  const rank = player.def_rank_vs_pos ?? 0;
  if (rank >= 25)                  reasons.push(`#${rank}/32 vs ${player.position}s (soft)`);
  else if (rank > 0 && rank <= 8)  reasons.push(`#${rank}/32 vs ${player.position}s (tough)`);
  if (prop) {
    const l5  = prop.avg_last_5  ?? null;
    const l10 = prop.avg_last_10 ?? null;
    if (l5 != null && l10 != null && l10 > 0) {
      if (l5 > l10 * 1.10)      reasons.push('L5 trending up');
      else if (l5 < l10 * 0.88) reasons.push('L5 trending down');
    }
    if ((prop.hit_rate_last_10 ?? 0) >= 65) reasons.push(`${prop.hit_rate_last_10}% L10 hit`);
  }
  return reasons.slice(0, 2);
}

// Returns true when a player shows breakout signals:
// starter + L5 trending 12%+ above L10 + (soft matchup OR hot recent hit rate)
function isBreakout(player, prop) {
  if (!prop || (player.depth_chart_order ?? 99) > 1) return false;
  const l5  = prop.avg_last_5  ?? prop.avg_last_10 ?? null;
  const l10 = prop.avg_last_10 ?? null;
  if (l5 == null || l10 == null || l10 === 0) return false;
  const trendingUp   = l5 > l10 * 1.12;
  const softMatchup  = (player.def_rank_vs_pos ?? 0) >= 25;
  const hotStreak    = (prop.hit_rate_last_10 ?? 0) >= 65;
  return trendingUp && (softMatchup || hotStreak);
}

function ConfidenceChip({ score }) {
  const conf = computeConfidence(score);
  if (!conf) return null;
  return (
    <span className={cn(
      'text-[9px] font-bold px-1.5 py-0.5 rounded-full border tracking-wider',
      conf === 'high'   ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' :
      conf === 'medium' ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' :
                          'bg-red-500/15 border-red-500/30 text-red-400',
    )}>
      {conf === 'high' ? 'HIGH' : conf === 'medium' ? 'MED' : 'LOW'} CONF
    </span>
  );
}

// Floor / Proj / Ceiling — label over value so it never wraps mid-number on phones.
function FpStats({ score }) {
  return (
    <div className="flex items-center gap-4">
      {[
        { label: 'Floor', value: score.floor,      cls: 'text-foreground' },
        { label: 'Proj',  value: score.projection, cls: 'text-primary' },
        { label: 'Ceil',  value: score.ceiling,    cls: 'text-foreground' },
      ].map(s => (
        <div key={s.label} className="leading-tight">
          <div className="text-[10px] text-muted-foreground">{s.label}</div>
          <div className={cn('text-sm font-semibold tabular-nums', s.cls)}>{s.value}</div>
        </div>
      ))}
      <span className="text-[10px] text-muted-foreground self-end mb-0.5">FP</span>
    </div>
  );
}

function PlayerRankCard({ rank, posRank, player, prop, score, trend, onCompare, onOpen, isCompared }) {
  const breakout  = isBreakout(player, prop);
  const mg        = matchupGrade(player.def_rank_vs_pos);
  const reasons   = getMatchupReasons(player, prop);
  // First injury line that affects this player (own status, next-man-up, QB out…)
  const injuryNote = player.injury_reasons?.[0] ?? null;

  return (
    <div
      onClick={onOpen}
      className={cn(
        'rounded-2xl border p-3.5 sm:p-4 space-y-3 hover:bg-white/2 transition-colors cursor-pointer',
        breakout
          ? 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50'
          : 'border-white/6 bg-[hsl(222,47%,9%)] hover:border-white/18',
      )}
    >
      {/* Row 1 — who + verdict */}
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
            {player.position === 'DEF' ? 'D/ST' : player.position}{posRank != null ? ` #${posRank}` : ''} · {player.team} {prop?.is_home ? 'vs' : '@'} {player.opponent}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <VerdictChip verdict={score.verdict} />
          <div className="flex items-center gap-1.5">
            <span className="text-base font-bold text-foreground tabular-nums">{score.total}</span>
            <GradeBadge grade={score.grade} />
          </div>
        </div>
      </div>

      {/* Row 2 — why (only when there's something to say) */}
      {(mg || breakout || trend || reasons.length > 0 || injuryNote) && (
        <div className="flex gap-1.5 flex-wrap">
          {injuryNote && (
            <span className="text-[10px] text-amber-300 bg-amber-500/8 border border-amber-500/20 px-1.5 py-0.5 rounded">
              {injuryNote}
            </span>
          )}
          {mg && (
            <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-md border', mg.bg, mg.color)}>
              Matchup {mg.letter}
            </span>
          )}
          {breakout && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-wide flex items-center gap-0.5">
              <TrendingUp className="w-2.5 h-2.5" /> Breakout
            </span>
          )}
          <TrendTagChip trend={trend} />
          {reasons.map((r, i) => (
            <span key={i} className="text-[10px] text-muted-foreground bg-white/4 border border-white/8 px-1.5 py-0.5 rounded">
              {r}
            </span>
          ))}
        </div>
      )}

      {/* Row 3 — numbers + actions */}
      <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-white/5">
        <FpStats score={score} />
        <div className="flex items-center gap-2 flex-shrink-0">
          <ConfidenceChip score={score} />
          <button
            onClick={e => { e.stopPropagation(); onCompare(player, prop); }}
            title={isCompared ? 'In comparison' : 'Add to comparison'}
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-xl border transition-colors',
              isCompared
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-white/10 text-muted-foreground hover:text-primary hover:border-primary/40',
            )}
          >
            <GitCompare className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Waiver Wire Card ─────────────────────────────────────────────────────────

function WaiverCard({ rank, player, prop, score, waiverReason, injuryUpside, isHandcuff, waiverPriority }) {

  const priorityStyle = {
    high:   'bg-primary/20 border-primary/40 text-primary',
    medium: 'bg-amber-500/20 border-amber-500/40 text-amber-400',
    low:    'bg-white/8 border-white/15 text-muted-foreground',
  }[waiverPriority] ?? 'bg-white/8 border-white/15 text-muted-foreground';

  return (
    <div className="rounded-2xl border border-white/6 bg-[hsl(222,47%,9%)] p-3.5 sm:p-4 space-y-3 hover:border-white/12 transition-colors">
      <div className="flex items-center gap-3">
        <span className={cn(
          'w-7 text-sm font-bold tabular-nums flex-shrink-0',
          rank === 1 ? 'text-yellow-400' : rank <= 3 ? 'text-primary' : 'text-muted-foreground',
        )}>
          #{rank}
        </span>

        <PlayerAvatar photo={player.photo_url} team={player.team} className="w-10 h-10 flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[15px] font-semibold text-foreground truncate">{player.player_name}</span>
            <InjuryTag player={player} />
            {isHandcuff && (
              <span className="text-[10px] bg-blue-500/15 border border-blue-500/30 text-blue-400 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5">
                <Link2 className="w-2.5 h-2.5" />
                Handcuff
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {player.position} · {player.team} {prop?.is_home ? 'vs' : '@'} {player.opponent}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border', priorityStyle)}>
            {waiverPriority === 'high' ? 'HIGH' : waiverPriority === 'medium' ? 'MED' : 'LOW'} PRIORITY
          </span>
          {score && (
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold text-foreground tabular-nums">{score.total}</span>
              <GradeBadge grade={score.grade} />
            </div>
          )}
        </div>
      </div>

      {score && (
        <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-white/5">
          <FpStats score={score} />
          {score.waiverBoost > 0 && (
            <span className="text-[11px] text-muted-foreground">
              Boost <span className="text-primary font-semibold">+{score.waiverBoost}</span>
            </span>
          )}
        </div>
      )}

      {waiverReason && (
        <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
          <Zap className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
          <span>{waiverReason}</span>
        </div>
      )}

      {injuryUpside && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
          <span className="text-[11px] text-amber-300">{injuryUpside}</span>
        </div>
      )}
    </div>
  );
}

// ─── Comparison slot ──────────────────────────────────────────────────────────

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
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">{label}</span>
        <button onClick={onClear} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <PlayerAvatar photo={player.photo_url} team={player.team} className="w-10 h-10" />
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-foreground text-sm">{player.player_name}</span>
            <InjuryTag player={player} />
          </div>
          <div className="text-[11px] text-muted-foreground">{player.team} · {player.position === 'DEF' ? 'D/ST' : player.position}</div>
        </div>
      </div>

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

      {score && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-foreground">{score.total}</span>
            <GradeBadge grade={score.grade} />
          </div>
          <VerdictChip verdict={score.verdict} />
        </div>
      )}

      {score && <ScoreBar total={score.total} />}
    </div>
  );
}

// ─── Comparison result ────────────────────────────────────────────────────────

function ComparisonResult({ result, playerA, playerB }) {
  if (!result) return null;
  const { winner, dimensions, reasoning, confidence, edgeLabel } = result;
  const winnerName = winner === 'A' ? playerA?.player_name : playerB?.player_name;

  return (
    <div className="rounded-2xl border border-white/6 bg-[hsl(222,47%,9%)] p-4 space-y-4">
      <div className="rounded-xl p-3 flex items-center justify-between bg-primary/10 border border-primary/20">
        <div>
          <div className="text-xs text-muted-foreground mb-0.5">Recommendation</div>
          <div className="font-bold text-foreground">Start {winnerName}</div>
        </div>
        <span className={cn(
          'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border',
          confidence === 'High'   && 'bg-primary/20 border-primary/40 text-primary',
          confidence === 'Medium' && 'bg-amber-500/20 border-amber-500/40 text-amber-400',
          confidence === 'Low'    && 'bg-blue-500/20 border-blue-500/40 text-blue-400',
        )}>
          {edgeLabel ?? confidence}
        </span>
      </div>

      <div className="space-y-1">
        <div className="flex items-center text-[10px] text-muted-foreground uppercase tracking-wider mb-2 px-1">
          <div className="w-1/4 text-left">{playerA?.player_name?.split(' ')[1]}</div>
          <div className="flex-1 text-center">Category</div>
          <div className="w-1/4 text-right">{playerB?.player_name?.split(' ')[1]}</div>
        </div>
        {dimensions.map((dim) => (
          <div key={dim.label} className="flex items-center py-1.5 px-1 rounded-lg hover:bg-white/3 transition-colors">
            <div className={cn(
              'w-1/4 text-left text-xs font-medium truncate',
              dim.winner === 'A' ? 'text-primary' : dim.winner === 'tie' ? 'text-muted-foreground' : 'text-red-400',
            )}>
              {typeof dim.valueA === 'number' ? dim.valueA : String(dim.valueA ?? '—')}
            </div>
            <div className="flex-1 text-center text-[11px] text-muted-foreground">{dim.label}</div>
            <div className={cn(
              'w-1/4 text-right text-xs font-medium truncate',
              dim.winner === 'B' ? 'text-primary' : dim.winner === 'tie' ? 'text-muted-foreground' : 'text-red-400',
            )}>
              {typeof dim.valueB === 'number' ? dim.valueB : String(dim.valueB ?? '—')}
            </div>
          </div>
        ))}
      </div>

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

// ─── Player Picker Modal ──────────────────────────────────────────────────────

function PlayerPickerModal({ players: allPlayers, onSelect, onClose, excludePlayerId, settings }) {
  const [search, setSearch]       = useState('');
  const [posFilter, setPosFilter] = useState('all');

  const players = useMemo(() => {
    const s = settings || getLeagueSettings();
    return (allPlayers ?? mockPlayers)
      .filter(p => p.id !== excludePlayerId)
      .filter(p => posFilter === 'all' || p.position === (posFilter === 'D/ST' ? 'DEF' : posFilter))
      .filter(p =>
        !search.trim() ||
        p.player_name.toLowerCase().includes(search.toLowerCase()) ||
        p.team.toLowerCase().includes(search.toLowerCase())
      )
      .map(p => {
        const primaryProp = (p.props ?? [])[0];
        const sc = primaryProp ? fantasyScore(p, primaryProp, s) : null;
        return { player: p, score: sc };
      })
      .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0))
      .map(({ player }) => player);
  }, [search, posFilter, excludePlayerId, allPlayers, settings]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[hsl(222,47%,7%)] shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-white/6 flex-shrink-0">
          <h3 className="font-semibold text-foreground">Pick a Player</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

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

        <div className="flex gap-1 p-3 border-b border-white/6 flex-shrink-0">
          {['all', ...POSITIONS].map(pos => (
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

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {players.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8">No players found</div>
          )}
          {players.map(player => {
            const topProp = [...(player.props ?? [])].sort(
              (a, b) => (b.confidence_score ?? 0) - (a.confidence_score ?? 0)
            )[0];
            const sc = topProp ? fantasyScore(player, topProp, settings) : null;

            return (
              <button
                key={player.id}
                onClick={() => onSelect(player)}
                className="w-full flex items-center gap-3 rounded-xl p-2.5 hover:bg-white/5 transition-colors text-left"
              >
                <PlayerAvatar photo={player.photo_url} team={player.team} className="w-8 h-8 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground truncate">{player.player_name}</span>
                    <span className="text-[10px] bg-white/8 text-muted-foreground px-1.5 py-0.5 rounded font-medium">
                      {player.position === 'DEF' ? 'D/ST' : player.position}
                    </span>
                    <InjuryTag player={player} />
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StartSit() {
  const [settings, setSettings]                   = useState(() => getLeagueSettings());
  const [showSettings, setShowSettings]           = useState(false);
  const [rankTab, setRankTab]                     = useTabParam('rankings', ['rankings', 'compare', 'waiver', 'myteam']);
  const [position, setPosition]                   = useState('QB');
  const [waiverPosition, setWaiverPosition]       = useState('QB');
  const [compareA, setCompareA]                   = useState(null);
  const [compareB, setCompareB]                   = useState(null);
  const [propA, setPropA]                         = useState(null);
  const [propB, setPropB]                         = useState(null);
  const [showComparePicker, setShowComparePicker] = useState(null);
  const [searchQuery, setSearchQuery]             = useState('');
  const [selectedGame, setSelectedGame]           = useState(null); // null | { key, teams: [t1, t2] }
  const [teamFilter, setTeamFilter]               = useState(null); // null | team abbreviation
  const [breakdownEntry, setBreakdownEntry]       = useState(null); // null | { player, prop, score }
  const [league, setLeague]                       = useState(() => getLeagueConnection());
  const [showLeague, setShowLeague]               = useState(false);
  const [myTeamOnly, setMyTeamOnly]               = useState(false);
  const [rankMode, setRankMode]                   = useState('weekly'); // 'weekly' | 'ros'
  const [scheduleEntry, setScheduleEntry]         = useState(null);

  // Rosters change through the week — quietly re-sync a stale connection.
  useEffect(() => {
    if (league && isConnectionStale(league)) {
      refreshLeagueConnection(league).then(setLeague).catch(() => {});
    }
  }, []);

  function handleLeagueChange(conn) {
    setLeague(conn);
    setSettings(getLeagueSettings()); // connecting applies the league's scoring
    if (!conn) setMyTeamOnly(false);
  }

  const myTeam      = getMyTeam(league);
  const myTeamIds   = useMemo(() => new Set(myTeam?.playerIds ?? []), [myTeam]);
  const rosteredIds = useMemo(() => getRosteredIds(league), [league]);

  // Live data state
  const [liveStatus, setLiveStatus] = useState({ loading: true, players: null, hasSchedule: false, week: null, error: false });

  const loadLivePlayers = useCallback(async (forceRefresh = false) => {
    if (isDemoMode()) {
      setLiveStatus({ loading: false, players: mockPlayers, hasSchedule: false, week: null, error: false });
      return;
    }
    setLiveStatus(prev => ({ ...prev, loading: true, error: false }));
    try {
      if (forceRefresh) clearLiveCache();
      const result = await fetchLivePlayers();
      setLiveStatus({ loading: false, players: result.players, hasSchedule: result.hasSchedule, week: result.week, index: result.index ?? {}, error: false });
    } catch {
      setLiveStatus({ loading: false, players: mockPlayers, hasSchedule: false, week: null, error: true });
    }
  }, []);

  useEffect(() => { loadLivePlayers(); }, [loadLivePlayers]);

  // Player Trend Engine — Stock Up/Down tags, loaded independently so a slow
  // or failed trend fetch never blocks the core rankings.
  const [trendIndex, setTrendIndex] = useState({});
  useEffect(() => {
    fetchTrendScores().then(data => setTrendIndex(indexTrendByPlayerId(data))).catch(() => {});
  }, []);

  // Season outlook: D/ST matchup context, returning-from-injury tags, ROS + schedule
  const [outlook, setOutlook] = useState(null);
  const [outlookFailed, setOutlookFailed] = useState(false);
  useEffect(() => {
    if (isDemoMode()) return;
    fetchOutlook().then(o => { if (o) setOutlook(o); else setOutlookFailed(true); });
  }, []);

  const activePlayers = useMemo(
    () => attachOutlookContext(liveStatus.players ?? mockPlayers, outlook, settings.scoring),
    [liveStatus.players, outlook, settings.scoring],
  );
  const isLive = !isDemoMode() && !liveStatus.error && liveStatus.players !== mockPlayers && !liveStatus.loading;

  function handleSaveSettings(newSettings) {
    saveLeagueSettings(newSettings);
    setSettings(newSettings);
  }

  function selectGame(game) {
    setSelectedGame(prev => (prev?.key === game.key ? null : game));
    setTeamFilter(null);
  }

  // Map the UI position label to the Sleeper position code used in player data
  const apiPosition = position === 'D/ST' ? 'DEF' : position;

  const rankings = useMemo(
    () => liveStatus.loading ? [] : rankPlayers(activePlayers, apiPosition, settings),
    [activePlayers, apiPosition, settings, liveStatus.loading],
  );

  // All-position rankings used to look up rank-based verdicts for H2H comparison.
  const allRankings = useMemo(
    () => liveStatus.loading ? [] : rankPlayers(activePlayers, 'all', settings),
    [activePlayers, settings, liveStatus.loading],
  );

  const availableGames = useMemo(() => {
    const seen = new Set();
    const games = [];
    for (const p of activePlayers) {
      if (!p.opponent || p.opponent === 'TBD') continue;
      const sorted = [p.team, p.opponent].sort();
      const key = sorted.join('_');
      if (!seen.has(key)) {
        seen.add(key);
        games.push({ key, teams: sorted });
      }
    }
    return games.sort((a, b) => a.key.localeCompare(b.key));
  }, [activePlayers]);

  const filteredRankings = useMemo(() => {
    let result = rankings;
    if (myTeamOnly && myTeam) result = result.filter(({ player }) => myTeamIds.has(String(player.id)));
    if (selectedGame) {
      result = teamFilter
        ? result.filter(({ player }) => player.team === teamFilter)
        : result.filter(({ player }) => selectedGame.teams.includes(player.team));
    }
    if (!searchQuery.trim()) return result;
    const q = searchQuery.toLowerCase();
    return result.filter(({ player }) =>
      player.player_name.toLowerCase().includes(q) ||
      player.team.toLowerCase().includes(q)
    );
  }, [rankings, selectedGame, teamFilter, searchQuery, myTeamOnly, myTeam, myTeamIds]);

  const rosByPos = useMemo(
    () => (outlook ? buildRosRankings(activePlayers, outlook, settings, trendIndex) : {}),
    [activePlayers, outlook, settings, trendIndex],
  );
  const filteredRos = useMemo(() => {
    let list = rosByPos[apiPosition] ?? [];
    if (myTeamOnly && myTeam) list = list.filter(e => myTeamIds.has(String(e.player.id)));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(e => e.player.player_name.toLowerCase().includes(q) || e.player.team.toLowerCase().includes(q));
    }
    return list;
  }, [rosByPos, apiPosition, myTeamOnly, myTeam, myTeamIds, searchQuery]);

  // Build waiver candidates from live activePlayers so matchups + projections
  // always match the Rankings tab instead of stale mock data.
  const waiverCandidates = useMemo(() => {
    if (!activePlayers?.length) return [];
    const starterMap = {};
    for (const p of activePlayers) {
      if ((p.depth_chart_order ?? 99) === 1) {
        starterMap[`${p.team}_${p.position}`] = p;
      }
    }
    return activePlayers
      .filter(p => {
        // Only real Sleeper data — no preseason placeholders
        if (p.has_real_projection !== true || p.proj_pts_ppr == null || p.proj_pts_ppr < 0.5) return false;
        // With a connected league we know exactly who's available, so any
        // unrostered player qualifies — including starters someone dropped.
        if (league) return !rosteredIds.has(String(p.id));
        // Otherwise guess: depth-1 starters belong in the rankings tab
        return (p.depth_chart_order ?? 99) > 1 && p.proj_pts_ppr < 9;
      })
      .map(p => {
        const starter = starterMap[`${p.team}_${p.position}`];
        const isHandcuff = p.position === 'RB' && (p.depth_chart_order ?? 99) === 2;
        const projPts = p.proj_pts_ppr ?? 0;
        const priority = projPts >= 10 ? 'high' : projPts >= 5 ? 'medium' : 'low';
        let reason = null;
        if (isHandcuff && starter) {
          const lastName = starter.player_name.split(' ').slice(-1)[0];
          reason = `Handcuff to ${starter.player_name} — immediately startable if ${lastName} misses time`;
        } else if (p.position === 'WR') {
          const catches = p.proj_rec != null ? ` — ${Math.round(p.proj_rec * 10) / 10} projected catches` : '';
          reason = `Receiving option in ${p.team}'s passing game${catches}`;
        } else if (p.position === 'TE') {
          reason = `Streaming TE option vs ${p.opponent}`;
        } else if (p.position === 'QB') {
          reason = `Streaming QB option vs ${p.opponent}`;
        } else {
          reason = `Change-of-pace back with PPR upside in ${p.team}'s backfield`;
        }
        return {
          ...p,
          waiver_priority: priority,
          waiver_reason: reason,
          is_handcuff: isHandcuff,
          injury_upside: null,
          is_waiver: true,
        };
      });
  }, [activePlayers, league, rosteredIds]);

  const apiWaiverPosition = waiverPosition === 'D/ST' ? 'DEF' : waiverPosition;

  const waiverRankings = useMemo(
    () => rankWaiverWire(waiverCandidates, apiWaiverPosition, settings),
    [waiverCandidates, apiWaiverPosition, settings],
  );

  const scoreA = useMemo(() => {
    if (!compareA || !propA) return null;
    const base = fantasyScore(compareA, propA, settings);
    if (!base) return null;
    const ranked = allRankings.find(e => e.player.id === compareA.id);
    return ranked ? { ...base, verdict: ranked.score.verdict } : base;
  }, [compareA, propA, settings, allRankings]);

  const scoreB = useMemo(() => {
    if (!compareB || !propB) return null;
    const base = fantasyScore(compareB, propB, settings);
    if (!base) return null;
    const ranked = allRankings.find(e => e.player.id === compareB.id);
    return ranked ? { ...base, verdict: ranked.score.verdict } : base;
  }, [compareB, propB, settings, allRankings]);

  const compResult = useMemo(() => {
    if (!compareA || !propA || !compareB || !propB) return null;
    return compareStartSit(compareA, propA, compareB, propB, settings);
  }, [compareA, propA, compareB, propB, settings]);

  function handlePickerSelect(player) {
    const topProp = [...(player.props ?? [])].sort(
      (a, b) => (b.confidence_score ?? 0) - (a.confidence_score ?? 0)
    )[0];
    if (showComparePicker === 'A') { setCompareA(player); setPropA(topProp ?? null); }
    else                           { setCompareB(player); setPropB(topProp ?? null); }
    setShowComparePicker(null);
  }

  function handleCompareFromRanking(player, prop) {
    if (compareA?.id === player.id) { setCompareA(null); setPropA(null); return; }
    if (compareB?.id === player.id) { setCompareB(null); setPropB(null); return; }
    if (!compareA)      { setCompareA(player); setPropA(prop); }
    else if (!compareB) { setCompareB(player); setPropB(prop); setRankTab('compare'); }
    else                { setCompareA(player); setPropA(prop); }
  }

  const scoringLabel = { standard: 'STD', half_ppr: '½PPR', ppr: 'PPR' }[settings.scoring] ?? settings.scoring;
  const activePosition = rankTab === 'waiver' ? waiverPosition : position;
  const setActivePosition = rankTab === 'waiver' ? setWaiverPosition : setPosition;
  const weekLabel = liveStatus.week ? `Week ${liveStatus.week}` : null;

  return (
    <div className="space-y-4 sm:space-y-5 max-w-4xl mx-auto pb-8">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary flex-shrink-0 hidden sm:block" />
            Start/Sit
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {liveStatus.loading ? (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                <Loader2 className="w-2.5 h-2.5 animate-spin" /> Loading
              </span>
            ) : isLive ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/15 border border-primary/30 px-2 py-0.5 rounded-full whitespace-nowrap">
                <Wifi className="w-2.5 h-2.5" /> LIVE{weekLabel ? ` · ${weekLabel}` : ''}
              </span>
            ) : (
              <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold">
                DEMO
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {scoringLabel}{settings.superflex ? ' · SF' : ''}{settings.tePremium ? ' · TE+' : ''}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!isDemoMode() && !liveStatus.loading && (
            <button
              onClick={() => loadLivePlayers(true)}
              title="Refresh live roster"
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-white/10 hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setShowLeague(true)}
            title={league ? `${league.name} — ${myTeam?.name ?? 'pick your team'}` : 'Connect your Sleeper or ESPN league'}
            className={cn(
              'h-9 flex items-center gap-1.5 px-2.5 rounded-xl border transition-all text-sm max-w-[170px]',
              league
                ? 'border-primary/30 bg-primary/8 text-primary'
                : 'border-white/10 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary',
            )}
          >
            <Link2 className="w-4 h-4 flex-shrink-0" />
            <span className="font-semibold truncate hidden sm:inline">{league ? (myTeam?.name ?? league.name) : 'Connect League'}</span>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            title="Scoring settings"
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-white/10 hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error / fallback notice */}
      {liveStatus.error && (
        <div className="rounded-xl bg-amber-500/8 border border-amber-500/20 px-3 py-2 text-[11px] text-amber-300 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          Could not reach roster API — showing demo data. Check your connection and refresh.
        </div>
      )}

      <PageTabs
        value={rankTab}
        onChange={key => { if (key === 'waiver' && rankTab !== 'waiver') setWaiverPosition(position); setRankTab(key); }}
        tabs={[
          { key: 'rankings', label: 'Rankings', icon: TrendingUp },
          { key: 'compare',  label: 'Compare',  icon: GitCompare, count: [compareA, compareB].filter(Boolean).length || null },
          { key: 'waiver',   label: 'Waiver',   icon: Shield },
          { key: 'myteam',   label: 'My Team',  short: 'Team', icon: Users },
        ]}
      />

      {/* ── Compare ── */}
      {rankTab === 'compare' && (
        <section className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Pick two players — or tap <GitCompare className="w-3 h-3 inline -mt-0.5" /> on any ranking — to see who to start.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-stretch">
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
            <div className="flex sm:flex-col items-center justify-center sm:w-10 flex-shrink-0 -my-1 sm:my-0">
              <span className="text-[10px] font-bold text-muted-foreground bg-white/5 rounded-full w-7 h-7 flex items-center justify-center border border-white/8">
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

          {compResult && <ComparisonResult result={compResult} playerA={compareA} playerB={compareB} />}
        </section>
      )}

      {/* ── My Team ── */}
      {rankTab === 'myteam' && (
        <MyTeamPanel
          league={league}
          players={activePlayers}
          index={liveStatus.index}
          rosByPos={rosByPos}
          outlook={outlook}
          trendIndex={trendIndex}
          settings={settings}
          week={liveStatus.week ?? outlook?.week}
          onConnect={() => setShowLeague(true)}
        />
      )}

      {/* ── Rankings / Waiver Wire ── */}
      {(rankTab === 'rankings' || rankTab === 'waiver') && (
      <section className="space-y-3">

        <div className="flex gap-1">
          {POSITIONS.map(pos => (
            <button
              key={pos}
              onClick={() => setActivePosition(pos)}
              className={cn(
                'flex-1 sm:flex-none px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors',
                activePosition === pos
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5 border border-white/6',
              )}
            >
              {pos}
            </button>
          ))}
        </div>

        {/* Compare tray — shows what's queued without leaving the rankings */}
        {rankTab === 'rankings' && (compareA || compareB) && (
          <button
            onClick={() => setRankTab('compare')}
            className="w-full flex items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/8 px-3 py-2 text-left"
          >
            <span className="text-xs text-foreground truncate">
              <GitCompare className="w-3.5 h-3.5 inline -mt-0.5 mr-1.5 text-primary" />
              {compareA?.player_name ?? '—'} <span className="text-muted-foreground">vs</span> {compareB?.player_name ?? 'pick one more'}
            </span>
            <span className="text-xs font-semibold text-primary flex-shrink-0">{compareA && compareB ? 'See result →' : 'Open →'}</span>
          </button>
        )}

        {/* ── Rankings ── */}
        {rankTab === 'rankings' && (
          <>
            <div className="flex gap-1 bg-white/4 rounded-xl p-1 w-fit">
              {[{ v: 'weekly', label: weekLabel ?? 'Weekly' }, { v: 'ros', label: 'Rest of Season' }].map(opt => (
                <button
                  key={opt.v}
                  onClick={() => setRankMode(opt.v)}
                  className={cn(
                    'px-3 py-1 text-[11px] font-semibold rounded-lg transition-all',
                    rankMode === opt.v
                      ? 'bg-primary/20 text-primary border border-primary/30'
                      : 'text-muted-foreground hover:text-foreground border border-transparent',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {rankMode === 'weekly' && availableGames.length > 0 && (
              <div className="space-y-2">
                <div
                  className="flex gap-1.5 overflow-x-auto pb-1"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  <button
                    onClick={() => { setSelectedGame(null); setTeamFilter(null); }}
                    className={cn(
                      'px-3 py-1.5 rounded-xl border text-[11px] font-semibold flex-shrink-0 transition-all',
                      !selectedGame
                        ? 'bg-primary/20 border-primary/40 text-primary'
                        : 'border-white/8 text-muted-foreground hover:border-white/18 hover:text-foreground',
                    )}
                  >
                    All Games
                  </button>
                  {availableGames.map(game => (
                    <GameChip
                      key={game.key}
                      game={game}
                      selected={selectedGame?.key === game.key}
                      onSelect={() => selectGame(game)}
                    />
                  ))}
                </div>

                {selectedGame && (
                  <div className="flex gap-1.5 items-center flex-wrap">
                    <span className="text-[11px] text-muted-foreground flex-shrink-0">Show:</span>
                    <button
                      onClick={() => setTeamFilter(null)}
                      className={cn(
                        'px-2.5 py-1 text-[11px] rounded-lg border transition-all flex-shrink-0',
                        !teamFilter
                          ? 'bg-primary/20 border-primary/40 text-primary'
                          : 'border-white/8 text-muted-foreground hover:border-white/18 hover:text-foreground',
                      )}
                    >
                      Both teams
                    </button>
                    {selectedGame.teams.map(team => (
                      <button
                        key={team}
                        onClick={() => setTeamFilter(prev => prev === team ? null : team)}
                        className={cn(
                          'flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-lg border transition-all flex-shrink-0',
                          teamFilter === team
                            ? 'bg-primary/20 border-primary/40 text-primary'
                            : 'border-white/8 text-muted-foreground hover:border-white/18 hover:text-foreground',
                        )}
                      >
                        <TeamLogo team={team} className="w-3.5 h-3.5" />
                        {team} only
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

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

            {myTeam && (
              <div className="flex gap-1 bg-white/4 rounded-xl p-1 w-fit">
                {[{ v: false, label: 'All players' }, { v: true, label: `My team · ${myTeam.name}` }].map(opt => (
                  <button
                    key={String(opt.v)}
                    onClick={() => setMyTeamOnly(opt.v)}
                    className={cn(
                      'px-3 py-1 text-[11px] font-semibold rounded-lg transition-all max-w-[220px] truncate',
                      myTeamOnly === opt.v
                        ? 'bg-primary/20 text-primary border border-primary/30'
                        : 'text-muted-foreground hover:text-foreground border border-transparent',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {rankMode === 'ros' ? (
              <div className="space-y-2">
                {!outlook ? (
                  outlookFailed ? (
                    <div className="text-center text-muted-foreground text-sm py-12 rounded-2xl border border-dashed border-white/10">
                      Couldn’t load season data from the LockLab server — try again shortly.
                    </div>
                  ) : (
                    Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="rounded-2xl border border-white/6 bg-[hsl(222,47%,9%)] p-4 h-24 animate-pulse" />
                    ))
                  )
                ) : (
                  <>
                    <p className="text-[11px] text-muted-foreground">
                      Weeks {outlook.week}–18 · projections adjusted for this season’s points allowed by position, usage trend and injuries.
                      Data through week {outlook.last_completed_week}. Tap a player for their schedule.
                    </p>
                    {filteredRos.map(entry => (
                      <RosCard key={entry.player.id} entry={entry} onOpen={() => setScheduleEntry(entry)} />
                    ))}
                    {filteredRos.length === 0 && (
                      <div className="text-center text-muted-foreground text-sm py-12">
                        {myTeamOnly ? 'No one on your roster at this position' : 'No rest-of-season projections for this position'}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (<>
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
              <span className="text-muted-foreground/50">· {filteredRankings.length} players · {scoringLabel}</span>
            </div>

            {!liveStatus.loading && (
              <TopMatchupsRow
                rankings={filteredRankings}
                onOpen={(entry) => setBreakdownEntry({ ...entry, trend: trendIndex[entry.player.id] })}
              />
            )}

            {liveStatus.loading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-2xl border border-white/6 bg-[hsl(222,47%,9%)] p-4 h-20 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredRankings.map(({ player, prop, score, posRank }, idx) => (
                  <PlayerRankCard
                    key={player.id}
                    rank={idx + 1}
                    posRank={posRank}
                    player={player}
                    prop={prop}
                    score={score}
                    trend={trendIndex[player.id]}
                    onCompare={handleCompareFromRanking}
                    isCompared={compareA?.id === player.id || compareB?.id === player.id}
                    onOpen={() => setBreakdownEntry({ player, prop, score, trend: trendIndex[player.id] })}
                  />
                ))}
                {filteredRankings.length === 0 && (
                  <div className="text-center text-muted-foreground text-sm py-12">
                    {myTeamOnly ? 'No one on your roster at this position this week' : 'No players found for this position'}
                  </div>
                )}
              </div>
            )}
            </>)}
          </>
        )}

        {/* ── Waiver Wire ── */}
        {rankTab === 'waiver' && (
          <>
            <div className="flex gap-4 text-xs text-muted-foreground items-center">
              <span>
                <span className="text-primary font-medium">
                  {waiverRankings.filter(r => r.waiverPriority === 'high').length}
                </span> High
              </span>
              <span>
                <span className="text-amber-400 font-medium">
                  {waiverRankings.filter(r => r.waiverPriority === 'medium').length}
                </span> Medium
              </span>
              <span>
                <span className="text-muted-foreground font-medium">
                  {waiverRankings.filter(r => r.waiverPriority === 'low').length}
                </span> Low
              </span>
              <span className="text-muted-foreground/50">· {waiverRankings.length} available · {scoringLabel}</span>
            </div>

            <div className="rounded-xl bg-blue-500/8 border border-blue-500/15 px-3 py-2 text-[11px] text-blue-300 flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 flex-shrink-0" />
              {league
                ? `Only players available in ${league.name} — rostered players are hidden.`
                : 'Waiver wire targets ranked by projected value and matchup — connect your league to hide rostered players.'}
            </div>

            <div className="space-y-2">
              {waiverRankings.map(({ player, prop, score, waiverReason, injuryUpside, isHandcuff, waiverPriority }, idx) => (
                <WaiverCard
                  key={player.id}
                  rank={idx + 1}
                  player={player}
                  prop={prop}
                  score={score}
                  waiverReason={waiverReason}
                  injuryUpside={injuryUpside}
                  isHandcuff={isHandcuff}
                  waiverPriority={waiverPriority}
                />
              ))}
              {waiverRankings.length === 0 && (
                <div className="text-center text-muted-foreground text-sm py-12">
                  No waiver wire players for this position
                </div>
              )}
            </div>
          </>
        )}
      </section>
      )}

      {/* ── Modals ── */}
      {showComparePicker && (
        <PlayerPickerModal
          players={activePlayers}
          onSelect={handlePickerSelect}
          onClose={() => setShowComparePicker(null)}
          excludePlayerId={showComparePicker === 'A' ? compareB?.id : compareA?.id}
          settings={settings}
        />
      )}

      <ScheduleChartModal entry={scheduleEntry} onClose={() => setScheduleEntry(null)} />

      {showLeague && (
        <LeagueConnectModal
          connection={league}
          onChange={handleLeagueChange}
          onClose={() => setShowLeague(false)}
        />
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      <PlayerBreakdownModal
        entry={breakdownEntry}
        onClose={() => setBreakdownEntry(null)}
        settings={settings}
      />
    </div>
  );
}
