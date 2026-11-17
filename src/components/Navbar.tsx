import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { QrCode, LogOut, Menu, X, Settings, Bot } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

export type AppView = 'home' | 'studio' | 'tools' | 'image-tools' | 'privacy' | 'terms';

interface NavbarProps {
  user: User | null;
  hasDriveAccess: boolean;
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  onLogin: () => void;
  onLogout: () => void;
  onOpenSettings: () => void;
  isLoggingIn: boolean;
  isChatbotMinimized?: boolean;
  onRestoreChatbot?: () => void;
}

const NAV_ITEMS: { id: AppView; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'studio', label: 'Cover Studio' },
  { id: 'tools', label: 'PDF Tools' },
  { id: 'image-tools', label: 'Image Tools' },
];

export const Navbar: React.FC<NavbarProps> = ({
  user,
  hasDriveAccess,
  activeView,
  onNavigate,
  onLogin,
  onLogout,
  onOpenSettings,
  isLoggingIn,
  isChatbotMinimized = false,
  onRestoreChatbot,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isConnected = !!user && hasDriveAccess;

  const handleNavClick = (view: AppView) => {
    onNavigate(view);
    setMobileMenuOpen(false);
  };

  return (
    <header className="no-print sticky top-0 z-40 bg-white/95 dark:bg-[#09090b]/95 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800/90 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3 sm:gap-6">
        {/* Zone 1: Brand Wordmark + Minimized PaperLink AI Dock */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => handleNavClick('home')}
            className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight text-zinc-900 dark:text-white whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 rounded-lg py-1"
          >
            <span className="w-8 h-8 rounded-lg bg-yellow-400 text-black flex items-center justify-center">
              <QrCode className="w-5 h-5 stroke-[2.5]" />
            </span>
            <span>
              Paper<span className="text-amber-600 dark:text-yellow-400">Link</span>
            </span>
          </button>

          {isChatbotMinimized && (
            <button
              type="button"
              onClick={onRestoreChatbot}
              title="Restore PaperLink AI"
              aria-label="Restore PaperLink AI"
              className="p-[1.5px] rounded-xl bg-gradient-to-r from-cyan-400 via-yellow-400 to-blue-500 shadow-[0_0_14px_rgba(34,211,238,0.35)] hover:shadow-[0_0_20px_rgba(34,211,238,0.55)] transition-all cursor-pointer shrink-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-[10.5px] bg-white dark:bg-[#0c0c12] text-xs font-bold text-zinc-950 dark:text-white whitespace-nowrap">
                <Bot className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400 shrink-0" />
                <span className="hidden sm:inline">PaperLink AI</span>
                <span className="sm:hidden">AI</span>
              </span>
            </button>
          )}
        </div>

        {/* Zone 2: Clean Typography Nav Links */}
        <nav className="hidden md:flex items-center gap-5 lg:gap-7" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`relative py-1 text-sm font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 rounded ${
                  isActive
                    ? 'text-amber-600 dark:text-yellow-400 font-semibold'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[19px] h-[2px] bg-amber-500 dark:bg-yellow-400"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Connection Status + Install + Settings + Logout + Mobile Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton />

          <button
            type="button"
            onClick={isConnected ? undefined : onLogin}
            disabled={isLoggingIn}
            title={
              isConnected
                ? `Connected to Google Drive (${user?.email || 'Account'})`
                : 'Sign in with Google to connect Drive'
            }
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 ${
              isConnected
                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40 cursor-default'
                : 'bg-yellow-400 hover:bg-yellow-300 text-black border-yellow-400 font-bold cursor-pointer'
            }`}
          >
            <span
              aria-hidden="true"
              className={`w-2 h-2 rounded-full shrink-0 ${
                isConnected ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-red-600'
              }`}
            />
            <span>
              {isConnected
                ? 'Drive Connected'
                : isLoggingIn
                ? 'Connecting...'
                : 'Connect Drive'}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            title="Settings (Dark/Light mode, text size & tutorial)"
            aria-label="Workspace settings"
            className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
          >
            <Settings className="w-4 h-4" />
          </button>

          {user && (
            <button
              type="button"
              onClick={onLogout}
              title={`Sign out (${user.email || 'Google account'})`}
              className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}

          {/* Mobile Menu Trigger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="md:hidden p-2 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white border border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-100 dark:bg-zinc-900 cursor-pointer"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Collapsible Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#0c0c0f] px-4 py-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-yellow-400 text-black font-bold'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-950 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
};
