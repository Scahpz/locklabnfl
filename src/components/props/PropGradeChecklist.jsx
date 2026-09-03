import React, { useState } from 'react';
import { Check, X, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { gradeProp } from '@/lib/grading';

function toLetterGrade(pass, available) {
  if (available === 0) return '?';
  const r = pass / available;
  if (r >= 0.92) return 'A+';
  if (r >= 0.83) return 'A';
  if (r >= 0.75) return 'A-';
  if (r >= 0.68) return 'B+';
  if (r >= 0.60) return 'B';
  if (r >= 0.55) return 'B-';
  if (r >= 0.48) return 'C+';
  if (r >= 0.42) return 'C';
  if (r >= 0.35) return 'C-';
  if (r >= 0.30) return 'D+';
  if (r >= 0.25) return 'D';
  if (r >= 0.20) return 'D-';
  return 'F';
}

export default function PropGradeChecklist({ prop, initialOpen = false }) {
  const [open, setOpen] = useState(initialOpen);
  const { criteria, passCount, totalCriteria, dataQuality } = gradeProp(prop);
  const availableCount = criteria.filter(c => c.available).length;
  const letterGrade = toLetterGrade(passCount, availableCount);

  const scoreColor = letterGrade[0] === 'A' || letterGrade === 'B+' || letterGrade === 'B'
    ? 'text-primary bg-primary/15 ring-primary/20'
    : letterGrade[0] === 'C' || letterGrade === 'B-'
    ? 'text-chart-4 bg-chart-4/15 ring-chart-4/20'
    : 'text-destructive bg-destructive/15 ring-destructive/20';

  return (
    <div className="px-4 pb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-2 group"
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
            Grade Breakdown
          </span>
          <span className={cn(
            "text-[11px] font-bold px-2 py-0.5 rounded-lg ring-1",
            scoreColor
          )}>
            {letterGrade}
          </span>
          {dataQuality === 'market' && (
            <span className="text-[9px] text-muted-foreground/60 italic">market only</span>
          )}
        </div>
        <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-white/5 text-muted-foreground">
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </div>
      </button>

      {open && (
        <div className="bg-white/3 border border-white/6 rounded-xl p-3 space-y-2.5 mt-1">
          {criteria.map((c, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ring-1",
                c.pending
                  ? "bg-white/5 ring-white/10"
                  : c.pass
                  ? "bg-primary/15 ring-primary/25"
                  : "bg-destructive/15 ring-destructive/25"
              )}>
                {c.pending
                  ? <Clock className="w-2.5 h-2.5 text-muted-foreground" />
                  : c.pass
                  ? <Check className="w-2.5 h-2.5 text-primary" />
                  : <X className="w-2.5 h-2.5 text-destructive" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-[11px] font-semibold leading-tight",
                  c.pending ? "text-muted-foreground/60" :
                  c.pass    ? "text-foreground" :
                              "text-muted-foreground"
                )}>
                  {c.label}
                </p>
                <p className="text-[10px] text-muted-foreground/70 leading-snug mt-0.5">{c.detail}</p>
              </div>
            </div>
          ))}

        </div>
      )}
    </div>
  );
}
