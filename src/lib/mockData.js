export const mockGameLogs = {};

function mkGames(base, variance, count = 6, integer = true) {
  return Array.from({ length: count }, () => {
    const raw = base + (Math.random() * variance * 2 - variance);
    return integer ? Math.round(raw) : parseFloat(raw.toFixed(1));
  });
}

const integerPropTypes = ['passing_tds', 'rushing_tds', 'receiving_tds', 'receptions', 'interceptions', 'sacks', 'targets'];

function mkProp(type, line, opts = {}) {
  const isInt = integerPropTypes.includes(type);
  const games = mkGames(line + (opts.bias || 2), opts.var || line * 0.22, 6, isInt);
  const avg6 = parseFloat((games.reduce((a, b) => a + b, 0) / games.length).toFixed(1));
  const avg3 = parseFloat((games.slice(-3).reduce((a, b) => a + b, 0) / 3).toFixed(1));
  const hits = games.filter(v => v > line).length;
  const hit_rate = Math.round((hits / games.length) * 100);
  const proj = parseFloat((avg3 * 1.02).toFixed(1));
  const edge = parseFloat((((proj - line) / Math.max(line, 1)) * 100).toFixed(1));
  const over_odds = opts.over_odds || -110;
  const under_odds = opts.under_odds || -110;
  const confidence_score = Math.min(10, Math.max(3, hits >= 5 ? 9 : hits >= 4 ? 7 : 5));
  const confidence_tier = confidence_score >= 8 ? 'A' : confidence_score >= 6 ? 'B' : 'C';
  const streak = hits >= 4 ? `Hit over in ${hits} of last 6` : hits <= 2 ? `Hit under in ${6 - hits} of last 6` : `Split ${hits}-${6 - hits} last 6`;
  return {
    prop_type: type, line, over_odds, under_odds, projection: proj, edge,
    hit_rate_last_10: hit_rate, avg_last_5: avg3, avg_last_10: avg6,
    streak_info: streak, confidence_score, confidence_tier,
    is_top_pick: confidence_score >= 8, is_lock: confidence_score === 10,
    best_value: edge > 8, trap_warning: opts.trap || false,
    last_5_games: games.slice(-3), last_10_games: games,
    matchup_rating: opts.matchup_rating || 'neutral',
    def_rank_vs_pos: opts.def_rank || 16,
    minutes_avg: null, usage_rate: opts.usage || null,
    game_total: opts.total || 45.5,
    snap_pct: opts.snap || null,
    target_share: opts.targets || null,
  };
}

function mkPlayer(id, name, team, opp, pos, starter, injStatus, injNote, props) {
  return { id, player_name: name, team, opponent: opp, position: pos, photo_url: '', is_starter: starter, injury_status: injStatus, injury_note: injNote, props };
}

