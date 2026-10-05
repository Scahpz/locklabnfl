import React, { useState } from 'react';
import { Link2, X, Loader2, RefreshCw, Check, AlertTriangle, ChevronDown } from 'lucide-react';
import {
  PLATFORMS, fetchLeague, finishConnection, refreshLeagueConnection,
  clearLeagueConnection, saveLeagueConnection, getMyTeam,
} from '@/lib/leagueConnect';
import { cn } from '@/lib/utils';

const ID_HELP = {
  sleeper: 'Open your league on sleeper.com — the ID is the number in the URL (sleeper.com/leagues/1234…). You can paste the whole URL.',
  espn:    'Open your league on fantasy.espn.com — the ID is the leagueId= number in the URL. You can paste the whole URL.',
};

function TeamPicker({ teams, value, onChange }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Which team is yours?</div>
      <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
        {teams.map(t => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left transition-all',
              value === t.id
                ? 'bg-primary/15 border-primary/40'
                : 'border-white/8 hover:border-white/18',
            )}
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground truncate">{t.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {t.owner ? `${t.owner} · ` : ''}{t.playerIds.length} players
              </div>
            </div>
            {value === t.id && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function LeagueConnectModal({ connection, onChange, onClose }) {
  const [platform, setPlatform]   = useState('sleeper');
  const [leagueId, setLeagueId]   = useState('');
  const [showPrivate, setShowPrivate] = useState(false);
  const [espnS2, setEspnS2]       = useState('');
  const [swid, setSwid]           = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [found, setFound]         = useState(null);   // fetched, not yet saved
  const [myTeamId, setMyTeamId]   = useState(connection?.myTeamId ?? null);
  const [editingTeam, setEditingTeam] = useState(false);

  async function handleFind() {
    setError('');
    setLoading(true);
    try {
      const league = await fetchLeague({ platform, leagueId, espnS2, swid });
      setFound(league);
      setMyTeamId(null);
    } catch (e) {
      setError(e.message);
      if (e.isPrivate) setShowPrivate(true);
    } finally {
      setLoading(false);
    }
  }

  function handleConnect() {
    onChange(finishConnection(found, myTeamId));
    onClose();
  }

  async function handleResync() {
    setError('');
    setLoading(true);
    try { onChange(await refreshLeagueConnection(connection)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  function handleSaveTeam() {
    const next = { ...connection, myTeamId };
    saveLeagueConnection(next);
    onChange(next);
    setEditingTeam(false);
  }

  function handleDisconnect() {
    clearLeagueConnection();
    onChange(null);
    setFound(null);
  }

  const myTeam = getMyTeam(connection);
  const unmatched = found?.teams.reduce((n, t) => n + t.unmatched, 0) ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[hsl(218,58%,6%)] shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-white/6 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground">{connection ? 'Your League' : 'Connect Your League'}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* ── Already connected ── */}
          {connection && !found && (
            <>
              <div className="rounded-xl bg-primary/8 border border-primary/15 p-3 space-y-1">
                <div className="text-sm font-semibold text-foreground">{connection.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {PLATFORMS[connection.platform]?.label} · {connection.season} · {connection.teams.length} teams
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Your team: <span className="text-primary font-medium">{myTeam?.name ?? 'not set'}</span>
                </div>
                <div className="text-[11px] text-muted-foreground/70">
                  Rosters synced {new Date(connection.syncedAt).toLocaleString()}
                </div>
              </div>

              {editingTeam ? (
                <>
                  <TeamPicker teams={connection.teams} value={myTeamId} onChange={setMyTeamId} />
                  <button
                    onClick={handleSaveTeam}
                    className="w-full py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors"
                  >
                    Save
                  </button>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleResync}
                    disabled={loading}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-white/10 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Re-sync
                  </button>
                  <button
                    onClick={() => setEditingTeam(true)}
                    className="py-2 rounded-xl border border-white/10 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Change team
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="col-span-2 py-2 rounded-xl border border-red-500/30 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    Disconnect league
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── Connect flow ── */}
          {!connection && !found && (
            <>
              <div className="flex gap-1 bg-white/4 rounded-xl p-1">
                {Object.entries(PLATFORMS).map(([key, p]) => (
                  <button
                    key={key}
                    disabled={p.comingSoon}
                    onClick={() => { setPlatform(key); setError(''); }}
                    className={cn(
                      'flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-all',
                      platform === key
                        ? 'bg-primary/25 text-primary border border-primary/30'
                        : 'text-muted-foreground hover:text-foreground',
                      p.comingSoon && 'opacity-40 cursor-not-allowed hover:text-muted-foreground',
                    )}
                  >
                    {p.label}{p.comingSoon ? ' · soon' : ''}
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">League ID or URL</div>
                <input
                  type="text"
                  value={leagueId}
                  onChange={e => setLeagueId(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !loading) handleFind(); }}
                  placeholder={platform === 'sleeper' ? 'e.g. 1048293746102394880' : 'e.g. 12345678'}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
                <p className="text-[11px] text-muted-foreground">{ID_HELP[platform]}</p>
              </div>

              {platform === 'espn' && (
                <div className="space-y-2">
                  <button
                    onClick={() => setShowPrivate(v => !v)}
                    className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showPrivate && 'rotate-180')} />
                    Private league?
                  </button>
                  {showPrivate && (
                    <div className="space-y-2 rounded-xl border border-white/8 p-3">
                      <p className="text-[11px] text-muted-foreground">
                        ESPN needs two cookies to read a private league. On a computer, log in to fantasy.espn.com,
                        open DevTools → Application → Cookies → espn.com, and copy <span className="text-foreground">espn_s2</span> and{' '}
                        <span className="text-foreground">SWID</span>. They're saved only on this device.
                      </p>
                      <input
                        type="password"
                        value={espnS2}
                        onChange={e => setEspnS2(e.target.value)}
                        placeholder="espn_s2"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                      />
                      <input
                        type="text"
                        value={swid}
                        onChange={e => setSwid(e.target.value)}
                        placeholder="SWID  {XXXXXXXX-XXXX-…}"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── League found: pick your team ── */}
          {found && (
            <>
              <div className="rounded-xl bg-primary/8 border border-primary/15 p-3">
                <div className="text-sm font-semibold text-foreground">{found.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {PLATFORMS[found.platform].label} · {found.season} · {found.teams.length} teams ·{' '}
                  {{ standard: 'Standard', half_ppr: 'Half PPR', ppr: 'PPR' }[found.settings.scoring]}
                  {found.settings.superflex ? ' · Superflex' : ''}
                  {found.settings.tePremium ? ' · TE Premium' : ''}
                </div>
              </div>
              <TeamPicker teams={found.teams} value={myTeamId} onChange={setMyTeamId} />
              {unmatched > 0 && (
                <p className="text-[11px] text-muted-foreground/70">
                  {unmatched} rostered player{unmatched === 1 ? '' : 's'} (mostly kickers or deep bench) couldn't be matched and won't show up.
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">Connecting also applies this league's scoring to your LockLab settings.</p>
            </>
          )}

          {error && (
            <div className="rounded-xl bg-red-500/8 border border-red-500/20 px-3 py-2 text-[12px] text-red-300 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {!connection && (
          <div className="p-4 border-t border-white/6 flex gap-2 flex-shrink-0">
            <button
              onClick={found ? () => setFound(null) : onClose}
              className="flex-1 py-2 rounded-xl border border-white/10 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {found ? 'Back' : 'Cancel'}
            </button>
            {found ? (
              <button
                onClick={handleConnect}
                disabled={!myTeamId}
                className="flex-1 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors disabled:opacity-50"
              >
                Connect
              </button>
            ) : (
              <button
                onClick={handleFind}
                disabled={loading || !leagueId.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Find league
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
