import React, { createContext, useContext, useState, useEffect } from 'react';
import { NFL_API } from './config';

const AUTH_TOKEN_KEY = 'locklab_auth_token';
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  // BYPASS: Railway is down — remove this mock user to re-enable auth
  const [user, setUser] = useState({ id: 'local', email: 'owner@locklabnba.com', full_name: 'Owner' });
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);

  useEffect(() => {
    // Auth check disabled while Railway is down — restore below to re-enable
    // const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);
    // if (!storedToken) { setIsLoadingAuth(false); return; }
    // fetch(`${NFL_API}/api/auth/me`, { headers: { Authorization: `Bearer ${storedToken}` } })
    //   .then(res => { if (!res.ok) { localStorage.removeItem(AUTH_TOKEN_KEY); return null; } return res.json(); })
    //   .then(data => { if (data) setUser(data); })
    //   .catch(() => {})
    //   .finally(() => setIsLoadingAuth(false));
  }, []);

  const doAuthFetch = async (url, body) => {
    let res;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
    } catch {
      // Network error or timeout — Railway is sleeping/cold-starting
      throw new Error('SERVER_STARTING');
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let msg = '';
      try { const j = JSON.parse(text); msg = j.detail || j.message || ''; } catch {}
      if (!msg) msg = text.slice(0, 200);
      // Railway cold-start / overload responses
      if (
        msg.toLowerCase().includes('application not found') ||
        msg.toLowerCase().includes('overload') ||
        res.status === 503 || res.status >= 502
      ) {
        throw new Error('SERVER_STARTING');
      }
      throw new Error(msg || 'Request failed');
    }
    return res.json();
  };

  const login = async (email, password) => {
    const data = await doAuthFetch(`${NFL_API}/api/auth/login`, { email, password });
    localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    setUser(data.user);
    return data.user;
  };

  const register = async (email, password, full_name) => {
    const data = await doAuthFetch(`${NFL_API}/api/auth/register`, { email, password, full_name });
    localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setUser(null);
  };

  const updateUser = updates => setUser(prev => ({ ...prev, ...updates }));

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError: null,
      appPublicSettings: null,
      login,
      register,
      logout,
      updateUser,
      navigateToLogin: () => {},
      checkAppState: () => {},
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
