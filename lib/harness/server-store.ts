import {promises as fs} from 'node:fs';
import path from 'node:path';
import {DeepSeekModelGateway} from './adapters/deepseek-gateway';
import {
  LocalFsCodeIndexAdapter,
  LocalFsWorkspaceAdapter,
  LocalNodeVerifyAdapter,
} from './adapters/local-fs-adapters';
import {compileSlotFrame} from './core/context-compiler';
import {getNextRunnableTask} from './core/dag-scheduler';
import {
  buildSpecAndDag,
  runClosedLoop,
  runSingleStep,
  type HarnessPorts,
  type OrchestratorState,
  type TaskPlanInput,
} from './core/orchestrator';
import {
  ensureWorkspaceDirectory,
  getDefaultSandboxDir,
  listWorkspaceFiles,
  readWorkspaceFileNumbered,
  runWorkspaceChatTurn,
  runWorkspaceVerify,
} from './core/workspace-chat-agent';
import {
  err,
  ok,
  type AdapterProfile,
  type ChatMessageEntry,
  type HarnessError,
  type HarnessWorkspaceSnapshot,
  type ModelTier,
  type Result,
  type RoleKind,
  type VerifyResult,
} from './types';

const STATE_PATH = path.join(process.cwd(), '.contextharness-workspace-state.json');

function isDeepSeekConfigured(): boolean {
  return Boolean(
    process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim().length > 0,
  );
}

function getWorkspaceRoot(): string {
  return process.cwd();
}

function buildLocalPorts(adapters: AdapterProfile): HarnessPorts {
  const rootDir = getWorkspaceRoot();
  const codeIndex = new LocalFsCodeIndexAdapter(rootDir, adapters.indexAdapter);
  const workspace = new LocalFsWorkspaceAdapter(rootDir);
  const verifyProbe = new LocalNodeVerifyAdapter(rootDir, adapters.probeAdapter);
  const modelGateway = new DeepSeekModelGateway({
    apiKey: process.env.DEEPSEEK_API_KEY ?? '',
    baseUrl: process.env.DEEPSEEK_BASE_URL,
    flashModel:
      adapters.modelAdapter === 'deepseek-pro'
        ? process.env.DEEPSEEK_MODEL_PRO ?? 'deepseek-reasoner'
        : process.env.DEEPSEEK_MODEL_FLASH ?? 'deepseek-chat',
    proModel: process.env.DEEPSEEK_MODEL_PRO ?? 'deepseek-reasoner',
  });

  return {codeIndex, workspace, verifyProbe, modelGateway};
}

async function refreshPreviews(
  snapshot: HarnessWorkspaceSnapshot,
  workspace: LocalFsWorkspaceAdapter,
): Promise<void> {
  const active =
    snapshot.tasks.find((t) => t.id === snapshot.activeTaskId) ??
    snapshot.tasks[0];
  if (!active) return;

  const targetRead = await workspace.readWithLineNumbers(active.targetFile, 1, 140);
  const testRead = await workspace.readWithLineNumbers(active.testFile, 1, 140);

  if (targetRead.ok === true) {
    snapshot.targetFilePreview = targetRead.value;
  } else {
    snapshot.targetFilePreview = `// ${targetRead.error.message}`;
  }

  if (testRead.ok === true) {
    snapshot.testFilePreview = testRead.value;
  } else {
    snapshot.testFilePreview = `// ${testRead.error.message}`;
  }
}

export async function createFreshSnapshot(
  planInput?: TaskPlanInput,
  adapters?: AdapterProfile,
): Promise<HarnessWorkspaceSnapshot> {
  const {spec, tasks} = buildSpecAndDag(
    planInput ?? {
      userPrompt:
        'Enforce strict token budget truncation and deterministic line slicing.',
      targetLanguage: 'typescript',
      targetFile: 'lib/harness/core/token-budget.ts',
      targetSymbol: 'truncateToTokenBudget',
      contractFile: 'lib/harness/types.ts',
      testFile: 'lib/harness/core/harness.test.ts',
      startLine: 32,
      endLine: 83,
    },
  );

  const firstRunnable = getNextRunnableTask(tasks) ?? tasks[0];
  const activeAdapters: AdapterProfile = adapters ?? {
    indexAdapter: 'treesitter-local',
    probeAdapter: 'local-tsc-test',
    modelAdapter: 'deepseek-v4.1-flash-1017',
  };

  const sandboxReady = await ensureWorkspaceDirectory(getDefaultSandboxDir(), true);
  const chatWorkspaceDir =
    sandboxReady.ok === true ? sandboxReady.value : getDefaultSandboxDir();
  const chatFiles = await listWorkspaceFiles(chatWorkspaceDir);

  const snapshot: HarnessWorkspaceSnapshot = {
    spec,
    tasks,
    activeTaskId: firstRunnable.id,
    targetFilePreview: '',
    testFilePreview: '',
    traces: [],
    lastFrame: null,
    lastVerify: null,
    adapters: activeAdapters,
    deepseekConfigured: isDeepSeekConfigured(),
    chatWorkspaceDir,
    chatVerifyCommand: '',
    chatFiles,
    chatMessages: [],
  };

  const ports = buildLocalPorts(activeAdapters);
  snapshot.lastFrame = await compileSlotFrame({
    task: firstRunnable,
    spec: snapshot.spec,
    role: 'micro_coder',
    modelTier: firstRunnable.activeModelTier,
    round: 1,
    previousStaticHeadHash: null,
    latestVerify: null,
    codeIndex: ports.codeIndex,
    workspace: ports.workspace as LocalFsWorkspaceAdapter,
  });

  await refreshPreviews(snapshot, ports.workspace as LocalFsWorkspaceAdapter);
  await saveSnapshot(snapshot);
  return snapshot;
}

