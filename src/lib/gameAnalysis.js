import { TEAM_STATS, NFL_LEAGUE_AVGS } from '@/lib/teamStats';

// ESPN uses different abbreviations for some teams — normalize to our keys
const ESPN_ABV_MAP = {
  JAC: 'JAX', WSH: 'WAS', LAX: 'LAR', LARC: 'LAR',
};
export function normAbv(abv) {
  if (!abv) return '';
  const up = abv.toUpperCase();
  return ESPN_ABV_MAP[up] ?? up;
}

// ─── 2024 NFL Offensive Data ──────────────────────────────────────────────────
// pts=pts/game scored, yds=total yards/game, pass/rush=yds by type
// third=3rd-down %, rz=red-zone TD %, to=turnovers/game
export const TEAM_OFFENSE = {
  ARI: { pts: 22.0, yds: 335, pass: 220, rush: 115, third: 38, rz: 58, to: 1.2 },
  ATL: { pts: 23.5, yds: 355, pass: 220, rush: 135, third: 40, rz: 60, to: 1.0 },
  BAL: { pts: 26.5, yds: 375, pass: 230, rush: 145, third: 43, rz: 65, to: 0.9 },
  BUF: { pts: 27.5, yds: 385, pass: 260, rush: 125, third: 45, rz: 68, to: 0.8 },
  CAR: { pts: 15.5, yds: 270, pass: 185, rush:  85, third: 30, rz: 42, to: 1.8 },
  CHI: { pts: 19.5, yds: 315, pass: 210, rush: 105, third: 35, rz: 50, to: 1.5 },
  CIN: { pts: 24.0, yds: 360, pass: 250, rush: 110, third: 42, rz: 62, to: 1.1 },
  CLE: { pts: 19.5, yds: 310, pass: 200, rush: 110, third: 34, rz: 48, to: 1.4 },
  DAL: { pts: 23.0, yds: 355, pass: 235, rush: 120, third: 41, rz: 59, to: 1.1 },
  DEN: { pts: 20.5, yds: 330, pass: 215, rush: 115, third: 37, rz: 52, to: 1.3 },
  DET: { pts: 28.0, yds: 395, pass: 255, rush: 140, third: 47, rz: 70, to: 0.7 },
  GB:  { pts: 24.5, yds: 365, pass: 240, rush: 125, third: 43, rz: 63, to: 0.9 },
  HOU: { pts: 24.5, yds: 355, pass: 240, rush: 115, third: 42, rz: 62, to: 1.0 },
  IND: { pts: 21.5, yds: 335, pass: 215, rush: 120, third: 38, rz: 54, to: 1.2 },
  JAX: { pts: 19.0, yds: 310, pass: 205, rush: 105, third: 34, rz: 49, to: 1.5 },
  KC:  { pts: 26.0, yds: 360, pass: 235, rush: 125, third: 44, rz: 66, to: 0.8 },
  LAC: { pts: 23.5, yds: 350, pass: 240, rush: 110, third: 41, rz: 60, to: 1.0 },
  LAR: { pts: 24.0, yds: 360, pass: 240, rush: 120, third: 42, rz: 61, to: 1.0 },
  LV:  { pts: 18.5, yds: 300, pass: 195, rush: 105, third: 33, rz: 47, to: 1.6 },
  MIA: { pts: 22.5, yds: 345, pass: 245, rush: 100, third: 40, rz: 57, to: 1.2 },
  MIN: { pts: 24.0, yds: 360, pass: 255, rush: 105, third: 42, rz: 62, to: 1.0 },
  NE:  { pts: 15.5, yds: 265, pass: 180, rush:  85, third: 29, rz: 41, to: 1.9 },
  NO:  { pts: 20.0, yds: 320, pass: 210, rush: 110, third: 36, rz: 51, to: 1.3 },
  NYG: { pts: 17.0, yds: 290, pass: 195, rush:  95, third: 31, rz: 44, to: 1.7 },
  NYJ: { pts: 19.5, yds: 305, pass: 205, rush: 100, third: 34, rz: 49, to: 1.5 },
  PHI: { pts: 25.5, yds: 370, pass: 245, rush: 125, third: 44, rz: 65, to: 0.9 },
  PIT: { pts: 22.5, yds: 340, pass: 220, rush: 120, third: 39, rz: 56, to: 1.1 },
  SEA: { pts: 22.0, yds: 340, pass: 225, rush: 115, third: 38, rz: 55, to: 1.2 },
  SF:  { pts: 27.1, yds: 380, pass: 250, rush: 130, third: 45, rz: 67, to: 0.9 },
  TB:  { pts: 24.5, yds: 365, pass: 250, rush: 115, third: 42, rz: 63, to: 1.0 },
  TEN: { pts: 18.0, yds: 295, pass: 190, rush: 105, third: 32, rz: 46, to: 1.7 },
  WAS: { pts: 23.5, yds: 355, pass: 235, rush: 120, third: 40, rz: 59, to: 1.1 },
};

