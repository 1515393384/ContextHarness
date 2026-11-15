export type Result<T, E> =
  | {ok: true; value: T}
  | {ok: false; error: E};

export function ok<T>(value: T): Result<T, never> {
  return {ok: true, value};
}

export function err<E>(error: E): Result<never, E> {
  return {ok: false, error};
}

export type RoleKind =
  | 'requirement_manager'
  | 'contract_planner'
  | 'micro_coder'
  | 'surgical_debugger';

export type ModelTier = 'flash' | 'pro';

export type TargetLanguage = 'typescript' | 'rust' | 'python' | 'go';

export interface RoleBudgetConfig {
  role: RoleKind;
  hardCeilingTokens: number;
  slot1MaxTokens: number;
  slot2MaxTokens: number;
  slot3MaxTokens: number;
  slot4MaxTokens: number;
}

export const ROLE_BUDGETS: Record<RoleKind, RoleBudgetConfig> = {
  requirement_manager: {
    role: 'requirement_manager',
    hardCeilingTokens: 6000,
    slot1MaxTokens: 900,
    slot2MaxTokens: 1600,
    slot3MaxTokens: 2500,
    slot4MaxTokens: 1000,
  },
  contract_planner: {
    role: 'contract_planner',
    hardCeilingTokens: 7500,
    slot1MaxTokens: 1000,
    slot2MaxTokens: 2800,
    slot3MaxTokens: 2700,
    slot4MaxTokens: 1000,
  },
  micro_coder: {
    role: 'micro_coder',
    hardCeilingTokens: 4000,
    slot1MaxTokens: 900,
    slot2MaxTokens: 1100,
    slot3MaxTokens: 1600,
    slot4MaxTokens: 400,
  },
  surgical_debugger: {
    role: 'surgical_debugger',
    hardCeilingTokens: 6000,
    slot1MaxTokens: 900,
    slot2MaxTokens: 1700,
    slot3MaxTokens: 1900,
    slot4MaxTokens: 1500,
  },
};

export const WIDENED_DEBUGGER_CEILING = 8000;

export interface HarnessError {
  code:
    | 'BUDGET_EXCEEDED'
    | 'WRITE_LOCK_VIOLATION'
    | 'PATCH_ANCHOR_MISMATCH'
    | 'DAG_CYCLE_DETECTED'
    | 'DAG_MISSING_DEPENDENCY'
    | 'MODEL_GATEWAY_ERROR'
    | 'VERIFY_EXECUTION_ERROR';
  message: string;
  details?: string;
}

export interface SpecDocument {
  id: string;
  title: string;
  userPrompt: string;
  targetLanguage: TargetLanguage;
  businessRules: string[];
  inputOutputSummary: string;
  acceptanceCriteria: string[];
  createdAt: string;
}

export interface EditableLineRange {
  file: string;
  startLine: number;
  endLine: number;
}

export interface WriteLockZone {
  editableRange: EditableLineRange;
  readOnlyFiles: string[];
}

export type TaskStatus = 'pending' | 'in_progress' | 'passed' | 'halted';

export type DdiDecision =
  | 'COMMIT_NEXT'
  | 'RETRY_SURGICAL_DEBUG'
  | 'ROLLBACK_AND_REWRITE'
  | 'WIDEN_1HOP_AND_ESCALATE_PRO'
  | 'HALT_AND_REPORT_TO_SPEC';

export interface AtomicTask {
  id: string;
  title: string;
  targetFile: string;
  targetSymbol: string;
  dependsOn: string[];
  contractFile: string;
  testFile: string;
  writeLock: WriteLockZone;
  status: TaskStatus;
  attempts: number;
  maxAttempts: number;
  errorHistory: string[];
  lastErrorHash: string | null;
  rewrittenOnce: boolean;
  widened1Hop: boolean;
  activeModelTier: ModelTier;
  pitfallHint: string | null;
}

export interface ProbePoint {
  file: string;
  line: number;
  expressions: string[];
}

export interface VerifyResult {
  passed: boolean;
  stage: 'COMPILE' | 'UNIT_TEST';
  errorHash: string;
  summary: string;
  expectedVsActual?: string;
  stackFrames: string[];
  probeSnapshot?: Record<string, unknown>;
}

export interface LinePatch {
  file: string;
  startLine: number;
  endLine: number;
  expectedFirstLine: string;
  newCode: string;
}

export interface SlotContent {
  label: string;
  content: string;
  tokens: number;
  maxTokens: number;
  pruned: boolean;
}

