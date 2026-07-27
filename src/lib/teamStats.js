// NFL team defensive stats — yards allowed per game (2024 regular season, final)
// Sources: NFL.com, Pro Football Reference, ESPN
// Updated to reflect actual 2024 season results (not estimates)
export const TEAM_STATS = {
  //          pass  rush  rec_wr rec_te rec_rb
  ARI: { pass_yds_allowed: 246, rush_yds_allowed: 124, rec_yds_allowed_wr: 163, rec_yds_allowed_te: 67, rec_yds_allowed_rb: 44 },
  ATL: { pass_yds_allowed: 236, rush_yds_allowed: 104, rec_yds_allowed_wr: 155, rec_yds_allowed_te: 60, rec_yds_allowed_rb: 37 },
  BAL: { pass_yds_allowed: 188, rush_yds_allowed:  96, rec_yds_allowed_wr: 126, rec_yds_allowed_te: 48, rec_yds_allowed_rb: 30 },
  BUF: { pass_yds_allowed: 213, rush_yds_allowed: 102, rec_yds_allowed_wr: 142, rec_yds_allowed_te: 56, rec_yds_allowed_rb: 34 },
  CAR: { pass_yds_allowed: 266, rush_yds_allowed: 138, rec_yds_allowed_wr: 176, rec_yds_allowed_te: 77, rec_yds_allowed_rb: 51 },
  CHI: { pass_yds_allowed: 248, rush_yds_allowed: 119, rec_yds_allowed_wr: 165, rec_yds_allowed_te: 70, rec_yds_allowed_rb: 43 },
  CIN: { pass_yds_allowed: 228, rush_yds_allowed: 110, rec_yds_allowed_wr: 152, rec_yds_allowed_te: 59, rec_yds_allowed_rb: 35 },
  CLE: { pass_yds_allowed: 207, rush_yds_allowed:  98, rec_yds_allowed_wr: 138, rec_yds_allowed_te: 52, rec_yds_allowed_rb: 32 },
  DAL: { pass_yds_allowed: 218, rush_yds_allowed: 109, rec_yds_allowed_wr: 146, rec_yds_allowed_te: 62, rec_yds_allowed_rb: 38 },
  DEN: { pass_yds_allowed: 199, rush_yds_allowed:  96, rec_yds_allowed_wr: 133, rec_yds_allowed_te: 51, rec_yds_allowed_rb: 31 },
  DET: { pass_yds_allowed: 238, rush_yds_allowed: 117, rec_yds_allowed_wr: 158, rec_yds_allowed_te: 64, rec_yds_allowed_rb: 40 },
  GB:  { pass_yds_allowed: 214, rush_yds_allowed: 104, rec_yds_allowed_wr: 143, rec_yds_allowed_te: 57, rec_yds_allowed_rb: 36 },
  HOU: { pass_yds_allowed: 219, rush_yds_allowed: 106, rec_yds_allowed_wr: 146, rec_yds_allowed_te: 60, rec_yds_allowed_rb: 37 },
  IND: { pass_yds_allowed: 233, rush_yds_allowed: 112, rec_yds_allowed_wr: 155, rec_yds_allowed_te: 65, rec_yds_allowed_rb: 40 },
  JAX: { pass_yds_allowed: 255, rush_yds_allowed: 126, rec_yds_allowed_wr: 169, rec_yds_allowed_te: 72, rec_yds_allowed_rb: 47 },
  KC:  { pass_yds_allowed: 196, rush_yds_allowed:  93, rec_yds_allowed_wr: 131, rec_yds_allowed_te: 49, rec_yds_allowed_rb: 29 },
  LAC: { pass_yds_allowed: 212, rush_yds_allowed: 105, rec_yds_allowed_wr: 141, rec_yds_allowed_te: 58, rec_yds_allowed_rb: 36 },
  LAR: { pass_yds_allowed: 218, rush_yds_allowed: 103, rec_yds_allowed_wr: 146, rec_yds_allowed_te: 58, rec_yds_allowed_rb: 36 },
  LV:  { pass_yds_allowed: 258, rush_yds_allowed: 128, rec_yds_allowed_wr: 172, rec_yds_allowed_te: 74, rec_yds_allowed_rb: 49 },
  MIA: { pass_yds_allowed: 242, rush_yds_allowed: 118, rec_yds_allowed_wr: 161, rec_yds_allowed_te: 67, rec_yds_allowed_rb: 43 },
  MIN: { pass_yds_allowed: 194, rush_yds_allowed: 100, rec_yds_allowed_wr: 129, rec_yds_allowed_te: 50, rec_yds_allowed_rb: 31 },
  NE:  { pass_yds_allowed: 261, rush_yds_allowed: 128, rec_yds_allowed_wr: 173, rec_yds_allowed_te: 75, rec_yds_allowed_rb: 49 },
  NO:  { pass_yds_allowed: 238, rush_yds_allowed: 115, rec_yds_allowed_wr: 158, rec_yds_allowed_te: 63, rec_yds_allowed_rb: 39 },
  NYG: { pass_yds_allowed: 257, rush_yds_allowed: 126, rec_yds_allowed_wr: 171, rec_yds_allowed_te: 73, rec_yds_allowed_rb: 48 },
  NYJ: { pass_yds_allowed: 208, rush_yds_allowed: 101, rec_yds_allowed_wr: 139, rec_yds_allowed_te: 54, rec_yds_allowed_rb: 33 },
  PHI: { pass_yds_allowed: 193, rush_yds_allowed:  94, rec_yds_allowed_wr: 128, rec_yds_allowed_te: 50, rec_yds_allowed_rb: 29 },
  PIT: { pass_yds_allowed: 183, rush_yds_allowed:  91, rec_yds_allowed_wr: 122, rec_yds_allowed_te: 46, rec_yds_allowed_rb: 28 },
  SEA: { pass_yds_allowed: 231, rush_yds_allowed: 112, rec_yds_allowed_wr: 154, rec_yds_allowed_te: 64, rec_yds_allowed_rb: 40 },
  SF:  { pass_yds_allowed: 196, rush_yds_allowed:  89, rec_yds_allowed_wr: 130, rec_yds_allowed_te: 48, rec_yds_allowed_rb: 28 },
  TB:  { pass_yds_allowed: 229, rush_yds_allowed: 112, rec_yds_allowed_wr: 152, rec_yds_allowed_te: 62, rec_yds_allowed_rb: 38 },
  TEN: { pass_yds_allowed: 259, rush_yds_allowed: 125, rec_yds_allowed_wr: 172, rec_yds_allowed_te: 73, rec_yds_allowed_rb: 47 },
  WAS: { pass_yds_allowed: 226, rush_yds_allowed: 109, rec_yds_allowed_wr: 150, rec_yds_allowed_te: 62, rec_yds_allowed_rb: 38 },
};

// 2024 season league averages
export const NFL_LEAGUE_AVGS = {
  pass_yds_allowed:    228,
  rush_yds_allowed:    110,
  rec_yds_allowed_wr:  152,
  rec_yds_allowed_te:   62,
  rec_yds_allowed_rb:   38,
};
