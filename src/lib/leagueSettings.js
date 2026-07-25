const STORAGE_KEY = 'locklab_nfl_league_settings';

export const SCORING_FORMATS = [
  { value: 'standard',  label: 'Standard',   recPts: 0,   description: '0 pts per reception' },
  { value: 'half_ppr',  label: 'Half PPR',   recPts: 0.5, description: '0.5 pts per reception' },
  { value: 'ppr',       label: 'Full PPR',   recPts: 1.0, description: '1 pt per reception' },
];

export const DEFAULT_SETTINGS = {
  scoring:     'half_ppr',  // 'standard' | 'half_ppr' | 'ppr'
  recPts:      0.5,         // 0 | 0.5 | 1.0
  passTDPts:   4,           // 4 or 6
  passYdPts:   0.04,        // pts per passing yard (25 yds = 1 pt)
  rushYdPts:   0.1,         // pts per rushing yard
  recYdPts:    0.1,         // pts per receiving yard
  rushTDPts:   6,
  recTDPts:    6,
  tePremium:   false,       // extra 0.5 PPR for TEs
  superflex:   false,       // 2nd QB slot
  leagueSize:  12,          // 8 | 10 | 12 | 14
  flexType:    'RB/WR/TE',  // 'RB/WR' | 'RB/WR/TE' | 'RB/WR/TE/QB'
};

export function getLeagueSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveLeagueSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

// Calculate projected fantasy points for a prop given settings
export function projectedFantasyPts(prop, position, settings) {
  const s = settings || DEFAULT_SETTINGS;
  const type = prop.prop_type;
  const proj = prop.avg_last_10 ?? prop.line ?? 0;

  if (type === 'passing_yards')   return proj * s.passYdPts;
  if (type === 'passing_tds')     return proj * s.passTDPts;
  if (type === 'rushing_yards')   return proj * s.rushYdPts;
  if (type === 'rushing_tds')     return proj * s.rushTDPts;
  if (type === 'receiving_yards') return proj * s.recYdPts;
  if (type === 'receiving_tds')   return proj * s.recTDPts;
  if (type === 'receptions') {
    const pts = position === 'TE' && s.tePremium
      ? (s.recPts + 0.5)
      : s.recPts;
    return proj * pts;
  }
  if (type === 'fantasy_points')  return proj;
  return 0;
}

// How much does PPR boost a WR/TE vs standard? Used to adjust tier weighting.
export function pprMultiplier(position, settings) {
  const s = settings || DEFAULT_SETTINGS;
  if (position === 'QB') return 1.0;
  if (position === 'RB') return 1.0 + s.recPts * 0.08; // small bump for pass-catching RBs
  if (position === 'TE') {
    const tePts = s.tePremium ? s.recPts + 0.5 : s.recPts;
    return 1.0 + tePts * 0.18;
  }
  return 1.0 + s.recPts * 0.15; // WR gets biggest PPR bump
}
