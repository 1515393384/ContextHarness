import {exec, execFile} from 'node:child_process';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';
import {
  err,
  ok,
  type ChatStepAction,
  type ChatToolName,
  type HarnessError,
  type HarnessStreamEvent,
  type ModelTier,
  type Result,
  type SlotFrame,
} from '../types';
import {computeStableHash, truncateToTokenBudget} from './token-budget';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const IGNORED_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'out',
  'coverage',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.venv',
  'venv',
  'env',
  'target',
  'bin',
  'obj',
  '.gradle',
  '.idea',
  '.vs',
  '.turbo',
  '.cache',
  'vendor',
]);

const IGNORED_FILE_NAMES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'Cargo.lock',
  'poetry.lock',
  'composer.lock',
  'Gemfile.lock',
]);

const BINARY_OR_NOISE_EXTS = new Set([
  '.pyc',
  '.pyo',
  '.pyd',
  '.class',
  '.o',
  '.obj',
  '.so',
  '.dll',
  '.exe',
  '.dylib',
  '.a',
  '.lib',
  '.wasm',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.svg',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.7z',
  '.rar',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp3',
  '.mp4',
  '.wav',
  '.mov',
  '.sqlite',
  '.db',
  '.tsbuildinfo',
]);

const MAX_SCAN_FILE_BYTES = 256 * 1024;
const TURN_SNAPSHOT_FILE = '.contextharness-turn-snapshots.json';
const REPO_RULES_FILE = '.contextharness.json';

export interface RepoHarnessRules {
  verifyCommand?: string;
  ignore?: string[];
  notes?: string[];
}

export interface TurnFileBaseline {
  relPath: string;
  existed: boolean;
  content: string | null;
}

export interface TurnSnapshotRecord {
  turnId: string;
  timestamp: string;
  userMessage: string;
  files: Record<string, TurnFileBaseline>;
}

export function getDefaultSandboxDir(): string {
  return path.join(process.cwd(), 'workspace-sandbox');
}

export function resolveWorkspaceDirInput(rawInput?: string): string {
  const trimmed = rawInput?.trim();
  if (!trimmed) {
    return getDefaultSandboxDir();
  }
  return path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.resolve(process.cwd(), trimmed);
}

