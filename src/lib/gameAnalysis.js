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

// ─── 2026-27 NFL Projected Offensive Data ────────────────────────────────────
// Base = 2025-26 final stats, adjusted for significant 2026 roster moves:
//   PHI -AJ Brown → DET O-line transition → PIT +Metcalf+Pittman+Rodgers
//   NE +AJ Brown+Maye leap → MIA -Tua-Waddle+Willis → DEN +Waddle+Nix Y2
//   LV rookie Mendoza → ARI Carson Beck bridge → BUF +DJ Moore
//   ATL Tua>Kirk → CLE QB battle → KC +Walker III
// Live ESPN in-season stats override these once Week 1 starts (see nflSeasonStats.js)
export const TEAM_OFFENSE = {
  // Carson Beck bridge/evaluation QB replacing Kyler Murray; new HC LaFleur
  ARI: { pts: 17.0, yds: 312, pass: 218, rush:  94, third: 34, rz: 50, to: 1.6 },
  // Tua (healthy) slightly better than declining Kirk; Stefanski brings structure
  ATL: { pts: 23.0, yds: 344, pass: 246, rush:  98, third: 40, rz: 57, to: 1.2 },
  // Lamar MVP-caliber; Harbaugh gone but offense is still Lamar-driven
  BAL: { pts: 27.5, yds: 398, pass: 238, rush: 160, third: 44, rz: 63, to: 0.9 },
  // Allen + DJ Moore addition + Joe Brady (was the OC, knows the system)
  BUF: { pts: 29.5, yds: 396, pass: 274, rush: 122, third: 46, rz: 65, to: 0.8 },
  // Still bottom-tier; Bryce Young may get another shot, new staff
  CAR: { pts: 15.9, yds: 278, pass: 198, rush:  80, third: 32, rz: 46, to: 1.8 },
  // Williams Year 2, but lost DJ Moore; net roughly flat to slight drop
  CHI: { pts: 20.5, yds: 322, pass: 226, rush:  96, third: 37, rz: 54, to: 1.4 },
  // Burrow healthy full season; Higgins + Chase elite duo; Zac Taylor year 7
  CIN: { pts: 25.5, yds: 380, pass: 284, rush:  96, third: 43, rz: 62, to: 1.0 },
  // Open QB battle (Sanders/Watson/Gabriel); Monken offense needs a QB
  CLE: { pts: 16.5, yds: 295, pass: 205, rush:  90, third: 33, rz: 48, to: 1.6 },
  // Dak Prescott full season; CeeDee Lamb + core intact under new staff
  DAL: { pts: 24.5, yds: 365, pass: 258, rush: 107, third: 42, rz: 60, to: 1.1 },
  // Bo Nix Year 2 leap; Jaylen Waddle gives explosive YAC weapon; Payton
  DEN: { pts: 24.0, yds: 350, pass: 242, rush:  98, third: 41, rz: 58, to: 1.2 },
  // O-line in transition; Goff + Gibbs/Montgomery still elite; Dan Campbell
  DET: { pts: 27.5, yds: 398, pass: 268, rush: 130, third: 44, rz: 63, to: 0.9 },
  // Jordan Love + Josh Jacobs; LaFleur system stable; no major losses
  GB:  { pts: 26.5, yds: 372, pass: 264, rush: 108, third: 44, rz: 62, to: 0.9 },
  // CJ Stroud Year 3; Nico Collins + Tank Dell; DeMeco Ryans culture
  HOU: { pts: 27.0, yds: 374, pass: 260, rush: 114, third: 44, rz: 64, to: 1.0 },
  // AR re-signed; Jonathan Taylor + solid OL
  IND: { pts: 22.4, yds: 338, pass: 241, rush:  97, third: 39, rz: 56, to: 1.3 },
  // Liam Coen Year 2; Trevor Lawrence back (if healthy); cautious optimism
  JAX: { pts: 21.5, yds: 335, pass: 240, rush:  95, third: 39, rz: 56, to: 1.3 },
  // Mahomes + Kelce re-signed + Kenneth Walker III; perennial powerhouse
  KC:  { pts: 27.8, yds: 364, pass: 255, rush: 109, third: 45, rz: 65, to: 0.8 },
  // Herbert + Harbaugh Year 2; continuity breeds improvement
  LAC: { pts: 24.5, yds: 354, pass: 262, rush:  92, third: 41, rz: 59, to: 1.1 },
  // Stafford + Puka Nacua/Cooper Kupp + Myles Garrett on D (doesn't help O)
  LAR: { pts: 25.5, yds: 370, pass: 270, rush: 100, third: 43, rz: 61, to: 1.0 },
  // Fernando Mendoza #1 pick; elite prospect but rookie struggles expected
  LV:  { pts: 13.5, yds: 275, pass: 192, rush:  83, third: 30, rz: 44, to: 1.9 },
  // Malik Willis replacing Tua; lost Waddle too; De'Von Achane the one bright spot
  MIA: { pts: 17.0, yds: 305, pass: 218, rush:  87, third: 34, rz: 49, to: 1.5 },
  // JJ McCarthy taking over (if healthy); or Darnold bridge; O'Connell system
  MIN: { pts: 23.5, yds: 350, pass: 260, rush:  90, third: 41, rz: 58, to: 1.2 },
  // Drake Maye Year 2 + AJ Brown = massive upgrade; Vrabel culture shift
  NE:  { pts: 21.5, yds: 330, pass: 228, rush: 102, third: 38, rz: 56, to: 1.3 },
  // QB situation still unsettled after carousel; Travis Etienne adds run game
  NO:  { pts: 20.5, yds: 325, pass: 222, rush: 103, third: 37, rz: 55, to: 1.4 },
  // Jaxson Dart confirmed starter; John Harbaugh structure; rebuilding but hopeful
  NYG: { pts: 17.5, yds: 292, pass: 200, rush:  92, third: 34, rz: 49, to: 1.7 },
  // Geno Smith veteran stability; Robert Saleh/Frank Reich rebuild
  NYJ: { pts: 19.5, yds: 320, pass: 222, rush:  98, third: 37, rz: 53, to: 1.4 },
  // Lost AJ Brown (biggest WR); Saquon + Hurts still strong but ceiling drops
  PHI: { pts: 25.5, yds: 385, pass: 248, rush: 137, third: 43, rz: 62, to: 0.9 },
  // Rodgers final season + DK Metcalf + Michael Pittman Jr.; McCarthy all-in
  PIT: { pts: 26.5, yds: 372, pass: 268, rush: 104, third: 43, rz: 63, to: 1.0 },
  // New QB situation post-Geno; developing young roster
  SEA: { pts: 21.5, yds: 338, pass: 238, rush: 100, third: 38, rz: 55, to: 1.3 },
  // Purdy + healthy OL + Shanahan scheme; strong bounce-back expected
  SF:  { pts: 27.0, yds: 388, pass: 268, rush: 120, third: 45, rz: 65, to: 0.9 },
  // Baker Mayfield Year 3 with Bowles; Rachaad White / Bucky Irving backfield
  TB:  { pts: 24.5, yds: 356, pass: 258, rush:  98, third: 42, rz: 60, to: 1.2 },
  // Cam Ward Year 2; Robert Saleh as HC; Saleh's D identity won't fix the O
  TEN: { pts: 18.5, yds: 305, pass: 208, rush:  97, third: 35, rz: 52, to: 1.5 },
  // Daniels Year 2; WAS offense remains dangerous; Dan Quinn strong
  WAS: { pts: 28.0, yds: 384, pass: 272, rush: 112, third: 45, rz: 63, to: 0.9 },
};

