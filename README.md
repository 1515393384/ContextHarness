# ContextHarness — Fixed-Budget (3K–8K) Context-Driven Coding Harness

A context-driven, stateless coding harness built around a **4-layer Ports & Adapters architecture** to eliminate long-context degradation (*Context Rot*) and enforce strict **3K–8K token attention budgets** per agent invocation.

## Core Design Principles

1. **Stateless Execution, Stateful Harness**: Conversation history is never carried across coding/debugging turns (`0` chat history). Task DAG state, snapshots, and error hashes live deterministically in the harness.
2. **4-Slot Context Compiler (3K–8K Hard Cap)**:
   - `Slot 1 (Static Head)`: Byte-identical role directive and flat `replace_lines` JSON tool schema for Prefix Cache hits.
   - `Slot 2 (Contract Anchors)`: Native language `interface` / `Result<T, E>` signatures (plus optional 1-hop callers when widened).
   - `Slot 3 (Surgical Slice)`: Line-numbered editable implementation slice paired with read-only unit assertions.
   - `Slot 4 (Masked Verify Feedback)`: Observation-masked single latest error, expected/actual diff, top user stack frames, and truncated probe snapshot.
3. **Physical Write-Lock Enforcement**: Blocks model patches targeting read-only `Contract` or `Tests` files or out-of-range lines.
4. **DDI 2-Round Circuit Breaker & SWE-Router Escalation**: After 2 consecutive identical `errorHash` failures, rolls back dirty edits to the initial stub and rewrites cleanly; on repeat, widens 1-hop callers (up to 8K ceiling) and escalates from Flash (`DeepSeek-V4.1-Flash-1017`) to Pro (`deepseek-reasoner`).

## Directory Structure

```text
lib/harness/
├── types.ts                        # Result<T, E>, role budgets (3K-8K), DAG tasks, 4-Slot frame types
├── ports.ts                        # 4 decoupled Ports: CodeIndex, WorkspaceEdit, VerifyProbe, ModelGateway
├── core/
│   ├── token-budget.ts             # Token estimator, FNV-1a hashing, deterministic budget truncation
│   ├── context-compiler.ts         # 4-Slot Context Compiler + Prefix Cache head + Observation Masking
│   ├── dag-scheduler.ts            # Topological DAG validator + physical write-lock enforcer
│   ├── ddi-circuit-breaker.ts      # DDI 2-round error-hash breaker + SWE-Router Pro escalation
│   ├── orchestrator.ts             # Stateless 6-step closed-loop orchestrator
│   └── harness.test.ts             # node:test unit tests
├── adapters/
│   ├── local-fs-adapters.ts        # Real local FS slicer, line-locked editor, and tsc/tsx verifier
│   └── deepseek-gateway.ts         # Server-side DeepSeek OpenAI-compatible ModelGatewayPort
├── server-store.ts                 # Server persistence backing /api/harness
└── cli.ts                          # CLI entrypoint for local repositories
```

## Quick Start

### 1. Run Unit Tests

```bash
npm run test:harness
```

### 2. Run CLI Against Local Repository

```bash
# Compile and inspect the 4-Slot frame on a target file
npm run harness -- --compile-only --file lib/harness/core/token-budget.ts --symbol truncateToTokenBudget

# Run tsc + test verification
npm run harness -- --verify-only --file lib/harness/core/token-budget.ts --test lib/harness/core/harness.test.ts

# Run live closed-loop with DeepSeek (requires DEEPSEEK_API_KEY in env)
DEEPSEEK_API_KEY="..." npm run harness -- --target . --file src/target.ts --symbol myFn --contract src/types.ts --test tests/target.test.ts --start 10 --end 40
```

### 3. Start Web Workbench

```bash
npm install
npm run dev
# Open http://localhost:3000
```

## Environment Variables (`.env.local`)

```bash
DEEPSEEK_API_KEY="your_deepseek_api_key"
DEEPSEEK_BASE_URL="https://api.deepseek.com/v1"
DEEPSEEK_MODEL_FLASH="deepseek-chat"
DEEPSEEK_MODEL_PRO="deepseek-reasoner"
```

## Plugging External Research Adapters

- `CodeIndexPort`: Swap `LocalFsCodeIndexAdapter` with **Serena (LSP MCP)** or **codebadger (Joern CPG MCP)** inside `getSlice()` / `get1HopCallers()`.
- `VerifyProbePort`: Extend `LocalNodeVerifyAdapter` with **InspectCoder**-style runtime variable probes or Playwright UI error captures.
