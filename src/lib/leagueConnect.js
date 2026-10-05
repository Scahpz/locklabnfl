// ── Fantasy league import (Sleeper + ESPN) ────────────────────────────────────
// Pulls a user's league so Start/Sit can show "My Team" and a waiver wire of
// players actually available in their league, and copies the league's scoring
// into LockLab league settings. Everything is stored in localStorage only.
//
// Sleeper's API is public and CORS-friendly, so it's called directly.
// ESPN goes through our backend (/api/espn/league) because private leagues need
// auth cookies a browser can't send cross-site.

import { NFL_API } from './config';
import { getLeagueSettings, saveLeagueSettings, SCORING_FORMATS } from './leagueSettings';
import { buildNameToIdFull, normName } from './propsNoBackend';

const STORAGE_KEY = 'locklab_nfl_league_connection';
const STALE_MS    = 6 * 60 * 60 * 1000; // rosters change — re-sync after 6h

export const PLATFORMS = {
  sleeper: { label: 'Sleeper' },
  espn:    { label: 'ESPN' },
  yahoo:   { label: 'Yahoo', comingSoon: true },
};

export function currentSeason() {
  const d = new Date();
  return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
}

// ── Storage ───────────────────────────────────────────────────────────────────
export function getLeagueConnection() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
  catch { return null; }
}

export function saveLeagueConnection(conn) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(conn)); } catch {}
}

