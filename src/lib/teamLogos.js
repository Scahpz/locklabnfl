// NFL team logos using ESPN CDN
const ESPN_NFL_IDS = {
  ARI: 'ari', ATL: 'atl', BAL: 'bal', BUF: 'buf',
  CAR: 'car', CHI: 'chi', CIN: 'cin', CLE: 'cle',
  DAL: 'dal', DEN: 'den', DET: 'det', GB:  'gb',
  HOU: 'hou', IND: 'ind', JAX: 'jax', KC:  'kc',
  LAC: 'lac', LAR: 'lar', LV:  'lv',  MIA: 'mia',
  MIN: 'min', NE:  'ne',  NO:  'no',  NYG: 'nyg',
  NYJ: 'nyj', PHI: 'phi', PIT: 'pit', SEA: 'sea',
  SF:  'sf',  TB:  'tb',  TEN: 'ten', WAS: 'wsh',
};

export function getTeamLogoUrl(teamAbbr) {
  const slug = ESPN_NFL_IDS[teamAbbr?.toUpperCase()];
  if (!slug) return null;
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${slug}.png`;
}
