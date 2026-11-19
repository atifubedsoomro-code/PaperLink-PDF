import React, { useState } from 'react';
import { COVER_THEMES } from '../constants/themes';
import { CoverTheme } from '../types';
import { Check } from 'lucide-react';

interface ThemeSelectorProps {
  selectedThemeId: string;
  onSelectTheme: (theme: CoverTheme) => void;
}

const PlainThumb: React.FC<{ theme: CoverTheme }> = ({ theme }) => {
  const ink = theme.isDark ? '#ffffff' : theme.primaryColor;
  const centered = theme.layoutStyle === 'plain-centered' || theme.layoutStyle === 'card-centered';
  const leftBar = theme.layoutStyle === 'plain-left-bar';

  return (
    <div className="absolute inset-0" style={{ backgroundColor: theme.backgroundColor }}>
      {theme.layoutStyle === 'plain-rule' && (
        <>
          <div className="absolute top-2 inset-x-3 h-0.5" style={{ backgroundColor: theme.primaryColor }} />
          <div className="absolute bottom-2 inset-x-3 h-px" style={{ backgroundColor: theme.accentColor }} />
        </>
      )}
      {leftBar && <div className="absolute left-0 inset-y-0 w-2" style={{ backgroundColor: theme.primaryColor }} />}

      <div
        className={`absolute top-7 flex flex-col gap-1.5 ${
          centered ? 'inset-x-4 items-center' : leftBar ? 'left-5 right-4 items-start' : 'inset-x-4 items-start'
        }`}
      >
        <div className="h-1.5 w-3/4 rounded-sm" style={{ backgroundColor: ink }} />
        <div className="h-1 w-1/2 rounded-sm" style={{ backgroundColor: theme.accentColor }} />
        <div className="h-0.5 w-6 rounded-full mt-0.5" style={{ backgroundColor: theme.accentColor }} />
      </div>

      <div
        className="absolute bottom-3.5 right-3 w-5 h-5 rounded-sm border"
        style={{ borderColor: ink, opacity: 0.5 }}
      />
      <span
        className="absolute bottom-3.5 left-4 text-[8px] font-bold uppercase tracking-wider"
        style={{ color: ink, opacity: 0.6 }}
      >
        Plain print
      </span>
    </div>
  );
};

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  selectedThemeId,
  onSelectTheme,
}) => {
  const [filterCategory, setFilterCategory] = useState<string>('All');

  const categories = ['All', 'Plain', 'Corporate', 'Minimalist', 'Modern', 'Creative', 'Academic', 'Luxury', 'Editorial'];

  const filteredThemes =
    filterCategory === 'All'
      ? COVER_THEMES
      : COVER_THEMES.filter((t) => t.category === filterCategory);

  return (
    <div className="bg-white dark:bg-[#121215] rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-yellow-400/15 text-amber-700 dark:text-yellow-400 border border-yellow-400/30">
              Step 2
            </span>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              Pick a Cover Look
            </h3>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 tabular-nums">
            {COVER_THEMES.length} ready-to-print styles, including clean ink-friendly plain sheets
          </p>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCategory(cat)}
              className={`px-2.5 py-1 text-xs rounded-lg whitespace-nowrap transition-all cursor-pointer ${
                filterCategory === cat
                  ? 'bg-yellow-400 text-black font-bold shadow-xs'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white border border-zinc-200 dark:border-zinc-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {filteredThemes.map((theme) => {
          const isSelected = theme.id === selectedThemeId;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => onSelectTheme(theme)}
              className={`group text-left rounded-xl p-3 border transition-all duration-150 relative overflow-hidden flex flex-col justify-between cursor-pointer hover:-translate-y-0.5 ${
                isSelected
                  ? 'border-yellow-400 bg-yellow-400/10 ring-1 ring-yellow-400/40'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 bg-zinc-50 dark:bg-zinc-950/60'
              }`}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-yellow-400 text-black flex items-center justify-center">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              )}

              <div
                className="w-full h-24 rounded-lg overflow-hidden relative mb-2.5 border border-zinc-200 dark:border-zinc-800"
                style={{ backgroundColor: theme.backgroundColor }}
              >
                {theme.defaultImage ? (
                  <>
                    <img
                      src={theme.defaultImage}
                      alt={theme.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 opacity-85"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent flex flex-col justify-end p-2 text-white">
                      <span className="text-[10px] font-bold tracking-tight text-white/95 uppercase truncate">
                        {theme.category}
                      </span>
                    </div>
                  </>
                ) : (
                  <PlainThumb theme={theme} />
                )}
              </div>

              <div>
                <h4 className="font-bold text-xs text-zinc-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-yellow-400 transition-colors line-clamp-1">
                  {theme.name}
                </h4>
                <p className="text-[10px] text-zinc-600 dark:text-zinc-400 line-clamp-1 mt-0.5">
                  {theme.description}
                </p>
              </div>

              <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <span
                  className="w-3 h-3 rounded-full border border-zinc-300 dark:border-black"
                  style={{ backgroundColor: theme.primaryColor }}
                />
                <span
                  className="w-3 h-3 rounded-full border border-zinc-300 dark:border-black"
                  style={{ backgroundColor: theme.accentColor }}
                />
                <span
                  className="w-3 h-3 rounded-full border border-zinc-300 dark:border-zinc-700"
                  style={{ backgroundColor: theme.backgroundColor }}
                />
                <span className="text-[10px] text-zinc-500 font-mono ml-auto uppercase">
                  {theme.defaultFont}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
