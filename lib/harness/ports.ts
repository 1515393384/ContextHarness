import type {
  AtomicTask,
  HarnessError,
  LinePatch,
  ModelInferOutput,
  ModelTier,
  ProbePoint,
  Result,
  RoleKind,
  SlotFrame,
  VerifyResult,
  WriteLockZone,
} from './types';

export interface CodeIndexPort {
  readonly adapterName: string;
  getRepoSkeleton(scopeFiles: string[], maxTokens: number): Promise<string>;
  getSlice(
    file: string,
    symbol: string,
    maxTokens: number,
  ): Promise<Result<string, HarnessError>>;
  get1HopCallers(
    file: string,
    symbol: string,
    maxTokens: number,
  ): Promise<Result<string, HarnessError>>;
}

export interface WorkspaceEditPort {
  readonly adapterName: string;
  readWithLineNumbers(
    file: string,
    startLine?: number,
    endLine?: number,
  ): Promise<Result<string, HarnessError>>;
  applyLinePatch(
    patch: LinePatch,
    lockZone: WriteLockZone,
  ): Promise<Result<{updatedContent: string}, HarnessError>>;
  snapshot(label: string): Promise<string>;
  rollback(snapshotId: string): Promise<Result<void, HarnessError>>;
}

export interface VerifyProbePort {
  readonly adapterName: string;
  runVerify(
    task: AtomicTask,
    probePoints?: ProbePoint[],
  ): Promise<Result<VerifyResult, HarnessError>>;
}

export interface ModelGatewayPort {
  readonly adapterName: string;
  inferPatch(
    frame: SlotFrame,
    role: RoleKind,
    tier: ModelTier,
    contextHints?: {
      task: AtomicTask;
      attempt: number;
      injectFailure?: boolean;
    },
  ): Promise<Result<ModelInferOutput, HarnessError>>;
}
