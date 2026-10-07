import React, { useState, useMemo, useEffect } from 'react';
import { Link2, Loader2, ArrowRightLeft, Shield, TrendingDown, Users, Swords, AlertTriangle, Search } from 'lucide-react';
import PlayerAvatar from '@/components/common/PlayerAvatar';
import InjuryTag from '@/components/common/InjuryTag';
import { cn } from '@/lib/utils';
import { getMyTeam, fetchWeekMatchup, DEFAULT_SLOTS } from '@/lib/leagueConnect';
import { indexRos } from '@/lib/rosRankings';
import {
  SLOT_LABEL, TRADE_POSITIONS, positionOf, nameOf, weeklyPoints, rosPerGame,
  optimalLineup, teamProfiles, needsAndSurplus, sellCandidates, handcuffs,
  tradeTargets, buildTradeOffers, predictMatchup,
} from '@/lib/teamAnalysis';

const CARD = 'rounded-2xl border border-white/6 bg-[hsl(222,47%,9%)]';
const LABEL_CLS = {
  Deep:  'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
  Solid: 'bg-white/6 border-white/12 text-muted-foreground',
  Thin:  'bg-red-500/15 border-red-500/30 text-red-400',
};

function PlayerLine({ ctx, id, right, sub, className }) {
  const p = ctx.playersById[id];
  const idx = ctx.index?.[id];
  const pos = positionOf(ctx, id);
  // Players outside the live list (IR, deep bench) still get their roster-index status
  const tagPlayer = p ?? (idx ? { injury_status: idx.i } : null);
  return (
    <div className={cn('flex items-center gap-3 min-w-0', className)}>
      <PlayerAvatar photo={p?.photo_url} team={p?.team ?? idx?.t} className="w-9 h-9 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-semibold text-foreground truncate">{nameOf(ctx, id)}</span>
          {tagPlayer && <InjuryTag player={tagPlayer} />}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">
          {sub ?? `${pos === 'DEF' ? 'D/ST' : pos ?? '—'} · ${p?.team ?? idx?.t ?? 'FA'}${p?.opponent && p.opponent !== 'TBD' ? ` vs ${p.opponent}` : ''}`}
        </div>
      </div>
      {right != null && <div className="flex-shrink-0 text-right">{right}</div>}
    </div>
  );
}

function SectionTitle({ icon: Icon, children, note }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
        {Icon && <Icon className="w-4 h-4 text-primary" />}{children}
      </h3>
      {note && <span className="text-[10px] text-muted-foreground">{note}</span>}
    </div>
  );
}

const SUBTABS = [
  { key: 'lineup',  label: 'Lineup',  icon: Users },
  { key: 'matchup', label: 'Matchup', icon: Swords },
  { key: 'advice',  label: 'Advice',  icon: TrendingDown },
  { key: 'trade',   label: 'Trade',   icon: ArrowRightLeft },
];

