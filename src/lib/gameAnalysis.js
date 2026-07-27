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

// ─── 2024 NFL Offensive Data (final regular season) ───────────────────────────
// pts=pts/game scored, yds=total yards/game, pass/rush=yds by type
// third=3rd-down %, rz=red-zone TD %, to=turnovers/game
// Sourced from NFL.com / Pro Football Reference 2024 final stats
export const TEAM_OFFENSE = {
  ARI: { pts: 24.3, yds: 348, pass: 236, rush: 112, third: 44, rz: 64, to: 1.0 },
  ATL: { pts: 23.2, yds: 350, pass: 228, rush: 122, third: 43, rz: 62, to: 1.1 },
  // Lamar Jackson 2nd MVP + Derrick Henry elite rushing — led league in both dimensions
  BAL: { pts: 28.6, yds: 408, pass: 234, rush: 174, third: 46, rz: 68, to: 0.8 },
  // Josh Allen MVP-caliber season, Josh Josh Josh
  BUF: { pts: 28.4, yds: 392, pass: 272, rush: 120, third: 48, rz: 69, to: 0.7 },
  // Bryce Young benched mid-season; Andy Dalton finished. Worst offense in NFL
  CAR: { pts: 15.2, yds: 258, pass: 177, rush:  81, third: 31, rz: 43, to: 2.0 },
  // Caleb Williams rough rookie year; poor OL, bottom-5 offense
  CHI: { pts: 18.9, yds: 308, pass: 208, rush: 100, third: 37, rz: 53, to: 1.5 },
  // Joe Burrow returns from wrist; Tee Higgins holdout then return, solid but not elite
  CIN: { pts: 22.5, yds: 345, pass: 248, rush:  97, third: 42, rz: 61, to: 1.2 },
  // QB disaster: Watson injured Week 1, DTR, then Jameis/Flacco. Bottom-3 offense
  CLE: { pts: 15.6, yds: 268, pass: 185, rush:  83, third: 32, rz: 46, to: 1.9 },
  // Dak Prescott injured Week 9; Cooper Rush finished. Below expectations
  DAL: { pts: 22.4, yds: 348, pass: 238, rush: 110, third: 42, rz: 60, to: 1.2 },
  // Bo Nix solid rookie; Sean Payton rebuilt the O. 22 pts/g underrates their late surge
  DEN: { pts: 22.2, yds: 335, pass: 218, rush: 117, third: 41, rz: 60, to: 1.2 },
  // DET led the NFL in scoring — Dan Campbell + Jared Goff + Gibbs/Montgomery backfield
  DET: { pts: 33.2, yds: 421, pass: 263, rush: 158, third: 52, rz: 72, to: 0.7 },
  // Jordan Love great leap; AJ Dillon, Josh Jacobs solid ground game
  GB:  { pts: 26.1, yds: 372, pass: 248, rush: 124, third: 46, rz: 68, to: 0.8 },
  // CJ Stroud Year 2; Tank Dell/Nico Collins solid; DeMeco Ryans' system
  HOU: { pts: 23.0, yds: 348, pass: 238, rush: 110, third: 44, rz: 63, to: 1.0 },
  // Anthony Richardson season; Jonathan Taylor consistent
  IND: { pts: 24.1, yds: 345, pass: 222, rush: 123, third: 43, rz: 63, to: 1.0 },
  // Trevor Lawrence injured; Mac Jones / C.J. Beathard finished. Mediocre offense
  JAX: { pts: 19.8, yds: 315, pass: 212, rush: 103, third: 38, rz: 55, to: 1.5 },
  // Mahomes + Kelce + Rice + Worthy. 3rd consecutive SB win
  KC:  { pts: 27.3, yds: 364, pass: 242, rush: 122, third: 46, rz: 71, to: 0.7 },
  // Justin Herbert + Jim Harbaugh first year — team improved significantly
  LAC: { pts: 24.0, yds: 355, pass: 244, rush: 111, third: 43, rz: 63, to: 0.9 },
  // Stafford/McVay. Puka Nacua/Cooper Kupp when healthy
  LAR: { pts: 24.5, yds: 365, pass: 247, rush: 118, third: 45, rz: 66, to: 0.9 },
  // Aidan O'Connell / Gardner Minshew. Bottom-5 offense
  LV:  { pts: 18.4, yds: 298, pass: 198, rush: 100, third: 36, rz: 52, to: 1.6 },
  // Tua concussion issues; offense regressed significantly from 2023
  MIA: { pts: 21.6, yds: 335, pass: 242, rush:  93, third: 41, rz: 59, to: 1.3 },
  // Sam Darnold best season of career; JJ McCarthy torn meniscus in preseason
  MIN: { pts: 26.6, yds: 375, pass: 267, rush: 108, third: 47, rz: 67, to: 0.8 },
  // Drake Maye promising rookie but historically bad team around him
  NE:  { pts: 15.7, yds: 264, pass: 182, rush:  82, third: 32, rz: 45, to: 1.9 },
  // Derek Carr injured; QB carousel (Jake Haener, Spencer Rattler)
  NO:  { pts: 19.8, yds: 318, pass: 215, rush: 103, third: 38, rz: 56, to: 1.4 },
  // Daniel Jones benched; Tommy DeVito finished. Bottom-5 offense
  NYG: { pts: 17.4, yds: 285, pass: 192, rush:  93, third: 34, rz: 49, to: 1.7 },
  // Aaron Rodgers returned; offense still limited; defense was solid
  NYJ: { pts: 19.8, yds: 312, pass: 210, rush: 102, third: 38, rz: 56, to: 1.4 },
  // Jalen Hurts + Saquon Barkley (single-season rushing record ~2,005 yds)
  PHI: { pts: 27.6, yds: 402, pass: 252, rush: 150, third: 48, rz: 70, to: 0.8 },
  // Russell Wilson started; Justin Fields took over. Uneven but defensive identity
  PIT: { pts: 22.3, yds: 338, pass: 218, rush: 120, third: 41, rz: 61, to: 1.1 },
  // Geno Smith; DK Metcalf/Tyler Lockett; solid middle-of-pack offense
  SEA: { pts: 23.1, yds: 345, pass: 232, rush: 113, third: 43, rz: 62, to: 1.1 },
  // Brock Purdy; injuries to OL/RBs throughout; still competitive
  SF:  { pts: 24.7, yds: 370, pass: 238, rush: 132, third: 44, rz: 68, to: 0.9 },
  // Baker Mayfield resurgence year 2; Rachaad White/Bucky Irving backfield
  TB:  { pts: 23.8, yds: 358, pass: 249, rush: 109, third: 43, rz: 63, to: 1.1 },
  // Will Levis sophomore struggles; poor supporting cast
  TEN: { pts: 18.0, yds: 290, pass: 190, rush: 100, third: 35, rz: 51, to: 1.7 },
  // Jayden Daniels ROY; Brian Robinson Jr. solid rush. Commanders' best year in decades
  WAS: { pts: 26.5, yds: 382, pass: 248, rush: 134, third: 46, rz: 67, to: 0.8 },
};