export const mockPlayers = [
  // == KANSAS CITY CHIEFS ==
  mkPlayer('kc1','Patrick Mahomes','KC','BUF','QB',true,'healthy','',[
    mkProp('passing_yards',285.5,{var:55,bias:8,total:48.5,over_odds:-118,under_odds:-102}),
    mkProp('passing_tds',2.5,{var:1,bias:0.3,over_odds:-115,under_odds:-105}),
    mkProp('rushing_yards',22.5,{var:12,bias:2}),
  ]),
  mkPlayer('kc2','Travis Kelce','KC','BUF','TE',true,'healthy','',[
    mkProp('receiving_yards',62.5,{var:28,bias:5,targets:0.22,over_odds:-120,under_odds:100}),
    mkProp('receptions',4.5,{var:2,bias:0.5,targets:0.22}),
  ]),
  mkPlayer('kc3','Rashee Rice','KC','BUF','WR',true,'healthy','',[
    mkProp('receiving_yards',58.5,{var:32,bias:4,targets:0.18}),
    mkProp('receptions',4.5,{var:2,bias:0.3,targets:0.18}),
  ]),
  mkPlayer('kc4','Isiah Pacheco','KC','BUF','RB',true,'healthy','',[
    mkProp('rushing_yards',68.5,{var:30,bias:5}),
    mkProp('receiving_yards',18.5,{var:14,bias:1}),
    mkProp('receptions',2.5,{var:1.5,bias:0.2}),
  ]),

  // == BUFFALO BILLS ==
  mkPlayer('buf1','Josh Allen','BUF','KC','QB',true,'healthy','',[
    mkProp('passing_yards',268.5,{var:58,bias:6,total:48.5}),
    mkProp('passing_tds',2.5,{var:1,bias:0.2}),
    mkProp('rushing_yards',42.5,{var:18,bias:4}),
  ]),
  mkPlayer('buf2','Stefon Diggs','BUF','KC','WR',true,'healthy','',[
    mkProp('receiving_yards',72.5,{var:35,bias:5,targets:0.24}),
    mkProp('receptions',5.5,{var:2.5,bias:0.3,targets:0.24}),
  ]),
  mkPlayer('buf3','Dalton Kincaid','BUF','KC','TE',false,'healthy','',[
    mkProp('receiving_yards',38.5,{var:22,bias:2}),
    mkProp('receptions',3.5,{var:1.5,bias:0.2}),
  ]),
  mkPlayer('buf4','James Cook','BUF','KC','RB',true,'healthy','',[
    mkProp('rushing_yards',72.5,{var:32,bias:6}),
    mkProp('receiving_yards',22.5,{var:16,bias:1}),
  ]),

  // == SAN FRANCISCO 49ERS ==
  mkPlayer('sf1','Brock Purdy','SF','DAL','QB',true,'healthy','',[
    mkProp('passing_yards',258.5,{var:52,bias:5,total:47.5}),
    mkProp('passing_tds',2.5,{var:1,bias:0.3}),
  ]),
  mkPlayer('sf2','Christian McCaffrey','SF','DAL','RB',true,'healthy','',[
    mkProp('rushing_yards',82.5,{var:38,bias:7,over_odds:-125,under_odds:105}),
    mkProp('receiving_yards',45.5,{var:22,bias:4,targets:0.15}),
    mkProp('receptions',4.5,{var:2,bias:0.5,targets:0.15}),
  ]),
  mkPlayer('sf3','Deebo Samuel','SF','DAL','WR',true,'healthy','',[
    mkProp('receiving_yards',62.5,{var:30,bias:4,targets:0.16}),
    mkProp('rushing_yards',18.5,{var:14,bias:2}),
  ]),
  mkPlayer('sf4','George Kittle','SF','DAL','TE',true,'healthy','',[
    mkProp('receiving_yards',58.5,{var:28,bias:4,targets:0.18}),
    mkProp('receptions',4.5,{var:2,bias:0.3}),
  ]),
  mkPlayer('sf5','Brandon Aiyuk','SF','DAL','WR',true,'healthy','',[
    mkProp('receiving_yards',68.5,{var:33,bias:5,targets:0.20}),
    mkProp('receptions',4.5,{var:2,bias:0.3}),
  ]),

  // == DALLAS COWBOYS ==
  mkPlayer('dal1','Dak Prescott','DAL','SF','QB',true,'healthy','',[
    mkProp('passing_yards',272.5,{var:56,bias:6,total:47.5}),
    mkProp('passing_tds',2.5,{var:1,bias:0.2}),
  ]),
  mkPlayer('dal2','CeeDee Lamb','DAL','SF','WR',true,'healthy','',[
    mkProp('receiving_yards',88.5,{var:42,bias:8,targets:0.28,over_odds:-120,under_odds:100}),
    mkProp('receptions',6.5,{var:2.5,bias:0.5,targets:0.28}),
  ]),
  mkPlayer('dal3','Tony Pollard','DAL','SF','RB',true,'healthy','',[
    mkProp('rushing_yards',62.5,{var:28,bias:4}),
    mkProp('receiving_yards',25.5,{var:18,bias:2}),
  ]),
  mkPlayer('dal4','Jake Ferguson','DAL','SF','TE',true,'healthy','',[
    mkProp('receiving_yards',42.5,{var:25,bias:3,targets:0.14}),
    mkProp('receptions',3.5,{var:1.5,bias:0.2}),
  ]),

  // == PHILADELPHIA EAGLES ==
  mkPlayer('phi1','Jalen Hurts','PHI','NYG','QB',true,'healthy','',[
    mkProp('passing_yards',248.5,{var:54,bias:5}),
    mkProp('passing_tds',2.5,{var:1,bias:0.2}),
    mkProp('rushing_yards',52.5,{var:22,bias:5,over_odds:-115,under_odds:-105}),
  ]),
  mkPlayer('phi2','A.J. Brown','PHI','NYG','WR',true,'healthy','',[
    mkProp('receiving_yards',78.5,{var:38,bias:6,targets:0.22}),
    mkProp('receptions',5.5,{var:2.5,bias:0.4}),
  ]),
  mkPlayer('phi3','DeVonta Smith','PHI','NYG','WR',true,'healthy','',[
    mkProp('receiving_yards',65.5,{var:32,bias:4,targets:0.18}),
    mkProp('receptions',4.5,{var:2,bias:0.3}),
  ]),
  mkPlayer('phi4','Dallas Goedert','PHI','NYG','TE',true,'questionable','Knee',[
    mkProp('receiving_yards',45.5,{var:25,bias:2,trap:true}),
    mkProp('receptions',3.5,{var:1.5,bias:0.1,trap:true}),
  ]),

  // == DETROIT LIONS ==
  mkPlayer('det1','Jared Goff','DET','MIN','QB',true,'healthy','',[
    mkProp('passing_yards',262.5,{var:50,bias:5,total:50.5}),
    mkProp('passing_tds',2.5,{var:1,bias:0.2}),
  ]),
  mkPlayer('det2','Amon-Ra St. Brown','DET','MIN','WR',true,'healthy','',[
    mkProp('receiving_yards',82.5,{var:38,bias:7,targets:0.26,over_odds:-118,under_odds:-102}),
    mkProp('receptions',6.5,{var:2.5,bias:0.6,targets:0.26}),
  ]),
  mkPlayer('det3','Jameson Williams','DET','MIN','WR',true,'healthy','',[
    mkProp('receiving_yards',55.5,{var:32,bias:3,targets:0.15}),
    mkProp('receptions',3.5,{var:1.5,bias:0.2}),
  ]),
  mkPlayer('det4','David Montgomery','DET','MIN','RB',true,'healthy','',[
    mkProp('rushing_yards',72.5,{var:32,bias:6}),
    mkProp('receptions',2.5,{var:1.5,bias:0.2}),
  ]),
  mkPlayer('det5','Sam LaPorta','DET','MIN','TE',true,'healthy','',[
    mkProp('receiving_yards',42.5,{var:22,bias:3,targets:0.14}),
    mkProp('receptions',3.5,{var:1.5,bias:0.2}),
  ]),

  // == MINNESOTA VIKINGS ==
  mkPlayer('min1','Sam Darnold','MIN','DET','QB',true,'healthy','',[
    mkProp('passing_yards',242.5,{var:55,bias:4,total:50.5}),
    mkProp('passing_tds',2.5,{var:1,bias:0.1}),
  ]),
  mkPlayer('min2','Justin Jefferson','MIN','DET','WR',true,'healthy','',[
    mkProp('receiving_yards',85.5,{var:40,bias:7,targets:0.25,over_odds:-122,under_odds:102}),
    mkProp('receptions',5.5,{var:2.5,bias:0.5}),
  ]),
  mkPlayer('min3','Jordan Addison','MIN','DET','WR',true,'healthy','',[
    mkProp('receiving_yards',52.5,{var:28,bias:3,targets:0.16}),
    mkProp('receptions',3.5,{var:1.5,bias:0.2}),
  ]),
  mkPlayer('min4','Aaron Jones','MIN','DET','RB',true,'healthy','',[
    mkProp('rushing_yards',58.5,{var:26,bias:4}),
    mkProp('receiving_yards',22.5,{var:15,bias:1}),
  ]),

  // == BALTIMORE RAVENS ==
  mkPlayer('bal1','Lamar Jackson','BAL','PIT','QB',true,'healthy','',[
    mkProp('passing_yards',242.5,{var:52,bias:4,total:46.5}),
    mkProp('rushing_yards',62.5,{var:25,bias:5,over_odds:-120,under_odds:100}),
    mkProp('passing_tds',2.5,{var:1,bias:0.2}),
  ]),
  mkPlayer('bal2','Zay Flowers','BAL','PIT','WR',true,'healthy','',[
    mkProp('receiving_yards',58.5,{var:30,bias:4,targets:0.18}),
    mkProp('receptions',4.5,{var:2,bias:0.3}),
  ]),
  mkPlayer('bal3','Mark Andrews','BAL','PIT','TE',true,'questionable','Shoulder',[
    mkProp('receiving_yards',48.5,{var:26,bias:2,trap:true}),
    mkProp('receptions',3.5,{var:1.5,bias:0.2,trap:true}),
  ]),
  mkPlayer('bal4','Derrick Henry','BAL','PIT','RB',true,'healthy','',[
    mkProp('rushing_yards',92.5,{var:42,bias:8,over_odds:-128,under_odds:108}),
    mkProp('receptions',2.5,{var:1.5,bias:0.1}),
  ]),

  // == PITTSBURGH STEELERS ==
  mkPlayer('pit1','Russell Wilson','PIT','BAL','QB',true,'healthy','',[
    mkProp('passing_yards',225.5,{var:50,bias:3,total:46.5}),
    mkProp('passing_tds',1.5,{var:1,bias:0.2}),
    mkProp('rushing_yards',18.5,{var:12,bias:1}),
  ]),
  mkPlayer('pit2','George Pickens','PIT','BAL','WR',true,'healthy','',[
    mkProp('receiving_yards',62.5,{var:32,bias:4,targets:0.20}),
    mkProp('receptions',4.5,{var:2,bias:0.3}),
  ]),
  mkPlayer('pit3','Najee Harris','PIT','BAL','RB',true,'healthy','',[
    mkProp('rushing_yards',65.5,{var:28,bias:5}),
    mkProp('receptions',2.5,{var:1.5,bias:0.2}),
  ]),

  // == GREEN BAY PACKERS ==
  mkPlayer('gb1','Jordan Love','GB','CHI','QB',true,'healthy','',[
    mkProp('passing_yards',258.5,{var:52,bias:5,total:46.0}),
    mkProp('passing_tds',2.5,{var:1,bias:0.2}),
  ]),
  mkPlayer('gb2','Jayden Reed','GB','CHI','WR',true,'healthy','',[
    mkProp('receiving_yards',58.5,{var:28,bias:4,targets:0.18}),
    mkProp('receptions',4.5,{var:2,bias:0.3}),
  ]),
  mkPlayer('gb3','Christian Watson','GB','CHI','WR',false,'healthy','',[
    mkProp('receiving_yards',45.5,{var:26,bias:2,targets:0.14}),
  ]),
  mkPlayer('gb4','Josh Jacobs','GB','CHI','RB',true,'healthy','',[
    mkProp('rushing_yards',78.5,{var:35,bias:7}),
    mkProp('receptions',2.5,{var:1.5,bias:0.2}),
  ]),

  // == CHICAGO BEARS ==
  mkPlayer('chi1','Caleb Williams','CHI','GB','QB',true,'healthy','',[
    mkProp('passing_yards',235.5,{var:55,bias:3,total:46.0}),
    mkProp('passing_tds',1.5,{var:1,bias:0.1}),
    mkProp('rushing_yards',25.5,{var:15,bias:2}),
  ]),
  mkPlayer('chi2','Rome Odunze','CHI','GB','WR',true,'healthy','',[
    mkProp('receiving_yards',55.5,{var:30,bias:3,targets:0.17}),
    mkProp('receptions',3.5,{var:1.5,bias:0.2}),
  ]),
  mkPlayer('chi3','DJ Moore','CHI','GB','WR',true,'healthy','',[
    mkProp('receiving_yards',62.5,{var:32,bias:4,targets:0.20}),
    mkProp('receptions',4.5,{var:2,bias:0.3}),
  ]),

  // == CINCINNATI BENGALS ==
  mkPlayer('cin1','Joe Burrow','CIN','CLE','QB',true,'healthy','',[
    mkProp('passing_yards',275.5,{var:55,bias:7,total:48.0}),
    mkProp('passing_tds',2.5,{var:1,bias:0.3}),
  ]),
  mkPlayer('cin2',"Ja'Marr Chase",'CIN','CLE','WR',true,'healthy','',[
    mkProp('receiving_yards',88.5,{var:42,bias:8,targets:0.28,over_odds:-122,under_odds:102}),
    mkProp('receptions',6.5,{var:2.5,bias:0.6}),
  ]),
  mkPlayer('cin3','Tee Higgins','CIN','CLE','WR',true,'healthy','',[
    mkProp('receiving_yards',65.5,{var:32,bias:4,targets:0.18}),
    mkProp('receptions',4.5,{var:2,bias:0.3}),
  ]),
  mkPlayer('cin4','Zack Moss','CIN','CLE','RB',true,'healthy','',[
    mkProp('rushing_yards',62.5,{var:28,bias:4}),
  ]),

  // == MIAMI DOLPHINS ==
  mkPlayer('mia1','Tua Tagovailoa','MIA','NE','QB',true,'healthy','',[
    mkProp('passing_yards',272.5,{var:58,bias:6,total:50.5}),
    mkProp('passing_tds',2.5,{var:1,bias:0.3}),
  ]),
  mkPlayer('mia2','Tyreek Hill','MIA','NE','WR',true,'healthy','',[
    mkProp('receiving_yards',92.5,{var:45,bias:8,targets:0.26,over_odds:-118,under_odds:-102}),
    mkProp('receptions',6.5,{var:2.5,bias:0.5}),
  ]),
  mkPlayer('mia3','Jaylen Waddle','MIA','NE','WR',true,'healthy','',[
    mkProp('receiving_yards',68.5,{var:35,bias:4,targets:0.18}),
    mkProp('receptions',4.5,{var:2,bias:0.3}),
  ]),
  mkPlayer('mia4',"De'Von Achane",'MIA','NE','RB',true,'healthy','',[
    mkProp('rushing_yards',68.5,{var:32,bias:5}),
    mkProp('receiving_yards',32.5,{var:20,bias:2}),
  ]),
];

