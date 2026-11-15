import type {AtomicTask, DdiDecision, VerifyResult} from '../types';

export interface DdiEvaluation {
  decision: DdiDecision;
  reason: string;
  consecutiveRepeatCount: number;
  shouldResetDirtyImpl: boolean;
  nextModelTier: 'flash' | 'pro';
  shouldWiden1Hop: boolean;
  pitfallHint: string | null;
}

export function countConsecutiveErrorRepeats(
  errorHistory: string[],
  currentHash: string,
): number {
  let count = 1;
  for (let i = errorHistory.length - 1; i >= 0; i -= 1) {
    if (errorHistory[i] === currentHash) {
      count += 1;
    } else {
      break;
    }
  }
  return count;
}

export function evaluateDdiDecision(
  task: AtomicTask,
  verifyResult: VerifyResult,
): DdiEvaluation {
  if (verifyResult.passed) {
    return {
      decision: 'COMMIT_NEXT',
      reason: 'Static typecheck and unit assertions passed; commit snapshot and discard context.',
      consecutiveRepeatCount: 0,
      shouldResetDirtyImpl: false,
      nextModelTier: task.activeModelTier,
      shouldWiden1Hop: false,
      pitfallHint: null,
    };
  }

  const nextAttempts = task.attempts + 1;
  const consecutiveRepeats = countConsecutiveErrorRepeats(
    task.errorHistory,
    verifyResult.errorHash,
  );

  if (nextAttempts >= task.maxAttempts) {
    return {
      decision: 'HALT_AND_REPORT_TO_SPEC',
      reason: `Reached max attempt ceiling (${task.maxAttempts}); halting and escalating to spec review.`,
      consecutiveRepeatCount: consecutiveRepeats,
      shouldResetDirtyImpl: true,
      nextModelTier: 'pro',
      shouldWiden1Hop: true,
      pitfallHint: `Unresolved after max attempts [${verifyResult.errorHash}]: ${verifyResult.summary}`,
    };
  }

  if (consecutiveRepeats >= 2 && !task.rewrittenOnce) {
    return {
      decision: 'ROLLBACK_AND_REWRITE',
      reason: `Identical error hash [${verifyResult.errorHash}] repeated 2 rounds; rolling back dirty impl for clean rewrite.`,
      consecutiveRepeatCount: consecutiveRepeats,
      shouldResetDirtyImpl: true,
      nextModelTier: task.activeModelTier,
      shouldWiden1Hop: false,
      pitfallHint: `Avoid prior failure at [${verifyResult.summary}]${
        verifyResult.expectedVsActual ? ` (${verifyResult.expectedVsActual})` : ''
      }; rewrite cleanly from stub.`,
    };
  }

  if ((consecutiveRepeats >= 2 && task.rewrittenOnce) || nextAttempts >= 3) {
    return {
      decision: 'WIDEN_1HOP_AND_ESCALATE_PRO',
      reason: `Did not converge after rewrite (attempt ${nextAttempts}); widening 1-hop context and escalating to Pro tier.`,
      consecutiveRepeatCount: consecutiveRepeats,
      shouldResetDirtyImpl: true,
      nextModelTier: 'pro',
      shouldWiden1Hop: true,
      pitfallHint: `Pro escalation: inspect 1-hop callers to resolve [${verifyResult.summary}].`,
    };
  }

  return {
    decision: 'RETRY_SURGICAL_DEBUG',
    reason: 'Initial verify failure; clearing prior conversation history and invoking Surgical Debugger.',
    consecutiveRepeatCount: consecutiveRepeats,
    shouldResetDirtyImpl: false,
    nextModelTier: task.activeModelTier,
    shouldWiden1Hop: task.widened1Hop,
    pitfallHint: task.pitfallHint,
  };
}