export async function ensureWorkspaceDirectory(
  targetDir: string,
  createIfMissing = false,
): Promise<Result<string, HarnessError>> {
  const resolved = resolveWorkspaceDirInput(targetDir);
  if (createIfMissing || resolved === getDefaultSandboxDir()) {
    try {
      await fs.mkdir(resolved, {recursive: true});
      return ok(resolved);
    } catch (error) {
      return err({
        code: 'VERIFY_EXECUTION_ERROR',
        message: `Failed to initialize directory: ${resolved}`,
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      return err({
        code: 'WRITE_LOCK_VIOLATION',
        message: `Path is not a directory: ${resolved}`,
      });
    }
    return ok(resolved);
  } catch {
    return err({
      code: 'VERIFY_EXECUTION_ERROR',
      message: `Directory does not exist: ${resolved}`,
    });
  }
}

export function resolveSafeWorkspacePath(
  rootDir: string,
  relPath: string,
): Result<string, HarnessError> {
  const cleaned = relPath.trim();
  if (!cleaned) {
    return err({
      code: 'WRITE_LOCK_VIOLATION',
      message: 'File path cannot be empty.',
    });
  }
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(resolvedRoot, cleaned);
  if (
    resolvedTarget !== resolvedRoot &&
    !resolvedTarget.startsWith(resolvedRoot + path.sep)
  ) {
    return err({
      code: 'WRITE_LOCK_VIOLATION',
      message: `Path traversal blocked outside workspace directory: ${relPath}`,
    });
  }
  return ok(resolvedTarget);
}

async function loadRepoRulesAndIgnores(rootDir: string): Promise<{
  rules: RepoHarnessRules;
  extraIgnoreNames: Set<string>;
  extraIgnorePrefixes: string[];
}> {
  const extraIgnoreNames = new Set<string>();
  const extraIgnorePrefixes: string[] = [];
  let rules: RepoHarnessRules = {};

  try {
    const rawGitignore = await fs.readFile(path.join(rootDir, '.gitignore'), 'utf8');
    for (const rawLine of rawGitignore.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith('!')) continue;
      const normalized = line.replace(/^\/+/, '').replace(/\/+$/, '');
      if (!normalized || normalized.includes('*')) continue;
      if (normalized.includes('/')) {
        extraIgnorePrefixes.push(normalized);
      } else {
        extraIgnoreNames.add(normalized);
      }
    }
  } catch {
    // no .gitignore
  }

  try {
    const rawRules = await fs.readFile(path.join(rootDir, REPO_RULES_FILE), 'utf8');
    const parsed = JSON.parse(rawRules) as RepoHarnessRules;
    if (parsed && typeof parsed === 'object') {
      rules = parsed;
      for (const item of parsed.ignore ?? []) {
        const clean = item.trim().replace(/^\/+/, '').replace(/\/+$/, '');
        if (!clean) continue;
        if (clean.includes('/')) {
          extraIgnorePrefixes.push(clean);
        } else {
          extraIgnoreNames.add(clean);
        }
      }
    }
  } catch {
    // no .contextharness.json
  }

  return {rules, extraIgnoreNames, extraIgnorePrefixes};
}

function shouldSkipFile(name: string): boolean {
  if (name.startsWith('.contextharness-')) return true;
  if (IGNORED_FILE_NAMES.has(name)) return true;
  const ext = path.extname(name).toLowerCase();
  return BINARY_OR_NOISE_EXTS.has(ext);
}

export async function listWorkspaceFiles(
  rootDir: string,
  maxFiles = 200,
): Promise<string[]> {
  const files: string[] = [];
  const {extraIgnoreNames, extraIgnorePrefixes} = await loadRepoRulesAndIgnores(rootDir);

  async function walk(currentDir: string): Promise<void> {
    if (files.length >= maxFiles) return;
    let entries;
    try {
      entries = await fs.readdir(currentDir, {withFileTypes: true});
    } catch {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      if (
        IGNORED_DIRS.has(entry.name) ||
        extraIgnoreNames.has(entry.name) ||
        entry.name.startsWith('.contextharness-')
      ) {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      const rel = path.relative(rootDir, fullPath).split(path.sep).join('/');
      if (
        extraIgnorePrefixes.some(
          (prefix) => rel === prefix || rel.startsWith(`${prefix}/`),
        )
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        if (shouldSkipFile(entry.name)) continue;
        files.push(rel);
      }
    }
  }

  await walk(rootDir);
  return files;
}

export async function listDirectoryEntries(
  rootDir: string,
  relSubdir = '.',
  maxDepth = 2,
): Promise<Result<string[], HarnessError>> {
  const safe = resolveSafeWorkspacePath(rootDir, relSubdir || '.');
  if (safe.ok === false) return {ok: false, error: safe.error};

  const {extraIgnoreNames} = await loadRepoRulesAndIgnores(rootDir);
  const out: string[] = [];
  const clampedDepth = Math.max(1, Math.min(4, maxDepth));

  async function walk(dir: string, depth: number): Promise<void> {
    if (out.length >= 60 || depth > clampedDepth) return;
    let entries;
    try {
      entries = await fs.readdir(dir, {withFileTypes: true});
    } catch {
      return;
    }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      if (out.length >= 60) break;
      if (
        IGNORED_DIRS.has(entry.name) ||
        extraIgnoreNames.has(entry.name) ||
        entry.name.startsWith('.contextharness-')
      ) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      const rel = path.relative(rootDir, fullPath).split(path.sep).join('/');
      if (entry.isDirectory()) {
        out.push(`${rel}/`);
        await walk(fullPath, depth + 1);
      } else if (entry.isFile() && !shouldSkipFile(entry.name)) {
        out.push(rel);
      }
    }
  }

  await walk(safe.value, 1);
  return ok(out);
}

export async function grepWorkspaceFiles(
  rootDir: string,
  pattern: string,
  subpath = '.',
  fileGlob?: string,
): Promise<Result<{matches: string[]; matchedFiles: string[]}, HarnessError>> {
  const trimmedPattern = pattern.trim();
  if (!trimmedPattern) {
    return err({
      code: 'VERIFY_EXECUTION_ERROR',
      message: 'grep_search pattern cannot be empty.',
    });
  }
  const safe = resolveSafeWorkspacePath(rootDir, subpath || '.');
  if (safe.ok === false) return {ok: false, error: safe.error};

  let regex: RegExp;
  try {
    regex = new RegExp(trimmedPattern, 'i');
  } catch {
    const escaped = trimmedPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    regex = new RegExp(escaped, 'i');
  }

  const allFiles = await listWorkspaceFiles(rootDir, 300);
  const relSub = path.relative(rootDir, safe.value).split(path.sep).join('/');
  const globExt = fileGlob?.trim().replace(/^\*/, '').toLowerCase();

  const candidates = allFiles.filter((rel) => {
    if (relSub && relSub !== '.' && rel !== relSub && !rel.startsWith(`${relSub}/`)) {
      return false;
    }
    if (globExt && !rel.toLowerCase().endsWith(globExt)) {
      return false;
    }
    return true;
  });

  const matches: string[] = [];
  const matchedFiles: string[] = [];
  const seenFiles = new Set<string>();

  for (const rel of candidates) {
    if (matches.length >= 25) break;
    const full = path.join(rootDir, rel);
    try {
      const stat = await fs.stat(full);
      if (stat.size > MAX_SCAN_FILE_BYTES) continue;
      const buf = await fs.readFile(full);
      if (buf.includes(0)) continue; // binary guard
      const text = buf.toString('utf8').replace(/\r\n/g, '\n');
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        if (regex.test(lines[i])) {
          matches.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 140)}`);
          if (!seenFiles.has(rel)) {
            seenFiles.add(rel);
            matchedFiles.push(rel);
          }
          if (matches.length >= 25) break;
        }
      }
    } catch {
      // ignore unreadable file
    }
  }

  return ok({matches, matchedFiles});
}

export async function readWorkspaceFileNumbered(
  rootDir: string,
  relPath: string,
  startLine = 1,
  endLine = 160,
): Promise<Result<string, HarnessError>> {
  const safe = resolveSafeWorkspacePath(rootDir, relPath);
  if (safe.ok === false) return {ok: false, error: safe.error};

  try {
    const stat = await fs.stat(safe.value);
    if (stat.size > MAX_SCAN_FILE_BYTES * 2) {
      return err({
        code: 'VERIFY_EXECUTION_ERROR',
        message: `File ${relPath} is too large (${Math.round(stat.size / 1024)}KB) for bounded slice reading.`,
      });
    }
    const raw = await fs.readFile(safe.value, 'utf8');
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    const startIdx = Math.max(0, startLine - 1);
    const endIdx = Math.min(lines.length, endLine);
    const numbered = lines
      .slice(startIdx, endIdx)
      .map((line, i) => `${startIdx + i + 1} | ${line}`)
      .join('\n');
    const totalNote =
      endIdx < lines.length
        ? `\n... (${lines.length - endIdx} more lines; total ${lines.length})`
        : '';
    return ok(`${numbered}${totalNote}`);
  } catch (error) {
    return err({
      code: 'VERIFY_EXECUTION_ERROR',
      message: `Failed to read ${relPath}`,
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

function stripAccidentalLineNumbers(code: string): string {
  const normalized = code.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length >= 2 && nonEmpty.every((l) => /^\s*\d+\s\|\s?/.test(l))) {
    return lines.map((l) => l.replace(/^\s*\d+\s\|\s?/, '')).join('\n');
  }
  return normalized;
}

async function readTurnSnapshots(rootDir: string): Promise<TurnSnapshotRecord[]> {
  try {
    const raw = await fs.readFile(path.join(rootDir, TURN_SNAPSHOT_FILE), 'utf8');
    const parsed = JSON.parse(raw) as TurnSnapshotRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeTurnSnapshots(
  rootDir: string,
  records: TurnSnapshotRecord[],
): Promise<void> {
  const trimmed = records.slice(-10);
  await fs.writeFile(
    path.join(rootDir, TURN_SNAPSHOT_FILE),
    JSON.stringify(trimmed, null, 2),
    'utf8',
  );
}

async function captureFileBaseline(
  rootDir: string,
  relPath: string,
  turnRecord: TurnSnapshotRecord,
): Promise<void> {
  const normRel = relPath.split('\\').join('/');
  if (turnRecord.files[normRel]) return;
  const safe = resolveSafeWorkspacePath(rootDir, normRel);
  if (safe.ok === false) return;
  try {
    const content = await fs.readFile(safe.value, 'utf8');
    turnRecord.files[normRel] = {relPath: normRel, existed: true, content};
  } catch {
    turnRecord.files[normRel] = {relPath: normRel, existed: false, content: null};
  }
}

export async function getTurnBaselineMap(
  rootDir: string,
  turnId?: string | null,
): Promise<TurnSnapshotRecord | null> {
  const records = await readTurnSnapshots(rootDir);
  if (records.length === 0) return null;
  if (turnId) {
    return records.find((r) => r.turnId === turnId) ?? null;
  }
  return records[records.length - 1] ?? null;
}

export async function rollbackChatTurn(
  rootDir: string,
  turnId?: string | null,
): Promise<Result<{turnId: string; restoredFiles: string[]}, HarnessError>> {
  const records = await readTurnSnapshots(rootDir);
  if (records.length === 0) {
    return err({
      code: 'VERIFY_EXECUTION_ERROR',
      message: 'No turn snapshots found to roll back.',
    });
  }

  const idx = turnId
    ? records.findIndex((r) => r.turnId === turnId)
    : records.length - 1;
  if (idx === -1) {
    return err({
      code: 'VERIFY_EXECUTION_ERROR',
      message: `Turn snapshot ${turnId} not found.`,
    });
  }

  const target = records[idx];
  const restoredFiles: string[] = [];

  for (const baseline of Object.values(target.files)) {
    const safe = resolveSafeWorkspacePath(rootDir, baseline.relPath);
    if (safe.ok === false) continue;
    if (baseline.existed && baseline.content !== null) {
      await fs.mkdir(path.dirname(safe.value), {recursive: true});
      await fs.writeFile(safe.value, baseline.content, 'utf8');
    } else {
      await fs.rm(safe.value, {force: true});
    }
    restoredFiles.push(baseline.relPath);
  }

  records.splice(idx, 1);
  await writeTurnSnapshots(rootDir, records);

  return ok({turnId: target.turnId, restoredFiles});
}

function isDangerousShellCommand(command: string): string | null {
  const lower = command.toLowerCase();
  const blocked = [
    /\brm\s+-rf\s+[/\\]/,
    /\bformat\s+[a-z]:/i,
    /\bdel\s+\/f\s+\/s\s+\/q\s+[a-z]:\\/i,
    /\bshutdown\b/,
    /\breboot\b/,
    /\bmkfs\b/,
    /:\(\)\{\s*:\|:\s*&\s*\};:/,
  ];
  for (const pat of blocked) {
    if (pat.test(lower)) {
      return `Blocked high-risk shell command matching ${pat.source}`;
    }
  }
  return null;
}

export async function runWorkspaceVerify(
  rootDir: string,
  customCommand?: string,
): Promise<{
  passed: boolean;
  errorHash: string | null;
  summary: string;
  output: string;
}> {
  const {rules} = await loadRepoRulesAndIgnores(rootDir);
  const trimmedCmd = customCommand?.trim() || rules.verifyCommand?.trim();
  if (trimmedCmd) {
    const blockedReason = isDangerousShellCommand(trimmedCmd);
    if (blockedReason) {
      return {
        passed: false,
        errorHash: computeStableHash(blockedReason),
        summary: blockedReason,
        output: blockedReason,
      };
    }

    try {
      const {stdout, stderr} = await execAsync(trimmedCmd, {
        cwd: rootDir,
        timeout: 45000,
      });
      const combined = [stdout, stderr].filter(Boolean).join('\n').trim();
      return {
        passed: true,
        errorHash: null,
        summary: `Command passed: ${trimmedCmd}`,
        output: combined.slice(0, 1200) || 'OK',
      };
    } catch (error) {
      const errObj = error as {stdout?: string; stderr?: string; message?: string};
      const combined = [errObj.stdout, errObj.stderr, errObj.message]
        .filter(Boolean)
        .join('\n')
        .trim();
      const firstLine = combined.split('\n')[0] || 'Command failed';
      return {
        passed: false,
        errorHash: computeStableHash(firstLine),
        summary: firstLine,
        output: combined.slice(0, 1200),
      };
    }
  }

  const files = await listWorkspaceFiles(rootDir);
  const useShell = process.platform === 'win32';
  const outputs: string[] = [];

  const testFiles = files.filter((f) => /\.(test|spec)\.(ts|tsx|js|mjs)$/.test(f));
  const hasTsConfig = files.includes('tsconfig.json');
  const pyTests = files.filter((f) => /(^|\/)(test_.*|.*_test)\.py$/.test(f));
  const hasCargo = files.includes('Cargo.toml');
  const hasGoMod = files.includes('go.mod');

  if (hasCargo) {
    return runWorkspaceVerify(rootDir, 'cargo test');
  }
  if (hasGoMod) {
    return runWorkspaceVerify(rootDir, 'go test ./...');
  }
  if (pyTests.length > 0 && !hasTsConfig && testFiles.length === 0) {
    const pyBin = process.platform === 'win32' ? 'python' : 'python3';
    return runWorkspaceVerify(rootDir, `${pyBin} -m unittest discover -v`);
  }

  if (hasTsConfig) {
    try {
      await execFileAsync('npx', ['--yes', 'tsc', '--noEmit'], {
        cwd: rootDir,
        timeout: 30000,
        shell: useShell,
      });
      outputs.push('tsc --noEmit: PASS');
    } catch (error) {
      const errObj = error as {stdout?: string; stderr?: string; message?: string};
      const combined = [errObj.stdout, errObj.stderr, errObj.message]
        .filter(Boolean)
        .join('\n')
        .trim();
      const firstLine =
        combined
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l.includes('error TS')) ??
        combined.split('\n')[0] ??
        'Typecheck failed';
      return {
        passed: false,
        errorHash: computeStableHash(firstLine),
        summary: firstLine,
        output: combined.slice(0, 1200),
      };
    }
  }

  if (testFiles.length > 0) {
    try {
      const {stdout, stderr} = await execFileAsync(
        'npx',
        ['--yes', 'tsx', '--test', ...testFiles.slice(0, 12)],
        {
          cwd: rootDir,
          timeout: 30000,
          shell: useShell,
        },
      );
      const combined = [stdout, stderr].filter(Boolean).join('\n').trim();
      outputs.push(`tsx --test (${testFiles.length} file(s)): PASS`);
      return {
        passed: true,
        errorHash: null,
        summary: outputs.join(' | '),
        output: combined.slice(0, 1200),
      };
    } catch (error) {
      const errObj = error as {stdout?: string; stderr?: string; message?: string};
      const combined = [errObj.stdout, errObj.stderr, errObj.message]
        .filter(Boolean)
        .join('\n')
        .trim();
      const relevantLine =
        combined
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l && !l.includes('node_modules')) ??
        'Unit test failed';
      return {
        passed: false,
        errorHash: computeStableHash(relevantLine),
        summary: relevantLine,
        output: combined.slice(0, 1200),
      };
    }
  }

  return {
    passed: true,
    errorHash: null,
    summary: hasTsConfig
      ? 'tsc --noEmit passed (no *.test.ts files found)'
      : `Scanned ${files.length} files (no test runner auto-detected; pass explicit command to run_command)`,
    output: outputs.join('\n') || 'No errors detected.',
  };
}

function buildChatStaticHead(tier: ModelTier): string {
  const schema = JSON.stringify({
    reasoning: 'concise 1-sentence reason for this step',
    action: {
      tool: 'read_slice | write_file | replace_lines | grep_search | list_dir | delete_file | move_file | run_command | finish',
      file: 'relative path (read_slice/write_file/replace_lines/delete_file)',
      from: 'source relative path (move_file)',
      to: 'destination relative path (move_file)',
      path: 'optional subdir (grep_search/list_dir)',
      pattern: 'regex or text (grep_search)',
      fileGlob: 'optional extension filter like .py or .ts (grep_search)',
      maxDepth: 'optional depth 1-4 (list_dir)',
      startLine: 'number (read_slice/replace_lines)',
      endLine: 'number (read_slice/replace_lines)',
      expectedFirstLine: 'exact trimmed first line anchor (replace_lines)',
      newCode: 'replacement code (replace_lines)',
      content: 'full file content (write_file)',
      command: 'shell test/build/lint command (run_command)',
      reply: 'final summary for user (finish)',
    },
  });

  return [
    `[STATIC_CHAT_HARNESS_PREFIX v2 | tier=${tier}]`,
    'ROLE: Stateless Bounded-Context Multi-Language Engineering Agent operating inside the active workspace within 4K-8K tokens/step.',
    'RULES: (1) Locate symbols in large repos with grep_search or list_dir first, then read exact ranges with read_slice. (2) Edit via write_file or replace_lines (never include "12 | " prefixes). (3) Use delete_file/move_file for refactors. (4) Verify changes via run_command (using the repo language test/typecheck tool, e.g. pytest, unittest, npm test, cargo test, go test) before finish. (5) You may save repo-specific verifyCommand/ignore rules to .contextharness.json if helpful. (6) Output ONLY one valid JSON object matching RESPONSE_JSON_SCHEMA.',
    `RESPONSE_JSON_SCHEMA: ${schema}`,
  ].join('\n');
}

function parseModelJsonObject<T>(raw: string): T | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const tryParse = (candidate: string): T | null => {
    try {
      const val = JSON.parse(candidate) as unknown;
      return val && typeof val === 'object' ? (val as T) : null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(trimmed);
  if (direct) return direct;

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    const fenced = tryParse(fenceMatch[1].trim());
    if (fenced) return fenced;
  }

  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        const balanced = tryParse(trimmed.slice(start, i + 1));
        if (balanced) return balanced;
        start = -1;
      }
    }
  }

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) {
    return tryParse(trimmed.slice(first, last + 1));
  }
  return null;
}

const UNIVERSAL_SYMBOL_RE =
  /^(export\s+(default\s+)?(async\s+)?(function|class|interface|type|const|enum)\b|async\s+def\s+|def\s+|class\s+|pub\s+(async\s+)?(fn|struct|enum|trait|mod|type)\b|fn\s+|struct\s+|impl\b|func\s+|(public|private|protected|internal)\s+.*\(|interface\s+\w+|type\s+\w+\s*=)/;

async function buildWorkspaceSkeleton(
  rootDir: string,
  files: string[],
  priorityFiles: string[],
  rules: RepoHarnessRules,
): Promise<string> {
  if (files.length === 0) {
    return '[WORKSPACE_FILES]\n(empty directory)';
  }
  const previewLines: string[] = [`[WORKSPACE_FILES (${files.length})]`];
  if (rules.verifyCommand) {
    previewLines.push(`[REPO_RULE verifyCommand=${rules.verifyCommand}]`);
  }
  if (rules.notes && rules.notes.length > 0) {
    previewLines.push(`[REPO_NOTES] ${rules.notes.slice(0, 3).join(' | ')}`);
  }

  for (const rel of files.slice(0, 70)) {
    previewLines.push(`- ${rel}`);
  }
  if (files.length > 70) {
    previewLines.push(`... (+${files.length - 70} more files; use list_dir or grep_search)`);
  }

  const codeExts = /\.(ts|tsx|js|jsx|mjs|py|rs|go|java|kt|cs|cpp|c|h|hpp|rb|php|swift)$/i;
  const prioritized = [
    ...priorityFiles.filter((f) => files.includes(f) && codeExts.test(f)),
    ...files.filter((f) => codeExts.test(f) && !priorityFiles.includes(f)),
  ];

  for (const rel of prioritized.slice(0, 10)) {
    const safe = resolveSafeWorkspacePath(rootDir, rel);
    if (safe.ok === false) continue;
    try {
      const stat = await fs.stat(safe.value);
      if (stat.size > MAX_SCAN_FILE_BYTES) continue;
      const content = (await fs.readFile(safe.value, 'utf8')).replace(/\r\n/g, '\n');
      const sigs = content
        .split('\n')
        .map((l, idx) => ({line: l.trim(), num: idx + 1}))
        .filter(({line}) => UNIVERSAL_SYMBOL_RE.test(line))
        .slice(0, 10)
        .map(({line, num}) => `  ${num} | ${line.replace(/\{[\s\S]*$/, '{ ... }')}`);
      if (sigs.length > 0) {
        previewLines.push(`# ${rel}\n${sigs.join('\n')}`);
      }
    } catch {
      // ignore unreadable file
    }
  }

  return previewLines.join('\n');
}

