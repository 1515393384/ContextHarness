import {execFile} from 'node:child_process';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';
import {checkWriteLock} from '../core/dag-scheduler';
import {computeStableHash, truncateToTokenBudget} from '../core/token-budget';
import type {
  CodeIndexPort,
  VerifyProbePort,
  WorkspaceEditPort,
} from '../ports';
import {
  err,
  ok,
  type AtomicTask,
  type HarnessError,
  type LinePatch,
  type Result,
  type VerifyResult,
  type WriteLockZone,
} from '../types';

const execFileAsync = promisify(execFile);

function resolveSafePath(rootDir: string, relPath: string): Result<string, HarnessError> {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(resolvedRoot, relPath);
  if (
    resolvedTarget !== resolvedRoot &&
    !resolvedTarget.startsWith(resolvedRoot + path.sep)
  ) {
    return err({
      code: 'WRITE_LOCK_VIOLATION',
      message: `Path traversal blocked outside workspace root: ${relPath}`,
    });
  }
  return ok(resolvedTarget);
}

function extractExportSignatures(content: string): string[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const signatures: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (
      trimmed.startsWith('export interface ') ||
      trimmed.startsWith('export type ') ||
      trimmed.startsWith('export function ') ||
      trimmed.startsWith('export async function ') ||
      trimmed.startsWith('export const ')
    ) {
      signatures.push(`${i + 1} | ${trimmed.replace(/\{[\s\S]*$/, '{ ... }')}`);
    }
  }
  return signatures;
}

export class LocalFsCodeIndexAdapter implements CodeIndexPort {
  public readonly adapterName: string;
  private readonly rootDir: string;

  constructor(rootDir: string, adapterName = 'treesitter-local') {
    this.rootDir = rootDir;
    this.adapterName = adapterName;
  }

  async getRepoSkeleton(scopeFiles: string[], maxTokens: number): Promise<string> {
    const sections: string[] = [];
    for (const relPath of scopeFiles) {
      const safe = resolveSafePath(this.rootDir, relPath);
      if (safe.ok === false) continue;
      try {
        const content = await fs.readFile(safe.value, 'utf8');
        const sigs = extractExportSignatures(content);
        if (sigs.length > 0) {
          sections.push(`# ${relPath}\n${sigs.join('\n')}`);
        }
      } catch {
        // Ignore unreadable files
      }
    }
    return truncateToTokenBudget(sections.join('\n\n'), maxTokens).text;
  }

