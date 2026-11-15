import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSlotFrame} from './context-compiler';
import {checkWriteLock, getNextRunnableTask, validateDag} from './dag-scheduler';
import {evaluateDdiDecision} from './ddi-circuit-breaker';
import {
  buildSpecAndDag,
  runClosedLoop,
  type HarnessPorts,
  type OrchestratorState,
} from './orchestrator';
import {computeStableHash, estimateTokens, truncateToTokenBudget} from './token-budget';
import {
  err,
  ok,
  type AtomicTask,
  type HarnessError,
  type LinePatch,
  type ModelInferOutput,
  type ModelTier,
  type Result,
  type RoleKind,
  type SlotFrame,
  type VerifyResult,
  type WriteLockZone,
} from '../types';
import type {
  CodeIndexPort,
  ModelGatewayPort,
  VerifyProbePort,
  WorkspaceEditPort,
} from '../ports';

function createMemoryPorts(files: Record<string, string>, failRounds = 0): HarnessPorts {
  const snapshots = new Map<string, Record<string, string>>();

  const codeIndex: CodeIndexPort = {
    adapterName: 'test-index',
    async getRepoSkeleton(scope, maxTokens) {
      return truncateToTokenBudget(scope.join('\n'), maxTokens).text;
    },
    async getSlice(file, _symbol, maxTokens) {
      const content = files[file] ?? '';
      return ok(truncateToTokenBudget(content, maxTokens).text);
    },
    async get1HopCallers(_file, symbol, maxTokens) {
      return ok(truncateToTokenBudget(`caller -> ${symbol}`, maxTokens).text);
    },
  };

  const workspace: WorkspaceEditPort = {
    adapterName: 'test-workspace',
    async readWithLineNumbers(file, start = 1, end) {
      const lines = (files[file] ?? '').split('\n');
      const s = Math.max(0, start - 1);
      const e = end ? Math.min(lines.length, end) : lines.length;
      return ok(lines.slice(s, e).map((l, i) => `${s + i + 1} | ${l}`).join('\n'));
    },
    async applyLinePatch(patch: LinePatch, lockZone: WriteLockZone) {
      const lockCheck = checkWriteLock(patch, lockZone);
      if (!lockCheck.ok) return lockCheck;
      const lines = (files[patch.file] ?? '').split('\n');
      const s = patch.startLine - 1;
      const e = Math.min(lines.length, patch.endLine);
      const updated = [...lines.slice(0, s), ...patch.newCode.split('\n'), ...lines.slice(e)].join('\n');
      files[patch.file] = updated;
      return ok({updatedContent: updated});
    },
    async snapshot(label) {
      const id = `${label}-${snapshots.size + 1}`;
      snapshots.set(id, {...files});
      return id;
    },
    async rollback(snapshotId) {
      const snap = snapshots.get(snapshotId);
      if (snap) {
        for (const [k, v] of Object.entries(snap)) files[k] = v;
      }
      return ok(undefined);
    },
  };

  const verifyProbe: VerifyProbePort = {
    adapterName: 'test-verify',
    async runVerify(task): Promise<Result<VerifyResult, HarnessError>> {
      const src = files[task.targetFile] ?? '';
      if (src.includes('BUGGY_IMPL')) {
        return ok({
          passed: false,
          stage: 'UNIT_TEST',
          errorHash: computeStableHash('ERR_ASSERT_FAIL'),
          summary: 'AssertionError: null guard missing',
          expectedVsActual: 'Expected: Err(INVALID_INPUT) | Actual: NaN',
          stackFrames: [`at ${task.targetFile}:10`],
          probeSnapshot: {value: null, result: 'NaN'},
        });
      }
      return ok({
        passed: true,
        stage: 'UNIT_TEST',
        errorHash: '00000000',
        summary: 'All assertions passed',
        stackFrames: [],
      });
    },
  };

  const modelGateway: ModelGatewayPort = {
    adapterName: 'test-gateway',
    async inferPatch(
      frame: SlotFrame,
      _role: RoleKind,
      tier: ModelTier,
      hints,
    ): Promise<Result<ModelInferOutput, HarnessError>> {
      const attempt = hints?.attempt ?? 1;
      const task = hints?.task;
      if (!task) {
        return err({code: 'MODEL_GATEWAY_ERROR', message: 'Missing task'});
      }
      const emitBug = tier === 'flash' && attempt <= failRounds;
      return ok({
        reasoningSummary: emitBug ? `Flash attempt ${attempt} incomplete` : `${tier} resolved patch`,
        patch: {
          file: task.targetFile,
          startLine: task.writeLock.editableRange.startLine,
          endLine: task.writeLock.editableRange.endLine,
          expectedFirstLine: '',
          newCode: emitBug
            ? '  return BUGGY_IMPL();'
            : '  return { ok: true, value: 42 };',
        },
        promptTokens: frame.totalTokens,
        cacheHitTokens: frame.cacheHitExpected ? frame.slot1StaticHead.tokens : 0,
      });
    },
  };

  return {codeIndex, workspace, verifyProbe, modelGateway};
}

