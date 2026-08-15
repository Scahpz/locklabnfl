/**
 * EV-based verdict engine.
 *
 * Tiers:
 *   GREEN  "BET IT OVER/UNDER" — model beats market by ≥ 8pp
 *   YELLOW "LEAN OVER/UNDER"   — model beats market by 3–8pp
 *   RED    "SKIP"              — edge < 3pp, no clear value
 *   TRAP   "TRAP"              — line is artificially juiced (overround > 10%)
 *                                or grading says UNSAFE — avoid both sides
 */

function impliedProb(odds) {
  if (odds == null) return 0.5;
  return odds < 0
    ? Math.abs(odds) / (Math.abs(odds) + 100)
    : 100 / (odds + 100);
}

/** De-vig: remove the book's margin to get true market probability of OVER. */
function devig(overOdds, underOdds) {
  const rawOver  = impliedProb(overOdds ?? -110);
  const rawUnder = impliedProb(underOdds ?? -110);
  const total    = rawOver + rawUnder;
  return total > 0 ? rawOver / total : 0.5;
}

/**
 * @param {object} prop   — prop object with over_odds, under_odds, poisson_hit_prob, etc.
 * @param {object} grade  — result of gradeProp(prop): { verdict, confidence, lean, dataQuality }
 * @returns {{ tier, label, direction, edgePP, modelProb, marketProb, hasRealOdds }}
 */
export function calcEVVerdict(prop, grade) {
  const overOdds  = prop.over_odds  ?? -110;
  const underOdds = prop.under_odds ?? -110;

  // Detect artificially juiced lines: standard vig is ~4-5%, >10% means books are
  // extracting extra margin — the line looks appealing but value is squeezed out both ways
  const rawOver    = impliedProb(overOdds);
  const rawUnder   = impliedProb(underOdds);
  const overround  = rawOver + rawUnder;
  const isJuiced   = overround > 1.10;

  let modelOverProb;
  if (prop.poisson_hit_prob != null) {
    modelOverProb = prop.poisson_hit_prob;
  } else if (grade.dataQuality === 'full') {
    modelOverProb = grade.lean === 'OVER'
      ? grade.confidence / 100
      : 1 - grade.confidence / 100;
  } else {
    modelOverProb = devig(overOdds, underOdds);
  }

  const marketOverProb = devig(overOdds, underOdds);
  const direction  = modelOverProb >= 0.5 ? 'OVER' : 'UNDER';
  const modelProb  = direction === 'OVER' ? modelOverProb  : 1 - modelOverProb;
  const marketProb = direction === 'OVER' ? marketOverProb : 1 - marketOverProb;
  const edgePP     = Math.round((modelProb - marketProb) * 1000) / 10;
  const hasRealOdds = overOdds !== -110 || underOdds !== -110;

  // TRAP: grading says UNSAFE with full data, OR the book has inflated the vig
  if ((grade.verdict === 'UNSAFE' && grade.dataQuality === 'full') || isJuiced) {
    return { tier: 'TRAP', label: 'TRAP', direction, edgePP, modelProb, marketProb, hasRealOdds };
  }

  // No analytics at all → model prob equals market prob, edge is exactly 0.
  // Show a neutral PRE-SEASON label instead of the misleading SKIP.
  if (edgePP === 0 && prop.poisson_hit_prob == null && grade.dataQuality !== 'full') {
    return { tier: 'PRESEASON', label: 'PRE-SEASON', direction, edgePP, modelProb, marketProb, hasRealOdds };
  }

  let tier, label;
  if (edgePP >= 8) {
    tier  = 'GREEN';
    label = `BET IT ${direction}`;
  } else if (edgePP >= 3) {
    tier  = 'YELLOW';
    label = `LEAN ${direction}`;
  } else {
    tier  = 'RED';
    label = 'SKIP';
  }

  return { tier, label, direction, edgePP, modelProb, marketProb, hasRealOdds };
}

export const TIER_CONFIG = {
  GREEN: {
    dot:   'bg-emerald-400',
    badge: 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400',
    label: 'BET IT',
  },
  YELLOW: {
    dot:   'bg-amber-400',
    badge: 'bg-amber-500/15 border-amber-500/35 text-amber-400',
    label: 'LEAN',
  },
  RED: {
    dot:   'bg-rose-500',
    badge: 'bg-rose-500/12 border-rose-500/30 text-rose-400',
    label: 'SKIP',
  },
  TRAP: {
    dot:   'bg-orange-500',
    badge: 'bg-orange-500/15 border-orange-500/40 text-orange-400',
    label: 'TRAP',
  },
  PRESEASON: {
    dot:   'bg-sky-400',
    badge: 'bg-sky-500/15 border-sky-500/35 text-sky-400',
    label: 'PRE-SEASON',
  },
};
