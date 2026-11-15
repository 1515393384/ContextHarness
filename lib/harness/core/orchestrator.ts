import type {
  CodeIndexPort,
  ModelGatewayPort,
  VerifyProbePort,
  WorkspaceEditPort,
} from '../ports';
import type {
  AtomicTask,
  ExecutionTraceEntry,
  RoleKind,
  SlotFrame,
  SpecDocument,
  TargetLanguage,
  VerifyResult,
} from '../types';
import {compileSlotFrame} from './context-compiler';
import {getNextRunnableTask, validateDag} from './dag-scheduler';
import {evaluateDdiDecision} from './ddi-circuit-breaker';

export interface HarnessPorts {
  codeIndex: CodeIndexPort;
  workspace: WorkspaceEditPort;
  verifyProbe: VerifyProbePort;
  modelGateway: ModelGatewayPort;
}

export interface OrchestratorState {
  spec: SpecDocument;
  tasks: AtomicTask[];
  traces: ExecutionTraceEntry[];
  lastFrame: SlotFrame | null;
  lastVerify: VerifyResult | null;
  lastStaticHeadHash: string | null;
  taskInitialSnapshots?: Record<string, string>;
}

export interface StepOutcome {
  executed: boolean;
  finishedAll: boolean;
  halted: boolean;
  trace: ExecutionTraceEntry | null;
  frame: SlotFrame | null;
  verify: VerifyResult | null;
  tasks: AtomicTask[];
}

export interface TaskPlanInput {
  userPrompt: string;
  targetLanguage?: TargetLanguage;
  targetFile?: string;
  targetSymbol?: string;
  contractFile?: string;
  testFile?: string;
  startLine?: number;
  endLine?: number;
}

export function buildSpecAndDag(input: TaskPlanInput): {
  spec: SpecDocument;
  tasks: AtomicTask[];
} {
  const prompt =
    input.userPrompt.trim() ||
    'Enforce strict token budget truncation and deterministic line slicing.';
  const targetLanguage = input.targetLanguage ?? 'typescript';
  const targetFile = input.targetFile?.trim() || 'lib/harness/core/token-budget.ts';
  const targetSymbol = input.targetSymbol?.trim() || 'truncateToTokenBudget';
  const contractFile = input.contractFile?.trim() || 'lib/harness/types.ts';
  const testFile = input.testFile?.trim() || 'lib/harness/core/harness.test.ts';
  const startLine = Math.max(1, input.startLine ?? 32);
  const endLine = Math.max(startLine, input.endLine ?? 78);

  const spec: SpecDocument = {
    id: 'SPEC-01',
    title: prompt.length > 72 ? `${prompt.slice(0, 72)}...` : prompt,
    userPrompt: prompt,
    targetLanguage,
    businessRules: [
      'Enforce native interface / Result<T, E> / assert primitives across module boundaries.',
      'Lock contract and test files read-only during micro_coder and surgical_debugger phases.',
      'Trigger DDI rollback after 2 identical error hashes and escalate via SWE-Router on repeat.',
    ],
    inputOutputSummary: `Target: ${targetFile}:${startLine}-${endLine} (${targetSymbol}) | Contract: ${contractFile} | Verify: ${testFile}`,
    acceptanceCriteria: [
      `Typecheck passes cleanly on ${targetFile}`,
      `Unit assertions in ${testFile} pass without modifying locked contracts or tests`,
      'Compiled 4-Slot frame stays strictly within role token budget (3K-8K)',
    ],
    createdAt: new Date().toISOString(),
  };

  const tasks: AtomicTask[] = [
    {
      id: 'T-01',
      title: `Verify locked contract anchors in ${contractFile}`,
      targetFile: contractFile,
      targetSymbol,
      dependsOn: [],
      contractFile,
      testFile,
      writeLock: {
        editableRange: {file: contractFile, startLine: 1, endLine: 40},
        readOnlyFiles: [testFile],
      },
      status: 'passed',
      attempts: 1,
      maxAttempts: 5,
      errorHistory: [],
      lastErrorHash: null,
      rewrittenOnce: false,
      widened1Hop: false,
      activeModelTier: 'flash',
      pitfallHint: null,
    },
    {
      id: 'T-02',
      title: `Implement and verify ${targetSymbol} in ${targetFile}`,
      targetFile,
      targetSymbol,
      dependsOn: ['T-01'],
      contractFile,
      testFile,
      writeLock: {
        editableRange: {file: targetFile, startLine, endLine},
        readOnlyFiles: [contractFile, testFile].filter(
          (f, idx, arr) => f !== targetFile && arr.indexOf(f) === idx,
        ),
      },
      status: 'pending',
      attempts: 0,
      maxAttempts: 5,
      errorHistory: [],
      lastErrorHash: null,
      rewrittenOnce: false,
      widened1Hop: false,
      activeModelTier: 'flash',
      pitfallHint: null,
    },
  ];

  return {spec, tasks};
}

