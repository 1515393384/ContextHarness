'use client';

export type ActiveTab = 'workbench' | 'compiler' | 'architecture';

interface TopNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onRunLoop: () => void;
  busy: boolean;
  allPassed: boolean;
}

export function TopNav({
  activeTab,
  onSelectTab,
  onRunLoop,
  busy,
  allPassed,
}: TopNavProps) {
  const tabs: Array<{id: ActiveTab; label: string}> = [
    {id: 'workbench', label: 'Workbench'},
    {id: 'compiler', label: '4-Slot Compiler'},
    {id: 'architecture', label: 'Ports & Adapters'},
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

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onRunLoop}
            disabled={busy || allPassed}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            {busy ? 'Running...' : allPassed ? 'All Tasks Passed' : 'Run Closed Loop'}
          </button>
        </div>
      </div>
    </header>
  );
}
