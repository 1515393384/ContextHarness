'use client';

import {useState} from 'react';
import {UI_COPY, type UiLocale} from '@/lib/harness/i18n';
import type {HarnessWorkspaceSnapshot, ModelTier} from '@/lib/harness/types';

interface ChatWorkspaceViewProps {
  snapshot: HarnessWorkspaceSnapshot;
  locale: UiLocale;
  busy: boolean;
  onSetWorkspace: (
    workspaceDir: string,
    verifyCommand: string,
    createIfMissing: boolean,
  ) => void;
  onRunVerify: (verifyCommand: string) => void;
  onSendMessage: (message: string, modelTier: ModelTier) => Promise<boolean>;
  onClearChat: () => void;
  onReadFile: (filePath: string) => Promise<string | null>;
}

export function ChatWorkspaceView({
  snapshot,
  locale,
  busy,
  onSetWorkspace,
  onRunVerify,
  onSendMessage,
  onClearChat,
  onReadFile,
}: ChatWorkspaceViewProps) {
  const t = UI_COPY[locale].chat;
  const [dirInput, setDirInput] = useState(
    snapshot.chatWorkspaceDir ?? './workspace-sandbox',
  );
  const [verifyCmd, setVerifyCmd] = useState(snapshot.chatVerifyCommand ?? '');
  const [createIfMissing, setCreateIfMissing] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [selectedTier, setSelectedTier] = useState<ModelTier>(
    snapshot.adapters.modelAdapter === 'deepseek-pro' ? 'pro' : 'flash',
  );
  const [previewFile, setPreviewFile] = useState<{
    path: string;
    content: string;
  } | null>(null);

  const files = snapshot.chatFiles ?? [];
  const messages = snapshot.chatMessages ?? [];

  async function handleSend() {
    const trimmed = messageInput.trim();
    if (!trimmed || busy) return;
    const sent = await onSendMessage(trimmed, selectedTier);
    if (sent) {
      setMessageInput('');
    }
  }

  async function handleInspectFile(filePath: string) {
    const content = await onReadFile(filePath);
    if (content !== null) {
      setPreviewFile({path: filePath, content});
    }
  }

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col lg:flex-row">
      <aside className="w-full shrink-0 border-b border-slate-200 bg-white lg:w-[340px] lg:border-b-0 lg:border-r">
        <div className="p-5">
          <h2 className="text-base font-semibold text-slate-900">
            {t.sidebarTitle}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            {t.sidebarDesc}
          </p>

          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              onSetWorkspace(dirInput, verifyCmd, createIfMissing);
            }}
          >
            <div>
              <label
                htmlFor="chat-workspace-dir"
                className="block text-xs font-medium text-slate-700"
              >
                {t.dirLabel}
              </label>
              <input
                id="chat-workspace-dir"
                type="text"
                value={dirInput}
                onChange={(e) => setDirInput(e.target.value)}
                placeholder={t.dirPlaceholder}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDirInput('./workspace-sandbox');
                    onSetWorkspace('./workspace-sandbox', verifyCmd, true);
                  }}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                >
                  {t.presetSandbox}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDirInput('.');
                    onSetWorkspace('.', verifyCmd, false);
                  }}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                >
                  {t.presetCurrent}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={createIfMissing}
                onChange={(e) => setCreateIfMissing(e.target.checked)}
                className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <span>{t.createMissingLabel}</span>
            </label>

            <div>
              <label
                htmlFor="chat-verify-cmd"
                className="block text-xs font-medium text-slate-700"
              >
                {t.verifyCmdLabel}
              </label>
              <input
                id="chat-verify-cmd"
                type="text"
                value={verifyCmd}
                onChange={(e) => setVerifyCmd(e.target.value)}
                placeholder={t.verifyCmdPlaceholder}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:border-slate-900 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg border border-slate-900 bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                {t.applyDirBtn}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onRunVerify(verifyCmd)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-100 disabled:opacity-50"
              >
                {t.runVerifyBtn}
              </button>
            </div>
          </form>
        </div>

        <div className="border-t border-slate-200 p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              {t.filesTitle}
            </h3>
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              {files.length}
            </span>
          </div>
          <div className="mt-1 truncate font-mono text-[11px] text-slate-500" title={snapshot.chatWorkspaceDir}>
            {snapshot.chatWorkspaceDir}
          </div>

          {files.length === 0 ? (
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              {t.emptyFiles}
            </p>
          ) : (
            <ul className="mt-3 max-h-[300px] divide-y divide-slate-100 overflow-y-auto border-t border-slate-100">
              {files.map((file) => (
                <li key={file}>
                  <button
                    type="button"
                    onClick={() => handleInspectFile(file)}
                    className={`w-full truncate px-2 py-1.5 text-left font-mono text-xs transition-colors ${
                      previewFile?.path === file
                        ? 'bg-slate-100 font-semibold text-slate-900'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {file}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col p-6">
        {previewFile && (
          <section className="mb-5 rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <span className="font-mono text-xs font-semibold text-slate-900">
                {t.filePreviewTitle}: {previewFile.path}
              </span>
              <button
                type="button"
                onClick={() => setPreviewFile(null)}
                className="text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                {t.closePreview}
              </button>
            </div>
            <pre className="max-h-[260px] overflow-auto p-4 font-mono text-xs leading-relaxed text-slate-800">
              {previewFile.content}
            </pre>
          </section>
        )}

        <section className="flex flex-1 flex-col rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
            <div>
              <h1 className="text-base font-semibold text-slate-900">
                {t.threadTitle}
              </h1>
              <div className="mt-0.5 font-mono text-xs text-slate-500">
                {snapshot.deepseekConfigured ? t.gatewayReady : t.gatewayUnset}
              </div>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={onClearChat}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {t.clearBtn}
              </button>
            )}
          </div>

          <div className="min-h-[380px] max-h-[540px] flex-1 space-y-4 overflow-y-auto p-6">
            {messages.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-xs leading-relaxed text-slate-600">
                {t.emptyThread}
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-lg border p-4 ${
                    msg.role === 'user'
                      ? 'border-slate-300 bg-slate-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-900">
                      {msg.role === 'user' ? t.userLabel : t.assistantLabel}
                    </span>
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-500 tabular-nums">
                      {msg.modelTier && (
                        <span>{msg.modelTier === 'pro' ? 'Pro' : 'Flash-1017'}</span>
                      )}
                      {typeof msg.frameTokens === 'number' && (
                        <span>
                          · {msg.frameTokens.toLocaleString()}/
                          {(msg.budgetCeiling ?? 6000).toLocaleString()} tok
                        </span>
                      )}
                      {typeof msg.cacheHitTokens === 'number' &&
                        msg.cacheHitTokens > 0 && (
                          <span>· cacheHit {msg.cacheHitTokens}</span>
                        )}
                      {msg.staticHeadHash && <span>· #{msg.staticHeadHash}</span>}
                    </div>
                  </div>

                  <div className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-800">
                    {msg.content}
                  </div>

                  {msg.actions && msg.actions.length > 0 && (
                    <div className="mt-3 border-t border-slate-100 pt-2.5">
                      <div className="text-[11px] font-medium text-slate-500">
                        {t.actionsTitle}
                      </div>
                      <ul className="mt-1.5 space-y-1">
                        {msg.actions.map((act, idx) => (
                          <li
                            key={`${msg.id}-act-${idx}`}
                            className="flex flex-wrap items-baseline gap-2 font-mono text-[11px]"
                          >
                            <span
                              className={
                                act.ok
                                  ? 'font-semibold text-emerald-700'
                                  : 'font-semibold text-red-700'
                              }
                            >
                              {act.ok ? 'OK' : 'ERR'}
                            </span>
                            <span className="font-semibold text-slate-800">
                              {act.tool}
                            </span>
                            <span className="text-slate-600">{act.target}</span>
                            <span className="text-slate-500">— {act.summary}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <form
            className="border-t border-slate-200 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
          >
            <textarea
              rows={3}
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={t.inputPlaceholder}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none"
            />
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <select
                  aria-label="Model Tier"
                  value={selectedTier}
                  onChange={(e) => setSelectedTier(e.target.value as ModelTier)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 focus:border-slate-900 focus:bg-white focus:outline-none"
                >
                  <option value="flash">{t.tierFlash}</option>
                  <option value="pro">{t.tierPro}</option>
                </select>
                <span className="font-mono text-[11px] text-slate-500">
                  {snapshot.chatWorkspaceDir}
                </span>
              </div>

              <button
                type="submit"
                disabled={busy || !messageInput.trim()}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {busy ? t.sendingBtn : t.sendBtn}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