mockPlayers.forEach(player => {
  mockGameLogs[player.id] = Array.from({ length: 6 }, (_, i) => ({
    date: `Wk ${17 - i}`,
    opp: player.opponent,
    isHome: i % 2 === 0,
  }));
});

export const mockAlerts = [
  { id: 'a1', title: 'Travis Kelce Injury Report', description: 'Kelce listed as full participant in practice. On track to play vs BUF.', type: 'injury', player_name: 'Travis Kelce', team: 'KC', impact: 'positive', is_read: false },
  { id: 'a2', title: 'Mark Andrews Questionable', description: 'Andrews (shoulder) limited in practice. Monitor final injury report before locking in TE props.', type: 'injury', player_name: 'Mark Andrews', team: 'BAL', impact: 'negative', is_read: false },
  { id: 'a3', title: 'Dallas Goedert Questionable', description: 'Goedert (knee) limited. TRAP warning on his receiving yard props if he plays restricted snaps.', type: 'injury', player_name: 'Dallas Goedert', team: 'PHI', impact: 'negative', is_read: false },
  { id: 'a4', title: "Best Bet: Ja'Marr Chase Yards", description: "Chase over 88.5 receiving yards — CLE ranks dead last vs WR yards allowed. Burrow has targeted Chase 28% of the time.", type: 'best_bet', player_name: "Ja'Marr Chase", team: 'CIN', impact: 'positive', is_read: false },
  { id: 'a5', title: 'Best Bet: Derrick Henry Rush Yards', description: 'Henry over 92.5 rushing yards — averaging 118 rush yards in last 6. PIT secondary focused on passing, run D allowing 93 yds/game.', type: 'best_bet', player_name: 'Derrick Henry', team: 'BAL', impact: 'positive', is_read: false },
  { id: 'a6', title: 'CeeDee Lamb Line Movement', description: 'Lamb receiving yards moved from 82.5 to 88.5. Sharp money coming in on the OVER — 30+ targets this week vs SF.', type: 'line_movement', player_name: 'CeeDee Lamb', team: 'DAL', impact: 'positive', is_read: true },
];

