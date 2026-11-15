import type {CodeIndexPort, WorkspaceEditPort} from '../ports';
import {
  ROLE_BUDGETS,
  WIDENED_DEBUGGER_CEILING,
  type AtomicTask,
  type ModelTier,
  type RoleKind,
  type SlotContent,
  type SlotFrame,
  type SpecDocument,
  type VerifyResult,
} from '../types';
import {computeStableHash, truncateToTokenBudget} from './token-budget';

export interface CompileFrameInput {
  task: AtomicTask;
  spec: SpecDocument;
  role: RoleKind;
  modelTier: ModelTier;
  round: number;
  previousStaticHeadHash?: string | null;
  latestVerify?: VerifyResult | null;
  codeIndex: CodeIndexPort;
  workspace: WorkspaceEditPort;
}

/**
 * Generates byte-identical static prefix per (role, modelTier) to maximize Prefix Cache hits.
 */
export function buildStaticHead(role: RoleKind, modelTier: ModelTier): string {
  const toolSpec = JSON.stringify(
    {
      tools: [
        {
          name: 'replace_lines',
          description:
            'Replace an exact line range inside the unlocked implementation zone only.',
          parameters: {
            file: 'string',
            startLine: 'number',
            endLine: 'number',
            expectedFirstLine: 'string',
            newCode: 'string',
          },
        },
        ...(role === 'surgical_debugger'
          ? [
              {
                name: 'inspect_probe',
                description:
                  'Optional: attach a runtime variable probe at a line on next verification run.',
                parameters: {
                  file: 'string',
                  line: 'number',
                  expressions: 'string[]',
                },
              },
            ]
          : []),
      ],
    },
    null,
    0,
  );

  const roleDirectives: Record<RoleKind, string> = {
    requirement_manager:
      'ROLE: Requirement Manager. Convert ambiguous human intent into strict Spec rules, I/O contracts, and verifiable acceptance criteria. Never emit code implementations.',
    contract_planner:
      'ROLE: Contract Planner. Emit native interface/Result<T,E> types and failing TDD assertions first, plus a topologically sorted atomic task DAG (<=50 LOC per task).',
    micro_coder:
      'ROLE: Micro-Coder (Stateless). Fill ONLY the unlocked implementation lines so static typechecks and read-only unit assertions pass. Return a single replace_lines JSON call. Zero chat history.',
    surgical_debugger:
      'ROLE: Surgical Debugger (Stateless). Fix ONLY the latest compiler error or failing assertion using replace_lines. Do NOT alter locked contracts or tests. Zero stale history.',
  };

  return [
    `[STATIC_SYSTEM_PREFIX v1 | tier=${modelTier}]`,
    roleDirectives[role],
    'HARD INVARIANTS: Use native interface/Result<T,E>/assert primitives. No implicit throw. Output strictly valid JSON matching tool schema.',
    `TOOL_SCHEMA: ${toolSpec}`,
  ].join('\n');
}

/**
 * Observation Masking + AgentDiet:
 * Never feed multi-turn conversation logs or stale compiler attempts.
 * Only preserve the single latest error, Expected vs Actual diff, top 3 user stack frames, and truncated probe snapshot.
 */
export function buildMaskedFeedback(
  task: AtomicTask,
  latestVerify: VerifyResult | null | undefined,
): string {
  const lines: string[] = [];

  if (task.pitfallHint) {
    lines.push(`[DDI_PITFALL_CONSTRAINT] ${task.pitfallHint}`);
  }

  if (!latestVerify) {
    lines.push('[STATUS] Initial clean execution frame. 0 prior errors.');
    return lines.join('\n');
  }

  if (task.attempts > 1) {
    lines.push(
      `<omitted ${task.attempts - 1} earlier failed observations via Observation Masking>`,
    );
  }

  lines.push(`[VERIFY_STAGE] ${latestVerify.stage} (hash=${latestVerify.errorHash})`);
  lines.push(`[ERROR] ${latestVerify.summary}`);

  if (latestVerify.expectedVsActual) {
    lines.push(`[ASSERT_DIFF] ${latestVerify.expectedVsActual}`);
  }

  if (latestVerify.stackFrames.length > 0) {
    lines.push(
      `[STACK_USER_FRAMES]\n${latestVerify.stackFrames.slice(0, 3).join('\n')}`,
    );
  }

  if (latestVerify.probeSnapshot) {
    const serialized = JSON.stringify(latestVerify.probeSnapshot);
    const bounded =
      serialized.length > 480 ? serialized.slice(0, 480) + '...(truncated)' : serialized;
    lines.push(`[RUNTIME_PROBE_SNAPSHOT] ${bounded}`);
  }

  return lines.join('\n');
}

