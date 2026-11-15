'use client';

import {useEffect, useState} from 'react';
import {ArchitecturePortsView} from '@/components/harness/ArchitecturePortsView';
import {CompilerInspectorView} from '@/components/harness/CompilerInspectorView';
import {
  RequirementSidebar,
  type PlanFormValues,
} from '@/components/harness/RequirementSidebar';
import {TopNav, type ActiveTab} from '@/components/harness/TopNav';
import {WorkbenchView} from '@/components/harness/WorkbenchView';
import {UI_COPY, type UiLocale} from '@/lib/harness/i18n';
import type {
  AdapterProfile,
  HarnessWorkspaceSnapshot,
} from '@/lib/harness/types';

export default function HomePage() {
  const [snapshot, setSnapshot] = useState<HarnessWorkspaceSnapshot | null>(
    null,
  );
  const [form, setForm] = useState<PlanFormValues>({
    prompt: '',
    targetLanguage: 'typescript',
    targetFile: 'lib/harness/core/token-budget.ts',
    targetSymbol: 'truncateToTokenBudget',
    contractFile: 'lib/harness/types.ts',
    testFile: 'lib/harness/core/harness.test.ts',
    startLine: 32,
    endLine: 83,
  });
  const [activeTab, setActiveTab] = useState<ActiveTab>('workbench');
  const [locale, setLocale] = useState<UiLocale>('en');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const t = UI_COPY[locale];

  useEffect(() => {
    let mounted = true;
    fetch('/api/harness')
      .then((res) => res.json())
      .then(
        (data: {
          ok: boolean;
          snapshot?: HarnessWorkspaceSnapshot;
          error?: string;
        }) => {
          if (!mounted) return;
          if (data.ok && data.snapshot) {
            setSnapshot(data.snapshot);
            const active =
              data.snapshot.tasks.find(
                (t) => t.id === data.snapshot!.activeTaskId,
              ) ?? data.snapshot.tasks[data.snapshot.tasks.length - 1];
            setForm({
              prompt: data.snapshot.spec.userPrompt,
              targetLanguage: data.snapshot.spec.targetLanguage,
              targetFile:
                active?.writeLock.editableRange.file ??
                'lib/harness/core/token-budget.ts',
              targetSymbol: active?.targetSymbol ?? 'truncateToTokenBudget',
              contractFile: active?.contractFile ?? 'lib/harness/types.ts',
              testFile:
                active?.testFile ?? 'lib/harness/core/harness.test.ts',
              startLine: active?.writeLock.editableRange.startLine ?? 32,
              endLine: active?.writeLock.editableRange.endLine ?? 83,
            });
          } else {
            setErrorMsg(data.error ?? 'Failed to load workspace snapshot.');
          }
        },
      )
      .catch((err) => {
        if (!mounted) return;
        setErrorMsg(err instanceof Error ? err.message : 'Network error.');
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function postAction(payload: Record<string, unknown>) {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/harness', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok: boolean;
        snapshot?: HarnessWorkspaceSnapshot;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.snapshot) {
        setErrorMsg(data.error ?? 'Operation failed.');
        return;
      }
      setSnapshot(data.snapshot);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  }

  const allPassed = Boolean(
    snapshot &&
      snapshot.tasks.length > 0 &&
      snapshot.tasks.every((t) => t.status === 'passed'),
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <TopNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onRunLoop={() => postAction({action: 'run_loop'})}
        busy={busy || !snapshot}
        allPassed={allPassed}
        locale={locale}
        onToggleLocale={() => setLocale((prev) => (prev === 'en' ? 'zh' : 'en'))}
      />

      {errorMsg && (
        <div role="alert" className="mx-auto mt-4 max-w-[1440px] px-6">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="font-medium text-red-900 underline whitespace-nowrap"
            >
              {t.dismiss}
            </button>
          </div>
        </div>
      )}

      {!snapshot ? (
        <main className="mx-auto max-w-[1440px] px-6 py-8">
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-sm text-slate-500">
            {t.loading}
          </div>
        </main>
      ) : (
        <div className="mx-auto flex max-w-[1440px] flex-col lg:flex-row">
          <RequirementSidebar
            form={form}
            onChangeForm={(patch) => setForm((prev) => ({...prev, ...patch}))}
            onPlanRequirement={() =>
              postAction({
                action: 'plan',
                prompt: form.prompt,
                targetLanguage: form.targetLanguage,
                targetFile: form.targetFile,
                targetSymbol: form.targetSymbol,
                contractFile: form.contractFile,
                testFile: form.testFile,
                startLine: form.startLine,
                endLine: form.endLine,
              })
            }
            spec={snapshot.spec}
            tasks={snapshot.tasks}
            activeTaskId={snapshot.activeTaskId}
            onSelectTask={(taskId) =>
              postAction({action: 'select_task', taskId})
            }
            busy={busy}
            locale={locale}
          />

          <main className="min-w-0 flex-1 p-6">
            {activeTab === 'workbench' && (
              <WorkbenchView
                snapshot={snapshot}
                onCompileFrame={() => postAction({action: 'compile_frame'})}
                onVerify={() => postAction({action: 'verify'})}
                onStep={() => postAction({action: 'step'})}
                onReset={() => postAction({action: 'reset'})}
                onOpenCompiler={() => setActiveTab('compiler')}
                busy={busy}
                locale={locale}
              />
            )}

            {activeTab === 'compiler' && (
              <CompilerInspectorView frame={snapshot.lastFrame} locale={locale} />
            )}

            {activeTab === 'architecture' && (
              <ArchitecturePortsView
                snapshot={snapshot}
                onUpdateAdapters={(adapters: Partial<AdapterProfile>) =>
                  postAction({action: 'update_adapters', adapters})
                }
                busy={busy}
                locale={locale}
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}
