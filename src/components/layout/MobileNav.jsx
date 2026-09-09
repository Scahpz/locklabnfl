import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { TrendingUp, Zap, Activity, Layers, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', label: 'Props', icon: Zap },
  { path: '/start-sit', label: 'Start/Sit', icon: Trophy },
  { path: '/trends', label: 'Trends', icon: TrendingUp },
  { path: '/odds', label: 'Odds', icon: Activity },
  { path: '/parlay', label: 'Parlay', icon: Layers },
];

export default function MobileNav() {
  const location = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-3 mb-2 bg-[hsl(222,47%,10%)] border border-white/8 rounded-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.4)] overflow-hidden">
        <div className="flex items-stretch px-1 py-1">
          {navItems.map(({ path, label, icon: Icon }) => {
            const active = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-1 py-2 rounded-xl transition-all duration-200',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground'
                )}
              >
                <Icon className={cn('w-5 h-5', active && 'text-primary')} />
                <span className={cn('text-[10px] font-semibold leading-none tracking-wide', active ? 'text-primary' : 'text-muted-foreground/70')}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
