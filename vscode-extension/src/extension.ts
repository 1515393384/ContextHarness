import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import {
  formatRecentTurnsSummary,
  getLiveAiRegressionPrompt,
  getTurnBaselineMap,
  rollbackChatTurn,
  runAllToolsRegression,
  runWorkspaceChatTurn,
  type LspBridgePort,
} from '../../lib/harness/core/workspace-chat-agent';
import type {
  ChatMessageEntry,
  ChatSessionRecord,
  ChatStepAction,
  HarnessStreamEvent,
  ModelTier,
  StepDebugTrace,
  ToolRegressionReport,
} from '../../lib/harness/types';
import {getWebviewHtml} from './webviewHtml';

interface LiveStreamViewState {
  step: number;
  maxSteps: number;
  modelTier: ModelTier;
  frameTokens: number;
  budgetCeiling: number;
  staticHeadHash: string;
  cacheHitTokens: number;
  streamTail: string;
  actions: ChatStepAction[];
  statusLine: string;
}

class SnapshotContentProvider implements vscode.TextDocumentContentProvider {
  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const params = new URLSearchParams(uri.query);
    const rootDir = params.get('root') ?? '';
    const turnId = params.get('turnId') ?? '';
    const relPath = params.get('file') ?? '';
    if (!rootDir || !relPath) return '';

    const record = await getTurnBaselineMap(rootDir, turnId || null);
    const baseline = record?.files?.[relPath];
    if (!baseline || !baseline.existed || baseline.content === null) {
      return '// (New file created during this turn)';
    }
    return baseline.content;
  }
}

const SESSION_STORAGE_KEY = 'contextharness.sessions.v1';
const MAX_STORED_SESSIONS = 15;

interface StoredSessionsPayload {
  activeSessionId: string;
  sessions: ChatSessionRecord[];
}

class ContextHarnessSidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private sessions: ChatSessionRecord[] = [];
  private activeSessionId = '';
  private messages: ChatMessageEntry[] = [];
  private traces: StepDebugTrace[] = [];
  private regressionReport: ToolRegressionReport | null = null;
  private busy = false;
  private live: LiveStreamViewState | null = null;
  private error: string | null = null;
  private lastTurnId: string | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
  ) {
    this.hydrateSessions();
  }

  private createEmptySession(): ChatSessionRecord {
    return {
      id: `SES-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: 'New Session',
      updatedAt: new Date().toISOString(),
      messages: [],
      lastTurnId: null,
    };
  }

  private hydrateSessions(): void {
    const saved = this.context.workspaceState.get<StoredSessionsPayload>(
      SESSION_STORAGE_KEY,
    );
    if (saved && Array.isArray(saved.sessions) && saved.sessions.length > 0) {
      this.sessions = saved.sessions;
      const found =
        this.sessions.find((s) => s.id === saved.activeSessionId) ??
        this.sessions[0];
      this.activeSessionId = found.id;
      this.messages = [...found.messages];
      this.lastTurnId = found.lastTurnId ?? null;
    } else {
      const fresh = this.createEmptySession();
      this.sessions = [fresh];
      this.activeSessionId = fresh.id;
      this.messages = [];
      this.lastTurnId = null;
    }
  }

  private async persistActiveSession(): Promise<void> {
    const firstUserMsg = this.messages.find((m) => m.role === 'user');
    const derivedTitle = firstUserMsg
      ? firstUserMsg.content.replace(/\s+/g, ' ').trim().slice(0, 36)
      : 'New Session';

    const existingIdx = this.sessions.findIndex(
      (s) => s.id === this.activeSessionId,
    );
    const updatedRecord: ChatSessionRecord = {
      id: this.activeSessionId || `SES-${Date.now()}`,
      title: derivedTitle || 'New Session',
      updatedAt: new Date().toISOString(),
      messages: this.messages.slice(-60),
      lastTurnId: this.lastTurnId,
    };

    if (existingIdx >= 0) {
      this.sessions[existingIdx] = updatedRecord;
    } else {
      this.sessions.unshift(updatedRecord);
    }

    this.sessions = this.sessions
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_STORED_SESSIONS);
    this.activeSessionId = updatedRecord.id;

    const payload: StoredSessionsPayload = {
      activeSessionId: this.activeSessionId,
      sessions: this.sessions,
    };
    await this.context.workspaceState.update(SESSION_STORAGE_KEY, payload);
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {enableScripts: true};
    const nonce = crypto.randomBytes(16).toString('hex');
    webviewView.webview.html = getWebviewHtml(nonce);

    webviewView.webview.onDidReceiveMessage(async (msg: Record<string, unknown>) => {
      if (msg.type === 'ready') {
        await this.syncState();
      } else if (msg.type === 'send') {
        await this.handleSend(
          String(msg.message ?? ''),
          msg.modelTier === 'pro' ? 'pro' : 'flash',
          Boolean(msg.includeSelection),
          Boolean(msg.includeDiagnostics),
        );
      } else if (msg.type === 'rollback') {
        await this.rollbackLastTurn();
      } else if (msg.type === 'setApiKey') {
        await vscode.commands.executeCommand('contextharness.setApiKey');
        await this.syncState();
      } else if (msg.type === 'showOutput') {
        this.output.show(true);
      } else if (msg.type === 'clear') {
        await this.clear();
      } else if (msg.type === 'newSession') {
        await this.startNewSession();
      } else if (msg.type === 'switchSession') {
        await this.switchSession(String(msg.sessionId ?? ''));
      } else if (msg.type === 'deleteSession') {
        await this.deleteSession(String(msg.sessionId ?? ''));
      } else if (msg.type === 'openDiff') {
        await this.openDiff(String(msg.turnId ?? ''), String(msg.file ?? ''));
      } else if (msg.type === 'runRegressionLocal') {
        await this.runLocalRegressionSuite();
      } else if (msg.type === 'runRegressionAi') {
        await this.handleSend(
          getLiveAiRegressionPrompt(),
          'flash',
          false,
          false,
        );
      }
    });
  }

  public prefillPrompt(text: string): void {
    this.view?.show?.(true);
    void this.view?.webview.postMessage({type: 'prefill', text});
  }

  public async clear(): Promise<void> {
    this.messages = [];
    this.traces = [];
    this.lastTurnId = null;
    this.error = null;
    await this.persistActiveSession();
    await this.syncState();
  }

  public async startNewSession(): Promise<void> {
    if (this.busy) return;
    await this.persistActiveSession();
    const fresh = this.createEmptySession();
    this.sessions.unshift(fresh);
    this.sessions = this.sessions.slice(0, MAX_STORED_SESSIONS);
    this.activeSessionId = fresh.id;
    this.messages = [];
    this.traces = [];
    this.lastTurnId = null;
    this.error = null;
    await this.persistActiveSession();
    await this.syncState();
  }

  public async switchSession(sessionId: string): Promise<void> {
    if (this.busy || !sessionId || sessionId === this.activeSessionId) return;
    await this.persistActiveSession();
    const target = this.sessions.find((s) => s.id === sessionId);
    if (!target) return;
    this.activeSessionId = target.id;
    this.messages = [...target.messages];
    this.lastTurnId = target.lastTurnId ?? null;
    this.traces = [];
    this.error = null;
    await this.context.workspaceState.update(SESSION_STORAGE_KEY, {
      activeSessionId: this.activeSessionId,
      sessions: this.sessions,
    } satisfies StoredSessionsPayload);
    await this.syncState();
  }

  public async deleteSession(sessionId: string): Promise<void> {
    if (this.busy) return;
    const idToDelete = sessionId || this.activeSessionId;
    this.sessions = this.sessions.filter((s) => s.id !== idToDelete);
    if (this.sessions.length === 0) {
      const fresh = this.createEmptySession();
      this.sessions = [fresh];
    }
    if (idToDelete === this.activeSessionId || !this.sessions.some((s) => s.id === this.activeSessionId)) {
      const next = this.sessions[0];
      this.activeSessionId = next.id;
      this.messages = [...next.messages];
      this.lastTurnId = next.lastTurnId ?? null;
      this.traces = [];
    }
    this.error = null;
    await this.context.workspaceState.update(SESSION_STORAGE_KEY, {
      activeSessionId: this.activeSessionId,
      sessions: this.sessions,
    } satisfies StoredSessionsPayload);
    await this.syncState();
  }

  public async runLocalRegressionSuite(): Promise<void> {
    if (this.busy) return;
    const workspaceDir = this.getWorkspaceDir();
    if (!workspaceDir) {
      this.error = 'Open a workspace folder in VS Code first.';
      await this.syncState();
      return;
    }

    this.busy = true;
    this.error = null;
    this.view?.show?.(true);
    void this.view?.webview.postMessage({type: 'openInspector'});
    await this.syncState();

    this.output.appendLine(`\n=== All-Tools Regression Self-Test (${workspaceDir}) ===`);
    try {
      const report = await runAllToolsRegression(workspaceDir);
      this.regressionReport = report;
      for (const item of report.items) {
        this.output.appendLine(
          `[${item.passed ? 'PASS' : 'FAIL'}] ${item.name} (${item.durationMs}ms) — ${item.detail}`,
        );
      }
      this.output.appendLine(
        `Summary: ${report.passedCount}/${report.totalCount} passed in ${report.durationMs}ms`,
      );
      if (report.passedCount === report.totalCount) {
        void vscode.window.showInformationMessage(
          `ContextHarness ${report.totalCount}-tool regression passed (${report.passedCount}/${report.totalCount}, ${report.durationMs}ms).`,
        );
      } else {
        void vscode.window.showWarningMessage(
          `ContextHarness regression: ${report.passedCount}/${report.totalCount} passed. Check Inspector / Output.`,
        );
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.busy = false;
      await this.syncState();
    }
  }

  public async rollbackLastTurn(): Promise<void> {
    const workspaceDir = this.getWorkspaceDir();
    if (!workspaceDir) return;
    const res = await rollbackChatTurn(workspaceDir, this.lastTurnId);
    if (res.ok === false) {
      this.error = res.error.message;
      await this.syncState();
      return;
    }
    this.messages.push({
      id: `MSG-${Date.now()}-rb`,
      role: 'assistant',
      content: `Rolled back ${res.value.turnId}. Restored: ${res.value.restoredFiles.join(', ') || 'none'}.`,
      workspaceDir,
      timestamp: new Date().toISOString(),
    });
    this.lastTurnId = null;
    await this.persistActiveSession();
    await this.syncState();
    void vscode.window.showInformationMessage(
      `ContextHarness rolled back ${res.value.restoredFiles.length} file(s).`,
    );
  }

  private getWorkspaceDir(): string | null {
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder ? folder.uri.fsPath : null;
  }

  private async resolveApiKey(workspaceDir: string | null): Promise<string> {
    const stored = await this.context.secrets.get('contextharness.apiKey');
    if (stored?.trim()) return stored.trim();

    if (workspaceDir) {
      for (const envName of ['.env.local', '.env']) {
        try {
          const raw = fs.readFileSync(path.join(workspaceDir, envName), 'utf8');
          const match = raw.match(/^\s*DEEPSEEK_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?/m);
          if (match?.[1]?.trim()) return match[1].trim();
        } catch {
          // ignore missing env file
        }
      }
    }

    return process.env.DEEPSEEK_API_KEY?.trim() ?? '';
  }

  private collectActiveSelection(workspaceDir: string): string | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) return undefined;
    const doc = editor.document;
    const rel = path.relative(workspaceDir, doc.uri.fsPath).split(path.sep).join('/');
    if (rel.startsWith('..')) return undefined;

    const startLine = editor.selection.start.line + 1;
    const endLine = editor.selection.end.line + 1;
    const lines: string[] = [];
    for (let l = editor.selection.start.line; l <= editor.selection.end.line; l += 1) {
      lines.push(`${l + 1} | ${doc.lineAt(l).text}`);
      if (lines.length >= 120) break;
    }
    return `Selected ${rel}:${startLine}-${endLine}\n${lines.join('\n')}`;
  }

  private collectDiagnostics(workspaceDir: string): string | undefined {
    const allDiags = vscode.languages.getDiagnostics();
    const lines: string[] = [];
    for (const [uri, diags] of allDiags) {
      if (uri.scheme !== 'file') continue;
      const rel = path.relative(workspaceDir, uri.fsPath).split(path.sep).join('/');
      if (rel.startsWith('..')) continue;
      for (const d of diags) {
        if (d.severity > vscode.DiagnosticSeverity.Warning) continue;
        const sev = d.severity === vscode.DiagnosticSeverity.Error ? 'ERROR' : 'WARN';
        lines.push(`${rel}:${d.range.start.line + 1}: [${sev}] ${d.message}`);
        if (lines.length >= 12) break;
      }
      if (lines.length >= 12) break;
    }
    return lines.length > 0 ? lines.join('\n') : undefined;
  }

  private async openDiff(turnId: string, relFile: string): Promise<void> {
    const workspaceDir = this.getWorkspaceDir();
    if (!workspaceDir) return;
    const leftUri = vscode.Uri.parse(
      `contextharness-snap:/${encodeURIComponent(relFile)}?root=${encodeURIComponent(workspaceDir)}&turnId=${encodeURIComponent(turnId)}&file=${encodeURIComponent(relFile)}`,
    );
    const rightUri = vscode.Uri.file(path.join(workspaceDir, relFile));
    await vscode.commands.executeCommand(
      'vscode.diff',
      leftUri,
      rightUri,
      `${relFile} (Before ↔ After)`,
    );
  }

  private createLspBridge(workspaceDir: string): LspBridgePort {
    const resolvedRoot = path.resolve(workspaceDir);

    const resolveSafeUri = (relPath: string): vscode.Uri | null => {
      const target = path.resolve(resolvedRoot, relPath);
      if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
        return null;
      }
      return vscode.Uri.file(target);
    };

    return {
      getDocumentSymbols: async (relFiles: string[]): Promise<string | undefined> => {
        const blocks: string[] = [];
        for (const rel of relFiles.slice(0, 6)) {
          const uri = resolveSafeUri(rel);
          if (!uri) continue;
          try {
            const symbols = await vscode.commands.executeCommand<
              Array<vscode.DocumentSymbol | vscode.SymbolInformation> | undefined
            >('vscode.executeDocumentSymbolProvider', uri);
            if (!symbols || symbols.length === 0) continue;

            const lines: string[] = [];
            const pushSym = (
              sym: vscode.DocumentSymbol | vscode.SymbolInformation,
              depth: number,
            ) => {
              if (lines.length >= 12) return;
              const kindName = vscode.SymbolKind[sym.kind] ?? 'Sym';
              const indent = depth > 0 ? '    ' : '  ';
              if ('range' in sym) {
                lines.push(`${indent}${sym.range.start.line + 1} | [${kindName}] ${sym.name}`);
                if (depth < 1 && Array.isArray(sym.children)) {
                  for (const child of sym.children) {
                    pushSym(child, depth + 1);
                  }
                }
              } else {
                lines.push(
                  `${indent}${sym.location.range.start.line + 1} | [${kindName}] ${sym.name}`,
                );
              }
            };
            for (const s of symbols) {
              pushSym(s, 0);
            }
            if (lines.length > 0) {
              blocks.push(`# ${rel}\n${lines.join('\n')}`);
            }
          } catch {
            // ignore unsupported language provider errors
          }
        }
        return blocks.length > 0 ? blocks.join('\n') : undefined;
      },

      findReferences: async (
        relFile: string,
        line: number,
        symbol?: string,
      ): Promise<string[]> => {
        const uri = resolveSafeUri(relFile);
        if (!uri) return [];
        try {
          const doc = await vscode.workspace.openTextDocument(uri);
          const lineIdx = Math.max(0, Math.min(doc.lineCount - 1, line - 1));
          const lineText = doc.lineAt(lineIdx).text;
          let charIdx = 0;
          if (symbol) {
            const foundIdx = lineText.indexOf(symbol);
            if (foundIdx >= 0) charIdx = foundIdx;
          } else {
            const identMatch = lineText.match(/[A-Za-z_]\w*/);
            if (identMatch && typeof identMatch.index === 'number') {
              charIdx = identMatch.index;
            }
          }

          const locs = await vscode.commands.executeCommand<vscode.Location[] | undefined>(
            'vscode.executeReferenceProvider',
            uri,
            new vscode.Position(lineIdx, charIdx),
          );
          if (!locs || locs.length === 0) return [];

          const hits: string[] = [];
          const textCache = new Map<string, string[]>();
          for (const loc of locs.slice(0, 20)) {
            const rel = path
              .relative(resolvedRoot, loc.uri.fsPath)
              .split(path.sep)
              .join('/');
            if (rel.startsWith('..')) continue;
            const hitLine = loc.range.start.line;
            let fileLines = textCache.get(loc.uri.fsPath);
            if (!fileLines) {
              try {
                fileLines = fs
                  .readFileSync(loc.uri.fsPath, 'utf8')
                  .replace(/\r\n/g, '\n')
                  .split('\n');
              } catch {
                fileLines = [];
              }
              textCache.set(loc.uri.fsPath, fileLines);
            }
            const snippet = (fileLines[hitLine] ?? '').trim().slice(0, 120);
            hits.push(`${rel}:${hitLine + 1}: ${snippet}`);
          }
          return hits;
        } catch {
          return [];
        }
      },
    };
  }

  public async syncState(): Promise<void> {
    const workspaceDir = this.getWorkspaceDir();
    const apiKey = await this.resolveApiKey(workspaceDir);
    void this.view?.webview.postMessage({
      type: 'state',
      state: {
        workspaceName: workspaceDir ? path.basename(workspaceDir) : '',
        hasApiKey: Boolean(apiKey),
        busy: this.busy,
        canRollback: Boolean(this.lastTurnId),
        activeSessionId: this.activeSessionId,
        sessions: this.sessions.map((s) => ({
          id: s.id,
          title: s.title,
          updatedAt: s.updatedAt,
          messageCount: s.messages.length,
        })),
        messages: this.messages,
        traces: this.traces,
        regressionReport: this.regressionReport,
        live: this.live,
        error: this.error,
      },
    });
  }

  private async handleSend(
    message: string,
    tier: ModelTier,
    includeSelection: boolean,
    includeDiagnostics: boolean,
  ): Promise<void> {
    const trimmed = message.trim();
    if (!trimmed || this.busy) return;

    const workspaceDir = this.getWorkspaceDir();
    if (!workspaceDir) {
      this.error = 'Open a workspace folder in VS Code first.';
      await this.syncState();
      return;
    }

    const apiKey = await this.resolveApiKey(workspaceDir);
    if (!apiKey) {
      this.error = 'DeepSeek API Key not found. Click "API Key" above or set DEEPSEEK_API_KEY in .env.local.';
      await this.syncState();
      return;
    }

    const cfg = vscode.workspace.getConfiguration('contextharness');
    const baseUrl = cfg.get<string>('baseUrl', 'https://api.deepseek.com/v1');
    const flashModel = cfg.get<string>('flashModel', 'deepseek-chat');
    const proModel = cfg.get<string>('proModel', 'deepseek-reasoner');
    const verifyCommand = cfg.get<string>('verifyCommand', '');
    const maxSteps = cfg.get<number>('maxSteps', 14);

    const activeContext = includeSelection ? this.collectActiveSelection(workspaceDir) : undefined;
    const externalDiagnostics = includeDiagnostics ? this.collectDiagnostics(workspaceDir) : undefined;
    const recentTurnsSummary = formatRecentTurnsSummary(this.messages);

    this.busy = true;
    this.error = null;
    this.traces = [];
    this.messages.push({
      id: `MSG-${Date.now()}-u`,
      role: 'user',
      content: trimmed,
      workspaceDir,
      timestamp: new Date().toISOString(),
    });
    this.live = {
      step: 1,
      maxSteps,
      modelTier: tier,
      frameTokens: 0,
      budgetCeiling: tier === 'pro' ? 8000 : 6000,
      staticHeadHash: '--------',
      cacheHitTokens: 0,
      streamTail: '',
      actions: [],
      statusLine: 'Compiling 4-Slot frame...',
    };
    await this.syncState();

    this.output.appendLine(`\n=== Turn: ${trimmed} ===`);

    const onEvent = (ev: HarnessStreamEvent) => {
      if (!this.live) return;
      if (ev.type === 'step_start') {
        this.live = {
          ...this.live,
          step: ev.step,
          maxSteps: ev.maxSteps,
          modelTier: ev.modelTier,
          frameTokens: ev.frameTokens,
          budgetCeiling: ev.budgetCeiling,
          staticHeadHash: ev.staticHeadHash,
          cacheHitTokens: ev.cacheHitTokens,
          streamTail: '',
          statusLine: `Step ${ev.step}/${ev.maxSteps}: streaming ${ev.modelTier}...`,
        };
        this.output.appendLine(
          `[Step ${ev.step}] ${ev.modelTier} ${ev.frameTokens}/${ev.budgetCeiling} tok #${ev.staticHeadHash} cacheHit=${ev.cacheHitTokens}`,
        );
      } else if (ev.type === 'model_delta') {
        this.live = {
          ...this.live,
          streamTail: (this.live.streamTail + ev.delta).slice(-240),
          statusLine: `Step ${ev.step}: streaming JSON (${ev.charCount} chars)...`,
        };
      } else if (ev.type === 'tool_start') {
        this.live = {
          ...this.live,
          statusLine: `Step ${ev.step}: running ${ev.tool}(${ev.target})...`,
        };
        this.output.appendLine(`  -> ${ev.tool}(${ev.target})`);
      } else if (ev.type === 'tool_done') {
        this.live = {
          ...this.live,
          actions: [...this.live.actions, ev.action],
          statusLine: `Step ${ev.step}: ${ev.action.tool} ${ev.action.ok ? 'OK' : 'ERR'}`,
        };
        this.output.appendLine(
          `     [${ev.action.ok ? 'OK' : 'ERR'}] ${ev.action.summary}`,
        );
      } else if (ev.type === 'ddi_rollback') {
        this.live = {
          ...this.live,
          statusLine: `DDI Rollback & Rewrite (${ev.errorHash}): restored ${ev.restoredFiles.join(', ') || 'state'}`,
        };
        this.output.appendLine(
          `  [DDI_ROLLBACK] (${ev.errorHash}) restored [${ev.restoredFiles.join(', ') || 'none'}]`,
        );
      } else if (ev.type === 'ddi_escalate') {
        this.live = {
          ...this.live,
          modelTier: ev.toTier,
          statusLine: `DDI Circuit Breaker (${ev.errorHash}) -> ${ev.toTier}`,
        };
        this.output.appendLine(`  [DDI] Escalated ${ev.fromTier} -> ${ev.toTier} (${ev.errorHash})`);
      } else if (ev.type === 'step_error') {
        this.live = {...this.live, statusLine: ev.message};
        this.output.appendLine(`  [STEP_ERROR] ${ev.message}`);
      } else if (ev.type === 'step_trace') {
        this.traces = [...this.traces, ev.trace];
        this.output.appendLine(`  [AI RAW STEP ${ev.trace.step} (${ev.trace.durationMs}ms, finish=${ev.trace.finishReason})]:`);
        this.output.appendLine(ev.trace.rawModelOutput);
        this.output.appendLine(`  [FEEDBACK STEP ${ev.trace.step}]: ${ev.trace.toolFeedback}`);
      }
      void this.syncState();
    };

    try {
      const res = await runWorkspaceChatTurn({
        workspaceDir,
        userMessage: trimmed,
        initialTier: tier,
        verifyCommand: verifyCommand || undefined,
        apiKey,
        baseUrl,
        flashModel,
        proModel,
        maxSteps,
        activeContext,
        externalDiagnostics,
        recentTurnsSummary,
        lspBridge: this.createLspBridge(workspaceDir),
        onEvent,
      });

      if (res.ok === false) {
        this.error = res.error.details
          ? `${res.error.message}: ${res.error.details}`
          : res.error.message;
      } else {
        this.traces = res.value.stepTraces;
        this.messages.push({
          id: `MSG-${Date.now()}-a`,
          role: 'assistant',
          content: res.value.reply,
          workspaceDir,
          timestamp: new Date().toISOString(),
          turnId: res.value.turnId,
          modifiedFiles: res.value.modifiedFiles,
          modelTier: res.value.modelTier,
          frameTokens: res.value.frameTokens,
          budgetCeiling: res.value.budgetCeiling,
          cacheHitTokens: res.value.cacheHitTokens,
          staticHeadHash: res.value.staticHeadHash,
          actions: res.value.actions,
          verifyPassed: res.value.verifyPassed,
        });
        if (res.value.modifiedFiles.length > 0) {
          this.lastTurnId = res.value.turnId;
        }
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.busy = false;
      this.live = null;
      await this.persistActiveSession();
      await this.syncState();
    }
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('ContextHarness');
  const provider = new ContextHarnessSidebarProvider(context, output);

  context.subscriptions.push(
    output,
    vscode.workspace.registerTextDocumentContentProvider(
      'contextharness-snap',
      new SnapshotContentProvider(),
    ),
    vscode.window.registerWebviewViewProvider('contextharness.chatView', provider, {
      webviewOptions: {retainContextWhenHidden: true},
    }),
    vscode.commands.registerCommand('contextharness.openChat', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.contextharness');
    }),
    vscode.commands.registerCommand('contextharness.askWithSelection', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.contextharness');
      provider.prefillPrompt('Explain or modify the selected code: ');
    }),
    vscode.commands.registerCommand('contextharness.setApiKey', async () => {
      const value = await vscode.window.showInputBox({
        prompt: 'Enter DeepSeek (or OpenAI-compatible) API Key',
        password: true,
        ignoreFocusOut: true,
      });
      if (value !== undefined) {
        if (value.trim()) {
          await context.secrets.store('contextharness.apiKey', value.trim());
          void vscode.window.showInformationMessage('ContextHarness API key saved to VS Code SecretStorage.');
        } else {
          await context.secrets.delete('contextharness.apiKey');
          void vscode.window.showInformationMessage('ContextHarness stored API key cleared.');
        }
        await provider.syncState();
      }
    }),
    vscode.commands.registerCommand('contextharness.rollbackLastTurn', () =>
      provider.rollbackLastTurn(),
    ),
    vscode.commands.registerCommand('contextharness.runToolRegression', () =>
      provider.runLocalRegressionSuite(),
    ),
    vscode.commands.registerCommand('contextharness.clearChat', () => {
      void provider.clear();
    }),
  );
}

export function deactivate(): void {
  // nothing to dispose beyond context.subscriptions
}