// QB tier ratings — updated for 2026-27 starters
// Scale: 97+ = elite MVP tier, 90-96 = top-10, 80-89 = solid starter, <80 = below average
const QB_TIER = {
  BAL: 99,  // Lamar Jackson — back-to-back MVP, still the standard
  BUF: 97,  // Josh Allen — elite in every dimension
  KC:  97,  // Patrick Mahomes — 3x SB, still the closer
  WAS: 93,  // Jayden Daniels — Year 2 leap, top-5 ceiling
  PHI: 92,  // Jalen Hurts — elite dual-threat, still the engine
  CIN: 93,  // Joe Burrow — full healthy season; top tier when on field
  HOU: 90,  // CJ Stroud — Year 3 breakout; DeMeco Ryans' system fits him
  DET: 91,  // Jared Goff — underrated elite; 2025-26 MVP-level season
  SF:  90,  // Brock Purdy — legitimate elite; Kyle Shanahan's best weapon
  GB:  89,  // Jordan Love — steady ascending arc; top-10 ceiling
  LAR: 86,  // Matthew Stafford — vet savant; health is only concern
  LAC: 89,  // Justin Herbert — Harbaugh Year 2 = full expression of talent
  PIT: 82,  // Aaron Rodgers — final season; declining but still capable
  TB:  85,  // Baker Mayfield — Year 3 Bowles; consistent performer
  DAL: 88,  // Dak Prescott — full healthy season; elite when upright
  ATL: 79,  // Tua Tagovailoa — talented when healthy; injury risk caps ceiling
  MIA: 70,  // Malik Willis — elevated backup; athletic but inaccurate at times
  DEN: 82,  // Bo Nix — Year 2 breakout; Payton + Waddle = major upgrade
  CHI: 80,  // Caleb Williams — Year 2 should show growth; OL still a concern
  NE:  78,  // Drake Maye — AJ Brown changes everything; promising leap expected
  MIN: 80,  // JJ McCarthy (if healthy) or Darnold bridge; O'Connell system
  SEA: 78,  // New QB situation; developmental year
  IND: 80,  // Anthony Richardson — full healthy season; elite athletic ceiling
  JAX: 81,  // Trevor Lawrence — back and healthy; Coen Year 2 scheme fits him
  NYJ: 78,  // Geno Smith — solid veteran; stable but not spectacular
  CLE: 71,  // Open battle — Shedeur Sanders the incumbent; true uncertainty
  NYG: 75,  // Jaxson Dart — sophomore confirmed starter; Harbaugh structure helps
  LV:  71,  // Fernando Mendoza — #1 pick; elite prospect but rookie wall is real
  ARI: 67,  // Carson Beck — bridge/evaluation QB; unproven in NFL
  TEN: 76,  // Cam Ward — Year 2; flashes but took 55 sacks as a rookie
  NO:  72,  // QB still unsettled; Derek Carr injury situation unclear
  CAR: 73,  // New HC; Bryce Young may get final shot or another new face
};

