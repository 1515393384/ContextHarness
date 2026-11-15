'use client';

import {UI_COPY, type UiLocale} from '@/lib/harness/i18n';
import type {AtomicTask, SpecDocument, TargetLanguage} from '@/lib/harness/types';

export interface PlanFormValues {
  prompt: string;
  targetLanguage: TargetLanguage;
  targetFile: string;
  targetSymbol: string;
  contractFile: string;
  testFile: string;
  startLine: number;
  endLine: number;
}

interface RequirementSidebarProps {
  form: PlanFormValues;
  onChangeForm: (patch: Partial<PlanFormValues>) => void;
  onPlanRequirement: () => void;
  spec: SpecDocument;
  tasks: AtomicTask[];
  activeTaskId: string;
  onSelectTask: (taskId: string) => void;
  busy: boolean;
  locale: UiLocale;
}

function formatStatusText(
  status: AtomicTask['status'],
  locale: UiLocale,
): {
  text: string;
  colorClass: string;
} {
  const s = UI_COPY[locale].sidebar;
  switch (status) {
    case 'passed':
      return {text: s.statusPassed, colorClass: 'text-emerald-700'};
    case 'in_progress':
      return {text: s.statusDebugging, colorClass: 'text-amber-700'};
    case 'halted':
      return {text: s.statusHalted, colorClass: 'text-red-700'};
    default:
      return {text: s.statusPending, colorClass: 'text-slate-500'};
  }
}

export function RequirementSidebar({
  form,
  onChangeForm,
  onPlanRequirement,
  spec,
  tasks,
  activeTaskId,
  onSelectTask,
  busy,
  locale,
}: RequirementSidebarProps) {
  const t = UI_COPY[locale].sidebar;
  return (
    <aside className="w-full shrink-0 border-b border-slate-200 bg-white lg:w-[320px] lg:border-b-0 lg:border-r">
      <div className="p-5">
        <h2 className="text-base font-semibold text-slate-900">
          {t.intakeTitle}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          {t.intakeDesc}
        </p>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onPlanRequirement();
          }}
        >
          <div>
            <label
              htmlFor="requirement-prompt"
              className="block text-xs font-medium text-slate-700"
            >
              {t.promptLabel}
            </label>
            <textarea
              id="requirement-prompt"
              rows={3}
              value={form.prompt}
              onChange={(e) => onChangeForm({prompt: e.target.value})}
              placeholder={t.promptPlaceholder}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label
                htmlFor="target-language"
                className="block text-xs font-medium text-slate-700"
              >
                {t.languageLabel}
              </label>
              <select
                id="target-language"
                value={form.targetLanguage}
                onChange={(e) =>
                  onChangeForm({
                    targetLanguage: e.target.value as TargetLanguage,
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
              >
                <option value="typescript">TypeScript</option>
                <option value="rust">Rust</option>
                <option value="python">Python</option>
                <option value="go">Go</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="target-symbol"
                className="block text-xs font-medium text-slate-700"
              >
                {t.symbolLabel}
              </label>
              <input
                id="target-symbol"
                type="text"
                value={form.targetSymbol}
                onChange={(e) => onChangeForm({targetSymbol: e.target.value})}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="target-file"
              className="block text-xs font-medium text-slate-700"
            >
              {t.targetFileLabel}
            </label>
            <input
              id="target-file"
              type="text"
              value={form.targetFile}
              onChange={(e) => onChangeForm({targetFile: e.target.value})}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label
                htmlFor="start-line"
                className="block text-xs font-medium text-slate-700"
              >
                {t.startLineLabel}
              </label>
              <input
                id="start-line"
                type="number"
                min={1}
                value={form.startLine}
                onChange={(e) =>
                  onChangeForm({startLine: Number(e.target.value) || 1})
                }
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 tabular-nums focus:border-slate-900 focus:bg-white focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="end-line"
                className="block text-xs font-medium text-slate-700"
              >
                {t.endLineLabel}
              </label>
              <input
                id="end-line"
                type="number"
                min={1}
                value={form.endLine}
                onChange={(e) =>
                  onChangeForm({endLine: Number(e.target.value) || 1})
                }
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 tabular-nums focus:border-slate-900 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="contract-file"
              className="block text-xs font-medium text-slate-700"
            >
              {t.contractFileLabel}
            </label>
            <input
              id="contract-file"
              type="text"
              value={form.contractFile}
              onChange={(e) => onChangeForm({contractFile: e.target.value})}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="test-file"
              className="block text-xs font-medium text-slate-700"
            >
              {t.testFileLabel}
            </label>
            <input
              id="test-file"
              type="text"
              value={form.testFile}
              onChange={(e) => onChangeForm({testFile: e.target.value})}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={busy || !form.prompt.trim()}
            className="w-full rounded-lg border border-slate-900 bg-white px-4 py-2 text-xs font-semibold text-slate-900 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
          >
            {t.buildDagBtn}
          </button>
        </form>
      </div>

      <div className="border-t border-slate-200 p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            {t.dagTitle}
          </h3>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            {tasks.filter((t) => t.status === 'passed').length}/{tasks.length}
          </span>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {spec.id} · {spec.targetLanguage}
        </div>

        <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
          {tasks.map((task) => {
            const isSelected = task.id === activeTaskId;
            const st = formatStatusText(task.status, locale);
            return (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => onSelectTask(task.id)}
                  className={`w-full px-2.5 py-2.5 text-left transition-colors ${
                    isSelected ? 'bg-slate-100' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-semibold text-slate-900">
                      {task.id}
                    </span>
                    <span className={`font-medium ${st.colorClass}`}>
                      {st.text}
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-medium text-slate-800">
                    {task.title}
                  </div>
                  <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-slate-500 tabular-nums">
                    <span>{task.activeModelTier === 'pro' ? 'Pro' : 'Flash-1017'}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {t.attemptsLabel} {task.attempts}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