test('token-budget strictly caps oversized input under target limit', () => {
  const giant = Array.from({length: 400}, (_, i) => `export const line_${i} = "payload_${i}";`).join('\n');
  const originalTokens = estimateTokens(giant);
  assert.ok(originalTokens > 2000);

  const bounded = truncateToTokenBudget(giant, 600);
  assert.equal(bounded.pruned, true);
  assert.ok(bounded.tokens <= 600, `Expected <= 600 tokens, got ${bounded.tokens}`);
});

test('4-Slot Context Compiler enforces 4K Micro-Coder ceiling and preserves Prefix Cache static head hash', async () => {
  const {spec, tasks} = buildSpecAndDag({
    userPrompt: 'Implement guarded calculation',
    targetFile: 'src/calc.ts',
    targetSymbol: 'calcValue',
    contractFile: 'src/types.ts',
    testFile: 'tests/calc.test.ts',
    startLine: 4,
    endLine: 12,
  });

  const files: Record<string, string> = {
    'src/types.ts': Array.from({length: 500}, (_, i) => `export type ExtraType${i} = string;`).join('\n'),
    'src/calc.ts': Array.from({length: 20}, (_, i) => `// line ${i + 1}`).join('\n'),
    'tests/calc.test.ts': 'assert.equal(1, 1);',
  };

  const ports = createMemoryPorts(files);
  const targetTask = tasks[1];

  const frame1 = await compileSlotFrame({
    task: targetTask,
    spec,
    role: 'micro_coder',
    modelTier: 'flash',
    round: 1,
    previousStaticHeadHash: null,
    latestVerify: null,
    codeIndex: ports.codeIndex,
    workspace: ports.workspace,
  });

  assert.ok(frame1.totalTokens <= frame1.budgetCeiling);
  assert.equal(frame1.cacheHitExpected, false);

  const frame2 = await compileSlotFrame({
    task: targetTask,
    spec,
    role: 'micro_coder',
    modelTier: 'flash',
    round: 2,
    previousStaticHeadHash: frame1.staticHeadHash,
    latestVerify: null,
    codeIndex: ports.codeIndex,
    workspace: ports.workspace,
  });

  assert.equal(frame1.staticHeadHash, frame2.staticHeadHash);
  assert.equal(frame2.cacheHitExpected, true);
});

