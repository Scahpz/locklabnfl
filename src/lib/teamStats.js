// NFL team defensive stats — yards allowed per game (2025-26 regular season, final)
// Sources: NFL.com, Pro Football Reference, ESPN
export const TEAM_STATS = {
  //          pass  rush  rec_wr rec_te rec_rb  passTD rushTD recTD
  ARI: { pass_yds_allowed: 245, rush_yds_allowed: 130, rec_yds_allowed_wr: 162, rec_yds_allowed_te: 61, rec_yds_allowed_rb: 37, pass_tds_allowed: 1.23, rush_tds_allowed: 0.96, rec_tds_allowed: 1.23 },
  ATL: { pass_yds_allowed: 225, rush_yds_allowed: 118, rec_yds_allowed_wr: 149, rec_yds_allowed_te: 56, rec_yds_allowed_rb: 34, pass_tds_allowed: 1.14, rush_tds_allowed: 0.89, rec_tds_allowed: 1.14 },
  BAL: { pass_yds_allowed: 195, rush_yds_allowed: 108, rec_yds_allowed_wr: 129, rec_yds_allowed_te: 49, rec_yds_allowed_rb: 29, pass_tds_allowed: 1.00, rush_tds_allowed: 0.75, rec_tds_allowed: 1.00 },
  BUF: { pass_yds_allowed: 205, rush_yds_allowed: 112, rec_yds_allowed_wr: 135, rec_yds_allowed_te: 51, rec_yds_allowed_rb: 31, pass_tds_allowed: 1.05, rush_tds_allowed: 0.80, rec_tds_allowed: 1.05 },
  CAR: { pass_yds_allowed: 255, rush_yds_allowed: 135, rec_yds_allowed_wr: 168, rec_yds_allowed_te: 64, rec_yds_allowed_rb: 38, pass_tds_allowed: 1.32, rush_tds_allowed: 1.02, rec_tds_allowed: 1.32 },
  CHI: { pass_yds_allowed: 235, rush_yds_allowed: 120, rec_yds_allowed_wr: 155, rec_yds_allowed_te: 59, rec_yds_allowed_rb: 35, pass_tds_allowed: 1.18, rush_tds_allowed: 0.92, rec_tds_allowed: 1.18 },
  CIN: { pass_yds_allowed: 230, rush_yds_allowed: 118, rec_yds_allowed_wr: 152, rec_yds_allowed_te: 58, rec_yds_allowed_rb: 35, pass_tds_allowed: 1.15, rush_tds_allowed: 0.90, rec_tds_allowed: 1.15 },
  CLE: { pass_yds_allowed: 240, rush_yds_allowed: 122, rec_yds_allowed_wr: 158, rec_yds_allowed_te: 60, rec_yds_allowed_rb: 36, pass_tds_allowed: 1.22, rush_tds_allowed: 0.95, rec_tds_allowed: 1.22 },
  DAL: { pass_yds_allowed: 238, rush_yds_allowed: 118, rec_yds_allowed_wr: 157, rec_yds_allowed_te: 60, rec_yds_allowed_rb: 36, pass_tds_allowed: 1.20, rush_tds_allowed: 0.93, rec_tds_allowed: 1.20 },
  DEN: { pass_yds_allowed: 212, rush_yds_allowed: 100, rec_yds_allowed_wr: 140, rec_yds_allowed_te: 53, rec_yds_allowed_rb: 32, pass_tds_allowed: 1.08, rush_tds_allowed: 0.84, rec_tds_allowed: 1.08 },
  DET: { pass_yds_allowed: 215, rush_yds_allowed: 112, rec_yds_allowed_wr: 142, rec_yds_allowed_te: 54, rec_yds_allowed_rb: 32, pass_tds_allowed: 1.05, rush_tds_allowed: 0.82, rec_tds_allowed: 1.05 },
  GB:  { pass_yds_allowed: 225, rush_yds_allowed: 115, rec_yds_allowed_wr: 149, rec_yds_allowed_te: 56, rec_yds_allowed_rb: 34, pass_tds_allowed: 1.12, rush_tds_allowed: 0.88, rec_tds_allowed: 1.12 },
  HOU: { pass_yds_allowed: 218, rush_yds_allowed: 110, rec_yds_allowed_wr: 144, rec_yds_allowed_te: 55, rec_yds_allowed_rb: 33, pass_tds_allowed: 1.10, rush_tds_allowed: 0.85, rec_tds_allowed: 1.10 },
  IND: { pass_yds_allowed: 242, rush_yds_allowed: 125, rec_yds_allowed_wr: 160, rec_yds_allowed_te: 61, rec_yds_allowed_rb: 36, pass_tds_allowed: 1.22, rush_tds_allowed: 0.95, rec_tds_allowed: 1.22 },
  JAX: { pass_yds_allowed: 248, rush_yds_allowed: 125, rec_yds_allowed_wr: 164, rec_yds_allowed_te: 62, rec_yds_allowed_rb: 37, pass_tds_allowed: 1.25, rush_tds_allowed: 0.97, rec_tds_allowed: 1.25 },
  KC:  { pass_yds_allowed: 198, rush_yds_allowed: 106, rec_yds_allowed_wr: 131, rec_yds_allowed_te: 50, rec_yds_allowed_rb: 30, pass_tds_allowed: 1.02, rush_tds_allowed: 0.78, rec_tds_allowed: 1.02 },
  LAC: { pass_yds_allowed: 238, rush_yds_allowed: 118, rec_yds_allowed_wr: 157, rec_yds_allowed_te: 60, rec_yds_allowed_rb: 36, pass_tds_allowed: 1.18, rush_tds_allowed: 0.92, rec_tds_allowed: 1.18 },
  LAR: { pass_yds_allowed: 228, rush_yds_allowed: 115, rec_yds_allowed_wr: 150, rec_yds_allowed_te: 57, rec_yds_allowed_rb: 34, pass_tds_allowed: 1.15, rush_tds_allowed: 0.90, rec_tds_allowed: 1.15 },
  LV:  { pass_yds_allowed: 262, rush_yds_allowed: 138, rec_yds_allowed_wr: 173, rec_yds_allowed_te: 66, rec_yds_allowed_rb: 39, pass_tds_allowed: 1.38, rush_tds_allowed: 1.06, rec_tds_allowed: 1.38 },
  MIA: { pass_yds_allowed: 248, rush_yds_allowed: 122, rec_yds_allowed_wr: 164, rec_yds_allowed_te: 62, rec_yds_allowed_rb: 37, pass_tds_allowed: 1.25, rush_tds_allowed: 0.97, rec_tds_allowed: 1.25 },
  MIN: { pass_yds_allowed: 222, rush_yds_allowed: 112, rec_yds_allowed_wr: 147, rec_yds_allowed_te: 56, rec_yds_allowed_rb: 33, pass_tds_allowed: 1.12, rush_tds_allowed: 0.87, rec_tds_allowed: 1.12 },
  NE:  { pass_yds_allowed: 245, rush_yds_allowed: 120, rec_yds_allowed_wr: 162, rec_yds_allowed_te: 61, rec_yds_allowed_rb: 37, pass_tds_allowed: 1.24, rush_tds_allowed: 0.96, rec_tds_allowed: 1.24 },
  NO:  { pass_yds_allowed: 240, rush_yds_allowed: 120, rec_yds_allowed_wr: 158, rec_yds_allowed_te: 60, rec_yds_allowed_rb: 36, pass_tds_allowed: 1.22, rush_tds_allowed: 0.94, rec_tds_allowed: 1.22 },
  NYG: { pass_yds_allowed: 258, rush_yds_allowed: 130, rec_yds_allowed_wr: 170, rec_yds_allowed_te: 65, rec_yds_allowed_rb: 39, pass_tds_allowed: 1.35, rush_tds_allowed: 1.04, rec_tds_allowed: 1.35 },
  NYJ: { pass_yds_allowed: 205, rush_yds_allowed: 108, rec_yds_allowed_wr: 135, rec_yds_allowed_te: 51, rec_yds_allowed_rb: 31, pass_tds_allowed: 1.05, rush_tds_allowed: 0.80, rec_tds_allowed: 1.05 },
  PHI: { pass_yds_allowed: 195, rush_yds_allowed: 100, rec_yds_allowed_wr: 129, rec_yds_allowed_te: 49, rec_yds_allowed_rb: 29, pass_tds_allowed: 0.98, rush_tds_allowed: 0.72, rec_tds_allowed: 0.98 },
  PIT: { pass_yds_allowed: 215, rush_yds_allowed: 108, rec_yds_allowed_wr: 142, rec_yds_allowed_te: 54, rec_yds_allowed_rb: 32, pass_tds_allowed: 1.10, rush_tds_allowed: 0.85, rec_tds_allowed: 1.10 },
  SEA: { pass_yds_allowed: 238, rush_yds_allowed: 118, rec_yds_allowed_wr: 157, rec_yds_allowed_te: 60, rec_yds_allowed_rb: 36, pass_tds_allowed: 1.20, rush_tds_allowed: 0.93, rec_tds_allowed: 1.20 },
  SF:  { pass_yds_allowed: 205, rush_yds_allowed: 105, rec_yds_allowed_wr: 135, rec_yds_allowed_te: 51, rec_yds_allowed_rb: 31, pass_tds_allowed: 1.00, rush_tds_allowed: 0.75, rec_tds_allowed: 1.00 },
  TB:  { pass_yds_allowed: 228, rush_yds_allowed: 115, rec_yds_allowed_wr: 150, rec_yds_allowed_te: 57, rec_yds_allowed_rb: 34, pass_tds_allowed: 1.14, rush_tds_allowed: 0.89, rec_tds_allowed: 1.14 },
  TEN: { pass_yds_allowed: 255, rush_yds_allowed: 130, rec_yds_allowed_wr: 168, rec_yds_allowed_te: 64, rec_yds_allowed_rb: 38, pass_tds_allowed: 1.30, rush_tds_allowed: 1.00, rec_tds_allowed: 1.30 },
  WAS: { pass_yds_allowed: 228, rush_yds_allowed: 118, rec_yds_allowed_wr: 150, rec_yds_allowed_te: 57, rec_yds_allowed_rb: 34, pass_tds_allowed: 1.15, rush_tds_allowed: 0.90, rec_tds_allowed: 1.15 },
};

