export const PROP_LABELS = {
  passing_yards: 'Pass Yds', passing_tds: 'Pass TDs', completions: 'Completions',
  rushing_yards: 'Rush Yds', rushing_tds: 'Rush TDs', rushing_attempts: 'Rush Att',
  receiving_yards: 'Rec Yds', receiving_tds: 'Rec TDs', receptions: 'Receptions',
  fantasy_points: 'Fantasy Pts', kicking_points: 'Kick Pts',
  tackles: 'Tackles', sacks: 'Sacks', passing_ints: 'INTs Thrown',
  interceptions: 'INTs',
  rush_rec_tds: 'Rush+Rec TDs', rush_rec_yards: 'Rush+Rec Yds',
  pass_rush_yards: 'Pass+Rush Yds', passing_long: 'Long Comp', rushing_long: 'Long Rush',
  q1_rush_rec_tds: '1Q R+R TDs', q1_receptions: '1Q Rec',
  h1_rush_rec_tds: '1H R+R TDs', h1_receptions: '1H Rec',
  q1_passing_yards: '1Q Pass Yds', q1_rushing_yards: '1Q Rush Yds', q1_receiving_yards: '1Q Rec Yds',
  h1_passing_yards: '1H Pass Yds', h1_rushing_yards: '1H Rush Yds', h1_receiving_yards: '1H Rec Yds',
  season_passing_yards: 'Pass Yds (Season)', season_passing_tds: 'Pass TDs (Season)',
  season_rushing_yards: 'Rush Yds (Season)', season_rushing_tds: 'Rush TDs (Season)',
  season_receiving_yards: 'Rec Yds (Season)', season_receiving_tds: 'Rec TDs (Season)',
  season_receptions: 'Rec (Season)', season_sacks: 'Sacks (Season)',
};

/** Formats a snake_case prop type key to a readable label. */
export function formatMarket(propType) {
  return PROP_LABELS[propType] || propType.replace(/_/g, ' ');
}
