import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Shield, Target, BarChart2, Zap, AlertTriangle,
  TrendingUp, TrendingDown, ChevronDown, ChevronUp, Star,
} from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { analyzeGame, normalizeForRadar, TEAM_OFFENSE, LEAGUE_OFFENSE_AVG } from '@/lib/gameAnalysis';
import { TEAM_STATS, NFL_LEAGUE_AVGS } from '@/lib/teamStats';
import TeamLogo from '@/components/common/TeamLogo';
import { cn } from '@/lib/utils';

// ─── Mini helpers ─────────────────────────────────────────────────────────────

function Stars({ count }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={cn('w-3 h-3', i <= count ? 'text-amber-400 fill-amber-400' : 'text-white/15')} />
      ))}
    </span>
  );
}

function ConfMeta({ confidence }) {
  const stars = confidence >= 85 ? 5 : confidence >= 76 ? 4 : confidence >= 66 ? 3 : confidence >= 56 ? 2 : 1;
  const label = ['Avoid', 'Low', 'Moderate', 'Strong', 'Elite'][stars - 1];
  const cls   = ['text-red-400','text-orange-400','text-amber-400','text-sky-400','text-emerald-400'][stars - 1];
  return (
    <div className="flex items-center gap-2">
      <Stars count={stars} />
      <span className={cn('text-[11px] font-bold', cls)}>{label} Confidence</span>
    </div>
  );
}

function SectionToggle({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-white/8 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white/4 hover:bg-white/7 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {Icon && <Icon className="w-4 h-4 text-primary" />}
          {title}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 pt-2">{children}</div>}
    </div>
  );
}

function StatRow({ label, home, away, higherIsBetter = true }) {
  const hNum = parseFloat(home);
  const aNum = parseFloat(away);
  const homeWins = higherIsBetter ? hNum > aNum : hNum < aNum;
  const awayWins = higherIsBetter ? aNum > hNum : aNum < hNum;
  const delta = Math.abs(hNum - aNum);
  const significant = delta > (higherIsBetter ? hNum * 0.05 : hNum * 0.04);
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 py-1.5 border-b border-white/5 last:border-0">
      <span className={cn('text-[12px] font-bold text-right',
        homeWins && significant ? 'text-emerald-400' : 'text-foreground'
      )}>{home}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider text-center px-2 whitespace-nowrap">{label}</span>
      <span className={cn('text-[12px] font-bold text-left',
        awayWins && significant ? 'text-emerald-400' : 'text-foreground'
      )}>{away}</span>
    </div>
  );
}

const GRADE_COLORS = {
  emerald: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
  sky:     'text-sky-400 bg-sky-500/15 border-sky-500/30',
  amber:   'text-amber-400 bg-amber-500/15 border-amber-500/30',
  orange:  'text-orange-400 bg-orange-500/15 border-orange-500/30',
  red:     'text-red-400 bg-red-500/15 border-red-500/30',
};

function GradeChip({ letter, color }) {
  return (
    <span className={cn('text-[11px] font-black px-2 py-0.5 rounded-full border', GRADE_COLORS[color] ?? GRADE_COLORS.amber)}>
      {letter}
    </span>
  );
}