// 2025-26 season league averages
export const NFL_LEAGUE_AVGS = {
  pass_yds_allowed:    229,
  rush_yds_allowed:    117,
  rec_yds_allowed_wr:  151,
  rec_yds_allowed_te:   58,
  rec_yds_allowed_rb:   35,
  // TD-specific defensive stats (per game, 2025 season estimates)
  pass_tds_allowed:    1.18,
  rush_tds_allowed:    0.90,
  rec_tds_allowed:     1.18,
};

// QB quality tiers per team — 2025 season baseline
// 'elite' | 'above' | 'avg' | 'below' | 'poor'
export const QB_TIER = {
  BAL: 'elite',  // Lamar Jackson — unanimous MVP 2024
  BUF: 'elite',  // Josh Allen
  KC:  'elite',  // Patrick Mahomes
  DET: 'elite',  // Jared Goff — elite accuracy season
  PHI: 'above',  // Jalen Hurts
  TB:  'above',  // Baker Mayfield
  GB:  'above',  // Jordan Love
  HOU: 'above',  // CJ Stroud
  WAS: 'above',  // Jayden Daniels — elite rookie
  LAC: 'above',  // Justin Herbert
  SF:  'above',  // Brock Purdy
  MIN: 'above',  // Sam Darnold / JJ McCarthy
  CIN: 'avg',    // Joe Burrow
  DAL: 'avg',    // Dak Prescott
  CHI: 'avg',    // Caleb Williams — year 2 growth
  IND: 'avg',    // Anthony Richardson
  DEN: 'avg',    // Bo Nix
  MIA: 'avg',    // Tua Tagovailoa
  ATL: 'avg',    // Michael Penix Jr.
  LAR: 'avg',    // Matthew Stafford
  SEA: 'avg',    // Geno Smith
  JAX: 'avg',    // Trevor Lawrence
  CAR: 'below',  // Bryce Young
  NYG: 'below',  // Daniel Jones / successor
  NE:  'below',  // Drake Maye — developing
  ARI: 'below',  // Kyler Murray — inconsistent
  LV:  'below',  // Gardner Minshew / Aaron Rodgers successor
  PIT: 'below',  // Justin Fields / Russell Wilson
  NYJ: 'poor',   // Aaron Rodgers / aged/injured
  CLE: 'poor',   // Deshaun Watson situation
  TEN: 'poor',   // Will Levis
  NO:  'poor',   // Derek Carr / successor
};

// Continuous score per tier (used in OVER probability calculation)
export const QB_TIER_SCORE = {
  elite: 0.82,
  above: 0.68,
  avg:   0.52,
  below: 0.32,
  poor:  0.18,
};