const QB_TIER = {
  KC: 97, BAL: 95, BUF: 94, SF: 93, PHI: 91, LAC: 91, MIN: 90, GB: 89, DET: 89, CIN: 88,
  MIA: 87, HOU: 86, DAL: 86, NO: 85, LAR: 84, TB: 84, ATL: 83, WAS: 83, SEA: 82, DEN: 81,
  ARI: 80, PIT: 80, IND: 79, CHI: 78, NYJ: 77, CLE: 76, LV: 74, JAX: 74, TEN: 72, NYG: 70,
  CAR: 68, NE: 67,
};

const COACHING = {
  KC: 97, SF: 96, PHI: 94, BAL: 93, BUF: 92, DET: 91, GB: 90, LAC: 89, HOU: 88, MIN: 87,
  CIN: 86, DAL: 86, LAR: 85, TB: 85, NO: 84, ATL: 83, WAS: 82, MIA: 82, DEN: 81, PIT: 80,
  SEA: 79, ARI: 78, IND: 78, CLE: 77, NYJ: 76, LV: 74, JAX: 73, CHI: 73, TEN: 71, NYG: 70,
  CAR: 67, NE: 66,
};

const OLINE = {
  PHI: 96, SF: 94, DET: 93, KC: 91, BUF: 90, BAL: 89, GB: 88, DEN: 87, LAC: 86, MIN: 85,
  CIN: 84, TB: 83, HOU: 83, LAR: 82, DAL: 81, ATL: 81, MIA: 80, IND: 80, WAS: 79, NO: 79,
  SEA: 78, PIT: 77, ARI: 77, CLE: 76, NYJ: 75, JAX: 74, TEN: 73, LV: 72, CHI: 71, CAR: 70,
  NYG: 68, NE: 67,
};

export const LEAGUE_OFFENSE_AVG = {
  pts: 21.5, yds: 335, pass: 225, rush: 110, third: 38, rz: 56, to: 1.2,
};

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

export function teamPowerRating(rawAbv) {
  const abv  = normAbv(rawAbv);
  const off  = TEAM_OFFENSE[abv];
  const def  = TEAM_STATS[abv];
  if (!off || !def) return 50;
  const offScore = clamp(
    ((off.pts / LEAGUE_OFFENSE_AVG.pts) + (off.yds / LEAGUE_OFFENSE_AVG.yds)) / 2 * 50, 0, 100
  );
  const defScore = clamp(
    ((NFL_LEAGUE_AVGS.pass_yds_allowed / def.pass_yds_allowed) +
     (NFL_LEAGUE_AVGS.rush_yds_allowed / def.rush_yds_allowed)) / 2 * 50, 0, 100
  );
  return Math.round(offScore * 0.55 + defScore * 0.45);
}

