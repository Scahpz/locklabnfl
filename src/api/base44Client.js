import { NFL_API } from '../lib/config';
import { gradePicks } from '../lib/predictionLog';

// Minimal localStorage-backed collection with the same async shape the pages
// already call (list / create / update / delete).
function localCollection(key) {
  const read = () => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };
  const write = rows => { localStorage.setItem(key, JSON.stringify(rows)); };
  return {
    list: async () => read(),
    create: async data => {
      const row = { ...data, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, created_date: new Date().toISOString() };
      write([row, ...read()]);
      return row;
    },
    update: async (id, data) => {
      const rows = read().map(r => (r.id === id ? { ...r, ...data } : r));
      write(rows);
      return rows.find(r => r.id === id) ?? null;
    },
    delete: async id => { write(read().filter(r => r.id !== id)); return { ok: true }; },
  };
}

const AUTH_TOKEN_KEY = 'locklab_auth_token';

function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || '';
}

async function apiRequest(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${NFL_API}${path}`, { ...options, headers });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export const base44 = {
  auth: {
    me: async () => {
      const token = getToken();
      if (!token) return null;
      try {
        const res = await fetch(`${NFL_API}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return null;
        return res.json();
      } catch {
        return null;
      }
    },

    updateMe: async (data) => {
      const token = getToken();
      if (!token) return null;
      const res = await fetch(`${NFL_API}/api/auth/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update profile');
      return res.json();
    },

    logout: () => {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      window.location.href = '/';
    },
  },

  functions: {
    invoke: async (funcName, params = {}) => {
      if (funcName === 'fetchLivePropsFromOdds') {
        const data = await apiRequest('/api/live-props');
        return { data };
      }
      if (funcName === 'getPlayerStats') {
        const data = await apiRequest('/api/player-stats', {
          method: 'POST',
          body: JSON.stringify(params),
        });
        return { data };
      }
      throw new Error(`Unknown function: ${funcName}`);
    },
  },

  integrations: {
    Core: {
      InvokeLLM: async ({ prompt }) => {
        try {
          const jsonMatch = prompt.match(/\[[\s\S]*\]/);
          if (!jsonMatch) return { verdicts: [] };
          const props = JSON.parse(jsonMatch[0]);

          const verdicts = props.map((p) => {
            const avg = p.avg_last_5 ?? p.avg_last_10 ?? p.line;
            const hitRate = p.hit_rate_last_10 ?? 50;

            let verdict, confidence, reason;

            if (avg > p.line * 1.08 && hitRate >= 60) {
              verdict = 'OVER';
              confidence = Math.min(92, 55 + (hitRate - 50) + Math.round((avg - p.line) * 2));
              reason = `Avg ${avg?.toFixed(1)} vs ${p.line} line — ${hitRate}% hit rate`;
            } else if (avg < p.line * 0.92 && hitRate <= 40) {
              verdict = 'UNDER';
              confidence = Math.min(92, 55 + (50 - hitRate) + Math.round((p.line - avg) * 2));
              reason = `Only ${avg?.toFixed(1)} avg vs ${p.line} line — ${hitRate}% hit rate`;
            } else {
              verdict = 'UNSAFE';
              confidence = 42;
              reason = `Too close to call — line is near season average`;
            }

            return { id: p.id, verdict, ai_confidence: confidence, reason };
          });

          return { verdicts };
        } catch {
          return { verdicts: [] };
        }
      },
    },
  },

  // Saved parlays and tracked props live on this device. The backend never had
  // /api/parlays or /api/prop-history routes (every save 404'd), and with auth
  // disabled there's no user to attach server-side records to anyway.
  entities: {
    SavedParlay: {
      ...localCollection('locklab_saved_parlays'),
      // Grades pending parlays whose prop legs have final stats. Any losing leg
      // loses the parlay; it wins only when every leg is a confirmed hit
      // (game-line legs can't be graded automatically, so those stay pending).
      settle: async () => {
        const store = localCollection('locklab_saved_parlays');
        const pending = (await store.list()).filter(p => p.status === 'pending');
        const legs = pending.flatMap(p => p.legs.filter(l => !l.is_game_bet));
        if (!legs.length) return { settled: 0 };
        const statuses = await gradePicks(legs.map(l => ({ ...l, direction: l.pick })));
        const statusOf = new Map(legs.map((l, i) => [l, statuses[i]]));
        let settled = 0;
        for (const p of pending) {
          const results = p.legs.map(l => (l.is_game_bet ? 'pending' : statusOf.get(l)));
          const status = results.includes('wrong') ? 'lost'
            : results.every(r => r === 'correct' || r === 'push') && results.some(r => r === 'correct') ? 'won'
            : null;
          if (status) { await store.update(p.id, { status, auto_settled: true }); settled++; }
        }
        return { settled };
      },
    },
    PropHistory: {
      ...localCollection('locklab_prop_history'),
      settle: async () => {
        const store = localCollection('locklab_prop_history');
        const pending = (await store.list()).filter(e => e.result === 'pending');
        if (!pending.length) return { settled: 0 };
        const statuses = await gradePicks(pending);
        let settled = 0;
        for (const [i, e] of pending.entries()) {
          const result = statuses[i] === 'correct' ? 'hit' : statuses[i] === 'wrong' ? 'miss' : null;
          if (result) { await store.update(e.id, { result }); settled++; }
        }
        return { settled };
      },
    },
  },
};