interface ParsedChatAction {
  tool:
    | 'read_slice'
    | 'write_file'
    | 'replace_lines'
    | 'grep_search'
    | 'list_dir'
    | 'delete_file'
    | 'move_file'
    | 'run_command'
    | 'run_verify'
    | 'finish';
  file?: string;
  from?: string;
  to?: string;
  path?: string;
  pattern?: string;
  fileGlob?: string;
  maxDepth?: number;
  startLine?: number;
  endLine?: number;
  expectedFirstLine?: string;
  newCode?: string;
  content?: string;
  command?: string;
  reply?: string;
}

interface OpenSliceEntry {
  key: string;
  rangeLabel: string;
  content: string;
  lastUsedStep: number;
}

export interface WorkspaceChatTurnInput {
  workspaceDir: string;
  userMessage: string;
  initialTier: ModelTier;
  verifyCommand?: string;
  apiKey: string;
  baseUrl?: string;
  flashModel?: string;
  proModel?: string;
  maxSteps?: number;
  activeContext?: string;
  externalDiagnostics?: string;
  onEvent?: (event: HarnessStreamEvent) => void;
}

export interface WorkspaceChatTurnOutput {
  turnId: string;
  reply: string;
  actions: ChatStepAction[];
  modifiedFiles: string[];
  frame: SlotFrame;
  verifyPassed?: boolean;
  frameTokens: number;
  budgetCeiling: number;
  cacheHitTokens: number;
  staticHeadHash: string;
  modelTier: ModelTier;
}