// QB tier ratings — calibrated to 2024 season performance (not career average)
// Scale: 97+ = elite MVP tier, 90-96 = top-10, 80-89 = solid starter, <80 = below average
const QB_TIER = {
  // Back-to-back unanimous MVP; historic dual-threat excellence
  BAL: 98,
  // MVP runner-up; arguably best overall QB performance of 2024
  BUF: 97,
  // 3x SB champ; still elite under pressure; won it all again
  KC:  96,
  // Incredible 2024 season leading highest-scoring offense; 37 TDs, 12 INTs
  DET: 93,
  // Solid Year 2 with Harbaugh; consistent and improving
  LAC: 89,
  // Great year but team offensive limitations; showed clear ROY
  WAS: 88,
  // Return to form, consistent performance; injury reliability question mark
  PHI: 88,
  // Injury scare but elite when healthy; Dak before the collarbone
  DAL: 87,
  // Good leap in Year 3; led GB to top seed in NFC
  GB:  87,
  // When healthy the best. Wrist surgery limited sample; elite ceiling
  CIN: 87,
  // Year 2 solidified Purdy as legitimate starter; team injuries hurt stats
  SF:  87,
  // Sam Darnold best season of career in O'Connell's system
  MIN: 82,
  // Year 2 with Stroud; solid not spectacular
  HOU: 86,
  // Stafford still a vet savant; health concern is the only flag
  LAR: 84,
  // Baker Mayfield Year 2 with Bowles; more consistent than expected
  TB:  83,
  // Kyler Murray full healthy season; 2024 bounce-back
  ARI: 83,
  // Tua injury concern limits ceiling; talented when on field
  MIA: 82,
  // Geno still capable in Carroll's (now Bevell's) system
  SEA: 80,
  // Bo Nix solid rookie; showed good decision making late season
  DEN: 76,
  // Anthony Richardson: elite athletic ceiling, inconsistency + injuries
  IND: 79,
  // Aaron Rodgers returned but showed decline; offense lacked explosion
  NYJ: 77,
  // Caleb Williams tough 2024 rookie year behind a poor OL
  CHI: 76,
  // Russell Wilson / Justin Fields split — neither inspired confidence
  PIT: 77,
  // Reasonable rookie in Drake Maye; team was historically bad around him
  NE:  72,
  // Will Levis ceiling still unclear; struggled behind poor OL
  TEN: 72,
  // Trevor Lawrence injuries derailed a promising career arc
  JAX: 75,
  // Daniel Jones benched; Tommy DeVito wins but no wow
  NYG: 68,
  // O'Connell / Minshew — substandard starter platoon
  LV:  71,
  // Watson career likely over; DTR/Flacco/Jameis — disaster
  CLE: 67,
  // Derek Carr torn shoulder; Jake Haener/Rattler finished out
  NO:  72,
  // Bryce Young benched, Andy Dalton doesn't move the needle
  CAR: 63,
};