export async function loadSnapshot(): Promise<HarnessWorkspaceSnapshot> {
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as HarnessWorkspaceSnapshot;
    parsed.deepseekConfigured = isDeepSeekConfigured();
    let migrated = false;
    for (const task of parsed.tasks ?? []) {
      if (
        task.targetFile === 'lib/harness/core/token-budget.ts' &&
        task.writeLock?.editableRange?.startLine === 32 &&
        task.writeLock?.editableRange?.endLine === 78
      ) {
        task.writeLock.editableRange.endLine = 83;
        migrated = true;
      }
    }
    if (migrated && parsed.spec?.inputOutputSummary?.includes('token-budget.ts:32-78')) {
      parsed.spec.inputOutputSummary = parsed.spec.inputOutputSummary.replace(
        'token-budget.ts:32-78',
        'token-budget.ts:32-83',
      );
    }

    if (!parsed.chatWorkspaceDir) {
      const ready = await ensureWorkspaceDirectory(getDefaultSandboxDir(), true);
      parsed.chatWorkspaceDir =
        ready.ok === true ? ready.value : getDefaultSandboxDir();
      migrated = true;
    }
    if (!parsed.chatMessages) {
      parsed.chatMessages = [];
      migrated = true;
    }
    parsed.chatFiles = await listWorkspaceFiles(parsed.chatWorkspaceDir);

    if (migrated) {
      await saveSnapshot(parsed);
    }
    return parsed;
  } catch {
    return createFreshSnapshot();
  }
}

export async function saveSnapshot(
  snapshot: HarnessWorkspaceSnapshot,
): Promise<void> {
  await fs.mkdir(path.dirname(STATE_PATH), {recursive: true});
  await fs.writeFile(STATE_PATH, JSON.stringify(snapshot, null, 2), 'utf8');
}

export async function previewTaskFrame(
  snapshot: HarnessWorkspaceSnapshot,
  taskId: string,
): Promise<HarnessWorkspaceSnapshot> {
  const task =
    snapshot.tasks.find((t) => t.id === taskId) ??
    getNextRunnableTask(snapshot.tasks) ??
    snapshot.tasks[0];
  if (!task) return snapshot;

  snapshot.activeTaskId = task.id;
  const ports = buildLocalPorts(snapshot.adapters);
  const role: RoleKind =
    task.attempts > 0 && task.status !== 'passed'
      ? 'surgical_debugger'
      : task.dependsOn.length === 0
        ? 'contract_planner'
        : 'micro_coder';

  snapshot.lastFrame = await compileSlotFrame({
    task,
    spec: snapshot.spec,
    role,
    modelTier: task.activeModelTier,
    round: snapshot.traces.length + 1,
    previousStaticHeadHash: snapshot.lastFrame?.staticHeadHash ?? null,
    latestVerify: task.attempts > 0 ? snapshot.lastVerify : null,
    codeIndex: ports.codeIndex,
    workspace: ports.workspace,
  });

  await refreshPreviews(snapshot, ports.workspace as LocalFsWorkspaceAdapter);
  await saveSnapshot(snapshot);
  return snapshot;
}