const FACTOR_COLORS = [
  '#6366f1','#8b5cf6','#a78bfa','#818cf8','#60a5fa',
  '#34d399','#fbbf24','#f87171','#fb923c','#e879f9',
];

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function GameBreakdownModal({ game, onClose, liveStats = null }) {
  const analysis = useMemo(() => analyzeGame(game, liveStats), [game, liveStats]);
  const {
    hA, aA, homeScore, awayScore, homeRating, awayRating,
    sim, adv, posMaps, explanation,
    spreadPick, ouPick, confidence,
    ourSpread, bookSpread,
    homeOff, awayOff, homeDef, awayDef, homeQB, awayQB,
    aiReasoningFactors, whatCouldChange, upsetWatch,
  } = analysis;

  const homeRadar = useMemo(() => normalizeForRadar(hA), [hA]);
  const awayRadar = useMemo(() => normalizeForRadar(aA), [aA]);

  const radarData = homeRadar.map((d, i) => ({
    metric: d.metric,
    [hA]: d.value,
    [aA]: awayRadar[i]?.value ?? 70,
  }));

  const gameDate = new Date(game.commence_time);
  const dateStr  = gameDate.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York',
  });
  const tipoff = gameDate.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  }) + ' ET';

  const favored  = homeScore >= awayScore ? hA : aA;
  const winPct   = homeScore >= awayScore ? sim.homeWinPct : sim.awayWinPct;
  const margin   = Math.abs(homeScore - awayScore).toFixed(1);
  const riskLevel = confidence >= 75 ? { label: 'Low', color: 'emerald' }
                  : confidence >= 63 ? { label: 'Medium', color: 'amber' }
                  : { label: 'High', color: 'red' };

  return (
    <AnimatePresence>
      <motion.div
        key="gb-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

        <motion.div
          key="gb-panel"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="relative z-10 w-full sm:max-w-2xl max-h-[96dvh] flex flex-col bg-[hsl(222,47%,7%)] rounded-t-3xl sm:rounded-3xl border border-white/10 shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* ── Sticky header ── */}
          <div className="sticky top-0 z-20 bg-[hsl(222,47%,7%)]/96 backdrop-blur-sm border-b border-white/8 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <TeamLogo team={game.awayAbv} className="w-8 h-8 flex-shrink-0" />
                <span className="text-xs font-bold text-muted-foreground">{aA}</span>
                <span className="text-xs text-muted-foreground px-1">@</span>
                <span className="text-xs font-bold text-foreground">{hA}</span>
                <TeamLogo team={game.homeAbv} className="w-8 h-8 flex-shrink-0" />
                <span className="text-[10px] text-muted-foreground ml-1 hidden sm:inline">{dateStr} · {tipoff}</span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right hidden sm:block">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">AI Pick</div>
                  <div className="text-sm font-black text-primary">{favored}</div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-white/8 hover:bg-white/15 transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* ── Scrollable body ── */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-3" style={{ scrollbarWidth: 'none' }}>

            {/* ── Win probability hero ── */}
            <div className="rounded-xl bg-white/4 border border-white/8 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TeamLogo team={game.awayAbv} className="w-10 h-10" />
                  <div>
                    <div className="text-sm font-black text-foreground">{aA}</div>
                    <div className="text-[10px] text-muted-foreground">Away · {sim.awayWinPct}% win</div>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-black text-foreground">{awayScore} – {homeScore}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Projected</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className="text-sm font-black text-foreground">{hA}</div>
                    <div className="text-[10px] text-muted-foreground">Home · {sim.homeWinPct}% win</div>
                  </div>
                  <TeamLogo team={game.homeAbv} className="w-10 h-10" />
                </div>
              </div>
              {/* Win probability bar */}
              <div className="mb-2">
                <div className="h-3 rounded-full overflow-hidden flex bg-secondary/50">
                  <div className="bg-blue-500 rounded-l-full transition-all" style={{ width: `${Math.max(sim.awayWinPct, 6)}%` }} />
                  <div className="bg-emerald-500 flex-1 rounded-r-full transition-all" />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-blue-400 font-semibold">{aA} {sim.awayWinPct}%</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Win Probability</span>
                  <span className="text-[10px] text-emerald-400 font-semibold">{sim.homeWinPct}% {hA}</span>
                </div>
              </div>
              <ConfMeta confidence={confidence} />
            </div>

            {/* ── Prediction Summary cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { label: 'AI Winner',       value: favored,                            sub: `${winPct}% probability`,    color: 'primary' },
                { label: 'Spread Pick',      value: `${spreadPick} -${Math.abs(ourSpread).toFixed(1)}`, sub: 'model projection', color: 'sky' },
                { label: 'Total',           value: ouPick,                             sub: `${(homeScore + awayScore).toFixed(1)} projected`, color: ouPick === 'OVER' ? 'emerald' : 'red' },
                { label: 'Cover Prob',      value: `${favored === hA ? sim.homeCoverPct : sim.awayCoverPct}%`, sub: `${favored} covers`,  color: 'amber' },
                { label: 'Confidence',      value: `${confidence}%`,                   sub: riskLevel.label + ' risk',   color: riskLevel.color },
                { label: 'Value Rating',    value: `${Math.round(confidence / 10)}/10`, sub: bookSpread != null && Math.abs(ourSpread - bookSpread) >= 2.5 ? 'Line value detected' : 'Market aligned', color: 'violet' },
              ].map(({ label, value, sub, color }) => (
                <div key={label} className="rounded-xl bg-white/4 border border-white/8 p-3 flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
                  <span className={cn('text-base font-black',
                    color === 'primary'  ? 'text-primary' :
                    color === 'sky'      ? 'text-sky-400' :
                    color === 'emerald'  ? 'text-emerald-400' :
                    color === 'red'      ? 'text-red-400' :
                    color === 'amber'    ? 'text-amber-400' :
                    color === 'violet'   ? 'text-violet-400' :
                    'text-foreground'
                  )}>{value}</span>
                  <span className="text-[10px] text-muted-foreground">{sub}</span>
                </div>
              ))}
            </div>

            {/* ── AI Explanation ── */}
            <SectionToggle title="AI Scouting Report" icon={Target}>
              <p className="text-[13px] text-foreground/90 leading-relaxed">{explanation}</p>
            </SectionToggle>

            {/* ── Upset Watch ── */}
            {upsetWatch && (
              <SectionToggle
                title={`🚨 ${upsetWatch.tier}: ${upsetWatch.underdog}`}
                icon={AlertTriangle}
                defaultOpen={true}
              >
                {/* Upset probability meter */}
                <div className={cn(
                  'rounded-lg border p-3 mb-3',
                  upsetWatch.tierColor === 'red'    ? 'bg-red-500/8 border-red-500/20' :
                  upsetWatch.tierColor === 'orange' ? 'bg-orange-500/8 border-orange-500/20' :
                                                      'bg-amber-500/8 border-amber-500/20'
                )}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className={cn('text-sm font-black',
                        upsetWatch.tierColor === 'red'    ? 'text-red-400' :
                        upsetWatch.tierColor === 'orange' ? 'text-orange-400' : 'text-amber-400'
                      )}>{upsetWatch.underdog} upset probability</span>
                      {upsetWatch.udIsHome && (
                        <span className="ml-2 text-[10px] bg-white/10 text-foreground px-1.5 py-0.5 rounded-full">Home Dog</span>
                      )}
                    </div>
                    <span className={cn('text-2xl font-black',
                      upsetWatch.tierColor === 'red'    ? 'text-red-400' :
                      upsetWatch.tierColor === 'orange' ? 'text-orange-400' : 'text-amber-400'
                    )}>{upsetWatch.udWinPct}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all',
                        upsetWatch.tierColor === 'red' ? 'bg-red-500' :
                        upsetWatch.tierColor === 'orange' ? 'bg-orange-500' : 'bg-amber-500'
                      )}
                      style={{ width: `${upsetWatch.udWinPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-muted-foreground">{upsetWatch.underdog}</span>
                    <span className="text-[10px] text-muted-foreground">{upsetWatch.favored}</span>
                  </div>
                </div>

                {/* Why reasons */}
                <div className="space-y-2 mb-3">
                  {upsetWatch.reasons.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 text-[12px] text-foreground/85 leading-snug">
                      <span className={cn('flex-shrink-0 font-black mt-0.5',
                        upsetWatch.tierColor === 'red' ? 'text-red-400' :
                        upsetWatch.tierColor === 'orange' ? 'text-orange-400' : 'text-amber-400'
                      )}>›</span>
                      {r}
                    </div>
                  ))}
                </div>

                {/* Key factors grid */}
                {upsetWatch.keyFactors.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {upsetWatch.keyFactors.map((f, i) => (
                      <div key={i} className={cn(
                        'rounded-lg border p-2',
                        upsetWatch.tierColor === 'red'    ? 'bg-red-500/8 border-red-500/15' :
                        upsetWatch.tierColor === 'orange' ? 'bg-orange-500/8 border-orange-500/15' :
                                                            'bg-amber-500/8 border-amber-500/15'
                      )}>
                        <div className={cn('text-[10px] font-bold mb-0.5',
                          upsetWatch.tierColor === 'red' ? 'text-red-400' :
                          upsetWatch.tierColor === 'orange' ? 'text-orange-400' : 'text-amber-400'
                        )}>{f.label}</div>
                        <div className="text-[11px] text-foreground/80">{f.description}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upset score bar */}
                <div className="mb-2">
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] text-muted-foreground">Upset Confidence Score</span>
                    <span className="text-[10px] font-bold text-foreground">{upsetWatch.upsetScore}/100</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/8">
                    <div
                      className={cn('h-full rounded-full',
                        upsetWatch.upsetScore >= 70 ? 'bg-red-500' :
                        upsetWatch.upsetScore >= 50 ? 'bg-orange-500' : 'bg-amber-500'
                      )}
                      style={{ width: `${upsetWatch.upsetScore}%` }}
                    />
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground italic leading-snug">
                  {upsetWatch.historicalNote}
                </p>
              </SectionToggle>
            )}

            {/* ── Team Comparison ── */}
            <SectionToggle title="Team Comparison" icon={BarChart2}>
              <div className="grid grid-cols-[1fr_auto_1fr] text-center mb-2 px-2">
                <div className="flex items-center gap-1.5 justify-end">
                  <span className="text-xs font-black text-foreground">{aA}</span>
                  <TeamLogo team={game.awayAbv} className="w-6 h-6" />
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider px-3">Stat</div>
                <div className="flex items-center gap-1.5 justify-start">
                  <TeamLogo team={game.homeAbv} className="w-6 h-6" />
                  <span className="text-xs font-black text-foreground">{hA}</span>
                </div>
              </div>

              <div className="space-y-0">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider px-2 py-1.5 bg-white/3 rounded-t-lg mt-2">Offense</div>
                <StatRow label="Pts/G Scored"    home={String(homeOff?.pts ?? '—')} away={String(awayOff?.pts ?? '—')} />
                <StatRow label="Total Yds/G"     home={String(homeOff?.yds ?? '—')} away={String(awayOff?.yds ?? '—')} />
                <StatRow label="Pass Yds/G"      home={String(homeOff?.pass ?? '—')} away={String(awayOff?.pass ?? '—')} />
                <StatRow label="Rush Yds/G"      home={String(homeOff?.rush ?? '—')} away={String(awayOff?.rush ?? '—')} />
                <StatRow label="3rd Down %"      home={String(homeOff?.third ?? '—')} away={String(awayOff?.third ?? '—')} />
                <StatRow label="Red Zone TD %"   home={String(homeOff?.rz ?? '—')} away={String(awayOff?.rz ?? '—')} />
                <StatRow label="Turnovers/G"     home={String(homeOff?.to ?? '—')} away={String(awayOff?.to ?? '—')} higherIsBetter={false} />

                <div className="text-[10px] text-muted-foreground uppercase tracking-wider px-2 py-1.5 bg-white/3 mt-3">Defense</div>
                <StatRow label="Pass Yds Allowed" home={String(homeDef?.pass_yds_allowed ?? '—')} away={String(awayDef?.pass_yds_allowed ?? '—')} higherIsBetter={false} />
                <StatRow label="Rush Yds Allowed" home={String(homeDef?.rush_yds_allowed ?? '—')} away={String(awayDef?.rush_yds_allowed ?? '—')} higherIsBetter={false} />
                <StatRow label="WR Rec Yds Alwd"  home={String(homeDef?.rec_yds_allowed_wr ?? '—')} away={String(awayDef?.rec_yds_allowed_wr ?? '—')} higherIsBetter={false} />
                <StatRow label="TE Rec Yds Alwd"  home={String(homeDef?.rec_yds_allowed_te ?? '—')} away={String(awayDef?.rec_yds_allowed_te ?? '—')} higherIsBetter={false} />
              </div>
            </SectionToggle>

            {/* ── Efficiency Radar ── */}
            <SectionToggle title="Team Efficiency Radar" icon={BarChart2} defaultOpen={false}>
              <div className="text-[10px] text-muted-foreground mb-3 text-center">Normalized vs league average (70 = avg)</div>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgba(255,255,255,0.08)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                  <Radar name={aA} dataKey={aA} stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.18} strokeWidth={2} />
                  <Radar name={hA} dataKey={hA} stroke="#34d399" fill="#34d399" fillOpacity={0.18} strokeWidth={2} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(222,47%,11%)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                </RadarChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-6 mt-1">
                <span className="flex items-center gap-1.5 text-[11px] text-blue-400"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />{aA}</span>
                <span className="flex items-center gap-1.5 text-[11px] text-emerald-400"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />{hA}</span>
              </div>
            </SectionToggle>

            {/* ── Matchup Advantages ── */}
            <SectionToggle title="Matchup Advantages" icon={Shield}>
              <div className="space-y-2">
                {adv.map((a, i) => (
                  <div key={i} className={cn(
                    'rounded-lg border px-3 py-2.5 flex items-start gap-2',
                    a.winner === hA ? 'bg-emerald-500/8 border-emerald-500/20' :
                    a.winner === aA ? 'bg-blue-500/8 border-blue-500/20' :
                    'bg-white/4 border-white/8'
                  )}>
                    <span className="text-[10px] font-black pt-0.5 flex-shrink-0 min-w-[80px]">{a.label}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] text-foreground/80">{a.desc}</span>
                    </div>
                    {a.winner && (
                      <span className={cn(
                        'text-[9px] font-black px-1.5 py-0.5 rounded-full border flex-shrink-0',
                        a.winner === hA ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-blue-500/20 border-blue-500/30 text-blue-400'
                      )}>
                        {a.winner}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </SectionToggle>

            {/* ── Position Matchups ── */}
            <SectionToggle title="Position Matchups" icon={Target} defaultOpen={false}>
              <div className="space-y-1.5">
                {posMaps.map((pm, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-white/3 px-3 py-2 border border-white/5">
                    <GradeChip letter={pm.grade.letter} color={pm.grade.color} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-foreground truncate">{pm.label}</div>
                      <div className="text-[10px] text-muted-foreground">{pm.detail}</div>
                    </div>
                    <span className={cn(
                      'text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0',
                      pm.favors === hA ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                    )}>
                      {pm.favors}
                    </span>
                  </div>
                ))}
              </div>
            </SectionToggle>

            {/* ── Simulation Results ── */}
            <SectionToggle title="Monte Carlo Simulation (5,000 games)" icon={BarChart2} defaultOpen={false}>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  { label: `${hA} Win`,       value: `${sim.homeWinPct}%`,   color: 'emerald' },
                  { label: `${aA} Win`,        value: `${sim.awayWinPct}%`,   color: 'blue' },
                  { label: `${hA} Covers`,    value: `${sim.homeCoverPct}%`, color: 'sky' },
                  { label: `${aA} Covers`,    value: `${sim.awayCoverPct}%`, color: 'violet' },
                  { label: 'Over %',           value: `${sim.overPct}%`,      color: 'amber' },
                  { label: 'Under %',          value: `${sim.underPct}%`,     color: 'orange' },
                  { label: 'Avg Total',        value: String(sim.avgTotal),   color: 'white' },
                  { label: 'Margin',           value: `${favored} -${margin}`, color: 'primary' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-lg bg-white/4 border border-white/6 px-3 py-2 flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
                    <span className={cn('text-sm font-black',
                      color === 'emerald' ? 'text-emerald-400' :
                      color === 'blue'    ? 'text-blue-400' :
                      color === 'sky'     ? 'text-sky-400' :
                      color === 'violet'  ? 'text-violet-400' :
                      color === 'amber'   ? 'text-amber-400' :
                      color === 'orange'  ? 'text-orange-400' :
                      color === 'primary' ? 'text-primary' :
                      'text-foreground'
                    )}>{value}</span>
                  </div>
                ))}
              </div>
              {/* Cover probability bars */}
              <div className="space-y-1.5">
                <div>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-[10px] text-muted-foreground">{hA} Cover</span>
                    <span className="text-[10px] font-bold text-emerald-400">{sim.homeCoverPct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/8">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${sim.homeCoverPct}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-[10px] text-muted-foreground">Over</span>
                    <span className="text-[10px] font-bold text-amber-400">{sim.overPct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/8">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${sim.overPct}%` }} />
                  </div>
                </div>
              </div>
            </SectionToggle>

            {/* ── AI Reasoning Factors ── */}
            <SectionToggle title="AI Reasoning Factors" icon={BarChart2} defaultOpen={false}>
              <p className="text-[11px] text-muted-foreground mb-3">How much each category contributed to this prediction:</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={aiReasoningFactors} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
                  <XAxis type="number" domain={[0, 25]} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 10, fill: 'hsl(var(--foreground))' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={v => [`${v}%`, 'Weight']}
                    contentStyle={{ background: 'hsl(222,47%,11%)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                  />
                  <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                    {aiReasoningFactors.map((_, i) => <Cell key={i} fill={FACTOR_COLORS[i % FACTOR_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </SectionToggle>

            {/* ── What Could Change ── */}
            <SectionToggle title="What Could Change This Prediction" icon={AlertTriangle} defaultOpen={false}>
              <ul className="space-y-1.5">
                {whatCouldChange.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-foreground/80">
                    <span className="w-1 h-1 rounded-full bg-amber-400 mt-[6px] flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </SectionToggle>

            {/* ── Advanced Analytics ── */}
            <SectionToggle title="Advanced Analytics" icon={TrendingUp} defaultOpen={false}>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Power Rating',    home: homeRating,                      away: awayRating,                      unit: '/100' },
                  { label: 'QB Rating',       home: homeQB,                          away: awayQB,                          unit: '/100' },
                  { label: 'Pass Efficiency', home: homeOff?.pass ?? '—',            away: awayOff?.pass ?? '—',            unit: ' yds/G' },
                  { label: 'Rush Efficiency', home: homeOff?.rush ?? '—',            away: awayOff?.rush ?? '—',            unit: ' yds/G' },
                  { label: 'Turnover Rate',   home: homeOff?.to ?? '—',              away: awayOff?.to ?? '—',              unit: '/G', lowerBetter: true },
                  { label: 'Def Pass Rank',   home: homeDef?.pass_yds_allowed ?? '—', away: awayDef?.pass_yds_allowed ?? '—', unit: ' alwd', lowerBetter: true },
                  { label: 'Def Rush Rank',   home: homeDef?.rush_yds_allowed ?? '—', away: awayDef?.rush_yds_allowed ?? '—', unit: ' alwd', lowerBetter: true },
                  { label: '3rd Down %',      home: `${homeOff?.third ?? '—'}%`,    away: `${awayOff?.third ?? '—'}%`,    unit: '' },
                  { label: 'Red Zone TD%',    home: `${homeOff?.rz ?? '—'}%`,       away: `${awayOff?.rz ?? '—'}%`,       unit: '' },
                  { label: 'Proj O/U',        home: (homeScore + awayScore).toFixed(1), away: game.total?.line != null ? String(game.total.line) : '—', unit: '' },
                ].map(({ label, home, away, unit, lowerBetter }) => {
                  const hN = parseFloat(home); const aN = parseFloat(away);
                  const hWin = !isNaN(hN) && !isNaN(aN) && (lowerBetter ? hN < aN : hN > aN);
                  const aWin = !isNaN(hN) && !isNaN(aN) && (lowerBetter ? aN < hN : aN > hN);
                  return (
                    <div key={label} className="rounded-lg bg-white/4 border border-white/6 px-3 py-2">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
                      <div className="flex justify-between items-end">
                        <span className={cn('text-[11px] font-bold', hWin ? 'text-emerald-400' : 'text-foreground')}>
                          {hA}: {home}{unit}
                        </span>
                        <span className={cn('text-[11px] font-bold', aWin ? 'text-emerald-400' : 'text-foreground')}>
                          {aA}: {away}{unit}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionToggle>

            {/* ── AI Recommendation ── */}
            <div className="rounded-xl border border-primary/30 bg-primary/8 p-4">
              <div className="text-[10px] text-primary uppercase tracking-wider font-bold mb-2">AI Recommendation</div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="text-base font-black text-foreground">Best Bet: {spreadPick} {ourSpread > 0 ? '-' : '+'}{Math.abs(ourSpread).toFixed(1)}</div>
                  <div className="text-[12px] text-muted-foreground mt-1">
                    {ouPick} the total · Confidence {confidence}% · Risk: {riskLevel.label}
                  </div>
                  <p className="text-[12px] text-foreground/80 mt-2 leading-relaxed">
                    {adv.filter(a => a.winner === spreadPick).map(a => a.label.toLowerCase()).slice(0, 2).join(', ')} advantage
                    {bookSpread != null && Math.abs(ourSpread - bookSpread) >= 2 ? ` · value gap vs book (${bookSpread > 0 ? '+' : ''}${bookSpread} line)` : ''}.
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={cn('text-2xl font-black', confidence >= 75 ? 'text-emerald-400' : confidence >= 63 ? 'text-amber-400' : 'text-orange-400')}>
                    {confidence}%
                  </div>
                  <div className="text-[10px] text-muted-foreground">Confidence</div>
                  <ConfMeta confidence={confidence} />
                </div>
              </div>
            </div>

            <div className="h-safe-area-inset-bottom" />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
