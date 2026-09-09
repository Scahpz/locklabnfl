import React, { useState, useEffect } from 'react';
import { fetchLiveProps } from '@/lib/liveData';
import { Sparkles, TrendingUp, TrendingDown, Wifi, WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import PlayerAvatar from '@/components/common/PlayerAvatar';
import { formatMarket } from '@/lib/propLabels';
import VerdictBadge from '@/components/props/VerdictBadge';
import { gradeProp } from '@/lib/grading';
import { calcEVVerdict, TIER_CONFIG } from '@/lib/verdict';

function fmtOdds(n) {
  if (n == null) return '—';
  return n > 0 ? `+${n}` : `${n}`;
}

const TIER_META = {
  GREEN:  { label: 'Strong Edge — Bet It',  className: 'border-emerald-500/30 bg-emerald-500/5' },
  YELLOW: { label: 'Marginal Edge — Lean',  className: 'border-amber-500/25 bg-amber-500/5'    },
};

function PickCard({ prop }) {
  const logs = prop.last_10_games || [];
  const gradedProp = (() => {
    if (logs.length === 0) return prop;
    const hitCount = logs.filter(v => v > prop.line).length;
    const dynamicHitRate = Math.round(hitCount / logs.length * 100);
    const base = prop.projection ?? prop.avg_last_10 ?? null;
    const dynamicEdge = base != null ? Math.round((base - prop.line) * 100) / 100 : prop.edge;
    return { ...prop, hit_rate_last_10: dynamicHitRate, edge: dynamicEdge };
  })();

  const grade      = gradeProp(gradedProp);
  const evVerdict  = calcEVVerdict(gradedProp, grade);
  const isOver     = evVerdict.direction === 'OVER';
  const displayOdds = isOver ? prop.over_odds : prop.under_odds;
  const tierCfg    = TIER_CONFIG[evVerdict.tier];
  const meta       = TIER_META[evVerdict.tier] || TIER_META.YELLOW;
  const edgeSign   = evVerdict.edgePP > 0 ? '+' : '';

  return (
    <div className={cn(
      "rounded-xl border p-4 transition-all duration-200 hover:scale-[1.01]",
      meta.className
    )}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <PlayerAvatar photo={prop.image_url} team={prop.team} className="w-10 h-10" />
          <div>
            <Link
              to={`/trends?player=${encodeURIComponent(prop.player_name)}`}
              className="font-semibold text-sm text-foreground hover:text-primary transition-colors"
            >
              {prop.player_name}
            </Link>
            <p className="text-xs text-muted-foreground">{prop.team} vs {prop.opponent}</p>
          </div>
        </div>
        {prop.trap_warning && <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />}
      </div>

      {/* Verdict badge */}
      <div className="mb-3">
        <VerdictBadge evVerdict={evVerdict} />
      </div>

      {/* Line block */}
      <div className="flex items-center justify-between bg-secondary/50 rounded-lg p-3 mb-3">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{formatMarket(prop.prop_type)}</p>
          <p className={cn("text-xl font-bold flex items-center gap-1.5 mt-0.5", isOver ? 'text-emerald-400' : 'text-rose-400')}>
            {isOver
              ? <TrendingUp className="w-4 h-4" />
              : <TrendingDown className="w-4 h-4" />
            }
            {isOver ? 'Over' : 'Under'} {prop.line}
          </p>
        </div>
        <div className="text-right">
          <p className={cn("text-sm font-bold", isOver ? 'text-emerald-400' : 'text-rose-400')}>
            {fmtOdds(displayOdds)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {evVerdict.edgePP != null ? `${edgeSign}${evVerdict.edgePP}% edge` : ''}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-secondary/30 rounded-lg p-2">
          <p className="text-[10px] text-muted-foreground">Projection</p>
          <p className="text-sm font-bold text-foreground">{prop.projection ?? '—'}</p>
        </div>
        <div className="bg-secondary/30 rounded-lg p-2">
          <p className="text-[10px] text-muted-foreground">L10 Avg</p>
          <p className="text-sm font-bold text-foreground">{prop.avg_last_10 ?? '—'}</p>
        </div>
        <div className="bg-secondary/30 rounded-lg p-2">
          <p className="text-[10px] text-muted-foreground">Hit Rate</p>
          <p className="text-sm font-bold text-foreground">
            {isOver
              ? (prop.hit_rate_last_10 != null ? `${prop.hit_rate_last_10}%` : '—')
              : (prop.hit_rate_last_10 != null ? `${100 - prop.hit_rate_last_10}%` : '—')
            }
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AIPicks() {
  const [allProps, setAllProps] = useState([]);
  const [isLive, setIsLive]     = useState(false);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await fetchLiveProps();
        if (data?.props?.length > 0) {
          setAllProps(data.props);
          setIsLive(true);
        } else {
          setAllProps([]);
        }
      } catch {
        setAllProps([]);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading today's picks…</span>
      </div>
    );
  }

  // Bucket props by EV tier — only surface GREEN and YELLOW (skip SKIP/TRAP)
  const buckets = { GREEN: [], YELLOW: [] };

  allProps
    .filter(p => p.injury_status !== 'out' && p.avg_last_10 != null)
    .forEach(p => {
      const logs = p.last_10_games || [];
      const gradedProp = (() => {
        if (logs.length === 0) return p;
        const hitCount = logs.filter(v => v > p.line).length;
        const dynamicHitRate = Math.round(hitCount / logs.length * 100);
        const base = p.projection ?? p.avg_last_10 ?? null;
        const dynamicEdge = base != null ? Math.round((base - p.line) * 100) / 100 : p.edge;
        return { ...p, hit_rate_last_10: dynamicHitRate, edge: dynamicEdge };
      })();
      const grade     = gradeProp(gradedProp);
      const evVerdict = calcEVVerdict(gradedProp, grade);
      if (buckets[evVerdict.tier]) {
        buckets[evVerdict.tier].push({ ...p, _evVerdict: evVerdict });
      }
    });

  // Sort each bucket by absolute edge descending
  Object.values(buckets).forEach(arr =>
    arr.sort((a, b) => Math.abs(b._evVerdict.edgePP) - Math.abs(a._evVerdict.edgePP))
  );

  const hasAny = buckets.GREEN.length > 0 || buckets.YELLOW.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
          <Sparkles className="w-7 h-7 text-primary" />
          AI Pick Recommendations
        </h1>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
          {isLive
            ? <><Wifi className="w-3.5 h-3.5 text-primary" /><span className="text-primary font-medium">Live · Over &amp; Under picks ranked by model edge</span></>
            : <><WifiOff className="w-3.5 h-3.5" />No live data</>
          }
        </p>
      </div>

      {!hasAny && (
        <div className="text-center py-20 text-muted-foreground">
          <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-lg font-medium">No strong picks yet today</p>
          <p className="text-sm mt-1">Check back once game logs are loaded — picks appear when the model finds a real edge.</p>
        </div>
      )}

      {Object.entries(buckets).map(([tier, props]) => {
        if (props.length === 0) return null;
        const meta    = TIER_META[tier];
        const tierCfg = TIER_CONFIG[tier];
        return (
          <div key={tier}>
            <div className="flex items-center gap-2 mb-3">
              <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', tierCfg.dot)} />
              <span className="text-sm font-bold text-foreground">{meta.label}</span>
              <span className="text-xs text-muted-foreground">({props.length})</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {props.map((prop, i) => (
                <PickCard key={`${prop.player_name}-${prop.prop_type}-${i}`} prop={prop} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