export async function verifyActiveTask(
  snapshot: HarnessWorkspaceSnapshot,
): Promise<HarnessWorkspaceSnapshot> {
  const task =
    snapshot.tasks.find((t) => t.id === snapshot.activeTaskId) ??
    getNextRunnableTask(snapshot.tasks) ??
    snapshot.tasks[0];
  if (!task) return snapshot;

  const ports = buildLocalPorts(snapshot.adapters);
  const startedAt = Date.now();
  const verifyRes = await ports.verifyProbe.runVerify(task);
  let verify: VerifyResult;
  if (verifyRes.ok === true) {
    verify = verifyRes.value;
  } else {
    verify = {
      passed: false,
      stage: 'COMPILE' as const,
      errorHash: verifyRes.error.code,
      summary: verifyRes.error.message,
      stackFrames: [],
    };
  }

  snapshot.lastVerify = verify;
  if (verify.passed) {
    task.status = 'passed';
  }

  const round = snapshot.traces.length + 1;
  snapshot.traces.push({
    id: `TR-${round}`,
    round,
    taskId: task.id,
    taskTitle: task.title,
    role: 'surgical_debugger',
    modelTier: task.activeModelTier,
    frameTokens: snapshot.lastFrame?.totalTokens ?? 0,
    budgetCeiling: snapshot.lastFrame?.budgetCeiling ?? 6000,
    staticHeadHash: snapshot.lastFrame?.staticHeadHash ?? '--------',
    cacheHit: snapshot.lastFrame?.cacheHitExpected ?? false,
    verifyStage: verify.stage,
    verifyPassed: verify.passed,
    errorHash: verify.passed ? null : verify.errorHash,
    ddiDecision: verify.passed ? 'COMMIT_NEXT' : 'RETRY_SURGICAL_DEBUG',
    durationMs: Math.max(1, Date.now() - startedAt),
    summary: verify.summary,
  });

  await previewTaskFrame(snapshot, task.id);
  return snapshot;
}

export async function executeStep(
  snapshot: HarnessWorkspaceSnapshot,
): Promise<HarnessWorkspaceSnapshot> {
  const ports = buildLocalPorts(snapshot.adapters);
  const orchState: OrchestratorState = {
    spec: snapshot.spec,
    tasks: snapshot.tasks,
    traces: snapshot.traces,
    lastFrame: snapshot.lastFrame,
    lastVerify: snapshot.lastVerify,
    lastStaticHeadHash: snapshot.lastFrame?.staticHeadHash ?? null,
    taskInitialSnapshots: snapshot.taskInitialSnapshots,
  };

  const outcome = await runSingleStep(orchState, ports);
  snapshot.traces = orchState.traces;
  snapshot.lastFrame = orchState.lastFrame;
  snapshot.lastVerify = orchState.lastVerify;
  snapshot.taskInitialSnapshots = orchState.taskInitialSnapshots;
  if (outcome.trace) {
    snapshot.activeTaskId = outcome.trace.taskId;
  }

  await refreshPreviews(snapshot, ports.workspace as LocalFsWorkspaceAdapter);
  await saveSnapshot(snapshot);
  return snapshot;
}

export async function executeClosedLoop(
  snapshot: HarnessWorkspaceSnapshot,
): Promise<HarnessWorkspaceSnapshot> {
  const ports = buildLocalPorts(snapshot.adapters);
  const orchState: OrchestratorState = {
    spec: snapshot.spec,
    tasks: snapshot.tasks,
    traces: snapshot.traces,
    lastFrame: snapshot.lastFrame,
    lastVerify: snapshot.lastVerify,
    lastStaticHeadHash: snapshot.lastFrame?.staticHeadHash ?? null,
    taskInitialSnapshots: snapshot.taskInitialSnapshots,
  };

  const outcomes = await runClosedLoop(orchState, ports, 10);
  snapshot.traces = orchState.traces;
  snapshot.lastFrame = orchState.lastFrame;
  snapshot.lastVerify = orchState.lastVerify;
  snapshot.taskInitialSnapshots = orchState.taskInitialSnapshots;
  const lastOutcome = outcomes[outcomes.length - 1];
  if (lastOutcome?.trace) {
    snapshot.activeTaskId = lastOutcome.trace.taskId;
  }

  await refreshPreviews(snapshot, ports.workspace as LocalFsWorkspaceAdapter);
  await saveSnapshot(snapshot);
  return snapshot;
}

export async function setChatWorkspace(
  snapshot: HarnessWorkspaceSnapshot,
  workspaceDir: string,
  verifyCommand?: string,
  createIfMissing = false,
): Promise<Result<HarnessWorkspaceSnapshot, HarnessError>> {
  const dirRes = await ensureWorkspaceDirectory(workspaceDir, createIfMissing);
  if (dirRes.ok === false) {
    return {ok: false, error: dirRes.error};
  }
  snapshot.chatWorkspaceDir = dirRes.value;
  if (typeof verifyCommand === 'string') {
    snapshot.chatVerifyCommand = verifyCommand.trim();
  }
  snapshot.chatFiles = await listWorkspaceFiles(dirRes.value);
  await saveSnapshot(snapshot);
  return ok(snapshot);
}

