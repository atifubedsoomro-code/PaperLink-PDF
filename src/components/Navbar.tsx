import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { QrCode, LogOut, Menu, X, Settings, Bot } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { PWAInstallButton } from './PWAInstallButton';
import { MiniAiRobot } from './MiniAiRobot';

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
  showMiniRobot?: boolean;
}

const NAV_ITEMS: { id: AppView; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'studio', label: 'Cover Studio' },
  { id: 'tools', label: 'PDF & Office' },
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
  showMiniRobot = true,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [googleBtnHovered, setGoogleBtnHovered] = useState(false);
  const [aiPillHovered, setAiPillHovered] = useState(false);
  const isConnected = !!user && hasDriveAccess;

  const handleNavClick = (view: AppView) => {
    onNavigate(view);
    setMobileMenuOpen(false);
  };

  return (
    <header className="no-print sticky top-0 z-40 bg-white/88 dark:bg-[#09090b]/88 backdrop-blur-xl backdrop-saturate-[165%] border-b border-zinc-200/90 dark:border-zinc-800/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3 sm:gap-6">
        {/* Zone 1: Brand Wordmark + Minimized PaperLink AI Dock */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            data-paperlink-brand-anchor="true"
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

          <AnimatePresence>
            {isChatbotMinimized && (
              <div
                key="navbar-minimized-ai-group"
                onMouseEnter={() => setAiPillHovered(true)}
                onMouseLeave={() => setAiPillHovered(false)}
                className="relative inline-flex items-center shrink-0"
              >
                <motion.button
                  type="button"
                  data-paperlink-minimized-btn="true"
                  onClick={onRestoreChatbot}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.14 } }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  title={
                    activeView === 'studio'
                      ? 'PaperLink AI is in the top bar — click to open assistant'
                      : 'Open PaperLink AI assistant'
                  }
                  aria-label="Open PaperLink AI assistant"
                  className={`relative z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-xl backdrop-saturate-[180%] border text-xs font-bold transition-colors cursor-pointer shrink-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 ${
                    activeView === 'studio'
                      ? 'bg-yellow-400/28 dark:bg-yellow-400/20 hover:bg-yellow-400/40 border-yellow-400/80 dark:border-yellow-400/50 text-zinc-950 dark:text-yellow-100 shadow-[0_0_16px_rgba(250,204,21,0.28),inset_0_1px_0_rgba(255,255,255,0.85)]'
                      : 'bg-yellow-400/20 dark:bg-yellow-400/[0.14] hover:bg-yellow-400/35 dark:hover:bg-yellow-400/[0.24] border-yellow-400/65 dark:border-yellow-400/35 text-zinc-950 dark:text-yellow-100 shadow-[0_4px_14px_rgba(250,204,21,0.22),inset_0_1px_0_rgba(255,255,255,0.85)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.2)]'
                  }`}
                >
                  <Bot className="w-3.5 h-3.5 text-amber-600 dark:text-yellow-400 shrink-0" />
                  <span className="hidden sm:inline whitespace-nowrap">PaperLink AI</span>
                  <span className="sm:hidden">AI</span>
                </motion.button>

                {showMiniRobot && (
                  <div className="relative z-0 flex items-center">
                    <MiniAiRobot
                      isHovered={aiPillHovered}
                      onClick={onRestoreChatbot}
                      title="Open PaperLink AI"
                    />
                  </div>
                )}
              </div>
            )}
          </AnimatePresence>
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
                  <motion.span
                    layoutId="paperlinkNavUnderline"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[19px] h-[2px] bg-amber-500 dark:bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.55)]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Connection Status + Install + Settings + Logout + Mobile Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton />

          {isConnected ? (
            <div
              title={`Connected to Google Drive (${user?.email || 'Account'})`}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 bg-emerald-50/90 dark:bg-emerald-950/50 backdrop-blur-md text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/40"
            >
              <span aria-hidden="true" className="w-2 h-2 rounded-full shrink-0 bg-emerald-500 dark:bg-emerald-400" />
              <span>Drive Connected</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={onLogin}
              disabled={isLoggingIn}
              onMouseEnter={() => setGoogleBtnHovered(true)}
              onMouseLeave={() => setGoogleBtnHovered(false)}
              onFocus={() => setGoogleBtnHovered(true)}
              onBlur={() => setGoogleBtnHovered(false)}
              aria-label="Sign in with Google to upload documents on your Drive"
              title="Sign in with Google — To Upload Documents on your Drive"
              className={`group relative inline-flex items-center overflow-hidden border transition-all duration-200 cursor-pointer shrink-0 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 ${
                googleBtnHovered || isLoggingIn
                  ? 'h-10 px-3 rounded-xl gap-2.5 bg-white dark:bg-zinc-900 border-yellow-400/85 dark:border-yellow-400/60 shadow-[0_6px_18px_-4px_rgba(250,204,21,0.32)]'
                  : 'w-9 h-9 justify-center rounded-full bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 hover:border-yellow-400/80 shadow-xs'
              }`}
            >
              {/* Google Multi-Color "G" Emblem */}
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="w-4 h-4 shrink-0"
              >
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-8.97Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>

              {(googleBtnHovered || isLoggingIn) && (
                <span className="flex flex-col items-start text-left leading-tight whitespace-nowrap pr-0.5">
                  <span className="text-[11px] font-bold text-zinc-900 dark:text-white">
                    {isLoggingIn ? 'Connecting...' : 'Sign in with Google'}
                  </span>
                  <span className="text-[9px] font-medium text-zinc-500 dark:text-zinc-400">
                    To Upload Documents on your Drive
                  </span>
                </span>
              )}
            </button>
          )}

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