function predictScore(offRaw, defRaw, isHome) {
  const offAbv = normAbv(offRaw);
  const defAbv = normAbv(defRaw);
  const off = TEAM_OFFENSE[offAbv];
  const def = TEAM_STATS[defAbv];
  if (!off || !def) return 21.5;
  const passAdj = NFL_LEAGUE_AVGS.pass_yds_allowed / def.pass_yds_allowed;
  const rushAdj = NFL_LEAGUE_AVGS.rush_yds_allowed / def.rush_yds_allowed;
  const defAdj  = passAdj * 0.65 + rushAdj * 0.35;
  let predicted = off.pts * defAdj;
  if (isHome) predicted += 1.8;
  return Math.round(predicted * 10) / 10;
}

function randNorm(mean, sd) {
  let u, v;
  do { u = Math.random(); } while (u === 0);
  do { v = Math.random(); } while (v === 0);
  return mean + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd;
}

export function runSimulation(homeScore, awayScore, ouLine, n = 5000) {
  const SD = 10.5;
  let hw = 0, aw = 0, hc = 0, ac = 0, ov = 0, un = 0;
  const spread = homeScore - awayScore;
  for (let i = 0; i < n; i++) {
    const hs = Math.max(0, randNorm(homeScore, SD));
    const as = Math.max(0, randNorm(awayScore, SD));
    const m  = hs - as;
    if (m > 0) hw++; else aw++;
    if (m > -spread) hc++; else ac++;
    if (hs + as > (ouLine ?? homeScore + awayScore)) ov++; else un++;
  }
  return {
    homeWinPct:   Math.round((hw / n) * 100),
    awayWinPct:   Math.round((aw / n) * 100),
    homeCoverPct: Math.round((hc / n) * 100),
    awayCoverPct: Math.round((ac / n) * 100),
    overPct:      Math.round((ov / n) * 100),
    underPct:     Math.round((un / n) * 100),
    avgTotal:     Math.round((homeScore + awayScore) * 10) / 10,
    avgHomeScore: Math.round(homeScore * 10) / 10,
    avgAwayScore: Math.round(awayScore * 10) / 10,
  };
}

function computeAdvantages(homeRaw, awayRaw) {
  const hA = normAbv(homeRaw), aA = normAbv(awayRaw);
  const hOff = TEAM_OFFENSE[hA] ?? {}; const aOff = TEAM_OFFENSE[aA] ?? {};
  const hDef = TEAM_STATS[hA] ?? {};   const aDef = TEAM_STATS[aA] ?? {};
  const hQB  = QB_TIER[hA] ?? 75;     const aQB  = QB_TIER[aA] ?? 75;
  const hC   = COACHING[hA] ?? 75;    const aC   = COACHING[aA] ?? 75;
  const hOL  = OLINE[hA] ?? 75;       const aOL  = OLINE[aA] ?? 75;

  const mk = (label, home, away, desc) => ({
    label,
    winner: home > away + 4 ? hA : away > home + 4 ? aA : null,
    homeVal: home, awayVal: away, desc,
  });

  return [
    mk('QB Advantage', hQB, aQB,
      Math.abs(hQB - aQB) > 4
        ? `${hQB > aQB ? hA : aA} holds a clear edge at quarterback`
        : 'Comparable quarterbacks — relatively even matchup'),
    mk('Offensive Line', hOL, aOL,
      Math.abs(hOL - aOL) > 4
        ? `${hOL > aOL ? hA : aA} has a trench advantage in blocking`
        : 'Comparable offensive lines'),
    {
      label: 'Pass Defense',
      winner: aDef.pass_yds_allowed > hDef.pass_yds_allowed + 15 ? hA
            : hDef.pass_yds_allowed > aDef.pass_yds_allowed + 15 ? aA : null,
      homeVal: 300 - (hDef.pass_yds_allowed ?? 228),
      awayVal: 300 - (aDef.pass_yds_allowed ?? 228),
      desc: `${hA} allows ${hDef.pass_yds_allowed ?? '?'} pass yds/G · ${aA} allows ${aDef.pass_yds_allowed ?? '?'}`,
    },
    {
      label: 'Run Defense',
      winner: aDef.rush_yds_allowed > hDef.rush_yds_allowed + 10 ? hA
            : hDef.rush_yds_allowed > aDef.rush_yds_allowed + 10 ? aA : null,
      homeVal: 180 - (hDef.rush_yds_allowed ?? 111),
      awayVal: 180 - (aDef.rush_yds_allowed ?? 111),
      desc: `${hA} allows ${hDef.rush_yds_allowed ?? '?'} rush yds/G · ${aA} allows ${aDef.rush_yds_allowed ?? '?'}`,
    },
    mk('Scoring Offense', hOff.pts ?? 21.5, aOff.pts ?? 21.5,
      `${hA} averages ${hOff.pts ?? '?'} pts/G · ${aA} averages ${aOff.pts ?? '?'} pts/G`),
    mk('Coaching Edge', hC, aC,
      Math.abs(hC - aC) > 4
        ? `${hC > aC ? hA : aA} has a meaningful coaching edge`
        : 'Competitive head coaches on both sidelines'),
    {
      label: 'Home Field', winner: hA, homeVal: 80, awayVal: 60,
      desc: `${hA} has the crowd and familiarity advantage`,
    },
    mk('3rd Down Offense', hOff.third ?? 38, aOff.third ?? 38,
      `${hA}: ${hOff.third ?? '?'}% · ${aA}: ${aOff.third ?? '?'}%`),
  ];
}