export interface SlotFrame {
  taskId: string;
  role: RoleKind;
  modelTier: ModelTier;
  round: number;
  slot1StaticHead: SlotContent;
  slot2ContractAnchors: SlotContent;
  slot3SurgicalSlice: SlotContent;
  slot4VerifyFeedback: SlotContent;
  totalTokens: number;
  budgetCeiling: number;
  staticHeadHash: string;
  cacheHitExpected: boolean;
  prunedItems: string[];
}

export interface ModelInferOutput {
  reasoningSummary: string;
  patch: LinePatch;
  requestedProbe?: ProbePoint;
  promptTokens?: number;
  cacheHitTokens?: number;
  completionTokens?: number;
}

export interface ExecutionTraceEntry {
  id: string;
  round: number;
  taskId: string;
  taskTitle: string;
  role: RoleKind;
  modelTier: ModelTier;
  frameTokens: number;
  budgetCeiling: number;
  staticHeadHash: string;
  cacheHit: boolean;
  verifyStage: 'COMPILE' | 'UNIT_TEST';
  verifyPassed: boolean;
  errorHash: string | null;
  ddiDecision: DdiDecision;
  durationMs: number;
  summary: string;
}

export type IndexAdapterKind = 'treesitter-local' | 'lsp-serena' | 'cpg-codebadger';
export type ProbeAdapterKind = 'local-tsc-test' | 'runtime-probe';
export type ModelAdapterKind = 'deepseek-v4.1-flash-1017' | 'deepseek-pro';

export interface AdapterProfile {
  indexAdapter: IndexAdapterKind;
  probeAdapter: ProbeAdapterKind;
  modelAdapter: ModelAdapterKind;
}

export type ChatToolName =
  | 'list_files'
  | 'list_dir'
  | 'grep_search'
  | 'find_references'
  | 'read_slice'
  | 'write_file'
  | 'replace_lines'
  | 'delete_file'
  | 'move_file'
  | 'run_command'
  | 'run_verify';

export interface ChatStepAction {
  tool: ChatToolName;
  target: string;
  ok: boolean;
  summary: string;
}

export interface ChatMessageEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  workspaceDir: string;
  timestamp: string;
  turnId?: string;
  modifiedFiles?: string[];
  modelTier?: ModelTier;
  frameTokens?: number;
  budgetCeiling?: number;
  cacheHitTokens?: number;
  staticHeadHash?: string;
  actions?: ChatStepAction[];
  verifyPassed?: boolean;
}

export interface ChatSessionRecord {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessageEntry[];
  lastTurnId: string | null;
}

export interface StepDebugTrace {
  step: number;
  modelTier: ModelTier;
  durationMs: number;
  finishReason: string;
  cacheHitTokens: number;
  frame: SlotFrame;
  rawModelOutput: string;
  parsedReasoning?: string;
  parsedTool?: string;
  toolFeedback: string;
}

export interface ToolRegressionItem {
  name: string;
  passed: boolean;
  durationMs: number;
  detail: string;
}

export interface ToolRegressionReport {
  timestamp: string;
  workspaceDir: string;
  passedCount: number;
  totalCount: number;
  durationMs: number;
  items: ToolRegressionItem[];
}

export type HarnessStreamEvent =
  | {
      type: 'step_start';
      step: number;
      maxSteps: number;
      modelTier: ModelTier;
      frameTokens: number;
      budgetCeiling: number;
      staticHeadHash: string;
      cacheHitTokens: number;
    }
  | {
      type: 'model_delta';
      step: number;
      delta: string;
      charCount: number;
    }
  | {
      type: 'tool_start';
      step: number;
      tool: string;
      target: string;
    }
  | {
      type: 'tool_done';
      step: number;
      action: ChatStepAction;
    }
  | {
      type: 'ddi_rollback';
      step: number;
      errorHash: string;
      restoredFiles: string[];
    }
  | {
      type: 'ddi_escalate';
      step: number;
      errorHash: string;
      fromTier: ModelTier;
      toTier: ModelTier;
    }
  | {
      type: 'step_error';
      step: number;
      message: string;
    }
  | {
      type: 'step_trace';
      trace: StepDebugTrace;
    };

export interface HarnessWorkspaceSnapshot {
  spec: SpecDocument;
  tasks: AtomicTask[];
  activeTaskId: string;
  targetFilePreview: string;
  testFilePreview: string;
  traces: ExecutionTraceEntry[];
  lastFrame: SlotFrame | null;
  lastVerify: VerifyResult | null;
  adapters: AdapterProfile;
  deepseekConfigured: boolean;
  taskInitialSnapshots?: Record<string, string>;
  chatWorkspaceDir?: string;
  chatVerifyCommand?: string;
  chatFiles?: string[];
  chatMessages?: ChatMessageEntry[];
  lastChatTurnId?: string | null;
}