export default function MyTeamPanel({ league, players, index, rosByPos, outlook, trendIndex, settings, week, onConnect }) {
  const [sub, setSub] = useState('lineup');
  const [tradeTarget, setTradeTarget] = useState(null);

  const myTeam = getMyTeam(league);

  const ctx = useMemo(() => {
    if (!league || !players?.length) return null;
    const playersById = Object.fromEntries(players.map(p => [String(p.id), p]));
    return {
      playersById, index, settings, outlook, trendIndex: trendIndex ?? {},
      rosIdx: indexRos(rosByPos),
      slots: league.slots?.length ? league.slots : DEFAULT_SLOTS,
      teams: league.teams,
    };
  }, [league, players, index, rosByPos, settings, outlook, trendIndex]);

  if (!league || !myTeam) {
    return (
      <div className={cn(CARD, 'p-6 text-center space-y-3')}>
        <Link2 className="w-8 h-8 mx-auto text-primary/60" />
        <p className="text-sm font-semibold text-foreground">
          {league ? 'Pick which team is yours' : 'Connect your league to see your team'}
        </p>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          My Team needs your league so it can read your roster, your lineup slots, the other teams’ rosters (for trades),
          and this week’s opponent. Sleeper and ESPN are supported.
        </p>
        <button onClick={onConnect} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
          {league ? 'Choose team' : 'Connect League'}
        </button>
      </div>
    );
  }
  if (!ctx) {
    return <div className="flex items-center justify-center py-16 text-sm text-muted-foreground gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading players…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-white/4 rounded-xl p-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {SUBTABS.map(t => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            className={cn(
              'flex-1 min-w-fit flex items-center justify-center gap-1 px-2.5 py-1.5 text-[12px] font-semibold rounded-lg transition-all whitespace-nowrap',
              sub === t.key ? 'bg-primary/20 text-primary border border-primary/30' : 'text-muted-foreground hover:text-foreground border border-transparent',
            )}
          >
            <t.icon className="w-3.5 h-3.5 hidden sm:block" />{t.label}
          </button>
        ))}
      </div>

      {!outlook && sub !== 'lineup' && sub !== 'matchup' && (
        <div className="rounded-xl bg-amber-500/8 border border-amber-500/20 px-3 py-2 text-[11px] text-amber-300 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" /> Loading rest-of-season data — advice and trades need it.
        </div>
      )}

      {sub === 'lineup'  && <LineupView ctx={ctx} team={myTeam} league={league} />}
      {sub === 'matchup' && <MatchupView ctx={ctx} team={myTeam} league={league} week={week} />}
      {sub === 'advice'  && outlook && <AdviceView ctx={ctx} team={myTeam} onTrade={id => { setTradeTarget(id); setSub('trade'); }} />}
      {sub === 'trade'   && outlook && <TradeView ctx={ctx} team={myTeam} target={tradeTarget} setTarget={setTradeTarget} />}
    </div>
  );
}

// ── Lineup ────────────────────────────────────────────────────────────────────
function StrengthRow({ ctx, teamId }) {
  const profile = useMemo(() => teamProfiles(ctx).find(p => p.id === teamId), [ctx, teamId]);
  if (!profile || !Object.keys(ctx.rosIdx).length) return null;
  return (
    <div className="flex gap-1.5 flex-wrap">
      {TRADE_POSITIONS.map(pos => (
        <span key={pos} title={`${Math.round(profile.byPos[pos].ratio * 100)}% of league median at ${pos}`}
          className={cn('text-[10px] font-bold px-2 py-0.5 rounded-md border', LABEL_CLS[profile.byPos[pos].label])}>
          {pos} · {profile.byPos[pos].label}
        </span>
      ))}
    </div>
  );
}

