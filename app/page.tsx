'use client';

import {useEffect, useState} from 'react';
import {ArchitecturePortsView} from '@/components/harness/ArchitecturePortsView';
import {ChatWorkspaceView} from '@/components/harness/ChatWorkspaceView';
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
  ChatStepAction,
  HarnessStreamEvent,
  HarnessWorkspaceSnapshot,
  ModelTier,
} from '@/lib/harness/types';

export interface LiveChatStreamState {
  step: number;
  maxSteps: number;
  modelTier: ModelTier;
  frameTokens: number;
  budgetCeiling: number;
  staticHeadHash: string;
  cacheHitTokens: number;
  streamChars: number;
  streamTail: string;
  actions: ChatStepAction[];
  statusLine: string;
}

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
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat');
  const [locale, setLocale] = useState<UiLocale>('en');
  const [busy, setBusy] = useState(false);
  const [liveStream, setLiveStream] = useState<LiveChatStreamState | null>(null);
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

  async function postAction(payload: Record<string, unknown>): Promise<boolean> {
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
        return false;
      }
      setSnapshot(data.snapshot);
      return true;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Request failed.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function readChatFile(filePath: string): Promise<string | null> {
    setErrorMsg(null);
    try {
      const res = await fetch('/api/harness', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'read_chat_file', filePath}),
      });
      const data = (await res.json()) as {
        ok: boolean;
        fileContent?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error ?? 'Failed to read file.');
        return null;
      }
      return data.fileContent ?? '';
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to read file.');
      return null;
    }
  }

  async function streamChatMessage(
    message: string,
    modelTier: ModelTier,
  ): Promise<boolean> {
    setBusy(true);
    setErrorMsg(null);
    setLiveStream({
      step: 1,
      maxSteps: 14,
      modelTier,
      frameTokens: 0,
      budgetCeiling: modelTier === 'pro' ? 8000 : 6000,
      staticHeadHash: '--------',
      cacheHitTokens: 0,
      streamChars: 0,
      streamTail: '',
      actions: [],
      statusLine: 'Compiling 4-Slot frame...',
    });

    try {
      const res = await fetch('/api/harness/stream', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({message, modelTier}),
      });

      if (res.ok === false || !res.body) {
        const errData = (await res.json().catch(() => ({}))) as {error?: string};
        setErrorMsg(errData.error ?? 'Streaming request failed.');
        return false;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let succeeded = false;

      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        buf += decoder.decode(value, {stream: true});
        const events = buf.split('\n\n');
        buf = events.pop() ?? '';

        for (const rawEv of events) {
          const line = rawEv
            .split('\n')
            .find((l) => l.startsWith('data:'));
          if (!line) continue;
          try {
            const ev = JSON.parse(line.slice(5).trim()) as
              | HarnessStreamEvent
              | {type: 'done'; snapshot: HarnessWorkspaceSnapshot}
              | {type: 'error'; message: string};

            if (ev.type === 'step_start') {
              setLiveStream((prev) => ({
                step: ev.step,
                maxSteps: ev.maxSteps,
                modelTier: ev.modelTier,
                frameTokens: ev.frameTokens,
                budgetCeiling: ev.budgetCeiling,
                staticHeadHash: ev.staticHeadHash,
                cacheHitTokens: ev.cacheHitTokens,
                streamChars: 0,
                streamTail: '',
                actions: prev?.actions ?? [],
                statusLine: `Step ${ev.step}/${ev.maxSteps}: waiting for ${ev.modelTier} stream...`,
              }));
            } else if (ev.type === 'model_delta') {
              setLiveStream((prev) =>
                prev
                  ? {
                      ...prev,
                      streamChars: ev.charCount,
                      streamTail: (prev.streamTail + ev.delta).slice(-240),
                      statusLine: `Step ${ev.step}: streaming model JSON (${ev.charCount} chars)...`,
                    }
                  : prev,
              );
            } else if (ev.type === 'tool_start') {
              setLiveStream((prev) =>
                prev
                  ? {
                      ...prev,
                      statusLine: `Step ${ev.step}: executing ${ev.tool}(${ev.target})...`,
                    }
                  : prev,
              );
            } else if (ev.type === 'tool_done') {
              setLiveStream((prev) =>
                prev
                  ? {
                      ...prev,
                      actions: [...prev.actions, ev.action],
                      statusLine: `Step ${ev.step}: ${ev.action.tool} ${ev.action.ok ? 'OK' : 'ERR'}`,
                    }
                  : prev,
              );
            } else if (ev.type === 'ddi_escalate') {
              setLiveStream((prev) =>
                prev
                  ? {
                      ...prev,
                      modelTier: ev.toTier,
                      statusLine: `DDI Escalated (${ev.errorHash}) -> ${ev.toTier}`,
                    }
                  : prev,
              );
            } else if (ev.type === 'step_error') {
              setLiveStream((prev) =>
                prev ? {...prev, statusLine: ev.message} : prev,
              );
            } else if (ev.type === 'error') {
              setErrorMsg(ev.message);
            } else if (ev.type === 'done') {
              setSnapshot(ev.snapshot);
              succeeded = true;
            }
          } catch {
            // ignore malformed SSE packet
          }
        }
      }

      return succeeded;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Streaming failed.');
      return false;
    } finally {
      setLiveStream(null);
      setBusy(false);
    }
  }

  const allPassed = Boolean(
    snapshot &&
      snapshot.tasks.length > 0 &&
      snapshot.tasks.every((task) => task.status === 'passed'),
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
      ) : activeTab === 'chat' ? (
          <ChatWorkspaceView
          snapshot={snapshot}
          locale={locale}
          busy={busy}
          liveStream={liveStream}
          onSetWorkspace={(workspaceDir, verifyCommand, createIfMissing) =>
            void postAction({
              action: 'set_chat_workspace',
              workspaceDir,
              verifyCommand,
              createIfMissing,
            })
          }
          onRunVerify={(verifyCommand) =>
            void postAction({
              action: 'verify_chat_workspace',
              verifyCommand,
            })
          }
          onSendMessage={streamChatMessage}
          onRollbackTurn={() => void postAction({action: 'rollback_chat_turn'})}
          onClearChat={() => void postAction({action: 'clear_chat'})}
          onReadFile={readChatFile}
        />
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
