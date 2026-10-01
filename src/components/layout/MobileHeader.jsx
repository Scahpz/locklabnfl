import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, Sparkles, Bell, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import logo from '@/assets/logo.png';

export default function MobileHeader({ onOpenMenu }) {
  const location = useLocation();

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 md:hidden bg-[hsl(218,58%,4%)] backdrop-blur-xl border-b border-white/5"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center justify-between px-3 h-14">
        {/* Left: Menu Hamburger + Logo */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenMenu}
            aria-label="Open navigation menu"
            className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-foreground transition-colors active:scale-95"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="LockLab NFL" className="w-7 h-7 object-contain" />
            <span className="text-[15px] font-bold text-foreground tracking-tight">
              LockLab<span className="text-primary">NFL</span>
            </span>
          </Link>
        </div>

        {/* Right: Quick actions */}
        <div className="flex items-center gap-1.5">
          <Link
            to="/ai-picks"
            className={cn(
              'px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-all border',
              location.pathname === '/ai-picks'
                ? 'bg-primary/20 text-primary border-primary/40'
                : 'bg-primary/10 text-primary/90 border-primary/20 hover:bg-primary/20'
            )}
          >
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>AI Picks</span>
          </Link>
          <Link
            to="/alerts"
            aria-label="Alerts"
            className={cn(
              'w-8 h-8 rounded-xl flex items-center justify-center transition-all',
              location.pathname === '/alerts'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            )}
          >
            <Bell className="w-4 h-4" />
          </Link>
          <Link
            to="/profile"
            aria-label="Profile"
            className={cn(
              'w-8 h-8 rounded-xl flex items-center justify-center transition-all',
              location.pathname === '/profile'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            )}
          >
            <User className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
