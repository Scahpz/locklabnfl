import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import MobileHeader from './MobileHeader';
import MobileNavDrawer from './MobileNavDrawer';
import MiniParlayBar from './MiniParlayBar';
import { cn } from '@/lib/utils';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      </div>

      {/* Mobile Header with hamburger trigger */}
      <MobileHeader onOpenMenu={() => setMobileMenuOpen(true)} />

      {/* Mobile Navigation Drawer giving 100% full access to all pages */}
      <MobileNavDrawer isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

      {/* Main Content with top and bottom safe area padding */}
      <main className={cn(
        "transition-all duration-300 mobile-scroll-pad md:pb-6 pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-0",
        collapsed ? "md:ml-16" : "md:ml-60"
      )}>
        <div className="p-4 md:p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Mobile Nav with More menu trigger */}
      <MobileNav onOpenMenu={() => setMobileMenuOpen(true)} />

      {/* Mini Parlay Bar */}
      <MiniParlayBar />
    </div>
  );
}