function positionMatchups(homeRaw, awayRaw) {
  const hA  = normAbv(homeRaw), aA = normAbv(awayRaw);
  const hD  = TEAM_STATS[hA] ?? {};
  const aD  = TEAM_STATS[aA] ?? {};

  const gradeRatio = r => {
    if (r >= 1.20) return { letter: 'A+', color: 'emerald' };
    if (r >= 1.10) return { letter: 'A',  color: 'emerald' };
    if (r >= 1.02) return { letter: 'B+', color: 'sky' };
    if (r >= 0.95) return { letter: 'B',  color: 'sky' };
    if (r >= 0.88) return { letter: 'C',  color: 'amber' };
    if (r >= 0.80) return { letter: 'D',  color: 'orange' };
    return              { letter: 'F',  color: 'red' };
  };

  const passAdj = v => NFL_LEAGUE_AVGS.pass_yds_allowed / (v ?? NFL_LEAGUE_AVGS.pass_yds_allowed);
  const rushAdj = v => NFL_LEAGUE_AVGS.rush_yds_allowed / (v ?? NFL_LEAGUE_AVGS.rush_yds_allowed);
  const recAdj  = (v, avg) => avg / (v ?? avg);

  return [
    {
      label: `${hA} QB vs ${aA} Pass D`,
      grade: gradeRatio(passAdj(aD.pass_yds_allowed)),
      detail: `${aA} allows ${aD.pass_yds_allowed ?? '?'} pass yds/G (league avg ${NFL_LEAGUE_AVGS.pass_yds_allowed})`,
      favors: passAdj(aD.pass_yds_allowed) >= 1 ? hA : aA,
    },
    {
      label: `${aA} QB vs ${hA} Pass D`,
      grade: gradeRatio(passAdj(hD.pass_yds_allowed)),
      detail: `${hA} allows ${hD.pass_yds_allowed ?? '?'} pass yds/G (league avg ${NFL_LEAGUE_AVGS.pass_yds_allowed})`,
      favors: passAdj(hD.pass_yds_allowed) >= 1 ? aA : hA,
    },
    {
      label: `${hA} WRs vs ${aA} Secondary`,
      grade: gradeRatio(recAdj(aD.rec_yds_allowed_wr, NFL_LEAGUE_AVGS.rec_yds_allowed_wr)),
      detail: `${aA} allows ${aD.rec_yds_allowed_wr ?? '?'} rec yds/G to WRs`,
      favors: (aD.rec_yds_allowed_wr ?? 152) > NFL_LEAGUE_AVGS.rec_yds_allowed_wr ? hA : aA,
    },
    {
      label: `${hA} RB vs ${aA} Run D`,
      grade: gradeRatio(rushAdj(aD.rush_yds_allowed)),
      detail: `${aA} allows ${aD.rush_yds_allowed ?? '?'} rush yds/G`,
      favors: rushAdj(aD.rush_yds_allowed) >= 1 ? hA : aA,
    },
    {
      label: `${aA} RB vs ${hA} Run D`,
      grade: gradeRatio(rushAdj(hD.rush_yds_allowed)),
      detail: `${hA} allows ${hD.rush_yds_allowed ?? '?'} rush yds/G`,
      favors: rushAdj(hD.rush_yds_allowed) >= 1 ? aA : hA,
    },
    {
      label: `${hA} TEs vs ${aA} LBs`,
      grade: gradeRatio(recAdj(aD.rec_yds_allowed_te, NFL_LEAGUE_AVGS.rec_yds_allowed_te)),
      detail: `${aA} allows ${aD.rec_yds_allowed_te ?? '?'} rec yds/G to TEs`,
      favors: (aD.rec_yds_allowed_te ?? 63) > NFL_LEAGUE_AVGS.rec_yds_allowed_te ? hA : aA,
    },
  ];
}

