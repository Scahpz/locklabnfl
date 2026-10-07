import React, { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';

// Active tab lives in ?tab= so tabs are linkable and old routes can redirect
// straight to one (e.g. /compare → /start-sit?tab=compare).
export function useTabParam(defaultKey, validKeys) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab = validKeys.includes(raw) ? raw : defaultKey;
  const setTab = useCallback(key => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      if (key === defaultKey) next.delete('tab'); else next.set('tab', key);
      return next;
    }, { replace: true });
  }, [setParams, defaultKey]);
  return [tab, setTab];
}

// Segmented control. Fills the width on phones so every tab is an easy tap
// target; scrolls sideways instead of wrapping when there are many tabs.
export default function PageTabs({ tabs, value, onChange, className }) {
  // Many tabs on a phone: drop icons and use `short` labels so they all fit.
  const crowded = tabs.length > 3;
  return (
    <div
      className={cn('flex gap-1 bg-white/4 border border-white/6 rounded-2xl p-1 overflow-x-auto', className)}
      style={{ scrollbarWidth: 'none' }}
      role="tablist"
    >
      {tabs.map(({ key, label, short, icon: Icon, count }) => {
        const active = value === key;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={cn(
              'flex-1 min-w-fit flex items-center justify-center gap-1.5 py-2 font-semibold rounded-xl whitespace-nowrap transition-all',
              crowded ? 'px-2 sm:px-3 text-[12px] sm:text-[13px]' : 'px-3 text-[13px]',
              active
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'text-muted-foreground hover:text-foreground border border-transparent',
            )}
          >
            {Icon && <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', crowded && 'hidden sm:block')} />}
            {short ? <><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span></> : label}
            {count != null && (
              <span className={cn('text-[10px] tabular-nums', active ? 'text-primary/80' : 'text-muted-foreground/60')}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
