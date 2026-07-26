import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, TrendingUp, TrendingDown, Minus, AlertTriangle, Shield,
  Zap, Target, Activity, ChevronDown, ChevronUp, Info, BarChart2,
  Calendar,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { TEAM_STATS, NFL_LEAGUE_AVGS } from '@/lib/teamStats';
import TeamLogo from '@/components/common/TeamLogo';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const POS_DEF_KEY = {
  QB: 'pass_yds_allowed',
  RB: 'rush_yds_allowed',
  WR: 'rec_yds_allowed_wr',
  TE: 'rec_yds_allowed_te',
};

const POS_DEF_LABEL = {
  QB: 'Pass Yds Allowed / G',
  RB: 'Rush Yds Allowed / G',
  WR: 'WR Rec Yds Allowed / G',
  TE: 'TE Rec Yds Allowed / G',
};

const POSITION_AVG_FP = { QB: 20, RB: 13, WR: 13, TE: 8 };

const PROP_LABELS = {
  passing_yards: 'Pass Yds', passing_tds: 'Pass TDs',
  rushing_yards: 'Rush Yds', rushing_tds: 'Rush TDs',
  receiving_yards: 'Rec Yds', receptions: 'Receptions',
};

// ESPN_TO_SLEEPER: normalize ESPN schedule abbreviations → our internal format
const ESPN_TO_SLEEPER = { WSH: 'WAS', LA: 'LAR' };
// SLEEPER_TO_ESPN: build the ESPN schedule URL from our team abbreviations
const SLEEPER_TO_ESPN = { WAS: 'WSH', LAR: 'LA' };

