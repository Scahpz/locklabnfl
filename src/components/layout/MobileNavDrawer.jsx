import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Zap, Sparkles, TrendingUp, GitCompare, Trophy, ArrowUpDown,
  Activity, Layers, ClipboardList, Bell, User, Search, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import logo from '@/assets/logo.png';

const navSections = [
  {
    title: 'Betting & Live Props',
    items: [
      { path: '/', label: 'Props', icon: Zap, badge: 'LIVE' },
      { path: '/ai-picks', label: 'AI Picks', icon: Sparkles, badge: 'AI MODEL', badgeColor: 'bg-primary/20 text-primary border-primary/30' },
      { path: '/parlay', label: 'Parlay Builder', icon: Layers },
      { path: '/odds', label: 'Live Odds', icon: Activity },
      { path: '/history', label: 'Prop History', icon: ClipboardList },
    ],
  },
  {
    title: 'Fantasy & Trends',
    items: [
      { path: '/start-sit', label: 'Start/Sit Tool', icon: Trophy, badge: 'FANTASY', badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
      { path: '/trend-engine', label: 'Trend Engine', icon: ArrowUpDown, badge: 'NEW', badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
      { path: '/trends', label: 'Streaks & Trends', icon: TrendingUp },
      { path: '/compare', label: 'Player Compare', icon: GitCompare },
    ],
  },
  {
    title: 'Account & Settings',
    items: [
      { path: '/alerts', label: 'Alerts', icon: Bell },
      { path: '/profile', label: 'Profile', icon: User },
    ],
  },
];

export default function MobileNavDrawer({ isOpen, onClose }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  // Lock background scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSearch = (e) => {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    onClose();
    navigate(`/trends?player=${encodeURIComponent(q)}`);
    setSearch('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed inset-y-0 left-0 w-4/5 max-w-sm bg-[hsl(222,47%,8%)] border-r border-white/10 flex flex-col shadow-2xl z-50 animate-in slide-in-from-left duration-250"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/8">
          <Link to="/" onClick={onClose} className="flex items-center gap-2.5">
            <img src={logo} alt="LockLab NFL" className="w-8 h-8 object-contain" />
            <div>
              <p className="text-sm font-bold text-foreground tracking-tight leading-none">
                LockLab<span className="text-primary">NFL</span>
              </p>
              <p className="text-[9px] text-muted-foreground mt-0.5 tracking-widest uppercase">
                Analytics &amp; Props
              </p>
            </div>
          </Link>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="p-3 border-b border-white/8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search player stats &amp; trends…"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
            />
          </div>
        </form>

        {/* Links list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {navSections.map((section, idx) => (
            <div key={idx} className="space-y-1">
              <p className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/70 px-2.5 mb-1.5">
                {section.title}
              </p>
              {section.items.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={onClose}
                    className={cn(
                      'flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150',
                      isActive
                        ? 'bg-primary/15 text-primary border border-primary/25 shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <item.icon className={cn('w-4 h-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span
                        className={cn(
                          'text-[9px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-wider',
                          item.badgeColor || (isActive ? 'bg-primary/20 text-primary border-primary/30' : 'bg-white/5 text-muted-foreground border-white/10')
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* Bottom footer status */}
        <div className="p-3 border-t border-white/8 bg-white/2">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground px-2">
            <span>Verified NFL Data</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Active
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