  async getSlice(
    file: string,
    symbol: string,
    maxTokens: number,
  ): Promise<Result<string, HarnessError>> {
    const safe = resolveSafePath(this.rootDir, file);
    if (safe.ok === false) return safe;

    try {
      const content = (await fs.readFile(safe.value, 'utf8')).replace(/\r\n/g, '\n');
      const lines = content.split('\n');
      const matchIdx = lines.findIndex((l) => l.includes(symbol));
      if (matchIdx === -1) {
        return ok(truncateToTokenBudget(content, maxTokens).text);
      }
      const start = Math.max(0, matchIdx - 2);
      const end = Math.min(lines.length, matchIdx + 32);
      const numbered = lines
        .slice(start, end)
        .map((line, idx) => `${start + idx + 1} | ${line}`)
        .join('\n');
      return ok(truncateToTokenBudget(numbered, maxTokens).text);
    } catch (error) {
      return err({
        code: 'VERIFY_EXECUTION_ERROR',
        message: `Failed to slice file ${file}`,
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async get1HopCallers(
    file: string,
    symbol: string,
    maxTokens: number,
  ): Promise<Result<string, HarnessError>> {
    const safe = resolveSafePath(this.rootDir, file);
    if (safe.ok === false) return safe;

    try {
      const content = (await fs.readFile(safe.value, 'utf8')).replace(/\r\n/g, '\n');
      const lines = content.split('\n');
      const hits: string[] = [];
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].includes(symbol)) {
          hits.push(`${file}:${i + 1} | ${lines[i].trim()}`);
        }
      }
      return ok(truncateToTokenBudget(hits.join('\n'), maxTokens).text);
    } catch (error) {
      return err({
        code: 'VERIFY_EXECUTION_ERROR',
        message: `Failed to inspect 1-hop callers for ${symbol}`,
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function stripAccidentalLineNumbers(code: string): string {
  const normalized = code.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (
    nonEmpty.length >= 2 &&
    nonEmpty.every((l) => /^\s*\d+\s\|\s?/.test(l))
  ) {
    return lines.map((l) => l.replace(/^\s*\d+\s\|\s?/, '')).join('\n');
  }
  return normalized;
}

export class LocalFsWorkspaceAdapter implements WorkspaceEditPort {
  public readonly adapterName = 'local-fs-line-lock';
  private readonly rootDir: string;
  private readonly snapshotStorePath: string;
  private readonly snapshots = new Map<string, Map<string, string>>();

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.snapshotStorePath = path.join(rootDir, '.contextharness-snapshots.json');
  }

  private async readSnapshotStore(): Promise<Record<string, Record<string, string>>> {
    try {
      const raw = await fs.readFile(this.snapshotStorePath, 'utf8');
      return JSON.parse(raw) as Record<string, Record<string, string>>;
    } catch {
      return {};
    }
  }

  private async writeSnapshotStore(
    store: Record<string, Record<string, string>>,
  ): Promise<void> {
    await fs.writeFile(this.snapshotStorePath, JSON.stringify(store), 'utf8');
  }

  async readWithLineNumbers(
    file: string,
    startLine = 1,
    endLine?: number,
  ): Promise<Result<string, HarnessError>> {
    const safe = resolveSafePath(this.rootDir, file);
    if (safe.ok === false) return safe;

    try {
      const content = (await fs.readFile(safe.value, 'utf8')).replace(/\r\n/g, '\n');
      const lines = content.split('\n');
      const startIdx = Math.max(0, startLine - 1);
      const endIdx = endLine ? Math.min(lines.length, endLine) : lines.length;
      const sliced = lines
        .slice(startIdx, endIdx)
        .map((line, i) => `${startIdx + i + 1} | ${line}`)
        .join('\n');
      return ok(sliced);
    } catch (error) {
      return err({
        code: 'VERIFY_EXECUTION_ERROR',
        message: `Failed to read file: ${file}`,
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async applyLinePatch(
    patch: LinePatch,
    lockZone: WriteLockZone,
  ): Promise<Result<{updatedContent: string}, HarnessError>> {
    const lockCheck = checkWriteLock(patch, lockZone);
    if (lockCheck.ok === false) {
      return {ok: false, error: lockCheck.error};
    }

    const safe = resolveSafePath(this.rootDir, patch.file);
    if (safe.ok === false) return {ok: false, error: safe.error};

    try {
      const rawContent = await fs.readFile(safe.value, 'utf8');
      const content = rawContent.replace(/\r\n/g, '\n');
      const lines = content.split('\n');

      const startIdx = patch.startLine - 1;
      const endIdx = patch.endLine;
      if (startIdx < 0 || endIdx > lines.length) {
        return err({
          code: 'PATCH_ANCHOR_MISMATCH',
          message: `Line range [${patch.startLine}-${patch.endLine}] exceeds file length ${lines.length}`,
        });
      }

      const actualFirst = lines[startIdx]?.trim() ?? '';
      const expectedFirst = patch.expectedFirstLine.trim().replace(/^\d+\s\|\s?/, '');
      if (expectedFirst && !actualFirst.includes(expectedFirst)) {
        return err({
          code: 'PATCH_ANCHOR_MISMATCH',
          message: `First-line anchor mismatch: expected "${expectedFirst}", got "${actualFirst}"`,
        });
      }

      const cleanNewCode = stripAccidentalLineNumbers(patch.newCode);
      const replacementLines = cleanNewCode.split('\n');
      const updatedLines = [
        ...lines.slice(0, startIdx),
        ...replacementLines,
        ...lines.slice(endIdx),
      ];
      const updatedContent = updatedLines.join('\n');

      const store = await this.readSnapshotStore();
      let storeChanged = false;
      for (const [id, fileMap] of this.snapshots.entries()) {
        if (!fileMap.has(patch.file)) {
          fileMap.set(patch.file, rawContent);
        }
        if (!store[id]) store[id] = {};
        if (!store[id][patch.file]) {
          store[id][patch.file] = rawContent;
          storeChanged = true;
        }
      }
      for (const id of Object.keys(store)) {
        if (!store[id][patch.file]) {
          store[id][patch.file] = rawContent;
          storeChanged = true;
        }
      }
      if (storeChanged) {
        await this.writeSnapshotStore(store);
      }

      await fs.writeFile(safe.value, updatedContent, 'utf8');
      return ok({updatedContent});
    } catch (error) {
      return err({
        code: 'VERIFY_EXECUTION_ERROR',
        message: `Failed to write patch to ${patch.file}`,
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async snapshot(label: string): Promise<string> {
    const id = `${label}-${Date.now()}`;
    this.snapshots.set(id, new Map<string, string>());
    const store = await this.readSnapshotStore();
    store[id] = store[id] ?? {};
    await this.writeSnapshotStore(store);
    return id;
  }

  async rollback(snapshotId: string): Promise<Result<void, HarnessError>> {
    const memMap = this.snapshots.get(snapshotId);
    const store = await this.readSnapshotStore();
    const diskMap = store[snapshotId];

    const entries: Array<[string, string]> =
      memMap && memMap.size > 0
        ? Array.from(memMap.entries())
        : diskMap
          ? Object.entries(diskMap)
          : [];

    if (entries.length === 0) {
      return ok(undefined);
    }

    try {
      for (const [relFile, original] of entries) {
        const safe = resolveSafePath(this.rootDir, relFile);
        if (safe.ok === false) return {ok: false, error: safe.error};
        await fs.writeFile(safe.value, original, 'utf8');
      }
      return ok(undefined);
    } catch (error) {
      return err({
        code: 'VERIFY_EXECUTION_ERROR',
        message: 'Failed to rollback workspace snapshot',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export class LocalNodeVerifyAdapter implements VerifyProbePort {
  public readonly adapterName: string;
  private readonly rootDir: string;

  constructor(rootDir: string, adapterName = 'local-tsc-test') {
    this.rootDir = rootDir;
    this.adapterName = adapterName;
  }

  async runVerify(task: AtomicTask): Promise<Result<VerifyResult, HarnessError>> {
    const useShell = process.platform === 'win32';
    try {
      await execFileAsync('npx', ['--yes', 'tsc', '--noEmit'], {
        cwd: this.rootDir,
        timeout: 25000,
        shell: useShell,
      });
    } catch (error) {
      const stderr =
        error && typeof error === 'object' && 'stdout' in error
          ? String((error as {stdout?: string; stderr?: string}).stdout || '') +
            String((error as {stderr?: string}).stderr || '')
          : String(error);
      const firstLine =
        stderr
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l.includes('error TS')) ?? stderr.split('\n')[0] ?? 'Compile error';
      return ok({
        passed: false,
        stage: 'COMPILE',
        errorHash: computeStableHash(firstLine),
        summary: firstLine,
        stackFrames: stderr.split('\n').slice(0, 4),
      });
    }

    try {
      await execFileAsync('npx', ['--yes', 'tsx', '--test', task.testFile], {
        cwd: this.rootDir,
        timeout: 25000,
        shell: useShell,
      });
      return ok({
        passed: true,
        stage: 'UNIT_TEST',
        errorHash: '00000000',
        summary: `tsc --noEmit and ${task.testFile} passed`,
        stackFrames: [],
      });
    } catch (error) {
      const output =
        error && typeof error === 'object' && 'stdout' in error
          ? String((error as {stdout?: string; stderr?: string}).stdout || '') +
            String((error as {stderr?: string}).stderr || '')
          : String(error);
      const relevant = output
        .split('\n')
        .filter((l) => !l.includes('node_modules'))
        .slice(0, 6);
      const summary = relevant[0] ?? 'Unit test failed';
      return ok({
        passed: false,
        stage: 'UNIT_TEST',
        errorHash: computeStableHash(summary),
        summary,
        stackFrames: relevant.slice(0, 3),
      });
    }
  }
}