async function callModelStreaming(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemContent: string;
  userContent: string;
  step: number;
  onEvent?: (event: HarnessStreamEvent) => void;
}): Promise<
  Result<
    {rawContent: string; finishReason: string; cacheHitTokens: number},
    HarnessError
  >
> {
  const {baseUrl, apiKey, model, systemContent, userContent, step, onEvent} = params;
  const cleanBase = baseUrl.replace(/\/$/, '');
  const isReasoner = model.toLowerCase().includes('reasoner');

  const requestBody: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    stream: true,
    stream_options: {include_usage: true},
    messages: [
      {role: 'system', content: systemContent},
      {role: 'user', content: userContent},
    ],
  };

  if (!isReasoner) {
    requestBody.temperature = 0.1;
    requestBody.response_format = {type: 'json_object'};
  }

  let response: Response;
  try {
    response = await fetch(`${cleanBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    return err({
      code: 'MODEL_GATEWAY_ERROR',
      message:
        error instanceof Error
          ? `DeepSeek request failed: ${error.message}`
          : 'DeepSeek request failed',
    });
  }

  if (!response.ok) {
    const body = await response.text();
    return err({
      code: 'MODEL_GATEWAY_ERROR',
      message: `DeepSeek API HTTP ${response.status}`,
      details: body.slice(0, 300),
    });
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream') || !response.body) {
    const data = (await response.json()) as {
      choices?: Array<{
        finish_reason?: string;
        message?: {content?: string; reasoning_content?: string};
      }>;
      usage?: {prompt_cache_hit_tokens?: number};
    };
    const rawContent =
      data.choices?.[0]?.message?.content ||
      data.choices?.[0]?.message?.reasoning_content ||
      '';
    return ok({
      rawContent,
      finishReason: data.choices?.[0]?.finish_reason ?? '',
      cacheHitTokens: data.usage?.prompt_cache_hit_tokens ?? 0,
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let contentAcc = '';
  let reasoningAcc = '';
  let finishReason = '';
  let cacheHitTokens = 0;
  let lastEmitAt = 0;
  let pendingDelta = '';

  const flushDelta = (force = false) => {
    const now = Date.now();
    if (pendingDelta && (force || now - lastEmitAt >= 90)) {
      onEvent?.({
        type: 'model_delta',
        step,
        delta: pendingDelta,
        charCount: contentAcc.length + reasoningAcc.length,
      });
      pendingDelta = '';
      lastEmitAt = now;
    }
  };

  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, {stream: true});

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || !line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;

      try {
        const chunk = JSON.parse(payload) as {
          choices?: Array<{
            finish_reason?: string | null;
            delta?: {content?: string; reasoning_content?: string};
          }>;
          usage?: {prompt_cache_hit_tokens?: number};
        };
        if (chunk.usage?.prompt_cache_hit_tokens !== undefined) {
          cacheHitTokens = chunk.usage.prompt_cache_hit_tokens;
        }
        const choice = chunk.choices?.[0];
        if (choice?.finish_reason) {
          finishReason = choice.finish_reason;
        }
        const deltaContent = choice?.delta?.content ?? '';
        const deltaReasoning = choice?.delta?.reasoning_content ?? '';
        if (deltaContent) {
          contentAcc += deltaContent;
          pendingDelta += deltaContent;
        } else if (deltaReasoning) {
          reasoningAcc += deltaReasoning;
          pendingDelta += deltaReasoning;
        }
        flushDelta(false);
      } catch {
        // ignore partial keepalive comments
      }
    }
  }
  flushDelta(true);

  return ok({
    rawContent: contentAcc || reasoningAcc,
    finishReason,
    cacheHitTokens,
  });
}

function buildSlot3WithLru(params: {
  userMessage: string;
  workspaceDir: string;
  activeContext?: string;
  modifiedFiles: string[];
  failedNotes: string[];
  openSlices: Map<string, OpenSliceEntry>;
  maxTokens: number;
}): {text: string; tokens: number; pruned: boolean} {
  const headerParts: string[] = [
    `[USER_REQUEST]\n${params.userMessage}`,
    `[WORKSPACE_DIR] ${params.workspaceDir}`,
  ];
  if (params.activeContext?.trim()) {
    headerParts.push(`[ACTIVE_EDITOR_CONTEXT]\n${params.activeContext.trim()}`);
  }
  if (params.modifiedFiles.length > 0 || params.failedNotes.length > 0) {
    headerParts.push(
      `[TURN_STATE]\nModified: ${params.modifiedFiles.join(', ') || 'none'}\nRecent errors: ${params.failedNotes.slice(-2).join(' | ') || 'none'}`,
    );
  }

  const orderedSlices = Array.from(params.openSlices.values()).sort(
    (a, b) => b.lastUsedStep - a.lastUsedStep,
  );

  const blocks = [...headerParts];
  const evicted: string[] = [];
  let currentText = blocks.join('\n\n');

  for (const slice of orderedSlices) {
    const candidateBlock = `[OPEN_SLICE ${slice.key} (${slice.rangeLabel})]\n${slice.content}`;
    const candidateFit = truncateToTokenBudget(
      `${currentText}\n\n${candidateBlock}`,
      params.maxTokens,
    );
    if (!candidateFit.pruned) {
      currentText = candidateFit.text;
    } else {
      evicted.push(`[EVICTED_SLICE ${slice.key} (${slice.rangeLabel}) — reload via read_slice if needed]`);
    }
  }

  if (evicted.length > 0) {
    currentText = `${currentText}\n\n${evicted.join('\n')}`;
  }

  return truncateToTokenBudget(currentText, params.maxTokens);
}

export async function runWorkspaceChatTurn(
  input: WorkspaceChatTurnInput,
): Promise<Result<WorkspaceChatTurnOutput, HarnessError>> {
  const {
    workspaceDir,
    userMessage,
    verifyCommand,
    apiKey,
    baseUrl = 'https://api.deepseek.com/v1',
    flashModel = 'deepseek-chat',
    proModel = 'deepseek-reasoner',
    maxSteps = 14,
    activeContext,
    externalDiagnostics,
    onEvent,
  } = input;

  if (!apiKey.trim()) {
    return err({
      code: 'MODEL_GATEWAY_ERROR',
      message: 'DEEPSEEK_API_KEY is not configured.',
    });
  }

  const turnId = `TURN-${Date.now()}`;
  const turnRecord: TurnSnapshotRecord = {
    turnId,
    timestamp: new Date().toISOString(),
    userMessage,
    files: {},
  };

  let activeTier: ModelTier = input.initialTier;
  const actions: ChatStepAction[] = [];
  const modifiedFiles: string[] = [];
  const failedNotes: string[] = [];
  const priorityFiles: string[] = [];
  const openSlices = new Map<string, OpenSliceEntry>();
  let latestFeedback = externalDiagnostics?.trim()
    ? `[STATUS] Turn start.\n[IDE_DIAGNOSTICS]\n${externalDiagnostics.trim()}`
    : '[STATUS] Clean turn start. 0 prior tool steps.';
  let lastErrorHash: string | null = null;
  let errorRepeatCount = 0;
  let lastToolSig: string | null = null;
  let lastVerifyPassed: boolean | undefined;
  let totalCacheHits = 0;
  let lastFrame: SlotFrame | null = null;
  let finalReply = '';

  const addPriorityFile = (rel: string) => {
    if (!rel) return;
    const norm = rel.split('\\').join('/');
    if (!priorityFiles.includes(norm)) {
      priorityFiles.unshift(norm);
    }
  };
  const recordModified = (rel: string) => {
    const norm = rel.split('\\').join('/');
    if (!modifiedFiles.includes(norm)) {
      modifiedFiles.push(norm);
    }
    addPriorityFile(norm);
  };

  for (let step = 1; step <= maxSteps; step += 1) {
    const budgetCeiling = activeTier === 'pro' ? 8000 : 6000;
    const {rules} = await loadRepoRulesAndIgnores(workspaceDir);
    const files = await listWorkspaceFiles(workspaceDir);
    const skeletonRaw = await buildWorkspaceSkeleton(
      workspaceDir,
      files,
      priorityFiles,
      rules,
    );

    const slot1Fit = truncateToTokenBudget(buildChatStaticHead(activeTier), 1000);
    const staticHeadHash = computeStableHash(slot1Fit.text);
    const slot2Fit = truncateToTokenBudget(skeletonRaw, 1500);
    const slot3Fit = buildSlot3WithLru({
      userMessage,
      workspaceDir,
      activeContext,
      modifiedFiles,
      failedNotes,
      openSlices,
      maxTokens: 2500,
    });
    const slot4Fit = truncateToTokenBudget(latestFeedback, 1000);

    const totalTokens =
      slot1Fit.tokens + slot2Fit.tokens + slot3Fit.tokens + slot4Fit.tokens;

    const frame: SlotFrame = {
      taskId: `CHAT-${step}`,
      role: activeTier === 'pro' ? 'surgical_debugger' : 'micro_coder',
      modelTier: activeTier,
      round: step,
      slot1StaticHead: {
        label: 'Slot 1 · Static Head (Prefix Cache)',
        content: slot1Fit.text,
        tokens: slot1Fit.tokens,
        maxTokens: 1000,
        pruned: slot1Fit.pruned,
      },
      slot2ContractAnchors: {
        label: 'Slot 2 · Workspace Skeleton',
        content: slot2Fit.text,
        tokens: slot2Fit.tokens,
        maxTokens: 1500,
        pruned: slot2Fit.pruned,
      },
      slot3SurgicalSlice: {
        label: 'Slot 3 · Request & LRU File Slices',
        content: slot3Fit.text,
        tokens: slot3Fit.tokens,
        maxTokens: 2500,
        pruned: slot3Fit.pruned,
      },
      slot4VerifyFeedback: {
        label: 'Slot 4 · Masked Step & Diagnostics',
        content: slot4Fit.text,
        tokens: slot4Fit.tokens,
        maxTokens: 1000,
        pruned: slot4Fit.pruned,
      },
      totalTokens,
      budgetCeiling,
      staticHeadHash,
      cacheHitExpected: step > 1,
      prunedItems: [
        ...(slot2Fit.pruned ? ['slot2ContractAnchors'] : []),
        ...(slot3Fit.pruned ? ['slot3SurgicalSlice'] : []),
        ...(slot4Fit.pruned ? ['slot4VerifyFeedback'] : []),
      ],
    };
    lastFrame = frame;

    onEvent?.({
      type: 'step_start',
      step,
      maxSteps,
      modelTier: activeTier,
      frameTokens: totalTokens,
      budgetCeiling,
      staticHeadHash,
      cacheHitTokens: totalCacheHits,
    });

    const model = activeTier === 'pro' ? proModel : flashModel;
    const modelRes = await callModelStreaming({
      baseUrl,
      apiKey,
      model,
      systemContent: frame.slot1StaticHead.content,
      userContent: [
        frame.slot2ContractAnchors.content,
        frame.slot3SurgicalSlice.content,
        frame.slot4VerifyFeedback.content,
      ].join('\n\n'),
      step,
      onEvent,
    });

    if (modelRes.ok === false) {
      return err(modelRes.error);
    }

    const {rawContent, finishReason, cacheHitTokens} = modelRes.value;
    totalCacheHits += cacheHitTokens;

    const parsed = parseModelJsonObject<
      {reasoning?: string; action?: ParsedChatAction} & Partial<ParsedChatAction>
    >(rawContent);
    if (!parsed) {
      const preview = rawContent.slice(0, 140).replace(/\s+/g, ' ');
      const msg = `[STEP_ERROR finish=${finishReason || 'unknown'}] Invalid JSON output (${preview || 'empty'}). Output ONLY one raw JSON object matching RESPONSE_JSON_SCHEMA.`;
      latestFeedback = msg;
      failedNotes.push(msg.slice(0, 100));
      onEvent?.({type: 'step_error', step, message: msg});
      continue;
    }

    const act: ParsedChatAction | undefined =
      parsed.action && parsed.action.tool
        ? parsed.action
        : parsed.tool
          ? (parsed as ParsedChatAction)
          : undefined;

    if (!act || !act.tool) {
      const msg = `[STEP_ERROR] Missing action.tool in JSON response. Received keys: ${Object.keys(parsed).join(', ')}`;
      latestFeedback = msg;
      failedNotes.push(msg);
      onEvent?.({type: 'step_error', step, message: msg});
      continue;
    }

    if (act.tool === 'finish') {
      finalReply =
        act.reply?.trim() ||
        parsed.reasoning?.trim() ||
        'Completed workspace operations.';
      break;
    }

    const toolSig = JSON.stringify([
      act.tool,
      act.file ?? act.from ?? act.path ?? act.command ?? act.pattern ?? '',
      act.startLine ?? '',
      act.endLine ?? '',
    ]);
    if (toolSig === lastToolSig && act.tool !== 'run_command' && act.tool !== 'run_verify') {
      latestFeedback = `[LOOP_GUARD] Repeated identical tool call (${act.tool}) detected. Choose a different tool, read a different slice, or finish.`;
      failedNotes.push(`loop:${act.tool}`);
      lastToolSig = null;
      continue;
    }
    lastToolSig = toolSig;

    const toolTarget =
      act.file ?? act.from ?? act.pattern ?? act.path ?? act.command ?? 'workspace';
    onEvent?.({type: 'tool_start', step, tool: act.tool, target: toolTarget});

    const recordAction = (
      tool: ChatToolName,
      target: string,
      okFlag: boolean,
      summary: string,
    ) => {
      const action: ChatStepAction = {tool, target, ok: okFlag, summary};
      actions.push(action);
      if (!okFlag) {
        failedNotes.push(`${tool}(${target}): ${summary}`.slice(0, 90));
      }
      onEvent?.({type: 'tool_done', step, action});
    };

    if (act.tool === 'grep_search') {
      const res = await grepWorkspaceFiles(
        workspaceDir,
        act.pattern ?? '',
        act.path ?? '.',
        act.fileGlob,
      );
      if (res.ok === true) {
        for (const mf of res.value.matchedFiles.slice(0, 5)) {
          addPriorityFile(mf);
        }
        const summary = `${res.value.matches.length} hit(s) across ${res.value.matchedFiles.length} file(s)`;
        recordAction('grep_search', act.pattern ?? '', true, summary);
        latestFeedback =
          res.value.matches.length > 0
            ? `[GREP_OK] ${summary}:\n${res.value.matches.join('\n')}`
            : `[GREP_OK] 0 matches for "${act.pattern ?? ''}".`;
      } else {
        recordAction('grep_search', act.pattern ?? '', false, res.error.message);
        latestFeedback = `[GREP_ERR] ${res.error.message}`;
      }
      continue;
    }

    if (act.tool === 'list_dir') {
      const res = await listDirectoryEntries(
        workspaceDir,
        act.path ?? '.',
        act.maxDepth ?? 2,
      );
      if (res.ok === true) {
        const summary = `${res.value.length} entries`;
        recordAction('list_dir', act.path ?? '.', true, summary);
        latestFeedback = `[LIST_OK] ${act.path ?? '.'}:\n${res.value.join('\n') || '(empty)'}`;
      } else {
        recordAction('list_dir', act.path ?? '.', false, res.error.message);
        latestFeedback = `[LIST_ERR] ${res.error.message}`;
      }
      continue;
    }

    if (act.tool === 'read_slice') {
      const target = act.file ?? '';
      const start = Math.max(1, act.startLine ?? 1);
      const end = Math.max(start, act.endLine ?? start + 140);
      const readRes = await readWorkspaceFileNumbered(
        workspaceDir,
        target,
        start,
        end,
      );
      if (readRes.ok === true) {
        addPriorityFile(target);
        openSlices.set(target, {
          key: target,
          rangeLabel: `${start}-${end}`,
          content: readRes.value,
          lastUsedStep: step,
        });
        recordAction('read_slice', `${target}:${start}-${end}`, true, `Loaded lines ${start}-${end}`);
        latestFeedback = `[READ_OK] Loaded ${target}:${start}-${end} into Slot 3.`;
      } else {
        recordAction('read_slice', target, false, readRes.error.message);
        latestFeedback = `[READ_ERR] ${readRes.error.message}`;
      }
      continue;
    }

    if (act.tool === 'write_file') {
      const target = act.file ?? '';
      const safe = resolveSafeWorkspacePath(workspaceDir, target);
      if (safe.ok === false) {
        recordAction('write_file', target, false, safe.error.message);
        latestFeedback = `[WRITE_ERR] ${safe.error.message}`;
        continue;
      }
      await captureFileBaseline(workspaceDir, target, turnRecord);
      const cleanBody = stripAccidentalLineNumbers(act.content ?? '');
      try {
        await fs.mkdir(path.dirname(safe.value), {recursive: true});
        await fs.writeFile(safe.value, cleanBody, 'utf8');
        recordModified(target);
        const numbered = await readWorkspaceFileNumbered(workspaceDir, target, 1, 140);
        if (numbered.ok === true) {
          openSlices.set(target, {
            key: target,
            rangeLabel: '1-140',
            content: numbered.value,
            lastUsedStep: step,
          });
        }
        recordAction(
          'write_file',
          target,
          true,
          `Wrote ${cleanBody.split('\n').length} lines`,
        );
        latestFeedback = `[WRITE_OK] Wrote ${target}. Run run_command to verify if tests/build apply, or finish.`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        recordAction('write_file', target, false, msg);
        latestFeedback = `[WRITE_ERR] ${msg}`;
      }
      continue;
    }

    if (act.tool === 'replace_lines') {
      const target = act.file ?? '';
      const safe = resolveSafeWorkspacePath(workspaceDir, target);
      if (safe.ok === false) {
        recordAction('replace_lines', target, false, safe.error.message);
        latestFeedback = `[PATCH_ERR] ${safe.error.message}`;
        continue;
      }
      try {
        const raw = (await fs.readFile(safe.value, 'utf8')).replace(/\r\n/g, '\n');
        const lines = raw.split('\n');
        const s = Math.max(1, act.startLine ?? 1);
        const e = Math.min(lines.length, Math.max(s, act.endLine ?? s));
        const expected = (act.expectedFirstLine ?? '')
          .trim()
          .replace(/^\d+\s\|\s?/, '');
        const actualFirst = lines[s - 1]?.trim() ?? '';
        if (expected && !actualFirst.includes(expected)) {
          const msg = `First-line anchor mismatch at line ${s}: expected "${expected}", got "${actualFirst}"`;
          recordAction('replace_lines', `${target}:${s}-${e}`, false, msg);
          latestFeedback = `[PATCH_ERR] ${msg}`;
          continue;
        }
        await captureFileBaseline(workspaceDir, target, turnRecord);
        const replacement = stripAccidentalLineNumbers(act.newCode ?? '').split('\n');
        const updated = [...lines.slice(0, s - 1), ...replacement, ...lines.slice(e)].join('\n');
        await fs.writeFile(safe.value, updated, 'utf8');
        recordModified(target);
        const numbered = await readWorkspaceFileNumbered(workspaceDir, target, 1, 140);
        if (numbered.ok === true) {
          openSlices.set(target, {
            key: target,
            rangeLabel: '1-140',
            content: numbered.value,
            lastUsedStep: step,
          });
        }
        recordAction(
          'replace_lines',
          `${target}:${s}-${e}`,
          true,
          `Replaced lines ${s}-${e} with ${replacement.length} lines`,
        );
        latestFeedback = `[PATCH_OK] Updated ${target}:${s}-${e}.`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        recordAction('replace_lines', target, false, msg);
        latestFeedback = `[PATCH_ERR] ${msg}`;
      }
      continue;
    }

    if (act.tool === 'delete_file') {
      const target = act.file ?? '';
      const safe = resolveSafeWorkspacePath(workspaceDir, target);
      if (safe.ok === false) {
        recordAction('delete_file', target, false, safe.error.message);
        latestFeedback = `[DELETE_ERR] ${safe.error.message}`;
        continue;
      }
      try {
        await captureFileBaseline(workspaceDir, target, turnRecord);
        await fs.rm(safe.value, {force: false});
        openSlices.delete(target);
        recordModified(target);
        recordAction('delete_file', target, true, 'Deleted file (snapshot saved)');
        latestFeedback = `[DELETE_OK] Deleted ${target}.`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        recordAction('delete_file', target, false, msg);
        latestFeedback = `[DELETE_ERR] ${msg}`;
      }
      continue;
    }

    if (act.tool === 'move_file') {
      const from = act.from ?? act.file ?? '';
      const to = act.to ?? '';
      const safeFrom = resolveSafeWorkspacePath(workspaceDir, from);
      const safeTo = resolveSafeWorkspacePath(workspaceDir, to);
      if (safeFrom.ok === false || safeTo.ok === false) {
        const msg =
          safeFrom.ok === false
            ? safeFrom.error.message
            : safeTo.ok === false
              ? safeTo.error.message
              : 'Invalid move path';
        recordAction('move_file', `${from} -> ${to}`, false, msg);
        latestFeedback = `[MOVE_ERR] ${msg}`;
        continue;
      }
      try {
        await captureFileBaseline(workspaceDir, from, turnRecord);
        await captureFileBaseline(workspaceDir, to, turnRecord);
        await fs.mkdir(path.dirname(safeTo.value), {recursive: true});
        await fs.rename(safeFrom.value, safeTo.value);
        openSlices.delete(from);
        recordModified(from);
        recordModified(to);
        recordAction('move_file', `${from} -> ${to}`, true, 'Moved file');
        latestFeedback = `[MOVE_OK] Moved ${from} -> ${to}.`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        recordAction('move_file', `${from} -> ${to}`, false, msg);
        latestFeedback = `[MOVE_ERR] ${msg}`;
      }
      continue;
    }

    if (act.tool === 'run_command' || act.tool === 'run_verify') {
      const cmd = act.command?.trim() || verifyCommand;
      const v = await runWorkspaceVerify(workspaceDir, cmd);
      lastVerifyPassed = v.passed;
      recordAction(
        act.tool,
        cmd || 'auto-verify',
        v.passed,
        v.summary,
      );

      if (v.passed) {
        lastErrorHash = null;
        errorRepeatCount = 0;
        latestFeedback = `[VERIFY_PASS] ${v.summary}\n${v.output}`;
      } else {
        if (v.errorHash && v.errorHash === lastErrorHash) {
          errorRepeatCount += 1;
        } else {
          lastErrorHash = v.errorHash;
          errorRepeatCount = 1;
        }

        let ddiHint = '';
        if (errorRepeatCount >= 2 && activeTier !== 'pro') {
          const prevTier = activeTier;
          activeTier = 'pro';
          onEvent?.({
            type: 'ddi_escalate',
            step,
            errorHash: v.errorHash ?? 'UNKNOWN',
            fromTier: prevTier,
            toTier: 'pro',
          });
          ddiHint = `\n[DDI_CIRCUIT_BREAKER] Identical errorHash=${v.errorHash} repeated ${errorRepeatCount} times; escalated to Pro tier.`;
        }
        latestFeedback = `[VERIFY_FAIL hash=${v.errorHash}] ${v.summary}\n${v.output}${ddiHint}`;
      }
    }
  }

  if (Object.keys(turnRecord.files).length > 0) {
    const existing = await readTurnSnapshots(workspaceDir);
    existing.push(turnRecord);
    await writeTurnSnapshots(workspaceDir, existing);
  }

  if (!finalReply) {
    finalReply =
      actions.length > 0
        ? `Executed ${actions.length} step(s). Latest: ${actions[actions.length - 1].summary}`
        : `Stopped at max step ceiling (${maxSteps} steps).`;
  }

  return ok({
    turnId,
    reply: finalReply,
    actions,
    modifiedFiles,
    frame: lastFrame!,
    verifyPassed: lastVerifyPassed,
    frameTokens: lastFrame?.totalTokens ?? 0,
    budgetCeiling: lastFrame?.budgetCeiling ?? 6000,
    cacheHitTokens: totalCacheHits,
    staticHeadHash: lastFrame?.staticHeadHash ?? '--------',
    modelTier: activeTier,
  });
}
