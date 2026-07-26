import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, TrendingUp, TrendingDown, Minus, AlertTriangle, Shield,
  Zap, Target, Activity, ChevronDown, ChevronUp, Info, BarChart2,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { TEAM_STATS, NFL_LEAGUE_AVGS } from '@/lib/teamStats';
import TeamLogo from '@/components/common/TeamLogo';
import { cn } from '@/lib/utils';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

const PROP_LABELS = {
  passing_yards: 'Pass Yds', passing_tds: 'Pass TDs',
  rushing_yards: 'Rush Yds', rushing_tds: 'Rush TDs',
  receiving_yards: 'Rec Yds', receptions: 'Receptions',
};

function defRank(opponent, statKey) {
  const val = TEAM_STATS[opponent]?.[statKey];
  if (val == null) return null;
  const sorted = Object.values(TEAM_STATS)
    .map(t => t[statKey])
    .filter(Boolean)
    .sort((a, b) => b - a);
  return sorted.indexOf(val) + 1;
}

function findSimilarDefenses(opponent, count = 3) {
  const keys = Object.keys(NFL_LEAGUE_AVGS);
  const opp = TEAM_STATS[opponent];
  if (!opp) return [];
  return Object.entries(TEAM_STATS)
    .filter(([team]) => team !== opponent)
    .map(([team, stats]) => {
      const dist = Math.sqrt(
        keys.reduce((sum, k) => {
          const avg = NFL_LEAGUE_AVGS[k] || 1;
          const diff = ((stats[k] ?? avg) - (opp[k] ?? avg)) / avg;
          return sum + diff * diff;
        }, 0),
      );
      return { team, similarity: Math.max(55, Math.min(98, Math.round(100 - dist * 120))) };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, count);
}

// Estimate probability of FP exceeding threshold using sigmoid on
// the [floor, ceiling] interval centered on projection.
function probAbove(projection, floor, ceiling, threshold) {
  if (projection <= 0) return threshold <= 0 ? 99 : 1;
  const safeFloor = Math.min(floor, projection * 0.5);
  const safeCeil  = Math.max(ceiling, projection * 1.5);
  if (threshold <= safeFloor) return 99;
  if (threshold >= safeCeil)  return 1;
  const sigma = Math.max(1, (safeCeil - safeFloor) / 4);
  const z = (threshold - projection) / sigma;
  return Math.max(1, Math.min(99, Math.round(100 / (1 + Math.exp(1.6 * z)))));
}

function matchupColor(rank) {
  if (rank == null) return 'text-muted-foreground';
  if (rank <= 8)  return 'text-emerald-400';
  if (rank <= 22) return 'text-amber-400';
  return 'text-red-400';
}

function matchupBg(rank) {
  if (rank == null) return 'bg-white/5 border-white/10';
  if (rank <= 8)  return 'bg-emerald-500/10 border-emerald-500/25';
  if (rank <= 22) return 'bg-amber-500/10 border-amber-500/25';
  return 'bg-red-500/10 border-red-500/25';
}

function buildSummary(player, score, rank) {
  const { verdict, grade, projection, total } = score;
  const pos = player.position;
  const parts = [];

  if (projection > 0) {
    parts.push(`${player.player_name} projects for ${projection} fantasy points this week, earning a ${grade} grade (${total}/100).`);
  } else {
    parts.push(`${player.player_name} currently has no confirmed projection for this week (${grade}, ${total}/100).`);
  }

  if (rank != null) {
    if (rank <= 10) {
      parts.push(`The ${player.opponent} defense ranks #${rank} in ${pos} production allowed — a clear plus matchup.`);
    } else if (rank <= 22) {
      parts.push(`The matchup vs ${player.opponent} (#${rank} against ${pos}s) is roughly league-average.`);
    } else {
      parts.push(`The ${player.opponent} defense (#${rank} against ${pos}s) presents a headwind factored into the grade.`);
    }
  }

  if (verdict === 'START') {
    parts.push(`He's a confident start — the projection, role, and matchup all align.`);
  } else if (verdict === 'FLEX') {
    parts.push(`He's in the flex conversation with real upside if the game script develops favorably.`);
  } else {
    parts.push(`The data suggests more risk than reward this week; consider alternatives where available.`);
  }

  return parts.join(' ');
}

function buildBullets(player, score, rank) {
  const likes = [];
  const risks = [];
  const { tier1, tier2, floor, ceiling, projection, criteria } = score;
  const pos = player.position;
  const defLabel = POS_DEF_LABEL[pos];

  if (rank != null && rank <= 12)
    likes.push(`Favorable matchup — ${player.opponent} ranks #${rank} in ${defLabel} allowed.`);
  if (projection >= 12)
    likes.push(`Projection of ${projection} FP is well above replacement level.`);
  if (player.depth_chart_order === 1)
    likes.push(`Confirmed starter with full expected workload and snap share.`);
  if ((player.proj_rec ?? 0) >= 5 && pos !== 'QB')
    likes.push(`${Math.round(player.proj_rec * 10) / 10} projected receptions — high-volume PPR floor.`);
  if ((player.proj_rush_yd ?? 0) >= 70 && pos === 'RB')
    likes.push(`${Math.round(player.proj_rush_yd)} projected rush yards — strong volume bet.`);
  if ((player.proj_pass_yd ?? 0) >= 260 && pos === 'QB')
    likes.push(`${Math.round(player.proj_pass_yd)} projected pass yards — elite QB volume.`);
  if (ceiling - projection >= 8)
    likes.push(`Ceiling of ${ceiling} FP offers meaningful boom upside.`);
  const gameTotal = criteria?.find(c => c.label === 'Game Total')?.tip?.match(/O\/U ([\d.]+)/)?.[1];
  if (gameTotal && parseFloat(gameTotal) > 47)
    likes.push(`High-total game environment (O/U ${gameTotal}) boosts scoring opportunity.`);

  if (rank != null && rank >= 23)
    risks.push(`Tough matchup — ${player.opponent} ranks #${rank} in ${defLabel} allowed.`);
  const inj = (player.injury_status ?? 'healthy').toLowerCase();
  if (inj.includes('questionable'))
    risks.push(`Questionable injury tag — monitor the injury report through the week.`);
  else if (inj.includes('doubtful'))
    risks.push(`Doubtful designation — high risk of being ruled out.`);
  if ((player.depth_chart_order ?? 99) >= 2)
    risks.push(`Not the primary option — upside is contingent on starter availability.`);
  if (tier2 < 8)
    risks.push(`Below-average game environment caps the scoring ceiling.`);
  if (floor < 5 && pos !== 'QB' && projection > 0)
    risks.push(`Floor of ${floor} FP leaves significant bust risk on a bad day.`);

  if (likes.length === 0) likes.push('Grade reflects all currently available projection data.');
  if (risks.length === 0) risks.push('No significant red flags detected in available data.');

  return { likes: likes.slice(0, 5), risks: risks.slice(0, 4) };
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
  const pct = Math.min(100, Math.max(0, (score / maxScore) * 100));
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
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      {tip && <p className="text-[10px] text-muted-foreground/60">{tip}</p>}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[hsl(222,47%,9%)] border border-white/12 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-semibold text-primary">{payload[0].value}</p>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export default function PlayerBreakdownModal({ entry, onClose, settings }) {
  // All hooks must run unconditionally
  const gameData = useMemo(() => {
    const games = entry?.prop?.last_10_games ?? [];
    return [...games].reverse().map((v, i) => ({
      label: `G-${games.length - i}`,
      value: v,
    }));
  }, [entry?.prop?.last_10_games]);

  const similar = useMemo(
    () => findSimilarDefenses(entry?.player?.opponent ?? ''),
    [entry?.player?.opponent],
  );

  if (!entry) return null;

  const { player, prop, score } = entry;
  const pos      = player.position ?? 'WR';
  const opponent = player.opponent ?? '—';
  const defKey   = POS_DEF_KEY[pos];
  const defStat  = TEAM_STATS[opponent]?.[defKey];
  const leagueAvg = NFL_LEAGUE_AVGS[defKey];
  const rank     = defRank(opponent, defKey);
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

  const recentAvg = gameData.length >= 3
    ? Math.round(gameData.slice(-3).reduce((a, b) => a + b.value, 0) / 3) : null;
  const earlyAvg = gameData.length >= 3
    ? Math.round(gameData.slice(0, 3).reduce((a, b) => a + b.value, 0) / 3) : null;
  const trend = recentAvg != null && earlyAvg != null
    ? recentAvg > earlyAvg + 5 ? 'up' : recentAvg < earlyAvg - 5 ? 'down' : 'neutral'
    : 'neutral';

  const injStatus = (player.injury_status ?? 'healthy').toLowerCase();
  const hasInjury = injStatus !== 'healthy' && injStatus !== '';

  const summary = buildSummary(player, score, rank);
  const { likes, risks } = buildBullets(player, score, rank);

  const projRange = score.ceiling - score.floor;
  const projPct   = projRange > 0
    ? Math.round(((score.projection - score.floor) / projRange) * 100)
    : 50;

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
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

          {/* ── Sticky header ─────────────────────────────────────────────── */}
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
                {prop?.line != null && ` · ${propLabel} ${prop.line}`}
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

          {/* ── Scrollable body ───────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2.5" style={{ scrollbarWidth: 'none' }}>

            {/* Hero: Floor / Proj / Ceiling */}
            <div className="rounded-2xl border border-white/8 bg-white/3 p-4 space-y-3">
              <div className="grid grid-cols-3 divide-x divide-white/8">
                {[
                  { label: 'Floor',      value: score.floor,      color: 'text-red-400'     },
                  { label: 'Projection', value: score.projection,  color: 'text-primary'     },
                  { label: 'Ceiling',    value: score.ceiling,     color: 'text-emerald-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center px-2">
                    <div className={cn('text-2xl font-bold', color)}>{value}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{label} FP</div>
                  </div>
                ))}
              </div>

              {/* Projection range bar */}
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
                        transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
                      />
                      <span className="relative text-[11px] font-bold text-foreground pb-1">{pct}%</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Probability of exceeding each FP threshold based on floor / projection / ceiling spread.
              </p>
            </Section>

            {/* Recent Performance */}
            {gameData.length > 1 && (
              <Section title="Simulated Performance Trend" icon={BarChart2} defaultOpen>
                <div className="flex items-center gap-4 mb-2">
                  <div>
                    <div className="text-[10px] text-muted-foreground">Avg last 3</div>
                    <div className="text-sm font-semibold text-foreground">{prop?.avg_last_5}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Avg last 10</div>
                    <div className="text-sm font-semibold text-foreground">{prop?.avg_last_10}</div>
                  </div>
                  <div className="ml-auto">
                    {trend === 'up'   && <div className="flex items-center gap-1 text-[11px] text-emerald-400"><TrendingUp className="w-3.5 h-3.5" /> Trending up</div>}
                    {trend === 'down' && <div className="flex items-center gap-1 text-[11px] text-red-400"><TrendingDown className="w-3.5 h-3.5" /> Trending down</div>}
                    {trend === 'neutral' && <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Minus className="w-3.5 h-3.5" /> Stable</div>}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={110}>
                  <AreaChart data={gameData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip content={<ChartTooltip />} />
                    {prop?.line != null && (
                      <ReferenceLine y={prop.line} stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3" />
                    )}
                    <Area
                      type="monotone" dataKey="value"
                      stroke="hsl(var(--primary))" strokeWidth={2}
                      fill="url(#areaGrad)"
                      dot={{ fill: 'hsl(var(--primary))', r: 2.5, strokeWidth: 0 }}
                      activeDot={{ r: 4 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-muted-foreground">
                  Values derived from stat distribution model. Dashed line = prop line ({prop?.line} {propLabel}).
                </p>
              </Section>
            )}

            {/* Matchup Analysis */}
            <Section title={`Matchup vs ${opponent}`} icon={Shield} defaultOpen>
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
                  <p className="text-[11px] text-muted-foreground">
                    {rank <= 10
                      ? `${opponent} is one of the most generous defenses for ${pos}s — a clear green-light matchup.`
                      : rank <= 22
                      ? `${opponent} sits near league average against ${pos}s — a neutral matchup without a strong edge either way.`
                      : `${opponent} has been among the stingier defenses against ${pos}s — this headwind is reflected in the grade.`}
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
                  Defenses with the closest statistical profile to {opponent} this season:
                </p>
                <div className="space-y-2">
                  {similar.map(({ team, similarity }) => {
                    const simRank = defRank(team, defKey);
                    const simStat = TEAM_STATS[team]?.[defKey];
                    return (
                      <div key={team} className="flex items-center gap-3 rounded-xl bg-white/3 border border-white/8 px-3 py-2.5">
                        <TeamLogo team={team} className="w-7 h-7 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-foreground">{team}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {POS_DEF_LABEL[pos]}: {simStat} · Rank #{simRank}
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
                        <span className="text-emerald-500 mt-0.5 flex-shrink-0 font-bold">+</span>
                        {text}
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
                        <span className="text-amber-500 mt-0.5 flex-shrink-0 font-bold">−</span>
                        {text}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Section>

            {/* Player Trends */}
            <Section title="Player Snapshot" icon={TrendingUp} defaultOpen={false}>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    label: 'Depth Chart',
                    value: player.depth_chart_order === 1 ? 'Starter' : `Depth ${player.depth_chart_order}`,
                    good: player.depth_chart_order === 1,
                  },
                  {
                    label: 'Injury Status',
                    value: (player.injury_status ?? 'Healthy').charAt(0).toUpperCase() + (player.injury_status ?? 'Healthy').slice(1),
                    good: !hasInjury,
                  },
                  pos !== 'QB' && player.proj_rec != null && {
                    label: 'Est. Target Share',
                    value: prop?.target_share != null
                      ? `${Math.round(prop.target_share * 100)}%`
                      : `${Math.round((player.proj_rec / (pos === 'TE' ? 24 : 22)) * 100)}% est.`,
                    good: (prop?.target_share ?? 0) >= 0.15 || (player.proj_rec ?? 0) >= 4,
                  },
                  pos === 'RB' && player.proj_rush_yd != null && {
                    label: 'Est. Snap %',
                    value: prop?.snap_pct != null
                      ? `${Math.round(prop.snap_pct * 100)}%`
                      : `${Math.round(Math.min(75, (player.proj_rush_yd / 130) * 100))}% est.`,
                    good: (player.proj_rush_yd ?? 0) >= 60,
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
                ].filter(Boolean).map(({ label, value, good }) => (
                  <div key={label} className="rounded-xl bg-white/3 border border-white/8 px-3 py-2.5">
                    <div className="text-[10px] text-muted-foreground">{label}</div>
                    <div className={cn('text-xs font-semibold mt-0.5', good ? 'text-emerald-400' : 'text-amber-400')}>
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
                    Monitor the official injury report before finalizing your lineup decision.
                  </p>
                </div>
              </Section>
            )}

            {/* Betting Context stub */}
            <Section title="Betting Context" icon={Target} defaultOpen={false}>
              <div className="rounded-xl bg-white/3 border border-white/8 px-4 py-3 text-center">
                <p className="text-[11px] text-muted-foreground">
                  Live betting lines (spread, O/U, player props) require a connected sportsbook API.
                  Set <code className="text-primary/80 text-[10px]">VITE_API_URL</code> in Vercel to your
                  backend to enable this section.
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