export async function runSingleStep(
  state: OrchestratorState,
  ports: HarnessPorts,
): Promise<StepOutcome> {
  const dagCheck = validateDag(state.tasks);
  if (!dagCheck.ok) {
    return {
      executed: false,
      finishedAll: false,
      halted: true,
      trace: null,
      frame: state.lastFrame,
      verify: state.lastVerify,
      tasks: state.tasks,
    };
  }

  const nextTask = getNextRunnableTask(state.tasks);
  if (!nextTask) {
    const anyHalted = state.tasks.some((t) => t.status === 'halted');
    const allPassed = state.tasks.every((t) => t.status === 'passed');
    return {
      executed: false,
      finishedAll: allPassed,
      halted: anyHalted,
      trace: null,
      frame: state.lastFrame,
      verify: state.lastVerify,
      tasks: state.tasks,
    };
  }

  const startedAt = Date.now();
  const round = state.traces.length + 1;
  const role: RoleKind =
    nextTask.attempts === 0 ? 'micro_coder' : 'surgical_debugger';

  const snapId = await ports.workspace.snapshot(`${nextTask.id}-r${round}`);
  if (!state.taskInitialSnapshots) {
    state.taskInitialSnapshots = {};
  }
  if (!state.taskInitialSnapshots[nextTask.id]) {
    state.taskInitialSnapshots[nextTask.id] = snapId;
  }

  const frame = await compileSlotFrame({
    task: nextTask,
    spec: state.spec,
    role,
    modelTier: nextTask.activeModelTier,
    round,
    previousStaticHeadHash: state.lastStaticHeadHash,
    latestVerify: nextTask.attempts > 0 ? state.lastVerify : null,
    codeIndex: ports.codeIndex,
    workspace: ports.workspace,
  });

  const inferRes = await ports.modelGateway.inferPatch(
    frame,
    role,
    nextTask.activeModelTier,
    {
      task: nextTask,
      attempt: nextTask.attempts + 1,
    },
  );

  if (!inferRes.ok) {
    const trace: ExecutionTraceEntry = {
      id: `TR-${round}`,
      round,
      taskId: nextTask.id,
      taskTitle: nextTask.title,
      role,
      modelTier: nextTask.activeModelTier,
      frameTokens: frame.totalTokens,
      budgetCeiling: frame.budgetCeiling,
      staticHeadHash: frame.staticHeadHash,
      cacheHit: frame.cacheHitExpected,
      verifyStage: 'COMPILE',
      verifyPassed: false,
      errorHash: 'GW_ERR',
      ddiDecision: 'RETRY_SURGICAL_DEBUG',
      durationMs: Math.max(1, Date.now() - startedAt),
      summary: `Model gateway failed: ${inferRes.error.message}`,
    };
    state.traces.push(trace);
    state.lastFrame = frame;
    state.lastStaticHeadHash = frame.staticHeadHash;
    return {
      executed: true,
      finishedAll: false,
      halted: false,
      trace,
      frame,
      verify: state.lastVerify,
      tasks: state.tasks,
    };
  }

  const patchRes = await ports.workspace.applyLinePatch(
    inferRes.value.patch,
    nextTask.writeLock,
  );

  let verifyResult: VerifyResult;
  if (!patchRes.ok) {
    verifyResult = {
      passed: false,
      stage: 'COMPILE',
      errorHash: patchRes.error.code,
      summary: patchRes.error.message,
      stackFrames: [],
    };
  } else {
    const verifyRes = await ports.verifyProbe.runVerify(
      nextTask,
      inferRes.value.requestedProbe ? [inferRes.value.requestedProbe] : undefined,
    );
    verifyResult = verifyRes.ok
      ? verifyRes.value
      : {
          passed: false,
          stage: 'COMPILE',
          errorHash: verifyRes.error.code,
          summary: verifyRes.error.message,
          stackFrames: [],
        };
  }

  const ddiEval = evaluateDdiDecision(nextTask, verifyResult);

  if (ddiEval.shouldResetDirtyImpl) {
    const cleanSnap = state.taskInitialSnapshots[nextTask.id] ?? snapId;
    await ports.workspace.rollback(cleanSnap);
  }

  nextTask.attempts += 1;
  if (verifyResult.passed) {
    nextTask.status = 'passed';
    nextTask.lastErrorHash = null;
  } else {
    nextTask.errorHistory.push(verifyResult.errorHash);
    nextTask.lastErrorHash = verifyResult.errorHash;
    nextTask.pitfallHint = ddiEval.pitfallHint;
    if (ddiEval.decision === 'ROLLBACK_AND_REWRITE') {
      nextTask.rewrittenOnce = true;
      nextTask.status = 'in_progress';
    } else if (ddiEval.decision === 'WIDEN_1HOP_AND_ESCALATE_PRO') {
      nextTask.widened1Hop = true;
      nextTask.activeModelTier = 'pro';
      nextTask.status = 'in_progress';
    } else if (ddiEval.decision === 'HALT_AND_REPORT_TO_SPEC') {
      nextTask.status = 'halted';
    } else {
      nextTask.status = 'in_progress';
    }
  }

  const cacheHit =
    Boolean(inferRes.value.cacheHitTokens && inferRes.value.cacheHitTokens > 0) ||
    frame.cacheHitExpected;

  const trace: ExecutionTraceEntry = {
    id: `TR-${round}`,
    round,
    taskId: nextTask.id,
    taskTitle: nextTask.title,
    role,
    modelTier: frame.modelTier,
    frameTokens: frame.totalTokens,
    budgetCeiling: frame.budgetCeiling,
    staticHeadHash: frame.staticHeadHash,
    cacheHit,
    verifyStage: verifyResult.stage,
    verifyPassed: verifyResult.passed,
    errorHash: verifyResult.passed ? null : verifyResult.errorHash,
    ddiDecision: ddiEval.decision,
    durationMs: Math.max(1, Date.now() - startedAt),
    summary: verifyResult.passed
      ? `${inferRes.value.reasoningSummary} · Verified`
      : `${verifyResult.summary} -> ${ddiEval.reason}`,
  };

  state.traces.push(trace);
  state.lastFrame = frame;
  state.lastVerify = verifyResult;
  state.lastStaticHeadHash = frame.staticHeadHash;

  return {
    executed: true,
    finishedAll: state.tasks.every((t) => t.status === 'passed'),
    halted: state.tasks.some((t) => t.status === 'halted'),
    trace,
    frame,
    verify: verifyResult,
    tasks: state.tasks,
  };
}

export async function runClosedLoop(
  state: OrchestratorState,
  ports: HarnessPorts,
  maxSteps = 12,
): Promise<StepOutcome[]> {
  const outcomes: StepOutcome[] = [];
  for (let i = 0; i < maxSteps; i += 1) {
    const step = await runSingleStep(state, ports);
    outcomes.push(step);
    if (!step.executed || step.finishedAll || step.halted) {
      break;
    }
  }
  return outcomes;
}
