import React, { useState } from 'react';
import { Check, X, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { gradeProp } from '@/lib/grading';

const PROP_LABELS = {
  passing_yards: 'Pass Yds', passing_tds: 'Pass TDs', completions: 'Completions',
  rushing_yards: 'Rush Yds', rushing_tds: 'Rush TDs', rushing_attempts: 'Rush Att',
  receiving_yards: 'Rec Yds', receiving_tds: 'Rec TDs', receptions: 'Receptions',
  fantasy_points: 'Fantasy Pts', kicking_points: 'Kick Pts',
  tackles: 'Tackles', sacks: 'Sacks', passing_ints: 'INTs Thrown',
  rush_rec_tds: 'Rush+Rec TDs', rush_rec_yards: 'Rush+Rec Yds',
  pass_rush_yards: 'Pass+Rush Yds', passing_long: 'Long Comp', rushing_long: 'Long Rush',
  q1_rush_rec_tds: '1Q R+R TDs', q1_receptions: '1Q Rec',
  h1_rush_rec_tds: '1H R+R TDs', h1_receptions: '1H Rec',
  q1_passing_yards: '1Q Pass Yds', q1_rushing_yards: '1Q Rush Yds', q1_receiving_yards: '1Q Rec Yds',
  h1_passing_yards: '1H Pass Yds', h1_rushing_yards: '1H Rush Yds', h1_receiving_yards: '1H Rec Yds',
};

function toLetterGrade(confidence) {
  if (confidence >= 88) return 'A+';
  if (confidence >= 83) return 'A';
  if (confidence >= 78) return 'A-';
  if (confidence >= 74) return 'B+';
  if (confidence >= 70) return 'B';
  if (confidence >= 65) return 'B-';
  if (confidence >= 61) return 'C+';
  if (confidence >= 57) return 'C';
  return 'C-';
}

function gradeStyle(letter) {
  const g = letter[0];
  if (g === 'A') return { text: 'text-emerald-400', ring: 'bg-emerald-500/15 text-emerald-400', bar: 'bg-emerald-500' };
  if (g === 'B') return { text: 'text-primary',     ring: 'bg-primary/15 text-primary',         bar: 'bg-primary'    };
  return              { text: 'text-amber-400',      ring: 'bg-amber-500/15 text-amber-400',     bar: 'bg-amber-500'  };
}

function buildNarrative(prop, grade) {
  const propLabel = PROP_LABELS[prop.prop_type] || prop.prop_type;
  const { lean, confidence, criteria, dataQuality } = grade;
  const letter    = toLetterGrade(confidence);

  const dirText = lean === 'OVER'
    ? `exceed ${prop.line} ${propLabel}`
    : `stay UNDER ${prop.line} ${propLabel}`;

  let txt = `${prop.player_name} is likely to ${dirText} — ${letter} grade (${confidence}/100).`;

  if (dataQuality === 'market') {
    txt += ' No historical game-log data available for this season; verdict is derived from market odds and team context only.';
    return txt;
  }

  const real = criteria.filter(c => c.available && !c.pending && !c.market);
  const passing = [...real].filter(c => c.pass).sort((a, b) => (b.weight || 0) - (a.weight || 0));
  const failing = [...real].filter(c => !c.pass).sort((a, b) => (b.weight || 0) - (a.weight || 0));

  if (passing[0]?.detail) txt += ` ${passing[0].detail}.`;
  if (failing[0]?.detail) txt += ` Risk: ${failing[0].detail}.`;
  else if (passing.length >= 3) txt += ' No significant red flags detected.';

  return txt;
}

export default function PropGradeChecklist({ prop, initialOpen = false }) {
  const [open, setOpen] = useState(initialOpen);
  const grade = gradeProp(prop);
  const { criteria, confidence, lean } = grade;

  const letter    = toLetterGrade(confidence);
  const style     = gradeStyle(letter);
  const narrative = buildNarrative(prop, grade);
  const availCount = criteria.filter(c => c.available).length;

  return (
    <div className="px-4 pt-3 pb-3">

      {/* Grade header — score + letter + direction */}
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className={cn('text-3xl font-black leading-none tabular-nums', style.text)}>
              {confidence}
            </span>
            <span className="text-sm text-muted-foreground/40">/100</span>
            <span className={cn('text-sm font-black px-2 py-0.5 rounded-lg', style.ring)}>
              {letter}
            </span>
          </div>
          {/* Confidence bar */}
          <div className="h-1.5 bg-white/6 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', style.bar)}
              style={{ width: `${confidence}%` }}
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
          Grade Breakdown · {availCount} factor{availCount !== 1 ? 's' : ''}
        </span>
        {open
          ? <ChevronUp  className="w-3.5 h-3.5 text-muted-foreground/35" />
          : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/35" />
        }
      </button>

      {open && (
        <div className="mt-2 border border-white/5 rounded-xl overflow-hidden divide-y divide-white/4">
          {criteria.map((c, i) => {
            const barPct = c.available && c.factorScore != null && c.weight
              ? Math.max(2, (c.factorScore / c.weight) * 100)
              : 0;
            return (
              <div key={i} className="px-3 py-2.5 space-y-1.5">
                <div className="flex items-start gap-2.5">
                  {/* Icon */}
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

                  {/* Label + detail */}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-[11px] font-semibold leading-tight',
                      c.pending ? 'text-muted-foreground/40'
                        : c.pass ? 'text-foreground/90'
                        : 'text-muted-foreground/65'
                    )}>
                      {c.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground/55 leading-snug mt-0.5">
                      {c.detail}
                    </p>
                  </div>

                  {/* Score fraction */}
                  {c.available && c.factorScore != null && (
                    <span className={cn(
                      'text-[10px] font-mono font-bold flex-shrink-0 self-start mt-0.5',
                      c.pass ? 'text-emerald-400/60' : 'text-muted-foreground/30'
                    )}>
                      {c.factorScore.toFixed(1)}/{c.weight}
                    </span>
                  )}
                </div>

                {/* Mini score bar */}
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
          })}
        </div>
      )}
    </div>
  );
}
