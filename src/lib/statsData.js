import { NFL_API as NFL_API_BASE } from './config';

/**
 * Get real analytics for a player prop using local nba_api backend.
 * Returns { avg_last_5, avg_last_10, hit_rate_last_10, game_logs_last_10,
 *           projection, edge, streak_info, confidence_score, data_source }
 */
export async function getRealPlayerAnalytics(playerName, propType, line) {
  try {
    const res = await fetch(`${NFL_API_BASE}/api/player-stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName, propType, line }),
    });

    if (!res.ok) throw new Error(`Backend returned ${res.status}`);
    const data = await res.json();
    return data.analytics || null;
  } catch (e) {
    console.warn(`nba_api fetch failed for ${playerName}:`, e.message);
    return null;
  }
}

// Keep these exports for compatibility
export async function getBallDontLiePlayerId() { return null; }
export function getCachedPlayerTeam() { return null; }
export async function prefetchPlayerTeams() {}
export async function getPlayerGameLogs() { return null; }
export async function getPlayerSeasonAverages() { return null; }