// Coaching quality ratings — 2024 season + tenure track record
// Scale: 95+ = all-time, 85-94 = elite, 75-84 = above average, <75 = rebuilding
const COACHING = {
  KC:  97,  // Andy Reid GOAT; SB 3-peat architect
  DET: 95,  // Dan Campbell — masterful 2024 season; culture builder
  BAL: 95,  // John Harbaugh — consistently gets most out of elite roster
  SF:  93,  // Kyle Shanahan — great coach, injury management concerns
  PHI: 92,  // Nick Sirianni — team rebounded strongly after 2023 struggles
  BUF: 91,  // Sean McDermott — consistent AFC contender; one of best in AFC
  MIN: 89,  // Kevin O'Connell — Darnold's resurgence is largely coaching
  GB:  89,  // Matt LaFleur — Jordan Love year-on-year improvement
  WAS: 88,  // Dan Quinn — incredible Year 1 turnaround with Daniels
  HOU: 87,  // DeMeco Ryans — impressive defensive identity
  LAC: 87,  // Jim Harbaugh — immediate impact, discipline + culture change
  CIN: 86,  // Zac Taylor — sustained excellence when Burrow healthy
  LAR: 86,  // Sean McVay — elite play-caller, consistent contender
  DAL: 84,  // Mike McCarthy — good but ceilinged with this roster
  TB:  83,  // Todd Bowles — Mayfield thrived; solid defensive head coach
  ATL: 82,  // Raheem Morris — Step up from Arthur Smith; promising start
  MIA: 81,  // Mike McDaniel — offensive genius but roster injury issues
  ARI: 80,  // Jonathan Gannon — Year 2, showing improvement
  DEN: 81,  // Sean Payton — defense elite, offense still building
  PIT: 80,  // Mike Tomlin — 18 consecutive non-losing seasons; remarkable
  SEA: 79,  // Mike Macdonald — Year 1 with new defensive identity
  NO:  77,  // Dennis Allen fired mid-season; Darren Rizzi interim
  IND: 77,  // Shane Steichen — roster talent is the question, not coaching
  NYJ: 75,  // Jeff Ulbrich (interim) / Robert Saleh fired early
  CLE: 76,  // Kevin Stefanski — solid coach but QB situation is unsalvageable
  JAX: 74,  // Doug Pederson — lost the locker room; fired after season
  CHI: 73,  // Matt Eberflus — fired Thanksgiving; Ben Johnson hired for 2025
  LV:  72,  // Antonio Pierce — offense rebuilding; tough situation
  TEN: 71,  // Brian Callahan — first year; long rebuild ahead
  NYG: 69,  // Brian Daboll — team in full rebuild mode
  NE:  67,  // Jerod Mayo — first year, fired; Vrabel hired for 2025
  CAR: 65,  // Dave Canales — HC first year; tough hand
};

// O-line quality ratings — 2024 season (blocking, run support, pass protection)
const OLINE = {
  PHI: 96,  // Best OL in NFL; Kelce/Johnson/Dickerson/Mailata dominant
  DET: 94,  // Elite run-blocking unit; Sewell anchor
  BAL: 91,  // Excellent for both Lamar runs and Henry carries
  BUF: 90,  // Solid protection for Allen; run game improved
  KC:  90,  // Reid's offensive line culture; consistent
  SF:  88,  // Top-tier when healthy; injuries impacted late
  GB:  88,  // Solid protection; Jordan Love clean pocket
  MIN: 86,  // Good pass protection for Darnold's resurgence
  WAS: 85,  // Major improvement under Dan Quinn; Daniels excelled
  LAR: 84,  // Stafford gets clean pockets; McVay's scheme helps
  LAC: 84,  // Herbert protected well; Harbaugh brought discipline
  DEN: 83,  // Bo Nix protection solid; run game consistent
  CIN: 83,  // Good when healthy; always injury concerns
  HOU: 82,  // Solid for Stroud; Dameon Pierce/Joe Mixon behind it
  ATL: 81,  // Kirk Cousins OL issues; Bijan Robinson's success = good run blocks
  TB:  82,  // Baker thrived; protection was reliable
  DAL: 81,  // Zack Martin anchor; OL still solid even with QB issues
  IND: 80,  // Decent unit but inconsistent
  ARI: 78,  // Improving but still below average overall
  SEA: 78,  // Solid pass pro for Geno; run game average
  PIT: 77,  // Below average; limited both Wilson and Fields
  MIA: 76,  // Key injuries; protection broke down, contributing to Tua's issues
  NO:  76,  // Some quality vets but aging and inconsistent
  NYJ: 75,  // One reason Rodgers's return underwhelmed
  JAX: 73,  // Mediocre; contributed to Lawrence's injury concerns
  CHI: 70,  // Poor pass protection for Caleb Williams' rookie year
  CLE: 71,  // Watson couldn't stay healthy behind this unit
  NE:  69,  // Drake Maye took a beating; rebuilding
  TEN: 72,  // Mediocre at best; Levis under pressure constantly
  LV:  71,  // Rebuilding across the board
  NYG: 67,  // One of the worst units in the league
  CAR: 65,  // Bottom of the league; Bryce Young constantly pressured
};

export const LEAGUE_OFFENSE_AVG = {
  pts: 22.5, yds: 340, pass: 227, rush: 113, third: 40, rz: 59, to: 1.2,
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
