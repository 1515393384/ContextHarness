'use client';

import {UI_COPY, type UiLocale} from '@/lib/harness/i18n';

export type ActiveTab = 'chat' | 'workbench' | 'compiler' | 'architecture';

interface TopNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onRunLoop: () => void;
  busy: boolean;
  allPassed: boolean;
  locale: UiLocale;
  onToggleLocale: () => void;
}

export function TopNav({
  activeTab,
  onSelectTab,
  onRunLoop,
  busy,
  allPassed,
  locale,
  onToggleLocale,
}: TopNavProps) {
  const t = UI_COPY[locale].nav;
  const tabs: Array<{id: ActiveTab; label: string}> = [
    {id: 'chat', label: t.chat},
    {id: 'workbench', label: t.workbench},
    {id: 'compiler', label: t.compiler},
    {id: 'architecture', label: t.architecture},
  ];

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-3.5">
        <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          ContextHarness
        </span>

        <nav
          aria-label="Primary Navigation"
          className="flex items-center gap-6 overflow-x-auto"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`border-b-2 py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-900 ${
                  isActive
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onToggleLocale}
            aria-label={locale === 'en' ? 'Switch UI to Chinese' : 'Switch UI to English'}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            {t.switchLabel}
          </button>
          <button
            type="button"
            onClick={onRunLoop}
            disabled={busy || allPassed}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            {busy ? t.running : allPassed ? t.allPassed : t.runLoop}
          </button>
        </div>
      </div>
    </header>
  );
}
