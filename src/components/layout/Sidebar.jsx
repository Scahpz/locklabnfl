import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { TrendingUp, Zap, Layers, Bell, User, GitCompare, Activity, ChevronLeft, ChevronRight, Sparkles, Search, ClipboardList, Trophy } from 'lucide-react';
import logo from '@/assets/logo.svg';

const navItems = [
  { path: '/', label: 'Props', icon: Zap },
  { path: '/ai-picks', label: 'AI Picks', icon: Sparkles },
  { path: '/trends', label: 'Streaks & Trends', icon: TrendingUp },
  { path: '/compare', label: 'Compare', icon: GitCompare },
  { path: '/start-sit', label: 'Start/Sit', icon: Trophy },
  { path: '/odds', label: 'Live Odds', icon: Activity },
  { path: '/parlay', label: 'Parlay Builder', icon: Layers },
  { path: '/history', label: 'Prop History', icon: ClipboardList },
  { path: '/alerts', label: 'Alerts', icon: Bell },
  { path: '/profile', label: 'Profile', icon: User },
];

export default function Sidebar({ collapsed, setCollapsed }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    navigate(`/trends?player=${encodeURIComponent(q)}`);
    setSearch('');
  };

  return (
    <aside className={cn(
      "fixed left-0 top-0 h-full z-40 flex flex-col transition-all duration-300",
      "bg-[hsl(222,47%,7%)] border-r border-white/5",
      collapsed ? "w-[68px]" : "w-[220px]"
    )}>
      {/* Logo */}
      <div className={cn(
        "flex items-center gap-3 border-b border-white/5 flex-shrink-0",
        collapsed ? "justify-center p-4" : "px-5 py-4"
      )}>
        <img src={logo} alt="LockLab NFL" className="w-8 h-8 object-contain flex-shrink-0" />
        {!collapsed && (
          <div>
            <p className="text-sm font-bold text-foreground tracking-tight leading-none">LockLab<span className="text-primary">NFL</span></p>
            <p className="text-[10px] text-muted-foreground mt-0.5 tracking-widest uppercase">Analytics</p>
          </div>
        )}
      </div>

      {/* Search */}
      {!collapsed && (
        <form onSubmit={handleSearch} className="px-3 py-2 border-b border-white/5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search player…"
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
            />
          </div>
        </form>
      )}

      {/* Nav */}
      <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-xl transition-all duration-200 group",
                collapsed ? "justify-center p-3" : "px-3 py-2.5",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />
              )}
              <item.icon className={cn("w-[18px] h-[18px] flex-shrink-0", isActive && "text-primary")} />
              {!collapsed && (
                <span className="text-[13px] font-medium truncate">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          "flex items-center border-t border-white/5 text-muted-foreground hover:text-foreground transition-colors",
          collapsed ? "justify-center p-4" : "gap-2 px-4 py-3"
        )}
      >
        {collapsed
          ? <ChevronRight className="w-4 h-4" />
          : <><ChevronLeft className="w-4 h-4" /><span className="text-xs">Collapse</span></>
        }
      </button>
    </aside>
  );
}