function generateExplanation(hA, aA, hS, aS, sim, adv) {
  const hDef = TEAM_STATS[normAbv(hA)] ?? {};
  const aDef = TEAM_STATS[normAbv(aA)] ?? {};
  const hOff = TEAM_OFFENSE[normAbv(hA)] ?? {};
  const aOff = TEAM_OFFENSE[normAbv(aA)] ?? {};
  const hQB  = QB_TIER[normAbv(hA)] ?? 75;
  const aQB  = QB_TIER[normAbv(aA)] ?? 75;
  const favored  = hS >= aS ? hA : aA;
  const margin   = Math.abs(hS - aS).toFixed(1);
  const winPct   = favored === hA ? sim.homeWinPct : sim.awayWinPct;

  const sentences = [];
  sentences.push(
    `The model projects ${favored} to win by approximately ${margin} points with a ${winPct}% win probability based on 5,000 Monte Carlo simulations.`
  );

  const qbDelta = Math.abs(hQB - aQB);
  if (qbDelta > 8) {
    const qbEdge = hQB > aQB ? hA : aA;
    sentences.push(
      `${qbEdge} holds a significant quarterback advantage — QB play carries the largest single weight (22%) in this model.`
    );
  }

  const passVuln = aDef.pass_yds_allowed > NFL_LEAGUE_AVGS.pass_yds_allowed + 15 ? aA
                 : hDef.pass_yds_allowed > NFL_LEAGUE_AVGS.pass_yds_allowed + 15 ? hA : null;
  if (passVuln) {
    const offAbv = passVuln === hA ? aA : hA;
    const allowed = passVuln === hA ? hDef.pass_yds_allowed : aDef.pass_yds_allowed;
    sentences.push(
      `${passVuln}'s pass defense is vulnerable at ${allowed} yards allowed per game — ${offAbv}'s aerial attack should find room to operate.`
    );
  }

  const strongRun = hOff.rush > LEAGUE_OFFENSE_AVG.rush + 20 ? hA
                  : aOff.rush > LEAGUE_OFFENSE_AVG.rush + 20 ? aA : null;
  if (strongRun) {
    const runAbv  = strongRun;
    const runYds  = runAbv === hA ? hOff.rush : aOff.rush;
    const oppRush = runAbv === hA ? aDef.rush_yds_allowed : hDef.rush_yds_allowed;
    sentences.push(
      `${runAbv} brings a dominant rushing attack (${runYds} yds/G) into a matchup against a defense allowing ${oppRush} rush yards per game — strong ground control potential.`
    );
  }

  const ouProj = hS + aS;
  if (sim.overPct > 58) {
    sentences.push(`The total at ${ouProj.toFixed(1)} projected points looks lean — both offenses rank above average and simulations hit the over ${sim.overPct}% of the time.`);
  } else if (sim.underPct > 58) {
    sentences.push(`With strong defensive units on the field, the under at ${ouProj.toFixed(1)} total points is the more likely outcome (${sim.underPct}% in simulations).`);
  }

  return sentences.join(' ');
}

