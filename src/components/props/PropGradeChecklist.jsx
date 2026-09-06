import React, { useState } from 'react';
import { Check, X, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { gradeProp } from '@/lib/grading';
import { formatMarket, toLetterGrade } from '@/lib/propLabels';



function gradeStyle(letter) {
  const g = letter[0];
  if (g === 'A') return { text: 'text-emerald-400', ring: 'bg-emerald-500/15 text-emerald-400', bar: 'bg-emerald-500' };
  if (g === 'B') return { text: 'text-primary',     ring: 'bg-primary/15 text-primary',         bar: 'bg-primary'    };
  return              { text: 'text-amber-400',      ring: 'bg-amber-500/15 text-amber-400',     bar: 'bg-amber-500'  };
}

function buildNarrative(prop, grade) {
  const propLabel = formatMarket(prop.prop_type);
  const { lean, overProb, underProb, criteria, dataQuality, completeness } = grade;

  const dirText = lean === 'OVER'
    ? `exceed ${prop.line} ${propLabel}`
    : `stay under ${prop.line} ${propLabel}`;

  const probDisplay = lean === 'OVER' ? `${overProb}%` : `${underProb}%`;
  let txt = `Model gives ${prop.player_name} a ${probDisplay} probability to ${dirText}.`;

  if (dataQuality === 'market' || completeness < 20) {
    txt += ' No historical stats found — verdict is derived from market odds and team context only.';
    return txt;
  }

  if (completeness < 50) {
    txt += ` Limited data available (${completeness}% of factors populated) — result is partially anchored to market odds.`;
  }

  const real = criteria.filter(c => c.available && !c.pending && !c.market);
  const passing = [...real].filter(c => c.pass).sort((a, b) => (b.weight || 0) - (a.weight || 0));
  const failing = [...real].filter(c => !c.pass).sort((a, b) => (b.weight || 0) - (a.weight || 0));

  if (passing[0]?.detail) txt += ` ${passing[0].detail}.`;
  if (failing[0]?.detail) txt += ` Risk: ${failing[0].detail}.`;
  else if (passing.length >= 3) txt += ' No significant red flags detected.';

  return txt;
}

// One-line tooltip explaining what each grading factor measures
const FACTOR_TIPS = {
  'Opponent Defense':      'How many yards this position group allows per game — tougher defense = lower OVER probability',
  'Game Total (O/U)':      'The game\'s over/under total; high-scoring games create more counting-stat opportunities',
  'Recent Form (L10)':     'Average performance over the last 10 games vs the current line',
  'Recent Form (L5)':      'Average performance over the last 5 games — more sensitive to current hot/cold streaks',
  'Hit Rate':              'How often this player has exceeded this line historically',
  'Season Average':        'Full-season average performance relative to the current line',
  'Usage / Snap %':        'Target share and snap percentage — high usage increases ceiling and floor',
  'Target Share':          'Share of team pass targets — directly drives receiving volume',
  'Snap %':                'Offensive snap percentage — lower snaps cap upside regardless of efficiency',
  'Home/Away Split':       'Career split for this player as home vs away team',
  'Head-to-Head':          'Historical performance specifically against this opponent',
  'EPA/Game':              'Expected Points Added per game — efficiency signal above raw yardage',
  'Air Yards Share':       'Proportion of team air yards targeted to this player — indicates downfield role',
  'Weather':               'Wind speed and conditions for outdoor games — wind suppresses passing props',
  'Line Movement':         'Direction and magnitude of line movement since opening',
};

export default function PropGradeChecklist({ prop, initialOpen = false }) {
  const [open, setOpen] = useState(initialOpen);
  const [showUnavail, setShowUnavail] = useState(false);
  const grade = gradeProp(prop);
  const { criteria, confidence, lean, overProb, underProb, completeness, totalCriteria } = grade;

  const letter    = toLetterGrade(confidence, completeness);
  const style     = gradeStyle(letter);
  const narrative = buildNarrative(prop, grade);

  const availCount = criteria.filter(c => c.available).length;
  const unavailCount = totalCriteria - availCount;

  // Direction-aware probability display
  const primaryProb = lean === 'OVER' ? overProb : underProb;
  const barColor = lean === 'OVER' ? 'bg-emerald-500' : 'bg-rose-500';

  return (
    <div className="px-4 pt-3 pb-3">

      {/* Grade header — probability + letter grade + direction */}
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1.5 flex-wrap">
            {/* Primary: side-specific probability */}
            <span className={cn('text-3xl font-black leading-none tabular-nums', lean === 'OVER' ? 'text-emerald-400' : 'text-rose-400')}>
              {primaryProb}%
            </span>
            <span className="text-sm text-muted-foreground/60">{lean}</span>
            {/* Secondary: letter grade */}
            <span className={cn('text-sm font-black px-2 py-0.5 rounded-lg', style.ring)}>
              {letter}
            </span>
            {/* Completeness pill */}
            {completeness < 80 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/8 text-muted-foreground/60 border border-white/8">
                {completeness}% data
              </span>
            )}
          </div>
          {/* Probability bar */}
          <div className="h-1.5 bg-white/6 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', barColor)}
              style={{ width: `${primaryProb}%` }}
            />
          </div>
        </div>

        {/* Direction badge */}
        <div className={cn(
          'flex-shrink-0 text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-xl border',
          lean === 'OVER'
            ? 'bg-emerald-500/12 border-emerald-500/25 text-emerald-400'
            : 'bg-rose-500/12 border-rose-500/25 text-rose-400'
        )}>
          {lean === 'OVER' ? '▲' : '▼'} {lean}
        </div>
      </div>

      {/* AI-style narrative */}
      <p className="text-[11px] text-muted-foreground/75 leading-relaxed mb-3">
        {narrative}
      </p>

      {/* Grade breakdown toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-1.5 group"
      >
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/45 group-hover:text-foreground/60 transition-colors">
          Grade Breakdown · {availCount}/{totalCriteria} factors with data
        </span>
        {open
          ? <ChevronUp  className="w-3.5 h-3.5 text-muted-foreground/35" />
          : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/35" />
        }
      </button>

      {open && (() => {
        const availCriteria  = criteria.filter(c => c.available);
        const unavailCrit    = criteria.filter(c => !c.available);

        const renderCriterion = (c, i) => {
          const barPct = c.available && c.factorScore != null && c.weight
            ? Math.max(2, (c.factorScore / c.weight) * 100)
            : 0;
          // Find tooltip for this label — try exact match then partial match
          const tip = FACTOR_TIPS[c.label] || Object.entries(FACTOR_TIPS).find(([k]) => c.label.startsWith(k))?.[1];
          return (
            <div key={i} className="px-3 py-2.5 space-y-1.5">
              <div className="flex items-start gap-2.5">
                <div className={cn(
                  'w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                  c.pending    ? 'bg-white/6 border border-white/10'
                  : !c.available ? 'bg-white/4'
                  : c.pass     ? 'bg-emerald-500/18'
                  :               'bg-rose-500/15'
                )}>
                  {c.pending
                    ? <Clock className="w-2.5 h-2.5 text-muted-foreground/40" />
                    : !c.available
                    ? <span className="text-[8px] leading-none text-muted-foreground/30">—</span>
                    : c.pass
                    ? <Check className="w-2.5 h-2.5 text-emerald-400" />
                    : <X    className="w-2.5 h-2.5 text-rose-400"    />
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      'text-[11px] font-semibold leading-tight cursor-help',
                      !c.available ? 'text-muted-foreground/35'
                        : c.pass ? 'text-foreground/90'
                        : 'text-muted-foreground/65'
                    )}
                    title={tip}
                  >
                    {c.label}
                    {tip && <span className="ml-1 text-[8px] text-muted-foreground/25">?</span>}
                  </p>
                  <p className="text-[10px] text-muted-foreground/55 leading-snug mt-0.5">
                    {c.detail}
                  </p>
                </div>

                {c.available && c.factorScore != null && (
                  <span className={cn(
                    'text-[10px] font-mono font-bold flex-shrink-0 self-start mt-0.5',
                    c.pass ? 'text-emerald-400/60' : 'text-muted-foreground/30'
                  )}>
                    {c.factorScore.toFixed(1)}/{c.weight}
                  </span>
                )}
                {!c.available && c.weight > 0 && (
                  <span className="text-[10px] font-mono text-muted-foreground/20 flex-shrink-0 self-start mt-0.5">
                    —/{c.weight}
                  </span>
                )}
              </div>

              {c.available && c.factorScore != null && (
                <div className="h-0.5 bg-white/4 rounded-full overflow-hidden ml-6">
                  <div
                    className={cn('h-full rounded-full', c.pass ? 'bg-emerald-500/55' : 'bg-rose-500/30')}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              )}
            </div>
          );
        };

        return (
          <div className="mt-2 border border-white/5 rounded-xl overflow-hidden divide-y divide-white/4">
            {/* Available factors — always shown */}
            {availCriteria.map((c, i) => renderCriterion(c, i))}

            {/* Unavailable factors — collapsed under expander */}
            {unavailCrit.length > 0 && (
              <>
                <button
                  onClick={() => setShowUnavail(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-white/2 hover:bg-white/4 transition-colors group"
                >
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/35 group-hover:text-muted-foreground/55 transition-colors">
                    {unavailCrit.length} factor{unavailCrit.length !== 1 ? 's' : ''} not scored (no data)
                  </span>
                  <ChevronDown className={cn('w-3 h-3 text-muted-foreground/25 transition-transform', showUnavail && 'rotate-180')} />
                </button>
                {showUnavail && (
                  <div className="divide-y divide-white/4 bg-black/10">
                    {unavailCrit.map((c, i) => renderCriterion(c, availCriteria.length + i))}
                  </div>
                )}
              </>
            )}

            {/* Season provenance footer */}
            {completeness < 100 && (
              <div className="px-3 py-2 bg-white/2">
                <p className="text-[9px] text-muted-foreground/30 text-center">
                  Historical data: <span className="text-muted-foreground/50">{new Date().getFullYear() - 1} season</span>
                  {' · '}{completeness}% historical / {100 - completeness}% market · prior-year weighted
                </p>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