test('DAG scheduler detects cycles and physical write-lock blocks tampering with read-only Contract/Tests', () => {
  const {tasks} = buildSpecAndDag({
    userPrompt: 'Validate write lock',
    targetFile: 'src/calc.ts',
    targetSymbol: 'calcValue',
    contractFile: 'src/types.ts',
    testFile: 'tests/calc.test.ts',
    startLine: 5,
    endLine: 20,
  });

  assert.equal(validateDag(tasks).ok, true);

  const cyclic: AtomicTask[] = [
    {...tasks[0], dependsOn: ['T-02']},
    {...tasks[1], dependsOn: ['T-01']},
  ];
  const cycleRes = validateDag(cyclic);
  assert.equal(cycleRes.ok, false);
  if (!cycleRes.ok) {
    assert.equal(cycleRes.error.code, 'DAG_CYCLE_DETECTED');
  }

  const t02 = tasks[1];
  const lockBlockedTest = checkWriteLock(
    {
      file: t02.testFile,
      startLine: 1,
      endLine: 3,
      expectedFirstLine: '',
      newCode: '// tamper test',
    },
    t02.writeLock,
  );
  assert.equal(lockBlockedTest.ok, false);
  if (!lockBlockedTest.ok) {
    assert.equal(lockBlockedTest.error.code, 'WRITE_LOCK_VIOLATION');
  }

  const lockBlockedLines = checkWriteLock(
    {
      file: t02.targetFile,
      startLine: 1,
      endLine: 3,
      expectedFirstLine: '',
      newCode: '// tamper signature',
    },
    t02.writeLock,
  );
  assert.equal(lockBlockedLines.ok, false);
  assert.equal(getNextRunnableTask(tasks)?.id, 'T-02');
});

test('DDI circuit breaker triggers ROLLBACK_AND_REWRITE on 2nd identical errorHash and escalates to Pro afterwards', () => {
  const {tasks} = buildSpecAndDag({userPrompt: 'Test DDI transitions'});
  const task: AtomicTask = {...tasks[1]};
  const failingVerify: VerifyResult = {
    passed: false,
    stage: 'UNIT_TEST',
    errorHash: 'ERR_NAN_01',
    summary: 'Expected INVALID_COUPON, got NaN',
    stackFrames: ['at src/calc.ts:12'],
  };

  const eval1 = evaluateDdiDecision(task, failingVerify);
  assert.equal(eval1.decision, 'RETRY_SURGICAL_DEBUG');
  assert.equal(eval1.shouldResetDirtyImpl, false);

  task.attempts = 1;
  task.errorHistory = ['ERR_NAN_01'];
  const eval2 = evaluateDdiDecision(task, failingVerify);
  assert.equal(eval2.decision, 'ROLLBACK_AND_REWRITE');
  assert.equal(eval2.shouldResetDirtyImpl, true);

  task.attempts = 2;
  task.rewrittenOnce = true;
  task.errorHistory = ['ERR_NAN_01', 'ERR_NAN_01'];
  const eval3 = evaluateDdiDecision(task, failingVerify);
  assert.equal(eval3.decision, 'WIDEN_1HOP_AND_ESCALATE_PRO');
  assert.equal(eval3.nextModelTier, 'pro');
  assert.equal(eval3.shouldWiden1Hop, true);
});

test('Orchestrator closed-loop recovers from repeated Flash failures via DDI rollback and Pro escalation', async () => {
  const {spec, tasks} = buildSpecAndDag({
    userPrompt: 'Recover via DDI + Pro escalation',
    targetFile: 'src/calc.ts',
    targetSymbol: 'calcValue',
    contractFile: 'src/types.ts',
    testFile: 'tests/calc.test.ts',
    startLine: 4,
    endLine: 10,
  });

  const files: Record<string, string> = {
    'src/types.ts': 'export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };',
    'src/calc.ts': Array.from({length: 12}, (_, i) => `// line ${i + 1}`).join('\n'),
    'tests/calc.test.ts': 'assert.equal(1, 1);',
  };

  const ports = createMemoryPorts(files, 3);
  const state: OrchestratorState = {
    spec,
    tasks,
    traces: [],
    lastFrame: null,
    lastVerify: null,
    lastStaticHeadHash: null,
  };

  const outcomes = await runClosedLoop(state, ports, 10);
  assert.equal(outcomes.length, 4);
  assert.equal(state.tasks.every((t) => t.status === 'passed'), true);
  assert.equal(state.traces[1].ddiDecision, 'ROLLBACK_AND_REWRITE');
  assert.equal(state.traces[2].ddiDecision, 'WIDEN_1HOP_AND_ESCALATE_PRO');
  assert.equal(state.traces[3].modelTier, 'pro');
  assert.equal(state.traces[3].verifyPassed, true);
});