export function getAllProps() {
  const allProps = [];
  mockPlayers.forEach(player => {
    player.props.forEach(prop => {
      allProps.push({
        ...prop,
        player_name: player.player_name,
        team: player.team,
        opponent: player.opponent,
        position: player.position,
        photo_url: player.photo_url,
        is_starter: player.is_starter,
        injury_status: player.injury_status,
        injury_note: player.injury_note,
        player_id: player.id,
      });
    });
  });
  return allProps;
}

function buildGameLogs(values, oppTeam) {
  return values.map((value, i) => {
    const isHome = i % 2 === 0;
    return {
      date: `Wk ${values.length - i}`,
      matchup: isHome ? `vs. ${oppTeam}` : `@ ${oppTeam}`,
      value,
      minutes: null,
      isHome,
      opp: oppTeam,
    };
  });
}

function getMockGames() {
  const seen = new Set();
  const pairs = [];
  mockPlayers.forEach(p => {
    const key = [p.team, p.opponent].sort().join('_');
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push({
        home: p.team,
        away: p.opponent,
        scheduled_at: new Date(Date.now() + pairs.length * 3600000).toISOString(),
      });
    }
  });
  return pairs.slice(0, 8);
}

export function getMockPayload() {
  const flat = getAllProps();
  const props = flat.map(p => {
    const vals = p.last_10_games || [];
    const vals20 = [...vals, ...vals].slice(0, 20);
    const logs = buildGameLogs(vals, p.opponent);
    const logs20 = buildGameLogs(vals20, p.opponent);
    const homeG = logs.filter(g => g.isHome);
    const awayG = logs.filter(g => !g.isHome);
    const avg = arr => arr.length ? parseFloat((arr.reduce((s, g) => s + g.value, 0) / arr.length).toFixed(1)) : null;
    const hitRate = (arr, line) => arr.length ? Math.round(arr.filter(g => g.value > line).length / arr.length * 100) : null;
    return {
      ...p,
      player_team: p.team,
      home: p.team,
      away: p.opponent,
      season_avg: p.avg_last_10 ? parseFloat((p.avg_last_10 * 0.97).toFixed(1)) : null,
      season_games: 16,
      season_hit_rate: p.hit_rate_last_10 ? Math.round(p.hit_rate_last_10 * 0.92) : null,
      avg_last_20: p.avg_last_10,
      hit_rate_last_20: p.hit_rate_last_10,
      last_20_games: vals20,
      game_logs_last_10: logs,
      game_logs_last_20: logs20,
      home_avg: avg(homeG),
      away_avg: avg(awayG),
      home_hit_rate: hitRate(homeG, p.line),
      away_hit_rate: hitRate(awayG, p.line),
      home_games_count: homeG.length,
      away_games_count: awayG.length,
      has_analytics: true,
      is_home: true,
      sources: ['draftkings'],
      all_books: [{ key: 'draftkings', title: 'DraftKings', line: p.line, over_odds: p.over_odds, under_odds: p.under_odds }],
    };
  });
  return {
    game_date: 'Demo Mode · NFL Example Props',
    games_summary: getMockGames(),
    props,
  };
}