function LineupView({ ctx, team, league }) {
  const lineup = useMemo(() => optimalLineup(ctx, team.playerIds, id => weeklyPoints(ctx, id), ctx.slots), [ctx, team]);
  const setIds = team.starters ?? [];
  const changes = setIds.length
    ? lineup.starters.filter(s => s.id && !setIds.includes(s.id)).map(s => nameOf(ctx, s.id))
    : [];
  return (
    <div className="space-y-4">
      <div className={cn(CARD, 'p-4 space-y-3')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-bold text-foreground truncate">{team.name}</div>
            <div className="text-[11px] text-muted-foreground">{league.name} · {team.playerIds.length} players</div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-lg font-bold text-primary tabular-nums">{lineup.total}</div>
            <div className="text-[10px] text-muted-foreground">proj. this week</div>
          </div>
        </div>
        <StrengthRow ctx={ctx} teamId={team.id} />
        {changes.length > 0 && (
          <p className="text-[11px] text-amber-300">Your current lineup differs — the app would start {changes.join(', ')}.</p>
        )}
      </div>

      <div className="space-y-2">
        <SectionTitle icon={Users} note={`${ctx.settings?.scoring === 'ppr' ? 'PPR' : ctx.settings?.scoring === 'half_ppr' ? 'Half PPR' : 'Standard'} · your league’s slots`}>
          Recommended lineup
        </SectionTitle>
        <div className={cn(CARD, 'divide-y divide-white/5')}>
          {lineup.starters.map(s => (
            <div key={s.i} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="w-12 text-[10px] font-bold text-muted-foreground flex-shrink-0">{SLOT_LABEL[s.slot] ?? s.slot}</span>
              {s.id ? (
                <PlayerLine ctx={ctx} id={s.id} className="flex-1"
                  right={<span className="text-sm font-semibold text-foreground tabular-nums">{s.value}</span>} />
              ) : <span className="text-xs text-muted-foreground">Empty — no eligible player</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle note="sorted by this week’s projection">Bench</SectionTitle>
        <div className={cn(CARD, 'divide-y divide-white/5')}>
          {lineup.bench.map(id => (
            <div key={id} className="px-3.5 py-2.5">
              <PlayerLine ctx={ctx} id={id}
                right={<span className="text-sm text-muted-foreground tabular-nums">{weeklyPoints(ctx, id) || '—'}</span>} />
            </div>
          ))}
          {lineup.bench.length === 0 && <p className="px-3.5 py-3 text-xs text-muted-foreground">No bench players.</p>}
        </div>
      </div>
    </div>
  );
}

// ── Matchup ───────────────────────────────────────────────────────────────────
function MatchupView({ ctx, team, league, week }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let alive = true;
    setState({ loading: true });
    fetchWeekMatchup(league, week)
      .then(m => alive && setState({ loading: false, matchup: m }))
      .catch(e => alive && setState({ loading: false, error: e.message }));
    return () => { alive = false; };
  }, [league, week]);

  const result = useMemo(() => {
    if (!state.matchup) return null;
    const opp = league.teams.find(t => t.id === state.matchup.opponentTeamId);
    if (!opp) return null;
    return {
      opp,
      ...predictMatchup(ctx,
        { starters: state.matchup.myStarters, all: team.playerIds },
        { starters: state.matchup.oppStarters, all: opp.playerIds }),
    };
  }, [state.matchup, ctx, team, league]);

  if (state.loading) return <div className="flex items-center justify-center py-16 text-sm text-muted-foreground gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading matchup…</div>;
  if (state.error) return <div className={cn(CARD, 'p-4 text-sm text-red-300')}>{state.error}</div>;
  if (!result) {
    return (
      <div className={cn(CARD, 'p-5 text-sm text-muted-foreground text-center')}>
        No head-to-head matchup found for week {state.matchup?.week ?? week} — you may be on a bye, or the league hasn’t published its schedule.
        {league.platform === 'espn' && ' Re-sync the league to refresh ESPN matchups.'}
      </div>
    );
  }
  const { opp, my, their, winProb, keyMine, keyTheirs, fixes } = result;
  return (
    <div className="space-y-4">
      <div className={cn(CARD, 'p-4 space-y-3')}>
        <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Week {state.matchup.week}</div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">{team.name}</div>
            <div className="text-2xl font-bold text-primary tabular-nums">{my.total}</div>
          </div>
          <span className="text-[10px] font-bold text-muted-foreground">VS</span>
          <div className="min-w-0 text-right">
            <div className="text-sm font-semibold text-foreground truncate">{opp.name}</div>
            <div className="text-2xl font-bold text-foreground tabular-nums">{their.total}</div>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-primary font-semibold">{winProb}% win</span>
            <span className="text-muted-foreground">{100 - winProb}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/8 overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${winProb}%` }} />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Your side uses the app’s recommended lineup{my.setTotal != null ? ` (your set lineup projects ${my.setTotal})` : ''}.
          {their.usedOptimal ? ' Opponent hasn’t set a lineup — using their best projected lineup.' : ' Opponent side uses their lineup as currently set.'}
        </p>
      </div>

      {fixes.length > 0 && (
        <div className="rounded-xl bg-amber-500/8 border border-amber-500/20 px-3 py-2.5 space-y-1">
          {fixes.map((f, i) => (
            <p key={i} className="text-[12px] text-amber-300 flex items-start gap-2"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{f}</p>
          ))}
        </div>
      )}

      {[['Your swing players', keyMine], [`${opp.name}’s swing players`, keyTheirs]].map(([title, list]) => (
        <div key={title} className="space-y-2">
          <SectionTitle note="highest week-to-week variance">{title}</SectionTitle>
          <div className={cn(CARD, 'divide-y divide-white/5')}>
            {list.map(k => (
              <div key={k.id} className="px-3.5 py-2.5">
                <PlayerLine ctx={ctx} id={k.id} sub={k.text} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Advice ────────────────────────────────────────────────────────────────────
function AdviceView({ ctx, team, onTrade }) {
  const profiles = useMemo(() => teamProfiles(ctx), [ctx]);
  const mine = profiles.find(p => p.id === team.id);
  const { needs, surplus } = useMemo(() => needsAndSurplus(mine), [mine]);
  const sells = useMemo(() => sellCandidates(ctx, team), [ctx, team]);
  const cuffs = useMemo(() => handcuffs(ctx, team), [ctx, team]);
  const targets = useMemo(() => tradeTargets(ctx, profiles, team.id), [ctx, profiles, team.id]);

  return (
    <div className="space-y-5">
      <div className={cn(CARD, 'p-4 space-y-2')}>
        <SectionTitle icon={Shield}>Roster makeup</SectionTitle>
        <StrengthRow ctx={ctx} teamId={team.id} />
        <p className="text-[12px] text-muted-foreground">
          Strongest at <span className="text-emerald-400 font-semibold">{surplus.length ? surplus.join(', ') : '—'}</span>,
          weakest at <span className="text-red-400 font-semibold">{needs.join(', ')}</span>. Trades below deal from the first to fix the second.
        </p>
      </div>

      <div className="space-y-2">
        <SectionTitle icon={ArrowRightLeft}>Trade targets</SectionTitle>
        <div className="space-y-2">
          {targets.map(t => (
            <div key={t.id} className={cn(CARD, 'p-3.5 space-y-2')}>
              <PlayerLine ctx={ctx} id={t.id}
                sub={`${t.pos} · ${t.teamName}`}
                right={<button onClick={() => onTrade(t.id)} className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/10">Build trade</button>} />
              <p className="text-[11px] text-muted-foreground">{t.reason}</p>
            </div>
          ))}
          {targets.length === 0 && <p className="text-xs text-muted-foreground">No clear upgrades available — your starters already match or beat what other teams can spare.</p>}
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle icon={TrendingDown}>Sell candidates</SectionTitle>
        <div className="space-y-2">
          {sells.map(s => (
            <div key={s.id} className={cn(CARD, 'p-3.5 space-y-2')}>
              <PlayerLine ctx={ctx} id={s.id} right={<span className="text-xs text-muted-foreground tabular-nums">{rosPerGame(ctx, s.id)} /g ROS</span>} />
              <p className="text-[11px] text-muted-foreground">{s.reason}</p>
            </div>
          ))}
          {sells.length === 0 && <p className="text-xs text-muted-foreground">No one looks like they’re at peak value right now.</p>}
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle icon={Shield}>Handcuffs</SectionTitle>
        <div className="space-y-2">
          {cuffs.map(c => (
            <div key={c.id} className={cn(CARD, 'p-3.5 space-y-2')}>
              <PlayerLine ctx={ctx} id={c.id} right={
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-md border',
                  c.status === 'free' ? LABEL_CLS.Deep : c.status === 'owned' ? LABEL_CLS.Solid : LABEL_CLS.Thin)}>
                  {c.status === 'free' ? 'ADD' : c.status === 'owned' ? 'OWNED' : 'TAKEN'}
                </span>
              } />
              <p className="text-[11px] text-muted-foreground">{c.reason}</p>
            </div>
          ))}
          {cuffs.length === 0 && <p className="text-xs text-muted-foreground">None of your RBs are lead backs with a clear backup worth stashing.</p>}
        </div>
      </div>
    </div>
  );
}

// ── Trade builder ─────────────────────────────────────────────────────────────
function TradeView({ ctx, team, target, setTarget }) {
  const [query, setQuery] = useState('');
  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ctx.teams
      .filter(t => t.id !== team.id)
      .flatMap(t => t.playerIds.map(id => ({ id, teamName: t.name })))
      .filter(o => TRADE_POSITIONS.includes(positionOf(ctx, o.id)) && ctx.rosIdx[o.id])
      .filter(o => !q || nameOf(ctx, o.id).toLowerCase().includes(q))
      .sort((a, b) => rosPerGame(ctx, b.id) - rosPerGame(ctx, a.id))
      .slice(0, q ? 20 : 8);
  }, [ctx, team, query]);
  const result = useMemo(() => (target ? buildTradeOffers(ctx, team.id, target) : null), [ctx, team, target]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <SectionTitle icon={ArrowRightLeft}>Who do you want?</SectionTitle>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search players on other teams…"
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40" />
        </div>
        <div className={cn(CARD, 'divide-y divide-white/5')}>
          {options.map(o => (
            <button key={o.id} onClick={() => setTarget(o.id)}
              className={cn('w-full text-left px-3.5 py-2.5 hover:bg-white/3', target === o.id && 'bg-primary/8')}>
              <PlayerLine ctx={ctx} id={o.id} sub={`${positionOf(ctx, o.id)} · ${o.teamName}`}
                right={<span className="text-xs text-muted-foreground tabular-nums">{rosPerGame(ctx, o.id)} /g</span>} />
            </button>
          ))}
        </div>
      </div>

      {result && (
        <div className="space-y-2">
          <SectionTitle note={result.them ? `with ${result.them.name}` : null}>Offers for {nameOf(ctx, target)}</SectionTitle>
          {result.error && <p className="text-xs text-muted-foreground">{result.error}</p>}
          {!result.error && result.offers.length === 0 && (
            <p className={cn(CARD, 'p-4 text-xs text-muted-foreground')}>
              No realistic offer from your roster — anything that helps your lineup would leave {result.them?.name ?? 'them'} clearly worse.
              Try a target at a position where you have depth to spare.
            </p>
          )}
          {result.offers.map((o, i) => <OfferCard key={i} ctx={ctx} offer={o} myName={team.name} theirName={result.them.name} />)}
        </div>
      )}
    </div>
  );
}

function SideChange({ title, side, labelsBefore, labelsAfter }) {
  const fmt = v => Math.round(v * 10) / 10;
  return (
    <div className="flex-1 min-w-0 space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{title}</div>
      <div className="text-sm text-foreground tabular-nums">
        {fmt(side.before)} → <span className="font-bold">{fmt(side.after)}</span>
        <span className={cn('ml-1 text-xs font-semibold', side.gain >= 0 ? 'text-emerald-400' : 'text-red-400')}>
          {side.gain >= 0 ? '+' : ''}{side.gain}
        </span>
      </div>
      <div className="text-[10px] text-muted-foreground">starters’ ROS FP/game</div>
      <div className="flex gap-1 flex-wrap">
        {TRADE_POSITIONS.filter(p => labelsBefore[p] !== labelsAfter[p]).map(p => (
          <span key={p} className="text-[10px] text-muted-foreground">
            {p}: {labelsBefore[p]} → <span className={cn('font-semibold', labelsAfter[p] === 'Thin' ? 'text-red-400' : labelsAfter[p] === 'Deep' ? 'text-emerald-400' : 'text-foreground')}>{labelsAfter[p]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function OfferCard({ ctx, offer, myName, theirName }) {
  return (
    <div className={cn(CARD, 'p-3.5 space-y-3')}>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-red-400">You give</div>
          {offer.give.map(id => <PlayerLine key={id} ctx={ctx} id={id} />)}
        </div>
        <div className="space-y-1.5 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-emerald-400">You get</div>
          {offer.get.map(id => <PlayerLine key={id} ctx={ctx} id={id} />)}
        </div>
      </div>
      <div className="flex gap-3 pt-2.5 border-t border-white/5">
        <SideChange title={myName} side={offer.my} labelsBefore={offer.labels.myBefore} labelsAfter={offer.labels.myAfter} />
        <SideChange title={theirName} side={offer.their} labelsBefore={offer.labels.theirBefore} labelsAfter={offer.labels.theirAfter} />
      </div>
      <p className="text-[11px] text-muted-foreground">ROS value {offer.valueGive} for {offer.valueGet} · {offer.reason}</p>
    </div>
  );
}
