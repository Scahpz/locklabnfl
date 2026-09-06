import React, { useState } from 'react';
import { Layers, X, TrendingUp, TrendingDown, Trophy, Loader2, History, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { gradeProp } from '@/lib/grading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import TeamLogo from '@/components/common/TeamLogo';
import { useParlay } from '@/lib/ParlayContext';
import { base44 } from '@/api/base44Client';
import ParlayHistoryTab from '@/components/props/ParlayHistoryTab';
import { Link } from 'react-router-dom';

function calculateCombinedOdds(legs) {
  if (legs.length === 0) return '0';
  let decimal = 1;
  legs.forEach(leg => {
    const odds = leg.odds;
    if (odds > 0) decimal *= (1 + odds / 100);
    else decimal *= (1 + 100 / Math.abs(odds));
  });
  return decimal > 2 ? `+${Math.round((decimal - 1) * 100)}` : `-${Math.round(100 / (decimal - 1))}`;
}

function getRiskLevel(legs) {
  if (legs.length <= 2) return 'low';
  if (legs.length <= 4) return 'medium';
  if (legs.length <= 6) return 'high';
  return 'extreme';
}

const riskColors = {
  low: 'text-primary bg-primary/10 border-primary/20',
  medium: 'text-chart-3 bg-chart-3/10 border-chart-3/20',
  high: 'text-chart-4 bg-chart-4/10 border-chart-4/20',
  extreme: 'text-destructive bg-destructive/10 border-destructive/20',
};

export default function ParlayBuilder() {
  const { legs, removeLeg: contextRemoveLeg, removeGameLeg, clearLegs } = useParlay();
  const [wager, setWager] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [parlayName, setParlayName] = useState('');
  const [activeTab, setActiveTab] = useState('builder');
  const [historyKey, setHistoryKey] = useState(0);

  const removeLeg = (index) => {
    const leg = legs[index];
    if (leg) contextRemoveLeg(leg.player_name, leg.prop_type);
  };

  const combinedOdds = calculateCombinedOdds(legs);
  const riskLevel = getRiskLevel(legs);

  const payout = (() => {
    if (legs.length === 0) return 0;
    const odds = parseInt(combinedOdds);
    if (odds > 0) return (wager * odds / 100 + wager).toFixed(2);
    return (wager * 100 / Math.abs(odds) + wager).toFixed(2);
  })();

  const handleSubmit = async () => {
    if (legs.length < 2) {
      toast.error('Add at least 2 legs to submit a parlay');
      return;
    }
    setSubmitting(true);
    try {
      const name = parlayName.trim() || `${legs.length}-Leg Parlay · ${new Date().toLocaleDateString()}`;
      await base44.entities.SavedParlay.create({
        name,
        legs: legs.map(l => ({
          player_name: l.player_name,
          team: l.team,
          opponent: l.opponent,
          prop_type: l.prop_type,
          line: l.line,
          pick: l.pick,
          odds: l.odds,
        })),
        wager,
        combined_odds: combinedOdds,
        potential_payout: parseFloat(payout),
        game_date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        status: 'pending',
      });
      toast.success('Parlay saved! Switching to History…');
      clearLegs();
      setParlayName('');
      setHistoryKey(k => k + 1);
      setActiveTab('history');
    } catch (e) {
      toast.error('Failed to submit parlay');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
          <Layers className="w-7 h-7 text-accent" />
          Parlay Builder
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Build from today's live props and track your results</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1.5">
        <button
          onClick={() => setActiveTab('builder')}
          className={cn(
            "flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border transition-all",
            activeTab === 'builder'
              ? "bg-primary/20 border-primary/40 text-primary"
              : "bg-secondary/40 border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
          )}
        >
          <Layers className="w-3.5 h-3.5" />
          Builder
          {legs.length > 0 && (
            <span className="text-[10px] font-bold bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center">
              {legs.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            "flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border transition-all",
            activeTab === 'history'
              ? "bg-white/12 border-white/25 text-foreground"
              : "bg-secondary/40 border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
          )}
        >
          <History className="w-3.5 h-3.5" />
          History
        </button>
      </div>

      {/* History tab */}
      {activeTab === 'history' && <ParlayHistoryTab refreshKey={historyKey} />}

      {/* Builder tab */}
      {activeTab === 'builder' && <div className="max-w-lg">
        {/* Parlay Slip */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="font-bold text-foreground mb-3">Your Parlay</h3>

          {legs.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Layers className="w-10 h-10 mx-auto mb-3 opacity-25" />
              <p className="text-sm font-medium mb-1">No legs added yet</p>
              <p className="text-xs text-muted-foreground/60 mb-4">Pick props from the Props page to build your parlay</p>
              <Link
                to="/props"
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 transition-colors"
              >
                Browse Props <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
              <div className="space-y-2 mb-4">
                {legs.map((leg, i) => {
                  const legGrade = leg.is_game_bet ? null : gradeProp(leg);
                  const isOver = leg.pick === 'over';
                  const prob = legGrade ? (isOver ? legGrade.overProb : legGrade.underProb) : null;
                  return (
                    <div key={i} className={cn(
                      "flex items-center justify-between rounded-lg p-2.5 border",
                      isOver
                        ? "bg-emerald-500/6 border-emerald-500/20"
                        : "bg-rose-500/6 border-rose-500/20"
                    )}>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <TeamLogo team={leg.team} className="w-7 h-7 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground truncate">{leg.player_name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {leg.is_game_bet ? (
                              <span className="font-bold text-primary">{leg.prop_type.toUpperCase()} ({leg.odds > 0 ? '+' : ''}{leg.odds})</span>
                            ) : (
                              <>
                                <span className={cn("font-bold", isOver ? 'text-emerald-400' : 'text-rose-400')}>
                                  {leg.pick.toUpperCase()}
                                </span>
                                {' '}{leg.line} · {leg.odds > 0 ? '+' : ''}{leg.odds}
                              </>
                            )}
                          </p>
                        </div>
                        {prob != null && (
                          <div className="flex-shrink-0 flex items-center gap-1">
                            {isOver
                              ? <TrendingUp className="w-3 h-3 text-emerald-400/70" />
                              : <TrendingDown className="w-3 h-3 text-rose-400/70" />
                            }
                            <span className={cn("text-xs font-bold tabular-nums", isOver ? 'text-emerald-400' : 'text-rose-400')}>
                              {prob}%
                            </span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => leg.is_game_bet ? removeGameLeg(leg.leg_id) : removeLeg(i)}
                        className="text-muted-foreground hover:text-destructive transition-colors ml-2 flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

          {legs.length > 0 && (
            <div className="border-t border-border pt-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Combined Odds</span>
                <span className="font-bold text-foreground">{combinedOdds}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Risk Level</span>
                <Badge variant="outline" className={cn("text-[10px]", riskColors[riskLevel])}>
                  {riskLevel.toUpperCase()}
                </Badge>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Parlay Name (optional)</label>
                <Input
                  placeholder="My Parlay"
                  value={parlayName}
                  onChange={(e) => setParlayName(e.target.value)}
                  className="h-8 bg-secondary border-border text-sm mb-2"
                />
                <label className="text-xs text-muted-foreground block mb-1">Wager ($)</label>
                <Input
                  type="number"
                  value={wager}
                  onChange={(e) => setWager(parseFloat(e.target.value) || 0)}
                  className="h-8 bg-secondary border-border text-sm"
                />
              </div>
              <div className="flex items-center justify-between bg-primary/10 rounded-lg p-3">
                <span className="text-xs text-primary font-medium">Potential Payout</span>
                <span className="text-lg font-bold text-primary">${payout}</span>
              </div>
              <Button
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
                onClick={handleSubmit}
                disabled={submitting || legs.length < 2}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trophy className="w-4 h-4 mr-2" />}
                Submit Parlay
              </Button>
              <div className="flex items-center justify-between">
                <Link
                  to="/props"
                  className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                >
                  <ArrowRight className="w-3 h-3" /> Add more props
                </Link>
                <button
                  onClick={clearLegs}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors py-1"
                >
                  Clear all
                </button>
              </div>
            </div>
          )}
        </div>
      </div>}
    </div>
  );
}