const GAME_FILTERS = ['L3', 'L5', 'L10', 'All'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Rank #1 = best defense (fewest yards allowed), #32 = worst defense (most yards allowed).
// Ascending sort so the smallest value (fewest yards allowed) gets rank 1.
function defRank(opponent, statKey) {
  const val = TEAM_STATS[opponent]?.[statKey];
  if (val == null) return null;
  const sorted = Object.values(TEAM_STATS)
    .map(t => t[statKey]).filter(Boolean).sort((a, b) => a - b);
  return sorted.indexOf(val) + 1;
}

function estimateFPAllowed(opponent, pos) {
  const key       = POS_DEF_KEY[pos];
  const defStat   = TEAM_STATS[opponent]?.[key];
  const leagueAvg = NFL_LEAGUE_AVGS[key];
  if (!defStat || !leagueAvg) return null;
  return Math.round(POSITION_AVG_FP[pos] * (defStat / leagueAvg) * 10) / 10;
}

function findSimilarDefenses(opponent, pos, excludeTeam = null, count = 3) {
  const keys = Object.keys(NFL_LEAGUE_AVGS);
  const opp  = TEAM_STATS[opponent];
  if (!opp) return [];
  return Object.entries(TEAM_STATS)
    .filter(([team]) => team !== opponent && team !== excludeTeam)
    .map(([team, stats]) => {
      const dist = Math.sqrt(
        keys.reduce((sum, k) => {
          const avg  = NFL_LEAGUE_AVGS[k] || 1;
          const diff = ((stats[k] ?? avg) - (opp[k] ?? avg)) / avg;
          return sum + diff * diff;
        }, 0),
      );
      return { team, similarity: Math.max(55, Math.min(98, Math.round(100 - dist * 120))) };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, count);
}

function probAbove(projection, floor, ceiling, threshold) {
  if (projection <= 0) return threshold <= 0 ? 99 : 1;
  const lo    = Math.min(floor, projection * 0.4);
  const hi    = Math.max(ceiling, projection * 1.6);
  if (threshold <= lo) return 99;
  if (threshold >= hi) return 1;
  const sigma = Math.max(1, (hi - lo) / 4);
  const z     = (threshold - projection) / sigma;
  return Math.max(1, Math.min(99, Math.round(100 / (1 + Math.exp(1.6 * z)))));
}

// #1–8   = elite defense = TOUGH matchup for the fantasy player → red
// #9–22  = average defense → amber
// #23–32 = weak defense   = SOFT matchup, favorable for the fantasy player → green
function matchupColor(rank) {
  if (rank == null) return 'text-muted-foreground';
  return rank <= 8 ? 'text-red-400' : rank <= 22 ? 'text-amber-400' : 'text-emerald-400';
}

function matchupBg(rank) {
  if (rank == null) return 'bg-white/5 border-white/10';
  return rank <= 8
    ? 'bg-red-500/10 border-red-500/25'
    : rank <= 22
    ? 'bg-amber-500/10 border-amber-500/25'
    : 'bg-emerald-500/10 border-emerald-500/25';
}

function buildSummary(player, score, rank) {
  const { verdict, grade, projection, total } = score;
  const pos   = player.position;
  const parts = [];
  if (projection > 0)
    parts.push(`${player.player_name} projects for ${projection} fantasy points this week, earning a ${grade} grade (${total}/100).`);
  else
    parts.push(`${player.player_name} currently has no confirmed projection for this week (${grade}, ${total}/100).`);
  if (rank != null) {
    if (rank <= 8)
      parts.push(`The ${player.opponent} defense ranks #${rank}/32 against ${pos}s — one of the toughest matchups in the league, factored into the grade.`);
    else if (rank >= 25)
      parts.push(`The ${player.opponent} defense ranks #${rank}/32 against ${pos}s — one of the softest matchups in the league, adding upside to the projection.`);
    else
      parts.push(`The matchup vs ${player.opponent} (#${rank}/32 against ${pos}s) is roughly league-average — no strong directional edge.`);
  }
  if (verdict === 'START')
    parts.push(`The projection, role, and matchup all align — a confident start.`);
  else if (verdict === 'FLEX')
    parts.push(`He's in the flex conversation with real upside if the game script develops favorably.`);
  else
    parts.push(`The data suggests more risk than reward this week; consider alternatives where available.`);
  return parts.join(' ');
}

function buildBullets(player, score, rank) {
  const likes = [];
  const risks = [];
  const { tier2, floor, ceiling, projection } = score;
  const pos = player.position;

  if (rank != null && rank >= 21)
    likes.push(`Soft matchup — ${player.opponent} ranks #${rank}/32 against ${pos}s (rank #32 = worst defense).`);
  if (projection >= 12)
    likes.push(`Projection of ${projection} FP is well above replacement level.`);
  if (player.depth_chart_order === 1)
    likes.push(`Confirmed starter with full expected workload.`);
  if ((player.proj_rec ?? 0) >= 5 && pos !== 'QB')
    likes.push(`${Math.round((player.proj_rec ?? 0) * 10) / 10} projected receptions — high PPR floor.`);
  if ((player.proj_rush_yd ?? 0) >= 70 && pos === 'RB')
    likes.push(`${Math.round(player.proj_rush_yd)} projected rush yards — volume-based upside.`);
  if ((player.proj_pass_yd ?? 0) >= 260 && pos === 'QB')
    likes.push(`${Math.round(player.proj_pass_yd)} projected pass yards — elite QB volume.`);
  if (ceiling - projection >= 8)
    likes.push(`Ceiling of ${ceiling} FP offers meaningful boom-week upside.`);

  if (rank != null && rank <= 12)
    risks.push(`Tough matchup — ${player.opponent} ranks #${rank}/32 against ${pos}s (rank #1 = best defense).`);
  const inj = (player.injury_status ?? 'healthy').toLowerCase();
  if (inj.includes('questionable'))
    risks.push(`Questionable injury tag — monitor the injury report through the week.`);
  else if (inj.includes('doubtful'))
    risks.push(`Doubtful designation — significant risk of being ruled out.`);
  if ((player.depth_chart_order ?? 99) >= 2)
    risks.push(`Not the primary option — upside contingent on starter availability.`);
  if (tier2 < 8)
    risks.push(`Below-average game environment caps the scoring ceiling.`);
  if (floor < 5 && pos !== 'QB' && projection > 0)
    risks.push(`Floor of ${floor} FP leaves meaningful bust risk on a bad day.`);

  if (likes.length === 0) likes.push('Grade reflects all currently available projection data.');
  if (risks.length === 0) risks.push('No significant red flags detected in available data.');
  return { likes: likes.slice(0, 5), risks: risks.slice(0, 4) };
}

// ─── Last-season fetch (2025) ─────────────────────────────────────────────────
// 18 parallel Sleeper weekly stat dumps + 1 ESPN schedule request.
// Cached in sessionStorage per player — subsequent opens are instant.

async function fetchLastSeasonLog(playerId, team, position) {
  const cacheKey = `locklab_ls25_${playerId}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {}

  const espnTeam = SLEEPER_TO_ESPN[team] ?? team;
  const defKey   = POS_DEF_KEY[position];

  const [schedRes, ...weekRes] = await Promise.allSettled([
    fetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${espnTeam}/schedule?season=2025&seasontype=2`,
    ).then(r => r.ok ? r.json() : null).catch(() => null),
    ...Array.from({ length: 18 }, (_, i) =>
      fetch(`https://api.sleeper.app/v1/stats/nfl/regular/2025/${i + 1}`)
        .then(r => r.ok ? r.json() : null).catch(() => null),
    ),
  ]);

  // Week-number → opponent abbreviation (Sleeper format)
  const oppByWeek = {};
  const schedData = schedRes.status === 'fulfilled' ? schedRes.value : null;
  for (const ev of schedData?.events ?? []) {
    const week = ev.week?.number ?? ev.week;
    if (!week) continue;
    const comp   = ev.competitions?.[0];
    const home   = comp?.competitors?.find(c => c.homeAway === 'home')?.team?.abbreviation?.toUpperCase();
    const away   = comp?.competitors?.find(c => c.homeAway === 'away')?.team?.abbreviation?.toUpperCase();
    const mine   = espnTeam.toUpperCase();
    const rawOpp = home === mine ? away : away === mine ? home : null;
    if (rawOpp) oppByWeek[week] = ESPN_TO_SLEEPER[rawOpp] ?? rawOpp;
  }

  const log = weekRes
    .map((res, i) => {
      const week  = i + 1;
      const stats = res.status === 'fulfilled' ? res.value?.[playerId] : null;
      if (!stats || (stats.pts_half_ppr ?? 0) < 0.5) return null; // bye / did not play
      const opp  = oppByWeek[week] ?? null;
      const rank = opp ? defRank(opp, defKey) : null;
      return {
        week,
        opponent:   opp,
        defRankVal: rank,
        fp:         Math.round((stats.pts_half_ppr ?? 0) * 10) / 10,
        passYd:     stats.pass_yd != null ? Math.round(stats.pass_yd)           : null,
        passTd:     stats.pass_td != null ? Math.round(stats.pass_td * 10) / 10 : null,
        rushYd:     stats.rush_yd != null ? Math.round(stats.rush_yd)           : null,
        rec:        stats.rec     != null ? Math.round(stats.rec * 10) / 10     : null,
        recYd:      stats.rec_yd  != null ? Math.round(stats.rec_yd)            : null,
        recTd:      stats.rec_td  != null ? Math.round(stats.rec_td * 10) / 10  : null,
      };
    })
    .filter(Boolean);

  try { sessionStorage.setItem(cacheKey, JSON.stringify(log)); } catch {}
  return log;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-white/8 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-white/3 transition-colors"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-3.5 h-3.5 text-primary" />}
          <span className="text-xs font-semibold text-foreground uppercase tracking-wide">{title}</span>
        </div>
        {open
          ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-3">{children}</div>}
    </div>
  );
}

