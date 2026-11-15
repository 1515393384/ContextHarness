import {exec, execFile} from 'node:child_process';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';
import {
  err,
  ok,
  type ChatStepAction,
  type HarnessError,
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
]);

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
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(resolvedRoot, relPath);
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

export async function listWorkspaceFiles(
  rootDir: string,
  maxFiles = 120,
): Promise<string[]> {
  const files: string[] = [];

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
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.contextharness-')) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const rel = path.relative(rootDir, fullPath).split(path.sep).join('/');
        files.push(rel);
      }
    }
  }

  await walk(rootDir);
  return files;
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
    const raw = await fs.readFile(safe.value, 'utf8');
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    const startIdx = Math.max(0, startLine - 1);
    const endIdx = Math.min(lines.length, endLine);
    const numbered = lines
      .slice(startIdx, endIdx)
      .map((line, i) => `${startIdx + i + 1} | ${line}`)
      .join('\n');
    return ok(numbered);
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

export async function runWorkspaceVerify(
  rootDir: string,
  customCommand?: string,
): Promise<{
  passed: boolean;
  errorHash: string | null;
  summary: string;
  output: string;
}> {
  const trimmedCmd = customCommand?.trim();
  if (trimmedCmd) {
    try {
      const {stdout, stderr} = await execAsync(trimmedCmd, {
        cwd: rootDir,
        timeout: 30000,
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
      const firstLine = combined.split('\n')[0] || 'Verification command failed';
      return {
        passed: false,
        errorHash: computeStableHash(firstLine),
        summary: firstLine,
        output: combined.slice(0, 1200),
      };
    }
  }

  const files = await listWorkspaceFiles(rootDir);
  const testFiles = files.filter((f) => /\.(test|spec)\.(ts|tsx|js|mjs)$/.test(f));
  const hasTsConfig = files.includes('tsconfig.json');
  const useShell = process.platform === 'win32';
  const outputs: string[] = [];

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
      : `Scanned ${files.length} files (no test files or custom verify command set)`,
    output: outputs.join('\n') || 'No errors detected.',
  };
}

function buildChatStaticHead(tier: ModelTier): string {
  const schema = JSON.stringify({
    reasoning: 'short explanation of this micro-step',
    action: {
      tool: 'read_slice | write_file | replace_lines | run_verify | finish',
      file: 'relative path inside workspace (for read_slice/write_file/replace_lines)',
      startLine: 'number (for read_slice/replace_lines)',
      endLine: 'number (for read_slice/replace_lines)',
      expectedFirstLine: 'string (for replace_lines)',
      newCode: 'string (for replace_lines)',
      content: 'string (for write_file)',
      command: 'optional string (for run_verify)',
      reply: 'string (for finish)',
    },
  });

  return [
    `[STATIC_CHAT_HARNESS_PREFIX v1 | tier=${tier}]`,
    'ROLE: Stateless Bounded-Context Workspace Agent. You operate strictly inside the active workspace directory using at most 4K-8K tokens per step.',
    'RULES: (1) Read only needed slices via read_slice. (2) Create or edit files inside workspace via write_file or replace_lines (never include line-number prefixes like "12 | "). (3) Run run_verify after code edits when tests or types apply. (4) Call finish with a concise summary when done. (5) Output ONLY raw JSON (no markdown fences, no prose).',
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

async function buildWorkspaceSkeleton(rootDir: string, files: string[]): Promise<string> {
  if (files.length === 0) {
    return '[WORKSPACE_FILES]\n(empty directory)';
  }
  const previewLines: string[] = [`[WORKSPACE_FILES (${files.length})]`];
  for (const rel of files.slice(0, 60)) {
    previewLines.push(`- ${rel}`);
  }

  const codeFiles = files
    .filter((f) => /\.(ts|tsx|js|mjs|py|rs|go)$/.test(f))
    .slice(0, 8);
  for (const rel of codeFiles) {
    const safe = resolveSafeWorkspacePath(rootDir, rel);
    if (safe.ok === false) continue;
    try {
      const content = (await fs.readFile(safe.value, 'utf8')).replace(/\r\n/g, '\n');
      const sigs = content
        .split('\n')
        .map((l, idx) => ({line: l.trim(), num: idx + 1}))
        .filter(
          ({line}) =>
            line.startsWith('export ') ||
            line.startsWith('def ') ||
            line.startsWith('pub fn ') ||
            line.startsWith('func '),
        )
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
  tool: 'read_slice' | 'write_file' | 'replace_lines' | 'run_verify' | 'finish';
  file?: string;
  startLine?: number;
  endLine?: number;
  expectedFirstLine?: string;
  newCode?: string;
  content?: string;
  command?: string;
  reply?: string;
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
}

export interface WorkspaceChatTurnOutput {
  reply: string;
  actions: ChatStepAction[];
  frame: SlotFrame;
  verifyPassed?: boolean;
  frameTokens: number;
  budgetCeiling: number;
  cacheHitTokens: number;
  staticHeadHash: string;
  modelTier: ModelTier;
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
  } = input;

  if (!apiKey.trim()) {
    return err({
      code: 'MODEL_GATEWAY_ERROR',
      message: 'DEEPSEEK_API_KEY is not configured in server environment (.env.local).',
    });
  }

  let activeTier: ModelTier = input.initialTier;
  const actions: ChatStepAction[] = [];
  const openSlices = new Map<string, string>();
  let latestFeedback = '[STATUS] Clean turn start. 0 prior tool steps.';
  let lastErrorHash: string | null = null;
  let errorRepeatCount = 0;
  let lastVerifyPassed: boolean | undefined;
  let totalCacheHits = 0;
  let lastFrame: SlotFrame | null = null;
  let finalReply = '';

  const maxMicroSteps = 8;

  for (let step = 1; step <= maxMicroSteps; step += 1) {
    const budgetCeiling = activeTier === 'pro' ? 8000 : 6000;
    const files = await listWorkspaceFiles(workspaceDir);
    const skeletonRaw = await buildWorkspaceSkeleton(workspaceDir, files);

    const slot1Fit = truncateToTokenBudget(buildChatStaticHead(activeTier), 1000);
    const staticHeadHash = computeStableHash(slot1Fit.text);
    const slot2Fit = truncateToTokenBudget(skeletonRaw, 1500);

    const sliceBlocks: string[] = [
      `[USER_REQUEST]\n${userMessage}`,
      `[WORKSPACE_DIR] ${workspaceDir}`,
    ];
    for (const [fileKey, content] of openSlices.entries()) {
      sliceBlocks.push(`[OPEN_SLICE ${fileKey}]\n${content}`);
    }
    const slot3Fit = truncateToTokenBudget(sliceBlocks.join('\n\n'), 2500);
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
        label: 'Slot 3 · Request & Active File Slices',
        content: slot3Fit.text,
        tokens: slot3Fit.tokens,
        maxTokens: 2500,
        pruned: slot3Fit.pruned,
      },
      slot4VerifyFeedback: {
        label: 'Slot 4 · Masked Step & Verify Feedback',
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

    const model = activeTier === 'pro' ? proModel : flashModel;
    const cleanBase = baseUrl.replace(/\/$/, '');
    const isReasoner = model.toLowerCase().includes('reasoner');

    let rawContent = '';
    let finishReason = '';
    try {
      const requestBody: Record<string, unknown> = {
        model,
        max_tokens: 4096,
        messages: [
          {role: 'system', content: frame.slot1StaticHead.content},
          {
            role: 'user',
            content: [
              frame.slot2ContractAnchors.content,
              frame.slot3SurgicalSlice.content,
              frame.slot4VerifyFeedback.content,
            ].join('\n\n'),
          },
        ],
      };
      if (!isReasoner) {
        requestBody.temperature = 0.1;
        requestBody.response_format = {type: 'json_object'};
      }

      const response = await fetch(`${cleanBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const body = await response.text();
        return err({
          code: 'MODEL_GATEWAY_ERROR',
          message: `DeepSeek API HTTP ${response.status}`,
          details: body.slice(0, 300),
        });
      }

      const data = (await response.json()) as {
        choices?: Array<{
          finish_reason?: string;
          message?: {content?: string; reasoning_content?: string};
        }>;
        usage?: {prompt_cache_hit_tokens?: number};
      };
      totalCacheHits += data.usage?.prompt_cache_hit_tokens ?? 0;
      finishReason = data.choices?.[0]?.finish_reason ?? '';
      rawContent =
        data.choices?.[0]?.message?.content ||
        data.choices?.[0]?.message?.reasoning_content ||
        '';
    } catch (error) {
      return err({
        code: 'MODEL_GATEWAY_ERROR',
        message:
          error instanceof Error
            ? `DeepSeek request failed: ${error.message}`
            : 'DeepSeek request failed',
      });
    }

    const parsed = parseModelJsonObject<
      {reasoning?: string; action?: ParsedChatAction} & Partial<ParsedChatAction>
    >(rawContent);
    if (!parsed) {
      const preview = rawContent.slice(0, 140).replace(/\s+/g, ' ');
      latestFeedback = `[STEP_ERROR finish=${finishReason || 'unknown'}] Invalid JSON output (${preview || 'empty'}). Output ONLY one raw JSON object matching RESPONSE_JSON_SCHEMA.`;
      continue;
    }

    const act: ParsedChatAction | undefined =
      parsed.action && parsed.action.tool
        ? parsed.action
        : parsed.tool
          ? (parsed as ParsedChatAction)
          : undefined;

    if (!act || !act.tool) {
      latestFeedback = `[STEP_ERROR] Missing action.tool in JSON response. Received keys: ${Object.keys(parsed).join(', ')}`;
      continue;
    }

    if (act.tool === 'finish') {
      finalReply =
        act.reply?.trim() ||
        parsed.reasoning?.trim() ||
        'Completed workspace operations.';
      break;
    }

    if (act.tool === 'read_slice') {
      const target = act.file ?? '';
      const start = Math.max(1, act.startLine ?? 1);
      const end = Math.max(start, act.endLine ?? start + 120);
      const readRes = await readWorkspaceFileNumbered(
        workspaceDir,
        target,
        start,
        end,
      );
      if (readRes.ok === true) {
        openSlices.set(target, readRes.value);
        actions.push({
          tool: 'read_slice',
          target: `${target}:${start}-${end}`,
          ok: true,
          summary: `Loaded lines ${start}-${end}`,
        });
        latestFeedback = `[READ_OK] Loaded ${target}:${start}-${end} into Slot 3.`;
      } else {
        actions.push({
          tool: 'read_slice',
          target,
          ok: false,
          summary: readRes.error.message,
        });
        latestFeedback = `[READ_ERR] ${readRes.error.message}`;
      }
      continue;
    }

    if (act.tool === 'write_file') {
      const target = act.file ?? '';
      const safe = resolveSafeWorkspacePath(workspaceDir, target);
      if (safe.ok === false) {
        actions.push({
          tool: 'write_file',
          target,
          ok: false,
          summary: safe.error.message,
        });
        latestFeedback = `[WRITE_ERR] ${safe.error.message}`;
        continue;
      }
      const cleanBody = stripAccidentalLineNumbers(act.content ?? '');
      try {
        await fs.mkdir(path.dirname(safe.value), {recursive: true});
        await fs.writeFile(safe.value, cleanBody, 'utf8');
        const numbered = await readWorkspaceFileNumbered(workspaceDir, target, 1, 140);
        if (numbered.ok === true) {
          openSlices.set(target, numbered.value);
        }
        actions.push({
          tool: 'write_file',
          target,
          ok: true,
          summary: `Wrote ${cleanBody.split('\n').length} lines`,
        });
        latestFeedback = `[WRITE_OK] Wrote ${target}. Run run_verify if tests/types exist, or finish.`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        actions.push({tool: 'write_file', target, ok: false, summary: msg});
        latestFeedback = `[WRITE_ERR] ${msg}`;
      }
      continue;
    }

    if (act.tool === 'replace_lines') {
      const target = act.file ?? '';
      const safe = resolveSafeWorkspacePath(workspaceDir, target);
      if (safe.ok === false) {
        actions.push({
          tool: 'replace_lines',
          target,
          ok: false,
          summary: safe.error.message,
        });
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
          actions.push({tool: 'replace_lines', target: `${target}:${s}-${e}`, ok: false, summary: msg});
          latestFeedback = `[PATCH_ERR] ${msg}`;
          continue;
        }
        const replacement = stripAccidentalLineNumbers(act.newCode ?? '').split('\n');
        const updated = [...lines.slice(0, s - 1), ...replacement, ...lines.slice(e)].join('\n');
        await fs.writeFile(safe.value, updated, 'utf8');
        const numbered = await readWorkspaceFileNumbered(workspaceDir, target, 1, 140);
        if (numbered.ok === true) {
          openSlices.set(target, numbered.value);
        }
        actions.push({
          tool: 'replace_lines',
          target: `${target}:${s}-${e}`,
          ok: true,
          summary: `Replaced lines ${s}-${e} with ${replacement.length} lines`,
        });
        latestFeedback = `[PATCH_OK] Updated ${target}:${s}-${e}.`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        actions.push({tool: 'replace_lines', target, ok: false, summary: msg});
        latestFeedback = `[PATCH_ERR] ${msg}`;
      }
      continue;
    }

    if (act.tool === 'run_verify') {
      const cmd = act.command?.trim() || verifyCommand;
      const v = await runWorkspaceVerify(workspaceDir, cmd);
      lastVerifyPassed = v.passed;
      actions.push({
        tool: 'run_verify',
        target: cmd || 'auto-verify',
        ok: v.passed,
        summary: v.summary,
      });

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
          activeTier = 'pro';
          ddiHint = `\n[DDI_CIRCUIT_BREAKER] Identical errorHash=${v.errorHash} repeated ${errorRepeatCount} times; escalated to Pro tier.`;
        }
        latestFeedback = `[VERIFY_FAIL hash=${v.errorHash}] ${v.summary}\n${v.output}${ddiHint}`;
      }
    }
  }

  if (!finalReply) {
    finalReply =
      actions.length > 0
        ? `Executed ${actions.length} step(s). Latest: ${actions[actions.length - 1].summary}`
        : 'Stopped at max step ceiling (8 steps).';
  }

  return ok({
    reply: finalReply,
    actions,
    frame: lastFrame!,
    verifyPassed: lastVerifyPassed,
    frameTokens: lastFrame?.totalTokens ?? 0,
    budgetCeiling: lastFrame?.budgetCeiling ?? 6000,
    cacheHitTokens: totalCacheHits,
    staticHeadHash: lastFrame?.staticHeadHash ?? '--------',
    modelTier: activeTier,
  });
}
