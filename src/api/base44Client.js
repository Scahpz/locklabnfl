import { NFL_API } from '../lib/config';

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

  entities: {
    SavedParlay: {
      list: async () => apiRequest('/api/parlays'),
      create: async (data) => apiRequest('/api/parlays', { method: 'POST', body: JSON.stringify(data) }),
      update: async (id, data) => apiRequest(`/api/parlays/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: async (id) => apiRequest(`/api/parlays/${id}`, { method: 'DELETE' }),
    },
    PropHistory: {
      list: async () => apiRequest('/api/prop-history'),
      create: async (data) => apiRequest('/api/prop-history', { method: 'POST', body: JSON.stringify(data) }),
      update: async (id, data) => apiRequest(`/api/prop-history/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: async (id) => apiRequest(`/api/prop-history/${id}`, { method: 'DELETE' }),
      settle: async () => apiRequest('/api/prop-history/settle', { method: 'POST', body: JSON.stringify({}) }),
    },
  },
};
