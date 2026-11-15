# ContextHarness VS Code Extension

Lightweight VS Code host driving the exact same 4K–8K stateless ContextHarness Core (`lib/harness/core/workspace-chat-agent.ts`).

## Capabilities
- **Streaming Micro-Steps**: Real-time SSE model token stream, step status, token budget (`4K-8K`), and Prefix Cache telemetry (`#hash` / `cacheHit`) in the Sidebar & Output channel.
- **Universal Multi-Language Support**: Auto-reads `.gitignore` + `.contextharness.json`, skips binaries/lockfiles/build outputs, and injects live **VS Code LSP Diagnostics** into Slot 4 across any language.
- **9-Tool Auto-Execution**: `read_slice`, `write_file`, `replace_lines`, `grep_search`, `list_dir`, `delete_file`, `move_file`, `run_command`, `finish`.
- **1-Click Turn Rollback & Native Diff**: Click `Diff: <file>` on any modified file to view `vscode.diff`, or click `Rollback` to restore all files touched in the last turn.

## Quick Start (Windows / macOS / Linux)
1. Open the `vscode-extension` folder in a terminal:
   ```bash
   cd vscode-extension
   npm install
   npm run build
   ```
2. Open `vscode-extension` in VS Code and press **`F5`** to launch the Extension Development Host.
3. In the Extension Development Host, open any project folder. If `.env.local` has `DEEPSEEK_API_KEY=...`, it is detected automatically; otherwise click **API Key** in the ContextHarness sidebar.