export async function readChatWorkspaceFile(
  snapshot: HarnessWorkspaceSnapshot,
  relPath: string,
): Promise<Result<string, HarnessError>> {
  const dir = snapshot.chatWorkspaceDir ?? getDefaultSandboxDir();
  return readWorkspaceFileNumbered(dir, relPath, 1, 300);
}

export async function verifyChatWorkspace(
  snapshot: HarnessWorkspaceSnapshot,
  verifyCommand?: string,
): Promise<HarnessWorkspaceSnapshot> {
  const dir = snapshot.chatWorkspaceDir ?? getDefaultSandboxDir();
  const ready = await ensureWorkspaceDirectory(dir, dir === getDefaultSandboxDir());
  const targetDir = ready.ok === true ? ready.value : dir;

  if (typeof verifyCommand === 'string') {
    snapshot.chatVerifyCommand = verifyCommand.trim();
  }

  const res = await runWorkspaceVerify(targetDir, snapshot.chatVerifyCommand);
  const messages = snapshot.chatMessages ?? [];
  messages.push({
    id: `MSG-${Date.now()}`,
    role: 'assistant',
    content: `${res.passed ? '[PASS]' : '[FAIL]'} ${res.summary}\n\n${res.output}`,
    workspaceDir: targetDir,
    timestamp: new Date().toISOString(),
    verifyPassed: res.passed,
    actions: [
      {
        tool: 'run_verify',
        target: snapshot.chatVerifyCommand || 'auto-verify',
        ok: res.passed,
        summary: res.summary,
      },
    ],
  });
  snapshot.chatMessages = messages;
  snapshot.chatFiles = await listWorkspaceFiles(targetDir);
  await saveSnapshot(snapshot);
  return snapshot;
}

export async function sendChatMessage(
  snapshot: HarnessWorkspaceSnapshot,
  message: string,
  tierOverride?: ModelTier,
): Promise<Result<HarnessWorkspaceSnapshot, HarnessError>> {
  const dir = snapshot.chatWorkspaceDir ?? getDefaultSandboxDir();
  const dirRes = await ensureWorkspaceDirectory(dir, dir === getDefaultSandboxDir());
  if (dirRes.ok === false) {
    return {ok: false, error: dirRes.error};
  }

  const targetDir = dirRes.value;
  const messages: ChatMessageEntry[] = [...(snapshot.chatMessages ?? [])];
  const userEntry: ChatMessageEntry = {
    id: `MSG-${Date.now()}-u`,
    role: 'user',
    content: message,
    workspaceDir: targetDir,
    timestamp: new Date().toISOString(),
  };

  const initialTier: ModelTier =
    tierOverride ??
    (snapshot.adapters.modelAdapter === 'deepseek-pro' ? 'pro' : 'flash');

  const turnRes = await runWorkspaceChatTurn({
    workspaceDir: targetDir,
    userMessage: message,
    initialTier,
    verifyCommand: snapshot.chatVerifyCommand,
    apiKey: process.env.DEEPSEEK_API_KEY ?? '',
    baseUrl: process.env.DEEPSEEK_BASE_URL,
    flashModel: process.env.DEEPSEEK_MODEL_FLASH,
    proModel: process.env.DEEPSEEK_MODEL_PRO,
  });

  if (turnRes.ok === false) {
    return err(turnRes.error);
  }

  const assistantEntry: ChatMessageEntry = {
    id: `MSG-${Date.now()}-a`,
    role: 'assistant',
    content: turnRes.value.reply,
    workspaceDir: targetDir,
    timestamp: new Date().toISOString(),
    modelTier: turnRes.value.modelTier,
    frameTokens: turnRes.value.frameTokens,
    budgetCeiling: turnRes.value.budgetCeiling,
    cacheHitTokens: turnRes.value.cacheHitTokens,
    staticHeadHash: turnRes.value.staticHeadHash,
    actions: turnRes.value.actions,
    verifyPassed: turnRes.value.verifyPassed,
  };

  messages.push(userEntry, assistantEntry);
  snapshot.chatMessages = messages;
  snapshot.lastFrame = turnRes.value.frame;
  snapshot.chatFiles = await listWorkspaceFiles(targetDir);
  await saveSnapshot(snapshot);
  return ok(snapshot);
}

export async function clearChatHistory(
  snapshot: HarnessWorkspaceSnapshot,
): Promise<HarnessWorkspaceSnapshot> {
  snapshot.chatMessages = [];
  await saveSnapshot(snapshot);
  return snapshot;
}
