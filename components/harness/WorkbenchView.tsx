'use client';

import {UI_COPY, type UiLocale} from '@/lib/harness/i18n';
import type {HarnessWorkspaceSnapshot} from '@/lib/harness/types';

interface WorkbenchViewProps {
  snapshot: HarnessWorkspaceSnapshot;
  onCompileFrame: () => void;
  onVerify: () => void;
  onStep: () => void;
  onReset: () => void;
  onOpenCompiler: () => void;
  busy: boolean;
  locale: UiLocale;
}

function decisionLabel(decision: string): {text: string; cls: string} {
  switch (decision) {
    case 'COMMIT_NEXT':
      return {text: 'COMMIT_NEXT', cls: 'text-emerald-700'};
    case 'RETRY_SURGICAL_DEBUG':
      return {text: 'RETRY_SURGICAL_DEBUG', cls: 'text-amber-700'};
    case 'ROLLBACK_AND_REWRITE':
      return {text: 'ROLLBACK_AND_REWRITE', cls: 'text-amber-800'};
    case 'WIDEN_1HOP_AND_ESCALATE_PRO':
      return {text: 'ESCALATE_PRO', cls: 'text-red-700'};
    case 'HALT_AND_REPORT_TO_SPEC':
      return {text: 'HALT_TO_SPEC', cls: 'text-red-700'};
    default:
      return {text: decision, cls: 'text-slate-700'};
  }
}

export function WorkbenchView({
  snapshot,
  onCompileFrame,
  onVerify,
  onStep,
  onReset,
  onOpenCompiler,
  busy,
  locale,
}: WorkbenchViewProps) {
  const t = UI_COPY[locale].workbench;
  const {
    spec,
    tasks,
    activeTaskId,
    targetFilePreview,
    testFilePreview,
    traces,
    lastFrame,
    deepseekConfigured,
  } = snapshot;
  const activeTask = tasks.find((task) => task.id === activeTaskId) ?? tasks[0];

  const passedCount = tasks.filter((task) => task.status === 'passed').length;
  const allPassed = passedCount === tasks.length && tasks.length > 0;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-slate-900 text-balance">
              {spec.title}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-mono">{spec.id}</span>
              <span aria-hidden="true">·</span>
              <span>
                {t.languagePrefix}: {spec.targetLanguage}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">
                {t.writablePrefix}: {activeTask.writeLock.editableRange.file}:
                {activeTask.writeLock.editableRange.startLine}-
                {activeTask.writeLock.editableRange.endLine}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {t.readOnlyLockPrefix}:{' '}
                {activeTask.writeLock.readOnlyFiles.join(', ') || t.noneText}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onCompileFrame}
              disabled={busy}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
            >
              {t.compileFrameBtn}
            </button>
            <button
              type="button"
              onClick={onVerify}
              disabled={busy}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
            >
              {t.verifyBtn}
            </button>
            <button
              type="button"
              onClick={onStep}
              disabled={busy || allPassed}
              className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 whitespace-nowrap"
            >
              {t.stepBtn}
            </button>
            <button
              type="button"
              onClick={onOpenCompiler}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              {t.inspectBtn}
            </button>
            <button
              type="button"
              onClick={onReset}
              disabled={busy}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
            >
              {t.resetBtn}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-5 border-t border-slate-100 pt-5 md:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold text-slate-700">
              {t.mappingTitle}
            </h2>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800">
              {spec.inputOutputSummary}
            </pre>
          </div>
          <div>
            <h2 className="text-xs font-semibold text-slate-700">
              {t.criteriaTitle}
            </h2>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-600">
              {spec.acceptanceCriteria.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4 text-xs text-slate-600">
          <span>
            {t.gatewayStatusLabel}:{' '}
            <strong className="font-mono text-slate-900">
              {deepseekConfigured ? t.gatewayReady : t.gatewayUnset}
            </strong>
          </span>
          <span className="font-mono text-slate-500 tabular-nums">
            {t.activeLabel}: {activeTask.id} · {t.adapterLabel}:{' '}
            {snapshot.adapters.modelAdapter}
          </span>
        </div>
      </section>

      <section
        aria-label={t.roleCeiling}
        className="grid grid-cols-2 gap-4 md:grid-cols-4"
      >
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">{t.roleCeiling}</div>
          <div className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
            {lastFrame ? `${lastFrame.budgetCeiling.toLocaleString()} tok` : '4,000 tok'}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">{t.compiledTokens}</div>
          <div className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
            {lastFrame ? `${lastFrame.totalTokens.toLocaleString()} tok` : '0 tok'}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">{t.staticHash}</div>
          <div className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
            {lastFrame ? lastFrame.staticHeadHash : '--------'}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">{t.dagProgress}</div>
          <div className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
            {passedCount} / {tasks.length}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">{t.logTitle}</h2>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            {traces.length} {t.roundsSuffix}
          </span>
        </div>

        {traces.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            {t.emptyLog}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-4 py-2.5 font-medium">{t.colRound}</th>
                  <th className="px-4 py-2.5 font-medium">{t.colTaskRole}</th>
                  <th className="px-4 py-2.5 font-medium">{t.colTier}</th>
                  <th className="px-4 py-2.5 font-medium text-right">
                    {t.colTokensCap}
                  </th>
                  <th className="px-4 py-2.5 font-medium">{t.colPrefixCache}</th>
                  <th className="px-4 py-2.5 font-medium">{t.colErrorHash}</th>
                  <th className="px-4 py-2.5 font-medium">{t.colDdiDecision}</th>
                  <th className="px-4 py-2.5 font-medium">{t.colSummary}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {traces.map((tr) => {
                  const dec = decisionLabel(tr.ddiDecision);
                  return (
                    <tr key={tr.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono text-slate-700 tabular-nums">
                        #{tr.round}
                      </td>
                      <td className="px-4 py-2.5 text-slate-900">
                        <span className="font-mono font-semibold">{tr.taskId}</span>
                        <span className="ml-1.5 text-slate-500">{tr.role}</span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-700">
                        {tr.modelTier === 'pro' ? 'Pro' : 'Flash-1017'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-900 tabular-nums">
                        {tr.frameTokens.toLocaleString()} /{' '}
                        {tr.budgetCeiling.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {tr.cacheHit ? t.cacheHit : t.cacheCold}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-600 tabular-nums">
                        {tr.errorHash ?? 'PASS'}
                      </td>
                      <td className={`px-4 py-2.5 font-mono font-medium ${dec.cls}`}>
                        {dec.text}
                      </td>
                      <td className="max-w-[320px] truncate px-4 py-2.5 text-slate-600">
                        {tr.summary}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h3 className="font-mono text-xs font-semibold text-slate-900">
              {activeTask.targetFile}
            </h3>
            <span className="text-xs text-slate-500">
              {t.writableLines} {activeTask.writeLock.editableRange.startLine}-
              {activeTask.writeLock.editableRange.endLine}
            </span>
          </div>
          <pre className="max-h-[300px] overflow-auto p-4 font-mono text-xs leading-relaxed text-slate-800">
            {targetFilePreview}
          </pre>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h3 className="font-mono text-xs font-semibold text-slate-900">
              {activeTask.testFile}
            </h3>
            <span className="text-xs text-slate-500">{t.readOnlyAssertions}</span>
          </div>
          <pre className="max-h-[300px] overflow-auto p-4 font-mono text-xs leading-relaxed text-slate-800">
            {testFilePreview}
          </pre>
        </div>
      </section>
    </div>
  );
}