// Coaching quality ratings — updated for 2026-27 head coaches
// Scale: 97+ = all-time, 85-94 = elite, 75-84 = above average, <75 = rebuilding
const COACHING = {
  KC:  98,  // Andy Reid — GOAT-tier; system never misses
  NYG: 92,  // John Harbaugh — elite HC immediately upgrades the Giants
  SF:  92,  // Kyle Shanahan — system mastery; injury management still a flaw
  LAR: 92,  // Sean McVay — brilliant offensive mind; sustained excellence
  DET: 90,  // Dan Campbell — culture builder; elite motivator
  LAC: 90,  // Jim Harbaugh — Year 2; installed discipline and culture
  GB:  88,  // Matt LaFleur — Jordan Love arc shows coaching quality
  DEN: 88,  // Sean Payton — defense elite; offense now has weapons
  BUF: 82,  // Joe Brady — first-year HC promoted from OC; Josh Allen helps
  ATL: 82,  // Kevin Stefanski — proven game-planner; fresh start works for him
  HOU: 86,  // DeMeco Ryans — young defensive genius; culture builder
  CIN: 84,  // Zac Taylor — sustained excellence when Burrow is healthy
  MIN: 84,  // Kevin O'Connell — elite offensive system; QB question is the only one
  PHI: 85,  // Nick Sirianni — team remains competitive despite Brown loss
  WAS: 85,  // Dan Quinn — Year 2 with Daniels; NFC contender
  PIT: 83,  // Mike McCarthy — Super Bowl pedigree; maximizing Rodgers' final year
  NE:  86,  // Mike Vrabel — proven builder; arrives with AJ Brown + Maye
  MIA: 82,  // Mike McDaniel — offensive genius; roster transition is the challenge
  CLE: 79,  // Todd Monken — experienced OC turned first-year HC
  BAL: 78,  // Jesse Minter — unproven as HC; inherits elite roster from Harbaugh
  SEA: 80,  // Mike Macdonald — Year 2; defensive identity being built
  DAL: 79,  // Mike McCarthy (same DAL) — good but roster-dependent
  IND: 80,  // Shane Steichen — question is QB/roster, not coaching
  JAX: 77,  // Liam Coen — Year 2; Lawrence healthy = real opportunity
  ARI: 70,  // Mike LaFleur — unproven first-year HC; tough roster
  TEN: 74,  // Robert Saleh — mixed HC track record; Brian Daboll as OC helps
  NYJ: 78,  // Aaron Glenn — Year 2; roster still limited
  LV:  70,  // Klint Kubiak — unproven HC; develop Mendoza is the mission
  CAR: 74,  // Dave Canales — Year 2; still rebuilding
  NO:  75,  // Dennis Allen situation resolved; stability being restored
  TB:  82,  // Todd Bowles — Mayfield Year 3; this team consistently overperforms
  CHI: 82,  // Ben Johnson — elite offensive mind; hired specifically for Williams
};