function CriteriaBar({ label, score, maxScore, tip }) {
  const pct      = Math.min(100, Math.max(0, (score / maxScore) * 100));
  const barColor = pct >= 70 ? 'bg-emerald-500' : pct >= 38 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className="text-[11px] font-semibold text-foreground tabular-nums">
          {score.toFixed(1)}<span className="text-muted-foreground/50"> / {maxScore}</span>
        </span>
      </div>
      <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', barColor)}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
        />
      </div>
      {tip && <p className="text-[10px] text-muted-foreground/60">{tip}</p>}
    </div>
  );
}

// Custom tooltip for the last-season chart
function LSChartTooltip({ active, payload, pos }) {
  if (!active || !payload?.length) return null;
  const g        = payload[0].payload;
  const keyStat  = pos === 'QB' ? g.passYd : pos === 'RB' ? g.rushYd : g.recYd;
  const keyLabel = pos === 'QB' ? 'Pass Yds' : pos === 'RB' ? 'Rush Yds' : 'Rec Yds';
  return (
    <div className="bg-[hsl(222,47%,9%)] border border-white/12 rounded-xl px-3 py-2.5 text-xs shadow-xl space-y-1">
      <p className="font-semibold text-foreground">
        Week {g.week}{g.opponent ? ` · vs ${g.opponent}` : ''}
      </p>
      <p className="text-primary font-bold text-base">{g.fp} FP</p>
      {g.defRankVal != null && (
        <p className={cn('text-[10px]', matchupColor(g.defRankVal))}>
          {g.opponent} ranked #{g.defRankVal}/32 vs {pos}s
          {' '}({g.defRankVal <= 8 ? 'tough' : g.defRankVal >= 23 ? 'soft' : 'neutral'})
        </p>
      )}
      {keyStat != null && (
        <p className="text-[10px] text-muted-foreground">{keyLabel}: {keyStat}</p>
      )}
    </div>
  );
}