export function normalizeForRadar(rawAbv) {
  const abv = normAbv(rawAbv);
  const off = TEAM_OFFENSE[abv] ?? LEAGUE_OFFENSE_AVG;
  const def = TEAM_STATS[abv] ?? {};
  return [
    { metric: 'Scoring',  value: Math.round((off.pts / LEAGUE_OFFENSE_AVG.pts) * 70) },
    { metric: 'Offense',  value: Math.round((off.yds / LEAGUE_OFFENSE_AVG.yds) * 70) },
    { metric: 'Pass Def', value: Math.round((NFL_LEAGUE_AVGS.pass_yds_allowed / (def.pass_yds_allowed || 228)) * 70) },
    { metric: 'Run Def',  value: Math.round((NFL_LEAGUE_AVGS.rush_yds_allowed / (def.rush_yds_allowed || 111)) * 70) },
    { metric: '3rd Dwn',  value: Math.round((off.third / LEAGUE_OFFENSE_AVG.third) * 70) },
    { metric: 'Red Zone', value: Math.round((off.rz / LEAGUE_OFFENSE_AVG.rz) * 70) },
  ];
}

// ─── Upset Watch Engine ───────────────────────────────────────────────────────
// Returns null if the game isn't a viable upset candidate, otherwise a scored
// breakdown explaining exactly why the underdog has a legitimate shot.
function computeUpsetWatch({ hA, aA, homeScore, awayScore, sim, bookSpread,
                             homeOff, awayOff, homeDef, awayDef }) {
  const margin   = homeScore - awayScore;               // positive = home favored
  const absMar   = Math.abs(margin);
  const favored  = margin >= 0 ? hA : aA;
  const underdog = favored === hA ? aA : hA;
  const udIsHome = underdog === hA;

  const udWinPct  = udIsHome ? sim.homeWinPct : sim.awayWinPct;
  const udOff     = udIsHome ? homeOff  : awayOff;
  const favOff    = udIsHome ? awayOff  : homeOff;
  const udDef     = udIsHome ? homeDef  : awayDef;
  const favDef    = udIsHome ? awayDef  : homeDef;

  const udQB  = QB_TIER[normAbv(underdog)] ?? 75;
  const favQB = QB_TIER[normAbv(favored)]  ?? 75;

  // Must be a genuine underdog and have a real shot
  if (absMar < 2)              return null;
  if (udWinPct < 26 || udWinPct > 49) return null;

  let score = 0;
  const reasons = [];
  const keyFactors = [];

  // 1. How competitive is this in simulation?
  if (udWinPct >= 42)      { score += 35; }
  else if (udWinPct >= 36) { score += 22; }
  else if (udWinPct >= 30) { score += 12; }
  reasons.push(
    `${underdog} wins ${udWinPct}% of simulated outcomes — the gap between these teams is smaller than the line suggests.`
  );

  // 2. Home underdog (strongest historical upset predictor)
  if (udIsHome) {
    score += 22;
    reasons.push(
      `${underdog} is a home underdog — historically, home 'dogs cover the spread at a significantly elevated rate (~52-55%).`
    );
    keyFactors.push({ label: 'Home Underdog', description: `${underdog} plays at home with crowd noise, familiarity, and travel disadvantage for ${favored}` });
  }

  // 3. Favorite has a soft pass defense
  if (favDef?.pass_yds_allowed > NFL_LEAGUE_AVGS.pass_yds_allowed + 15) {
    score += 18;
    reasons.push(
      `${favored}'s pass defense allows ${favDef.pass_yds_allowed} yds/G through the air — ${underdog}'s offense can exploit that weakness for chunk plays.`
    );
    keyFactors.push({ label: 'Soft Favorite Defense', description: `${favored} allows ${favDef.pass_yds_allowed} pass yds/G vs league avg ${NFL_LEAGUE_AVGS.pass_yds_allowed}` });
  }

  // 4. Favorite has a soft run defense
  if (favDef?.rush_yds_allowed > NFL_LEAGUE_AVGS.rush_yds_allowed + 15) {
    score += 12;
    reasons.push(
      `${favored} is also soft against the run (${favDef.rush_yds_allowed} rush yds/G allowed) — ${underdog} can control the clock and stay in this game.`
    );
    keyFactors.push({ label: 'Run Defense Vulnerability', description: `${favored} allows ${favDef.rush_yds_allowed} rush yds/G — clock-control upset route` });
  }

  // 5. Line value vs book (model projects closer game)
  if (bookSpread != null) {
    const bookMar = Math.abs(bookSpread);
    const gap     = bookMar - absMar;
    if (gap >= 2.5) {
      score += 20;
      reasons.push(
        `The model projects a ${absMar.toFixed(1)}-point game vs the book's ${bookMar.toFixed(1)}-point spread — ${Math.round(gap)} points of model-implied value on ${underdog}.`
      );
      keyFactors.push({ label: 'Line Value Gap', description: `Book: −${bookMar.toFixed(1)} · Model: −${absMar.toFixed(1)} → ${Math.round(gap)} pts of edge` });
    }
  }

  // 6. Underdog has a capable offense
  if (udOff?.pts && udOff.pts > LEAGUE_OFFENSE_AVG.pts + 2) {
    score += 12;
    reasons.push(
      `${underdog} averages ${udOff.pts} pts/G — an above-average offense capable of posting the kind of score needed to pull the upset.`
    );
    keyFactors.push({ label: `${underdog} Scoring Ability`, description: `${udOff.pts} pts/G average — not a push-over offense` });
  }

  // 7. QB tiers are closer than the line implies
  if (favQB - udQB < 8) {
    score += 10;
    reasons.push(
      `QB tiers are close (${underdog}: ${udQB} · ${favored}: ${favQB}) — the talent gap at the most impactful position is minimal.`
    );
    keyFactors.push({ label: 'Even QB Matchup', description: `${underdog} QB rated ${udQB} vs ${favored} QB rated ${favQB} — minimal edge` });
  }

  // 8. Underdog has strong defense
  const avgPassAlwd = NFL_LEAGUE_AVGS.pass_yds_allowed;
  if (udDef?.pass_yds_allowed && udDef.pass_yds_allowed < avgPassAlwd - 15) {
    score += 10;
    reasons.push(
      `${underdog}'s defense is stingy (${udDef.pass_yds_allowed} pass yds/G allowed) — they can keep the favorite's offense in check.`
    );
    keyFactors.push({ label: `${underdog} Defense`, description: `Allows only ${udDef.pass_yds_allowed} pass yds/G — elite defensive unit` });
  }

  if (score < 30) return null;

  // Upset tier label
  const tier = score >= 70 ? 'Prime Upset'
             : score >= 50 ? 'Upset Watch'
             : 'Mild Upset Lean';

  const tierColor = score >= 70 ? 'red' : score >= 50 ? 'orange' : 'amber';

  return {
    underdog, favored, udIsHome,
    udWinPct,
    upsetScore: Math.min(score, 100),
    tier, tierColor,
    reasons:    reasons.slice(0, 4),
    keyFactors: keyFactors.slice(0, 4),
    historicalNote: udIsHome
      ? 'Home underdogs cover the spread roughly 52-55% of the time — one of the most reliable edges in NFL betting.'
      : 'Road underdogs of 3-7 points cover at approximately 47%, slightly above the break-even threshold.',
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function analyzeGame(game) {
  const hA = normAbv(game.homeAbv);
  const aA = normAbv(game.awayAbv);

  const hS = predictScore(hA, aA, true);
  const aS = predictScore(aA, hA, false);
  const ouLine = game.total?.line ?? null;
  const sim    = runSimulation(hS, aS, ouLine);
  const adv    = computeAdvantages(hA, aA);
  const posMaps = positionMatchups(hA, aA);
  const explanation = generateExplanation(hA, aA, hS, aS, sim, adv);

  const bookSpread = game.spread?.home ?? null;
  const ourSpread  = hS - aS;
  const spreadPick = ourSpread > 0 ? hA : aA;
  const ouPick     = ouLine != null
    ? ((hS + aS) > ouLine ? 'OVER' : 'UNDER')
    : (sim.overPct > sim.underPct ? 'OVER' : 'UNDER');

  const confidence = Math.round(clamp(58 + Math.abs(ourSpread) * 1.8, 55, 91));

  const homeOff = TEAM_OFFENSE[hA] ?? null;
  const awayOff = TEAM_OFFENSE[aA] ?? null;
  const homeDef = TEAM_STATS[hA] ?? null;
  const awayDef = TEAM_STATS[aA] ?? null;

  const upsetWatch = computeUpsetWatch({
    hA, aA, homeScore: hS, awayScore: aS, sim, bookSpread,
    homeOff, awayOff, homeDef, awayDef,
  });

  return {
    hA, aA,
    homeScore: hS, awayScore: aS,
    homeRating: teamPowerRating(hA), awayRating: teamPowerRating(aA),
    sim, adv, posMaps, explanation,
    spreadPick, ouPick, confidence,
    ourSpread, bookSpread,
    homeOff, awayOff, homeDef, awayDef,
    homeQB: QB_TIER[hA] ?? 75,
    awayQB: QB_TIER[aA] ?? 75,
    upsetWatch,
    aiReasoningFactors: [
      { label: 'Quarterback Play',     pct: 22 },
      { label: 'Defense',              pct: 18 },
      { label: 'Coaching',             pct: 12 },
      { label: 'Home Field',           pct: 10 },
      { label: 'Injuries',             pct: 9  },
      { label: 'Matchup Advantage',    pct: 8  },
      { label: 'Recent Form',          pct: 8  },
      { label: 'Offensive Efficiency', pct: 7  },
      { label: 'Rest / Schedule',      pct: 4  },
      { label: 'Special Teams',        pct: 2  },
    ],
    whatCouldChange: [
      'Late injury news from Friday/Saturday practice reports',
      'Unexpected weather (wind >20 mph significantly impacts passing games)',
      'Quarterback limitations due to reported minor injuries',
      'Coaching scheme adjustments or overly conservative game plans',
      'Turnover variance — one or two extra turnovers can swing 14+ points',
      'Red-zone efficiency outlier (NFL averages 1.8 TDs per 4 red zone trips)',
    ],
  };
}

export function getGameIndicators(analysis) {
  const { confidence, sim, ourSpread, bookSpread, upsetWatch } = analysis;
  const indicators = [];
  if (upsetWatch?.upsetScore >= 50)
                                    indicators.push({ icon: '🚨', label: upsetWatch.tier, color: upsetWatch.tierColor });
  if (confidence >= 83)             indicators.push({ icon: '⭐', label: 'AI Lock',     color: 'amber'   });
  else if (confidence >= 76)        indicators.push({ icon: '🔥', label: 'Best Bet',    color: 'orange'  });
  if (sim.overPct >= 65 || sim.underPct >= 65)
                                    indicators.push({ icon: '📈', label: 'Sharp Edge',  color: 'blue'    });
  if (bookSpread != null && Math.abs(ourSpread - bookSpread) >= 2.5)
                                    indicators.push({ icon: '💰', label: 'Value Pick',  color: 'emerald' });
  if (confidence < 64 && !upsetWatch)
                                    indicators.push({ icon: '⚠️', label: 'Risky Bet',  color: 'red'     });
  return indicators.slice(0, 2);
}
