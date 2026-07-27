// NFL team defensive stats — yards allowed per game (2025-26 regular season, final)
// Sources: NFL.com, Pro Football Reference, ESPN
export const TEAM_STATS = {
  //          pass  rush  rec_wr rec_te rec_rb
  ARI: { pass_yds_allowed: 245, rush_yds_allowed: 130, rec_yds_allowed_wr: 162, rec_yds_allowed_te: 61, rec_yds_allowed_rb: 37 },
  ATL: { pass_yds_allowed: 225, rush_yds_allowed: 118, rec_yds_allowed_wr: 149, rec_yds_allowed_te: 56, rec_yds_allowed_rb: 34 },
  BAL: { pass_yds_allowed: 195, rush_yds_allowed: 108, rec_yds_allowed_wr: 129, rec_yds_allowed_te: 49, rec_yds_allowed_rb: 29 },
  BUF: { pass_yds_allowed: 205, rush_yds_allowed: 112, rec_yds_allowed_wr: 135, rec_yds_allowed_te: 51, rec_yds_allowed_rb: 31 },
  CAR: { pass_yds_allowed: 255, rush_yds_allowed: 135, rec_yds_allowed_wr: 168, rec_yds_allowed_te: 64, rec_yds_allowed_rb: 38 },
  CHI: { pass_yds_allowed: 235, rush_yds_allowed: 120, rec_yds_allowed_wr: 155, rec_yds_allowed_te: 59, rec_yds_allowed_rb: 35 },
  CIN: { pass_yds_allowed: 230, rush_yds_allowed: 118, rec_yds_allowed_wr: 152, rec_yds_allowed_te: 58, rec_yds_allowed_rb: 35 },
  CLE: { pass_yds_allowed: 240, rush_yds_allowed: 122, rec_yds_allowed_wr: 158, rec_yds_allowed_te: 60, rec_yds_allowed_rb: 36 },
  DAL: { pass_yds_allowed: 238, rush_yds_allowed: 118, rec_yds_allowed_wr: 157, rec_yds_allowed_te: 60, rec_yds_allowed_rb: 36 },
  DEN: { pass_yds_allowed: 212, rush_yds_allowed: 100, rec_yds_allowed_wr: 140, rec_yds_allowed_te: 53, rec_yds_allowed_rb: 32 },
  DET: { pass_yds_allowed: 215, rush_yds_allowed: 112, rec_yds_allowed_wr: 142, rec_yds_allowed_te: 54, rec_yds_allowed_rb: 32 },
  GB:  { pass_yds_allowed: 225, rush_yds_allowed: 115, rec_yds_allowed_wr: 149, rec_yds_allowed_te: 56, rec_yds_allowed_rb: 34 },
  HOU: { pass_yds_allowed: 218, rush_yds_allowed: 110, rec_yds_allowed_wr: 144, rec_yds_allowed_te: 55, rec_yds_allowed_rb: 33 },
  IND: { pass_yds_allowed: 242, rush_yds_allowed: 125, rec_yds_allowed_wr: 160, rec_yds_allowed_te: 61, rec_yds_allowed_rb: 36 },
  JAX: { pass_yds_allowed: 248, rush_yds_allowed: 125, rec_yds_allowed_wr: 164, rec_yds_allowed_te: 62, rec_yds_allowed_rb: 37 },
  KC:  { pass_yds_allowed: 198, rush_yds_allowed: 106, rec_yds_allowed_wr: 131, rec_yds_allowed_te: 50, rec_yds_allowed_rb: 30 },
  LAC: { pass_yds_allowed: 238, rush_yds_allowed: 118, rec_yds_allowed_wr: 157, rec_yds_allowed_te: 60, rec_yds_allowed_rb: 36 },
  LAR: { pass_yds_allowed: 228, rush_yds_allowed: 115, rec_yds_allowed_wr: 150, rec_yds_allowed_te: 57, rec_yds_allowed_rb: 34 },
  LV:  { pass_yds_allowed: 262, rush_yds_allowed: 138, rec_yds_allowed_wr: 173, rec_yds_allowed_te: 66, rec_yds_allowed_rb: 39 },
  MIA: { pass_yds_allowed: 248, rush_yds_allowed: 122, rec_yds_allowed_wr: 164, rec_yds_allowed_te: 62, rec_yds_allowed_rb: 37 },
  MIN: { pass_yds_allowed: 222, rush_yds_allowed: 112, rec_yds_allowed_wr: 147, rec_yds_allowed_te: 56, rec_yds_allowed_rb: 33 },
  NE:  { pass_yds_allowed: 245, rush_yds_allowed: 120, rec_yds_allowed_wr: 162, rec_yds_allowed_te: 61, rec_yds_allowed_rb: 37 },
  NO:  { pass_yds_allowed: 240, rush_yds_allowed: 120, rec_yds_allowed_wr: 158, rec_yds_allowed_te: 60, rec_yds_allowed_rb: 36 },
  NYG: { pass_yds_allowed: 258, rush_yds_allowed: 130, rec_yds_allowed_wr: 170, rec_yds_allowed_te: 65, rec_yds_allowed_rb: 39 },
  NYJ: { pass_yds_allowed: 205, rush_yds_allowed: 108, rec_yds_allowed_wr: 135, rec_yds_allowed_te: 51, rec_yds_allowed_rb: 31 },
  PHI: { pass_yds_allowed: 195, rush_yds_allowed: 100, rec_yds_allowed_wr: 129, rec_yds_allowed_te: 49, rec_yds_allowed_rb: 29 },
  PIT: { pass_yds_allowed: 215, rush_yds_allowed: 108, rec_yds_allowed_wr: 142, rec_yds_allowed_te: 54, rec_yds_allowed_rb: 32 },
  SEA: { pass_yds_allowed: 238, rush_yds_allowed: 118, rec_yds_allowed_wr: 157, rec_yds_allowed_te: 60, rec_yds_allowed_rb: 36 },
  SF:  { pass_yds_allowed: 205, rush_yds_allowed: 105, rec_yds_allowed_wr: 135, rec_yds_allowed_te: 51, rec_yds_allowed_rb: 31 },
  TB:  { pass_yds_allowed: 228, rush_yds_allowed: 115, rec_yds_allowed_wr: 150, rec_yds_allowed_te: 57, rec_yds_allowed_rb: 34 },
  TEN: { pass_yds_allowed: 255, rush_yds_allowed: 130, rec_yds_allowed_wr: 168, rec_yds_allowed_te: 64, rec_yds_allowed_rb: 38 },
  WAS: { pass_yds_allowed: 228, rush_yds_allowed: 118, rec_yds_allowed_wr: 150, rec_yds_allowed_te: 57, rec_yds_allowed_rb: 34 },
};

// 2025-26 season league averages
export const NFL_LEAGUE_AVGS = {
  pass_yds_allowed:    229,
  rush_yds_allowed:    117,
  rec_yds_allowed_wr:  151,
  rec_yds_allowed_te:   58,
  rec_yds_allowed_rb:   35,
};
