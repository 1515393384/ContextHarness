import {promises as fs} from 'node:fs';
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
import type {
  AdapterProfile,
  HarnessWorkspaceSnapshot,
  RoleKind,
} from './types';

const STATE_PATH = '/tmp/contextharness-workspace-state.json';

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

  snapshot.targetFilePreview = targetRead.ok
    ? targetRead.value
    : `// ${targetRead.error.message}`;
  snapshot.testFilePreview = testRead.ok
    ? testRead.value
    : `// ${testRead.error.message}`;
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
      endLine: 78,
    },
  );

  const firstRunnable = getNextRunnableTask(tasks) ?? tasks[0];
  const activeAdapters: AdapterProfile = adapters ?? {
    indexAdapter: 'treesitter-local',
    probeAdapter: 'local-tsc-test',
    modelAdapter: 'deepseek-v4.1-flash-1017',
  };

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
    return parsed;
  } catch {
    return createFreshSnapshot();
  }
}

export async function saveSnapshot(
  snapshot: HarnessWorkspaceSnapshot,
): Promise<void> {
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
  const verify = verifyRes.ok
    ? verifyRes.value
    : {
        passed: false,
        stage: 'COMPILE' as const,
        errorHash: verifyRes.error.code,
        summary: verifyRes.error.message,
        stackFrames: [],
      };

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
  };

  const outcome = await runSingleStep(orchState, ports);
  snapshot.traces = orchState.traces;
  snapshot.lastFrame = orchState.lastFrame;
  snapshot.lastVerify = orchState.lastVerify;
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
  };

  const outcomes = await runClosedLoop(orchState, ports, 10);
  snapshot.traces = orchState.traces;
  snapshot.lastFrame = orchState.lastFrame;
  snapshot.lastVerify = orchState.lastVerify;
  const lastOutcome = outcomes[outcomes.length - 1];
  if (lastOutcome?.trace) {
    snapshot.activeTaskId = lastOutcome.trace.taskId;
  }

  await refreshPreviews(snapshot, ports.workspace as LocalFsWorkspaceAdapter);
  await saveSnapshot(snapshot);
  return snapshot;
}