export const isDemoMode = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo');

// ─── Waiver Wire Players ──────────────────────────────────────────────────────
// Backup RBs, emerging WRs, streaming options — players typically available in
// most leagues. Each has waiver_priority, waiver_reason, is_handcuff, injury_upside.

export const waiverPlayers = [
  // ── Handcuff RBs ──
  {
    ...mkPlayer('kc_rb2','Clyde Edwards-Helaire','KC','BUF','RB',false,'healthy','',[
      mkProp('rushing_yards',42.5,{var:28,bias:4}),
      mkProp('receptions',2.5,{var:1.5,bias:0.2}),
    ]),
    waiver_priority: 'high',
    waiver_reason: 'Handcuff to Isiah Pacheco — immediately startable if Pacheco misses time',
    is_handcuff: true,
    injury_upside: 'Pacheco (ribs) is week-to-week',
    is_waiver: true,
  },
  {
    ...mkPlayer('sf_rb2','Jordan Mason','SF','DAL','RB',false,'healthy','',[
      mkProp('rushing_yards',52.5,{var:32,bias:5}),
      mkProp('receptions',1.5,{var:1,bias:0.1}),
    ]),
    waiver_priority: 'high',
    waiver_reason: 'Direct handcuff to CMC — elite upside if McCaffrey sits',
    is_handcuff: true,
    injury_upside: null,
    is_waiver: true,
  },
  {
    ...mkPlayer('bal_rb2','Justice Hill','BAL','PIT','RB',false,'healthy','',[
      mkProp('rushing_yards',38.5,{var:22,bias:3}),
      mkProp('receptions',3.5,{var:2,bias:0.5,targets:0.10}),
    ]),
    waiver_priority: 'medium',
    waiver_reason: 'Pass-catching back with PPR upside behind Derrick Henry',
    is_handcuff: true,
    injury_upside: null,
    is_waiver: true,
  },
  {
    ...mkPlayer('det_rb2','Craig Reynolds','DET','MIN','RB',false,'healthy','',[
      mkProp('rushing_yards',35.5,{var:22,bias:2}),
    ]),
    waiver_priority: 'medium',
    waiver_reason: 'Handcuff to Montgomery — Lions high-powered offense',
    is_handcuff: true,
    injury_upside: null,
    is_waiver: true,
  },

  // ── Emerging WRs ──
  {
    ...mkPlayer('phi_wr3','Britain Covey','PHI','NYG','WR',false,'healthy','',[
      mkProp('receiving_yards',38.5,{var:22,bias:3,targets:0.12}),
      mkProp('receptions',3.5,{var:1.5,bias:0.4,targets:0.12}),
    ]),
    waiver_priority: 'medium',
    waiver_reason: 'Slot receiver seeing increased targets with Goedert questionable — PPR upside',
    is_handcuff: false,
    injury_upside: 'Target share surging with Goedert limited',
    is_waiver: true,
  },
  {
    ...mkPlayer('gb_wr3','Romeo Doubs','GB','CHI','WR',false,'healthy','',[
      mkProp('receiving_yards',48.5,{var:26,bias:4,targets:0.16}),
      mkProp('receptions',4.5,{var:2,bias:0.4,targets:0.16}),
    ]),
    waiver_priority: 'medium',
    waiver_reason: 'Emerging as WR2 in Green Bay — Jordan Love connection growing',
    is_handcuff: false,
    injury_upside: null,
    is_waiver: true,
  },
  {
    ...mkPlayer('cin_wr3','Charlie Jones','CIN','CLE','WR',false,'healthy','',[
      mkProp('receiving_yards',42.5,{var:24,bias:3,targets:0.13}),
      mkProp('receptions',4.5,{var:2,bias:0.5,targets:0.13}),
    ]),
    waiver_priority: 'medium',
    waiver_reason: 'Slot receiver in Burrow\'s offense — high PPR upside, 13% target share',
    is_handcuff: false,
    injury_upside: null,
    is_waiver: true,
  },
  {
    ...mkPlayer('mia_wr3','Braxton Berrios','MIA','NE','WR',false,'healthy','',[
      mkProp('receiving_yards',32.5,{var:20,bias:2,targets:0.10}),
      mkProp('receptions',3.5,{var:1.5,bias:0.3,targets:0.10}),
    ]),
    waiver_priority: 'low',
    waiver_reason: 'PPR streamer in Miami\'s fast-paced offense vs weak NE secondary',
    is_handcuff: false,
    injury_upside: null,
    is_waiver: true,
  },

  // ── Streaming QBs ──
  {
    ...mkPlayer('chi_qb','Caleb Williams','CHI','GB','QB',true,'healthy','',[
      mkProp('passing_yards',235.5,{var:55,bias:3}),
      mkProp('passing_tds',1.5,{var:1,bias:0.1}),
      mkProp('rushing_yards',25.5,{var:15,bias:2}),
    ]),
    waiver_priority: 'high',
    waiver_reason: 'Rookie with dual-threat upside — streaming option in weak matchup vs CHI',
    is_handcuff: false,
    injury_upside: null,
    is_waiver: true,
  },
  {
    ...mkPlayer('ten_qb','Will Levis','TEN','JAX','QB',true,'healthy','',[
      mkProp('passing_yards',218.5,{var:55,bias:2}),
      mkProp('passing_tds',1.5,{var:1,bias:0.1}),
    ]),
    waiver_priority: 'medium',
    waiver_reason: 'Streamer vs JAX — one of the worst pass defenses in the league',
    is_handcuff: false,
    injury_upside: null,
    is_waiver: true,
  },

  // ── Streaming TEs ──
  {
    ...mkPlayer('gb_te2','Tucker Kraft','GB','CHI','TE',false,'healthy','',[
      mkProp('receiving_yards',38.5,{var:22,bias:3,targets:0.13}),
      mkProp('receptions',3.5,{var:1.5,bias:0.3,targets:0.13}),
    ]),
    waiver_priority: 'medium',
    waiver_reason: 'Backup TE seeing seam routes in Jordan Love\'s scheme — TE premium leagues',
    is_handcuff: false,
    injury_upside: null,
    is_waiver: true,
  },
  {
    ...mkPlayer('det_te2','Brock Wright','DET','MIN','TE',false,'healthy','',[
      mkProp('receiving_yards',32.5,{var:20,bias:2,targets:0.10}),
      mkProp('receptions',2.5,{var:1.5,bias:0.2,targets:0.10}),
    ]),
    waiver_priority: 'low',
    waiver_reason: 'Sneaky TE2 in Detroit\'s run-heavy offense — better in TE premium formats',
    is_handcuff: false,
    injury_upside: null,
    is_waiver: true,
  },
  {
    ...mkPlayer('min_te2','Josh Oliver','MIN','DET','TE',false,'healthy','',[
      mkProp('receiving_yards',28.5,{var:18,bias:2,targets:0.09}),
      mkProp('receptions',2.5,{var:1.5,bias:0.2,targets:0.09}),
    ]),
    waiver_priority: 'low',
    waiver_reason: 'Deep TE streamer in high-total DET vs MIN matchup',
    is_handcuff: false,
    injury_upside: null,
    is_waiver: true,
  },
];