export function clearLeagueConnection() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function isConnectionStale(conn) {
  return !conn?.syncedAt || Date.now() - conn.syncedAt > STALE_MS;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Accepts a bare ID or a pasted league URL from either site.
export function parseLeagueId(input) {
  const s = String(input || '').trim();
  const espn = s.match(/leagueId=(\d+)/i);
  if (espn) return espn[1];
  const sleeper = s.match(/leagues?\/(\d+)/i);
  if (sleeper) return sleeper[1];
  return /^\d+$/.test(s) ? s : '';
}

// Stricter than normName: also drops suffixes and apostrophes so ESPN's
// "Kenneth Walker III" / "Ja'Marr Chase" match Sleeper's spellings.
function matchKey(name) {
  return normName(name)
    .replace(/['’]/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, '')
    .trim();
}

async function getJson(url, opts) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Converts platform scoring into LockLab settings, keeping anything the
// platform doesn't specify at the user's current value.
function toLockLabSettings({ recPts, passTDPts, passYdPts, rushYdPts, recYdPts, rushTDPts, recTDPts, tePremium, superflex, leagueSize }) {
  const cur = getLeagueSettings();
  const rec = recPts ?? cur.recPts;
  const nearest = SCORING_FORMATS.reduce((a, b) => Math.abs(b.recPts - rec) < Math.abs(a.recPts - rec) ? b : a);
  const sizes = [8, 10, 12, 14];
  const size = leagueSize ? sizes.reduce((a, b) => Math.abs(b - leagueSize) < Math.abs(a - leagueSize) ? b : a) : cur.leagueSize;
  return {
    ...cur,
    scoring:   nearest.value,
    recPts:    rec,
    passTDPts: passTDPts ?? cur.passTDPts,
    passYdPts: passYdPts ?? cur.passYdPts,
    rushYdPts: rushYdPts ?? cur.rushYdPts,
    recYdPts:  recYdPts  ?? cur.recYdPts,
    rushTDPts: rushTDPts ?? cur.rushTDPts,
    recTDPts:  recTDPts  ?? cur.recTDPts,
    tePremium: !!tePremium,
    superflex: !!superflex,
    flexType:  superflex ? 'RB/WR/TE/QB' : cur.flexType,
    leagueSize: size,
  };
}

// ── Sleeper ───────────────────────────────────────────────────────────────────
async function fetchSleeperLeague(leagueId) {
  const base = `https://api.sleeper.app/v1/league/${leagueId}`;
  let league;
  try { league = await getJson(base); }
  catch { throw new Error("Couldn't reach Sleeper. Check your connection and try again."); }
  if (!league?.league_id) throw new Error(`No Sleeper league found with ID ${leagueId}.`);

  const [users, rosters] = await Promise.all([
    getJson(`${base}/users`).catch(() => []),
    getJson(`${base}/rosters`).catch(() => []),
  ]);
  const userById = Object.fromEntries((users || []).map(u => [u.user_id, u]));

  const s = league.scoring_settings || {};
  const positions = league.roster_positions || [];

  return {
    name:   league.name || `Sleeper League ${leagueId}`,
    season: Number(league.season) || currentSeason(),
    settings: toLockLabSettings({
      recPts:    s.rec,
      passTDPts: s.pass_td,
      passYdPts: s.pass_yd,
      rushYdPts: s.rush_yd,
      recYdPts:  s.rec_yd,
      rushTDPts: s.rush_td,
      recTDPts:  s.rec_td,
      tePremium: (s.bonus_rec_te ?? 0) > 0,
      superflex: positions.includes('SUPER_FLEX'),
      leagueSize: league.total_rosters,
    }),
    teams: (rosters || []).map(r => {
      const u = userById[r.owner_id];
      return {
        id:        String(r.roster_id),
        name:      u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`,
        owner:     u?.display_name || '',
        playerIds: (r.players || []).map(String),
        unmatched: 0,
      };
    }),
  };
}

// ── ESPN ──────────────────────────────────────────────────────────────────────
async function fetchEspnLeague(leagueId, season, creds = {}) {
  let data;
  try {
    data = await getJson(`${NFL_API}/api/espn/league`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ league_id: leagueId, season, espn_s2: creds.espnS2, swid: creds.swid }),
    });
  } catch {
    throw new Error("Couldn't reach the LockLab server to import from ESPN. Try again shortly.");
  }
  if (!data?.ok) {
    const err = new Error(data?.error || 'ESPN import failed.');
    err.isPrivate = !!data?.private;
    throw err;
  }

  // ESPN IDs → Sleeper IDs (what the rest of the app uses) via name match.
  // Sleeper's team-defense IDs are just the team abbreviation.
  const nameToId = await buildNameToIdFull().catch(() => ({}));
  const byKey = {};
  for (const [n, id] of Object.entries(nameToId)) byKey[matchKey(n)] = id;

  return {
    name:   data.name,
    season: data.season,
    settings: toLockLabSettings({
      ...data.scoring,
      tePremium:  data.tePremium,
      superflex:  data.superflex,
      leagueSize: data.size,
    }),
    teams: data.teams.map(t => {
      const ids = [];
      let unmatched = 0;
      for (const p of t.players) {
        const id = p.position === 'DEF' ? p.team : byKey[matchKey(p.name)];
        if (id) ids.push(String(id)); else unmatched++;
      }
      return { id: t.id, name: t.name, owner: t.owner, playerIds: ids, unmatched };
    }),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────
// Fetches a league without saving it — the UI shows the teams so the user can
// pick theirs, then calls finishConnection().
export async function fetchLeague({ platform, leagueId, season = currentSeason(), espnS2, swid }) {
  const id = parseLeagueId(leagueId);
  if (!id) throw new Error('Enter a league ID or paste your league URL.');
  if (platform === 'sleeper') return { platform, leagueId: id, ...(await fetchSleeperLeague(id)) };
  if (platform === 'espn') {
    const league = await fetchEspnLeague(id, season, { espnS2, swid });
    return { platform, leagueId: id, creds: espnS2 && swid ? { espnS2, swid } : null, ...league };
  }
  throw new Error(`${PLATFORMS[platform]?.label ?? platform} isn't supported yet.`);
}

export function finishConnection(league, myTeamId) {
  const conn = { ...league, myTeamId: myTeamId ?? null, syncedAt: Date.now() };
  saveLeagueConnection(conn);
  saveLeagueSettings(league.settings);
  return conn;
}

// Re-pulls rosters for a saved connection. Scoring settings aren't re-applied
// so manual tweaks the user made after connecting are kept.
export async function refreshLeagueConnection(conn = getLeagueConnection()) {
  if (!conn) return null;
  const fresh = await fetchLeague({
    platform: conn.platform,
    leagueId: conn.leagueId,
    season:   conn.season,
    espnS2:   conn.creds?.espnS2,
    swid:     conn.creds?.swid,
  });
  const next = { ...conn, name: fresh.name, teams: fresh.teams, syncedAt: Date.now() };
  saveLeagueConnection(next);
  return next;
}

export function getMyTeam(conn) {
  return conn?.teams?.find(t => t.id === conn.myTeamId) ?? null;
}

export function getRosteredIds(conn) {
  return new Set((conn?.teams ?? []).flatMap(t => t.playerIds));
}