// ─── Season Stats section ─────────────────────────────────────────────────────

function SeasonStatsSection({ lsLog, onRetryLS, pos, score }) {
  const [seasonFilter, setSeasonFilter] = useState('last');
  const [gameFilter,   setGameFilter]   = useState('L10');

  const slice = useMemo(() => {
    if (!Array.isArray(lsLog)) return [];
    if (gameFilter === 'All') return lsLog;
    const n = gameFilter === 'L3' ? 3 : gameFilter === 'L5' ? 5 : 10;
    return lsLog.slice(-n);
  }, [lsLog, gameFilter]);

  const allFP    = slice.map(g => g.fp);
  const avg      = allFP.length ? Math.round(allFP.reduce((a, b) => a + b, 0) / allFP.length * 10) / 10 : 0;
  const high     = allFP.length ? Math.max(...allFP) : 0;
  const low      = allFP.length ? Math.min(...allFP) : 0;
  const chartMax = Math.max(high + 5, (score?.ceiling ?? 20) + 5, 20);

  // X-axis label: "KC #3" — team the player faced + that defense's rank vs this position
  const chartData = slice.map(g => ({
    ...g,
    xLabel: g.opponent
      ? `${g.opponent}${g.defRankVal != null ? ` #${g.defRankVal}` : ''}`
      : `Wk${g.week}`,
  }));

  // Angle labels when there are enough games that they'd overlap
  const needsAngle = slice.length > 7;

  const isCurrent = seasonFilter === 'current';

  return (
    <div className="space-y-3">
      {/* Season toggle */}
      <div className="flex gap-1.5 p-1 bg-white/4 rounded-xl w-fit">
        {[
          { key: 'current', label: '2026 Season' },
          { key: 'last',    label: '2025 Season' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSeasonFilter(key)}
            className={cn(
              'px-3 py-1.5 text-[10px] font-semibold rounded-lg transition-all',
              seasonFilter === key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Game filter — only visible for last season */}
      {!isCurrent && (
        <div className="flex gap-1">
          {GAME_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setGameFilter(f)}
              className={cn(
                'px-2.5 py-1 text-[10px] font-semibold rounded-lg border transition-all',
                gameFilter === f
                  ? 'bg-primary/20 border-primary/40 text-primary'
                  : 'border-white/8 text-muted-foreground hover:border-white/18 hover:text-foreground',
              )}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {isCurrent ? (
        /* ── 2026 season — no data yet ── */
        <div className="rounded-xl bg-white/3 border border-white/8 px-4 py-8 text-center">
          <Calendar className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2.5" />
          <p className="text-sm font-semibold text-foreground">No stats available yet</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            The 2026 NFL season hasn't started. Stats will populate week by week once games are played.
          </p>
        </div>
      ) : lsLog === null || lsLog === 'loading' ? (
        /* ── fetching ── */
        <div className="flex flex-col items-center gap-3 py-10">
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-[11px] text-muted-foreground">Loading 2025 game log…</p>
          <p className="text-[10px] text-muted-foreground/60">
            Fetching 18 weeks of stats — takes a moment the first time.
          </p>
        </div>
      ) : lsLog === 'error' ? (
        /* ── error ── */
        <div className="flex flex-col items-center gap-2 py-8">
          <p className="text-[11px] text-red-400">Failed to load 2025 game log.</p>
          <button onClick={onRetryLS} className="text-[10px] text-primary underline underline-offset-2">
            Retry
          </button>
        </div>
      ) : lsLog.length === 0 ? (
        /* ── no games ── */
        <div className="rounded-xl bg-white/3 border border-white/8 px-4 py-6 text-center">
          <Calendar className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-[11px] text-muted-foreground">No 2025 regular season games found.</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            Player may have been injured, on a practice squad, or inactive most of the year.
          </p>
        </div>
      ) : (
        /* ── chart ── */
        <>
          {/* Stat pills */}
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {[
              { label: `Avg (${gameFilter})`, value: `${avg} FP` },
              { label: 'High', value: `${high} FP`, color: 'text-emerald-400' },
              { label: 'Low',  value: `${low} FP`,  color: 'text-red-400'     },
              {
                label: '20+ FP',
                value: `${slice.filter(g => g.fp >= 20).length}`,
                color: slice.filter(g => g.fp >= 20).length >= 2 ? 'text-emerald-400' : 'text-muted-foreground',
              },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div className="text-[10px] text-muted-foreground">{label}</div>
                <div className={cn('text-xs font-semibold', color ?? 'text-foreground')}>{value}</div>
              </div>
            ))}
          </div>

          {/* Area chart */}
          <ResponsiveContainer width="100%" height={needsAngle ? 165 : 140}>
            <AreaChart
              data={chartData}
              margin={{ top: 6, right: 4, left: -24, bottom: needsAngle ? 8 : 0 }}
            >
              <defs>
                <linearGradient id="lsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="xLabel"
                tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }}
                interval={0}
                angle={needsAngle ? -40 : 0}
                textAnchor={needsAngle ? 'end' : 'middle'}
                height={needsAngle ? 46 : 20}
              />
              <YAxis
                domain={[0, chartMax]}
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              />
              <Tooltip content={(props) => <LSChartTooltip {...props} pos={pos} />} />
              {/* Average reference line */}
              <ReferenceLine
                y={avg}
                stroke="hsl(var(--primary))"
                strokeOpacity={0.3}
                strokeDasharray="4 3"
              />
              <Area
                type="monotone"
                dataKey="fp"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                fill="url(#lsGrad)"
                dot={({ cx, cy, payload }) => (
                  <circle
                    key={`dot-${payload.week}`}
                    cx={cx} cy={cy} r={3.5}
                    fill={payload.fp >= 20 ? 'hsl(142,76%,60%)' : 'hsl(var(--primary))'}
                    stroke="hsl(222,47%,7%)" strokeWidth={1.5}
                  />
                )}
                activeDot={{ r: 5, stroke: 'hsl(var(--primary))', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>

          <p className="text-[10px] text-muted-foreground">
            Real 2025 half-PPR stats · Source: Sleeper · Def rank = current season · Hover for game details
          </p>
        </>
      )}
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export default function PlayerBreakdownModal({ entry, onClose }) {
  const [lsLog, setLsLog] = useState(null); // null | 'loading' | 'error' | GameEntry[]

  const pos      = entry?.player?.position ?? 'WR';
  const opponent = entry?.player?.opponent ?? '—';

  // Reset when player changes
  useEffect(() => {
    setLsLog(null);
  }, [entry?.player?.id]);

  // Fetch 2025 game log on mount (lazy — cached after first load)
  useEffect(() => {
    if (!entry || lsLog !== null) return;
    setLsLog('loading');
    fetchLastSeasonLog(entry.player.id, entry.player.team, pos)
      .then(log => setLsLog(log))
      .catch(() => setLsLog('error'));
  }, [entry, lsLog, pos]);

  const playerTeam = entry?.player?.team ?? null;
  const similar = useMemo(
    () => findSimilarDefenses(opponent, pos, playerTeam),
    [opponent, pos, playerTeam],
  );

  if (!entry) return null;

  const { player, prop, score } = entry;
  const defKey    = POS_DEF_KEY[pos];
  const defStat   = TEAM_STATS[opponent]?.[defKey];
  const leagueAvg = NFL_LEAGUE_AVGS[defKey];
  const rank      = defRank(opponent, defKey);
  const fpAllowed = estimateFPAllowed(opponent, pos);
  const leagueFP  = POSITION_AVG_FP[pos];
  const propLabel = PROP_LABELS[prop?.prop_type] ?? prop?.prop_type ?? '';

  const verdictCls = score.verdict === 'START'
    ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
    : score.verdict === 'FLEX'
    ? 'text-amber-400 bg-amber-500/15 border-amber-500/30'
    : 'text-red-400 bg-red-500/15 border-red-500/30';

  const gradeCls = score.total >= 72 ? 'text-emerald-400'
    : score.total >= 52 ? 'text-amber-400' : 'text-red-400';

  const probs = [10, 15, 20, 25, 30].map(t => ({
    label: `${t}+`,
    pct: probAbove(score.projection, score.floor, score.ceiling, t),
  }));

  const usageCrit = score.criteria?.find(c =>
    c.label === 'Target Share' || c.label === 'Snap % / Workload' || c.label === 'Rushing Volume',
  );

  const injStatus = (player.injury_status ?? 'healthy').toLowerCase();
  const hasInjury = injStatus !== 'healthy' && injStatus !== '';

  const summary = buildSummary(player, score, rank);
  const { likes, risks } = buildBullets(player, score, rank);

  const projRange = score.ceiling - score.floor;
  const projPct   = projRange > 0
    ? Math.round(((score.projection - score.floor) / projRange) * 100) : 50;

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-black/75 backdrop-blur-md" />

        <motion.div
          key="panel"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          className="relative z-10 w-full sm:max-w-xl max-h-[96dvh] flex flex-col bg-[hsl(222,47%,7%)] rounded-t-3xl sm:rounded-3xl border border-white/10 shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* ── Sticky header ── */}
          <div className="sticky top-0 z-20 bg-[hsl(222,47%,7%)]/96 backdrop-blur-sm border-b border-white/8 px-4 py-3 flex items-center gap-3">
            <TeamLogo team={player.team} className="w-10 h-10 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm text-foreground truncate">{player.player_name}</span>
                <span className="text-[9px] bg-white/8 text-muted-foreground px-1.5 py-0.5 rounded font-medium uppercase tracking-wider">{pos}</span>
                <span className={cn('text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border', verdictCls)}>
                  {score.verdict}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {player.team} vs {opponent}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="text-right">
                <div className={cn('text-xl font-bold', gradeCls)}>{score.total}</div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{score.grade}</div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/8 hover:bg-white/15 transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ── Scrollable body ── */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2.5" style={{ scrollbarWidth: 'none' }}>

            {/* Hero */}
            <div className="rounded-2xl border border-white/8 bg-white/3 p-4 space-y-3">
              <div className="grid grid-cols-3 divide-x divide-white/8">
                {[
                  { label: 'Floor',      value: score.floor,     color: 'text-red-400'     },
                  { label: 'Projection', value: score.projection, color: 'text-primary'     },
                  { label: 'Ceiling',    value: score.ceiling,   color: 'text-emerald-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center px-2">
                    <div className={cn('text-2xl font-bold', color)}>{value}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{label} FP</div>
                  </div>
                ))}
              </div>
              <div className="relative h-2 rounded-full bg-gradient-to-r from-red-500/30 via-primary/40 to-emerald-500/30">
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-primary border-2 border-[hsl(222,47%,7%)] shadow-lg"
                  style={{ left: `${Math.min(95, Math.max(5, projPct))}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{summary}</p>
            </div>

            {/* Grade Breakdown */}
            <Section title="Grade Breakdown" icon={Activity} defaultOpen>
              <div className="space-y-3.5">
                {(score.criteria ?? []).map((c, i) => (
                  <CriteriaBar key={i} label={c.label} score={c.score} maxScore={c.maxScore} tip={c.tip} />
                ))}
              </div>
            </Section>

            {/* Projection Distribution */}
            <Section title="Projection Distribution" icon={Target} defaultOpen>
              <div className="grid grid-cols-5 gap-1.5 mb-2">
                {probs.map(({ label, pct }) => (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <div className="w-full h-20 bg-white/5 rounded-xl relative flex items-end justify-center overflow-hidden">
                      <motion.div
                        className="absolute bottom-0 left-0 right-0 bg-primary/25"
                        initial={{ height: 0 }}
                        animate={{ height: `${pct}%` }}
                        transition={{ duration: 0.65, ease: 'easeOut', delay: 0.1 }}
                      />
                      <span className="relative text-[11px] font-bold text-foreground pb-1">{pct}%</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Probability of exceeding each FP threshold, derived from floor ({score.floor}) → ceiling ({score.ceiling}).
              </p>
            </Section>

            {/* Season Stats (2026 empty state / 2025 chart) */}
            <Section title="Season Stats" icon={BarChart2} defaultOpen>
              <SeasonStatsSection
                lsLog={lsLog}
                onRetryLS={() => setLsLog(null)}
                pos={pos}
                score={score}
              />
            </Section>

            {/* Position vs. Opponent FP */}
            <Section title={`${pos} Scoring vs ${opponent}`} icon={Shield} defaultOpen>
              {defStat != null ? (
                <div className="space-y-3">
                  <div className={cn('rounded-xl border px-4 py-3 flex items-center justify-between', matchupBg(rank))}>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{POS_DEF_LABEL[pos]}</div>
                      <div className={cn('text-2xl font-bold mt-0.5', matchupColor(rank))}>{defStat}</div>
                      <div className="text-[10px] text-muted-foreground">League avg: {leagueAvg}</div>
                    </div>
                    <div className="text-right">
                      <div className={cn('text-4xl font-bold', matchupColor(rank))}>#{rank}</div>
                      <div className="text-[10px] text-muted-foreground">of 32</div>
                    </div>
                  </div>

                  {fpAllowed != null && (
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: `Est. ${pos} FP Allowed`, value: `${fpAllowed}`, sub: 'per game (est.)', color: matchupColor(rank) },
                        { label: 'League Average',          value: `${leagueFP}`,  sub: 'FP per game',   color: 'text-muted-foreground' },
                        {
                          label: 'vs League Avg',
                          value: `${fpAllowed >= leagueFP ? '+' : ''}${Math.round((fpAllowed - leagueFP) * 10) / 10}`,
                          sub:   'FP diff',
                          color: fpAllowed >= leagueFP ? 'text-emerald-400' : 'text-red-400',
                        },
                      ].map(({ label, value, sub, color }) => (
                        <div key={label} className="rounded-xl bg-white/3 border border-white/8 px-3 py-2.5 text-center">
                          <div className="text-[10px] text-muted-foreground">{label}</div>
                          <div className={cn('text-lg font-bold mt-0.5', color)}>{value}</div>
                          <div className="text-[9px] text-muted-foreground">{sub}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-[11px] text-muted-foreground">
                    {rank <= 8
                      ? `${opponent} ranks #${rank}/32 against ${pos}s — one of the toughest matchups in the league. Rank #1 = best defense.`
                      : rank >= 25
                      ? `${opponent} ranks #${rank}/32 against ${pos}s — one of the softest matchups in the league. Rank #32 = worst defense.`
                      : `${opponent} (#${rank}/32 vs ${pos}s) is roughly league-average against ${pos}s — no strong directional edge.`}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">Defensive data not available for {opponent}.</p>
              )}
            </Section>

            {/* Similar Defensive Profiles */}
            {similar.length > 0 && (
              <Section title="Similar Defensive Profiles" icon={Info} defaultOpen={false}>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Defenses with the closest statistical fingerprint to {opponent}:
                </p>
                <div className="space-y-2">
                  {similar.map(({ team, similarity }) => {
                    const simRank = defRank(team, defKey);
                    const simFP   = estimateFPAllowed(team, pos);
                    return (
                      <div key={team} className="flex items-center gap-3 rounded-xl bg-white/3 border border-white/8 px-3 py-2.5">
                        <TeamLogo team={team} className="w-7 h-7 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-foreground">{team}</div>
                          <div className="text-[10px] text-muted-foreground">
                            Rank #{simRank} · ~{simFP} est. {pos} FP/G
                          </div>
                        </div>
                        <div className={cn('text-[11px] font-bold', similarity >= 85 ? 'text-primary' : 'text-muted-foreground')}>
                          {similarity}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* AI Insights */}
            <Section title="AI Recommendation" icon={Zap} defaultOpen>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-2">
                    <TrendingUp className="w-3 h-3" /> Favorable factors
                  </div>
                  <ul className="space-y-1.5">
                    {likes.map((text, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                        <span className="text-emerald-500 mt-0.5 flex-shrink-0 font-bold">+</span> {text}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="border-t border-white/6 pt-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-2">
                    <AlertTriangle className="w-3 h-3" /> Possible risks
                  </div>
                  <ul className="space-y-1.5">
                    {risks.map((text, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                        <span className="text-amber-500 mt-0.5 flex-shrink-0 font-bold">−</span> {text}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Section>

            {/* Player Snapshot */}
            <Section title="Player Snapshot" icon={TrendingUp} defaultOpen={false}>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    label: 'Depth Chart',
                    value: player.depth_chart_order === 1 ? 'Starter' : `Depth ${player.depth_chart_order ?? '—'}`,
                    good: player.depth_chart_order === 1,
                  },
                  {
                    label: 'Injury Status',
                    value: (player.injury_status ?? 'Healthy').charAt(0).toUpperCase() + (player.injury_status ?? 'Healthy').slice(1),
                    good: !hasInjury,
                  },
                  usageCrit && {
                    label: usageCrit.label,
                    value: usageCrit.tip,
                    good: usageCrit.score >= 1,
                  },
                  pos === 'QB' && player.proj_pass_yd != null && {
                    label: 'Proj. Pass Yds',
                    value: `${Math.round(player.proj_pass_yd)}`,
                    good: player.proj_pass_yd >= 240,
                  },
                  pos === 'QB' && player.proj_pass_td != null && {
                    label: 'Proj. Pass TDs',
                    value: (Math.round(player.proj_pass_td * 10) / 10).toString(),
                    good: player.proj_pass_td >= 1.5,
                  },
                  pos === 'RB' && player.proj_rush_yd != null && {
                    label: 'Proj. Rush Yds',
                    value: `${Math.round(player.proj_rush_yd)}`,
                    good: player.proj_rush_yd >= 60,
                  },
                  (pos === 'WR' || pos === 'TE') && player.proj_rec_yd != null && {
                    label: 'Proj. Rec Yds',
                    value: `${Math.round(player.proj_rec_yd)}`,
                    good: player.proj_rec_yd >= 50,
                  },
                ].filter(Boolean).map(({ label, value, good }) => (
                  <div key={label} className="rounded-xl bg-white/3 border border-white/8 px-3 py-2.5">
                    <div className="text-[10px] text-muted-foreground">{label}</div>
                    <div className={cn('text-[11px] font-semibold mt-0.5', good ? 'text-emerald-400' : 'text-amber-400')}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Injury context */}
            {hasInjury && (
              <Section title="Injury Context" icon={AlertTriangle} defaultOpen>
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <span className="text-xs font-semibold text-amber-300 capitalize">{injStatus}</span>
                  </div>
                  {player.injury_note && (
                    <p className="text-[11px] text-amber-200/80">{player.injury_note}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Monitor the official injury report before finalizing your lineup.
                  </p>
                </div>
              </Section>
            )}

            {/* Betting Context stub */}
            <Section title="Betting Context" icon={Target} defaultOpen={false}>
              <div className="rounded-xl bg-white/3 border border-white/8 px-4 py-5 flex flex-col items-center gap-2">
                <Target className="w-5 h-5 text-muted-foreground/40" />
                <p className="text-[11px] text-muted-foreground text-center">
                  Odds data unavailable. Live lines, spreads, and player props will appear here once a sportsbook feed is connected.
                </p>
              </div>
            </Section>

            <div className="h-3" />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