export async function compileSlotFrame(
  input: CompileFrameInput,
): Promise<SlotFrame> {
  const {
    task,
    spec,
    role,
    modelTier,
    round,
    previousStaticHeadHash,
    latestVerify,
    codeIndex,
    workspace,
  } = input;

  const baseBudget = ROLE_BUDGETS[role];
  const budgetCeiling =
    role === 'surgical_debugger' && task.widened1Hop
      ? WIDENED_DEBUGGER_CEILING
      : baseBudget.hardCeilingTokens;

  const prunedItems: string[] = [];

  // Slot 1: Static Head (byte-invariant across rounds for Prefix Cache)
  const rawSlot1 = buildStaticHead(role, modelTier);
  const slot1Fit = truncateToTokenBudget(rawSlot1, baseBudget.slot1MaxTokens);
  if (slot1Fit.pruned) prunedItems.push('slot1StaticHead');
  const staticHeadHash = computeStableHash(slot1Fit.text);
  const cacheHitExpected =
    Boolean(previousStaticHeadHash) && previousStaticHeadHash === staticHeadHash;

  // Slot 2: Native Contract Anchors (+ optional 1-hop callers when DDI widened)
  const contractSliceRes = await codeIndex.getSlice(
    task.contractFile,
    task.targetSymbol,
    Math.floor(baseBudget.slot2MaxTokens * 0.65),
  );
  let contractText = '';
  if (contractSliceRes.ok === true) {
    contractText = contractSliceRes.value;
  } else {
    contractText = `// Missing contract slice: ${contractSliceRes.error.message}`;
  }

  let callerText = '';
  if (task.widened1Hop) {
    const callersRes = await codeIndex.get1HopCallers(
      task.targetFile,
      task.targetSymbol,
      Math.floor(baseBudget.slot2MaxTokens * 0.35),
    );
    if (callersRes.ok) {
      callerText = `\n[1-HOP_CALLERS_WIDENED]\n${callersRes.value}`;
    }
  }

  const specAnchor = [
    `[TASK_SPEC ${task.id}] ${task.title} (lang=${spec.targetLanguage})`,
    `[LOCK_BOUNDARY] writable=${task.writeLock.editableRange.file}:${task.writeLock.editableRange.startLine}-${task.writeLock.editableRange.endLine} | readOnly=${task.writeLock.readOnlyFiles.join(', ')}`,
    `[CONTRACT_TYPES]\n${contractText}${callerText}`,
  ].join('\n');

  const slot2Budget =
    role === 'surgical_debugger' && task.widened1Hop
      ? baseBudget.slot2MaxTokens + 1200
      : baseBudget.slot2MaxTokens;
  const slot2Fit = truncateToTokenBudget(specAnchor, slot2Budget);
  if (slot2Fit.pruned) prunedItems.push('slot2ContractAnchors');

  // Slot 3: Surgical Line-Numbered Implementation Slice + Read-Only Test Assertions
  const implStart = Math.max(1, task.writeLock.editableRange.startLine - 4);
  const implEnd = task.writeLock.editableRange.endLine + 4;
  const implRead = await workspace.readWithLineNumbers(
    task.targetFile,
    implStart,
    implEnd,
  );
  const testRead = await workspace.readWithLineNumbers(task.testFile, 1, 60);

  let implText = '';
  if (implRead.ok === true) {
    implText = implRead.value;
  } else {
    implText = `// Error reading impl: ${implRead.error.message}`;
  }

  let testText = '';
  if (testRead.ok === true) {
    testText = testRead.value;
  } else {
    testText = `// Error reading tests: ${testRead.error.message}`;
  }

  const rawSlot3 = [
    `[UNLOCKED_IMPL_SLICE ${task.targetFile}]`,
    implText,
    `[READONLY_UNIT_ASSERTIONS ${task.testFile}]`,
    testText,
  ].join('\n');

  const slot3Budget =
    role === 'surgical_debugger' && task.widened1Hop
      ? baseBudget.slot3MaxTokens + 500
      : baseBudget.slot3MaxTokens;
  const slot3Fit = truncateToTokenBudget(rawSlot3, slot3Budget);
  if (slot3Fit.pruned) prunedItems.push('slot3SurgicalSlice');

  // Slot 4: Observation-Masked Latest Verify & Runtime Probe Feedback
  const rawSlot4 = buildMaskedFeedback(task, latestVerify);
  const slot4Fit = truncateToTokenBudget(rawSlot4, baseBudget.slot4MaxTokens);
  if (slot4Fit.pruned) prunedItems.push('slot4VerifyFeedback');

  // Hard ceiling reconciliation: never exceed budgetCeiling (3K–8K)
  let s2 = slot2Fit;
  let s3 = slot3Fit;
  let s4 = slot4Fit;

  let total = slot1Fit.tokens + s2.tokens + s3.tokens + s4.tokens;
  if (total > budgetCeiling) {
    const overflow = total - budgetCeiling;
    const s2Target = Math.max(300, s2.tokens - Math.ceil(overflow * 0.6));
    s2 = truncateToTokenBudget(s2.text, s2Target);
    if (s2.pruned && !prunedItems.includes('slot2ContractAnchors')) {
      prunedItems.push('slot2ContractAnchors');
    }

    total = slot1Fit.tokens + s2.tokens + s3.tokens + s4.tokens;
    if (total > budgetCeiling) {
      const remOverflow = total - budgetCeiling;
      const s3Target = Math.max(400, s3.tokens - remOverflow);
      s3 = truncateToTokenBudget(s3.text, s3Target);
      if (s3.pruned && !prunedItems.includes('slot3SurgicalSlice')) {
        prunedItems.push('slot3SurgicalSlice');
      }
    }

    total = slot1Fit.tokens + s2.tokens + s3.tokens + s4.tokens;
    if (total > budgetCeiling) {
      const s4Target = Math.max(120, s4.tokens - (total - budgetCeiling));
      s4 = truncateToTokenBudget(s4.text, s4Target);
      if (s4.pruned && !prunedItems.includes('slot4VerifyFeedback')) {
        prunedItems.push('slot4VerifyFeedback');
      }
      total = slot1Fit.tokens + s2.tokens + s3.tokens + s4.tokens;
    }
  }

  const slot1StaticHead: SlotContent = {
    label: 'Slot 1 · Static Head (Prefix Cache)',
    content: slot1Fit.text,
    tokens: slot1Fit.tokens,
    maxTokens: baseBudget.slot1MaxTokens,
    pruned: slot1Fit.pruned,
  };
  const slot2ContractAnchors: SlotContent = {
    label: 'Slot 2 · Contract & Type Anchors',
    content: s2.text,
    tokens: s2.tokens,
    maxTokens: slot2Budget,
    pruned: s2.pruned,
  };
  const slot3SurgicalSlice: SlotContent = {
    label: 'Slot 3 · Line-Numbered Surgical Slice',
    content: s3.text,
    tokens: s3.tokens,
    maxTokens: slot3Budget,
    pruned: s3.pruned,
  };
  const slot4VerifyFeedback: SlotContent = {
    label: 'Slot 4 · Masked Verify & Probe Feedback',
    content: s4.text,
    tokens: s4.tokens,
    maxTokens: baseBudget.slot4MaxTokens,
    pruned: s4.pruned,
  };

  return {
    taskId: task.id,
    role,
    modelTier,
    round,
    slot1StaticHead,
    slot2ContractAnchors,
    slot3SurgicalSlice,
    slot4VerifyFeedback,
    totalTokens: total,
    budgetCeiling,
    staticHeadHash,
    cacheHitExpected,
    prunedItems,
  };
}