// O-line quality ratings — updated for 2026-27 roster changes
const OLINE = {
  PHI: 93,  // Still elite; Kelce/Mailata/Dickerson anchored even without Brown
  SF:  89,  // Top-tier; healthy OL again; Shanahan run game foundation
  DET: 87,  // Slight drop; O-line in transition year with starters in flux
  BAL: 84,  // Thinned by Harbaugh era departures; Lamar's mobility compensates
  BUF: 88,  // Solid; Allen mobility masks weaknesses; DJ Moore helps spacing
  KC:  86,  // Reid's OL culture; Kenneth Walker III behind them
  DAL: 85,  // Zack Martin anchor; still one of the better units in NFC
  GB:  85,  // Solid pass pro; Jordan Love's clean pockets are coaching + line
  CIN: 84,  // Burrow's O-line has improved; protection key to his health
  LAC: 83,  // Herbert protected well; Harbaugh discipline showing
  LAR: 82,  // McVay keeps the line functional regardless of personnel
  WAS: 82,  // Quinn's scheme helps; Daniels mobility offsets any weakness
  MIN: 82,  // Good for McCarthy/Darnold; JJ McCarthy needs this unit healthy
  HOU: 82,  // Solid for Stroud's pocket timing game
  PIT: 82,  // McCarthy offensive identity should improve unit usage
  TB:  80,  // Baker thrived; pass pro solid for a pocket QB
  IND: 80,  // Decent; AR's athleticism helps when it breaks down
  SEA: 81,  // Solid run game; developmental QB needs this unit
  DEN: 80,  // Improved; Bo Nix's quick release helps; Waddle's YAC reduces need
  ARI: 77,  // New scheme under LaFleur; continuity gap
  JAX: 77,  // Mediocre; Lawrence's health partly depends on this improving
  ATL: 76,  // Stefanski will try to establish run game; Tua needs quick throws
  CLE: 79,  // Improved with Zion Johnson addition; whoever wins QB battle benefits
  NE:  76,  // Improving; Vrabel emphasis on physicality; Maye needs time
  MIA: 79,  // De'Von Achane behind this; pass pro crucial for Willis
  NO:  78,  // Aging vets but serviceable; Etienne needs holes
  NYJ: 75,  // Glenn still working on roster; Geno extends plays well
  TEN: 76,  // Cam Ward took 55 sacks; this needs to improve for Year 2
  CHI: 75,  // Ben Johnson's scheme should help; still below average pass pro
  LV:  72,  // Mendoza will take hits; rebuilding across the board
  NYG: 71,  // Harbaugh will emphasize the run; still below average
  CAR: 70,  // Bottom of league; new HC same problem
};

// 2026-27 season projected league averages
export const LEAGUE_OFFENSE_AVG = {
  pts: 22.6, yds: 344, pass: 241, rush: 103, third: 40, rz: 57, to: 1.2,
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
// liveStats = { offense: { [ABV]: {...} } } from useSeasonStats() — null = use 2024 hardcoded
export function analyzeGame(game, liveStats = null) {
  const hA = normAbv(game.homeAbv);
  const aA = normAbv(game.awayAbv);

  // Build the active offense table: live data wins over 2024 hardcoded
  const offTable = liveStats?.offense
    ? { ...TEAM_OFFENSE, ...liveStats.offense }
    : TEAM_OFFENSE;
  const defTable = TEAM_STATS; // defensive stats always use 2024 (no live source yet)

  // Local predict that uses the active tables
  function predictScoreLive(offRaw, defRaw, isHome) {
    const off = offTable[normAbv(offRaw)];
    const def = defTable[normAbv(defRaw)];
    if (!off || !def) return 21.5;
    const passAdj = NFL_LEAGUE_AVGS.pass_yds_allowed / def.pass_yds_allowed;
    const rushAdj = NFL_LEAGUE_AVGS.rush_yds_allowed / def.rush_yds_allowed;
    const defAdj  = passAdj * 0.65 + rushAdj * 0.35;
    let predicted = off.pts * defAdj;
    if (isHome) predicted += 1.8;
    return Math.round(predicted * 10) / 10;
  }

  const hS = predictScoreLive(hA, aA, true);
  const aS = predictScoreLive(aA, hA, false);
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

  const homeOff = offTable[hA] ?? null;
  const awayOff = offTable[aA] ?? null;
  const homeDef = defTable[hA] ?? null;
  const awayDef = defTable[aA] ?? null;

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
