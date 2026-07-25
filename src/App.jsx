import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ParlayProvider } from '@/lib/ParlayContext';
import AppLayout from '@/components/layout/AppLayout';
import Props from '@/pages/Props.jsx';
import Trends from '@/pages/Trends.jsx';
import Login from '@/pages/Login.jsx';
import ParlayBuilder from '@/pages/ParlayBuilder.jsx';
import Alerts from '@/pages/Alerts';
import Profile from '@/pages/Profile.jsx';
import Compare from '@/pages/Compare';
import LiveOdds from '@/pages/LiveOdds';
import AIPicks from '@/pages/AIPicks.jsx';
import PropHistory from '@/pages/PropHistory.jsx';
import StartSit from '@/pages/StartSit.jsx';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]);
  return null;
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Props />} />
        <Route path="/trends" element={<Trends />} />
        <Route path="/parlay" element={<ParlayBuilder />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/odds" element={<LiveOdds />} />
        <Route path="/ai-picks" element={<AIPicks />} />
        <Route path="/history" element={<PropHistory />} />
        <Route path="/start-sit" element={<StartSit />} />
        <Route path="/live-odds" element={<Navigate to="/odds" replace />} />
        <Route path="/streaks" element={<Navigate to="/trends" replace />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <ParlayProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </ParlayProvider>
    </AuthProvider>
  )
}

export default App