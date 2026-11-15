export function getWebviewHtml(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"
  />
  <title>ContextHarness 4-Slot Agent</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: var(--vscode-font-family);
      font-size: 12px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    .header {
      padding: 8px 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .title {
      font-weight: 600;
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .header-actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }
    .tabs {
      display: flex;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
    }
    .tab-btn {
      flex: 1;
      border: none;
      background: transparent;
      color: var(--vscode-descriptionForeground);
      padding: 7px 8px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      border-bottom: 2px solid transparent;
    }
    .tab-btn.active {
      color: var(--vscode-foreground);
      border-bottom-color: var(--vscode-focusBorder);
      background: var(--vscode-sideBar-background);
    }
    button.btn {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 3px 7px;
      font-size: 11px;
      cursor: pointer;
    }
    button.btn:hover:not(:disabled) {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    button.btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
    }
    button.btn-primary:hover:not(:disabled) {
      background: var(--vscode-button-hoverBackground);
    }
    button.btn-warn {
      border-color: var(--vscode-editorWarning-foreground);
      color: var(--vscode-editorWarning-foreground);
      background: transparent;
    }
    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .meta-bar {
      padding: 5px 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 4px;
    }
    .messages, .inspector-body {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .empty {
      padding: 14px;
      border: 1px dashed var(--vscode-panel-border);
      border-radius: 6px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.5;
    }
    .card {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 8px 10px;
      background: var(--vscode-editor-background);
    }
    .card.user {
      background: var(--vscode-list-hoverBackground);
    }
    .card-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
      margin-bottom: 5px;
      font-size: 11px;
    }
    .role { font-weight: 600; }
    .telemetry {
      font-family: var(--vscode-editor-font-family);
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }
    .content {
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.45;
    }
    .actions {
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px solid var(--vscode-panel-border);
      display: flex;
      flex-direction: column;
      gap: 3px;
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
    }
    .act-row {
      display: flex;
      gap: 5px;
      align-items: baseline;
      flex-wrap: wrap;
    }
    .ok { color: var(--vscode-testing-iconPassed, #3fb950); font-weight: 600; }
    .err { color: var(--vscode-testing-iconFailed, #f85149); font-weight: 600; }
    .tool { font-weight: 600; }
    .target { color: var(--vscode-textLink-foreground); }
    .summary { color: var(--vscode-descriptionForeground); }
    .files-changed {
      margin-top: 7px;
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .stream-box {
      border: 1px solid var(--vscode-focusBorder);
      border-radius: 6px;
      padding: 8px 10px;
      background: var(--vscode-editor-background);
    }
    .stream-tail, .code-block {
      margin-top: 6px;
      padding: 6px;
      border-radius: 4px;
      background: var(--vscode-textCodeBlock-background);
      font-family: var(--vscode-editor-font-family);
      font-size: 10px;
      max-height: 220px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-all;
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-panel-border);
    }
    details {
      margin-top: 6px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 5px 7px;
      background: var(--vscode-sideBar-background);
    }
    summary {
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
    }
    .reg-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
    }
    .reg-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
      padding: 4px 0;
      border-bottom: 1px solid var(--vscode-panel-border);
      font-family: var(--vscode-editor-font-family);
      font-size: 10px;
    }
    .reg-row:last-child { border-bottom: none; }
    .composer {
      border-top: 1px solid var(--vscode-panel-border);
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .flags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .flags label {
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
    }
    textarea {
      width: 100%;
      resize: vertical;
      min-height: 60px;
      border-radius: 4px;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-font-family);
      font-size: 12px;
      padding: 6px 8px;
    }
    textarea:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    .composer-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    select {
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border));
      border-radius: 4px;
      padding: 3px 6px;
      font-size: 11px;
    }
    .error-banner {
      margin: 6px 10px 0;
      padding: 6px 8px;
      border-radius: 4px;
      border: 1px solid var(--vscode-inputValidation-errorBorder, #f85149);
      background: var(--vscode-inputValidation-errorBackground, rgba(248,81,73,0.12));
      font-size: 11px;
      display: flex;
      justify-content: space-between;
      gap: 6px;
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="title">ContextHarness · 4-Slot</span>
    <div class="header-actions">
      <button id="btn-rollback" class="btn btn-warn" style="display:none;"></button>
      <button id="btn-output" class="btn"></button>
      <button id="btn-key" class="btn"></button>
      <button id="btn-clear" class="btn"></button>
      <button id="btn-lang" class="btn">EN</button>
    </div>
  </div>

  <div class="tabs">
    <button id="tab-chat" class="tab-btn active"></button>
    <button id="tab-inspector" class="tab-btn"></button>
  </div>

  <div class="meta-bar">
    <span id="ws-label">No workspace</span>
    <span id="key-status">Checking key...</span>
  </div>

  <div id="error-box" class="error-banner" style="display:none;">
    <span id="error-text"></span>
    <button id="btn-dismiss-err" class="btn">×</button>
  </div>

  <div id="messages" class="messages"></div>

  <div id="inspector" class="inspector-body" style="display:none;"></div>

  <div id="composer" class="composer">
    <div class="flags">
      <label><input type="checkbox" id="chk-selection" checked /> <span id="lbl-selection"></span></label>
      <label><input type="checkbox" id="chk-diag" checked /> <span id="lbl-diag"></span></label>
    </div>
    <textarea id="prompt-input" rows="3"></textarea>
    <div class="composer-footer">
      <select id="tier-select">
        <option value="flash">Flash-1017 (6K)</option>
        <option value="pro">Pro / Reasoner (8K)</option>
      </select>
      <button id="btn-send" class="btn btn-primary"></button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let locale = 'zh';
    let activeTab = 'chat';
    let state = {
      workspaceName: '',
      hasApiKey: false,
      busy: false,
      canRollback: false,
      messages: [],
      traces: [],
      regressionReport: null,
      live: null,
      error: null
    };

    const COPY = {
      en: {
        tabChat: 'Chat',
        tabInspector: 'Full Slots & AI Logs',
        rollback: 'Rollback',
        outputBtn: 'Output',
        key: 'API Key',
        clear: 'Clear',
        langBtn: '中文',
        keyOk: 'Key Ready',
        keyMissing: 'Key Unset',
        selection: 'Active Selection',
        diag: 'LSP Diagnostics',
        placeholder: 'Ask ContextHarness to build, edit, search, debug, or test... (Enter to send)',
        send: 'Send',
        sending: 'Streaming...',
        empty: 'Bounded 4K-8K Context Driver ready. Supports all languages automatically (.gitignore + 9 tools + VS Code LSP Diagnostics + 1-click Turn Rollback).',
        you: 'You',
        agent: 'ContextHarness',
        diffPrefix: 'Diff: ',
        viewLogsBtn: 'Inspect AI Logs & Slots',
        liveTitle: 'Live Micro-Step',
        regTitle: 'All-Tools Regression Debug Suite',
        regLocalBtn: 'Run Local 10-Tool Self-Test (0 Token)',
        regAiBtn: 'Run Live AI Multi-Tool E2E',
        noTraces: 'No step traces recorded yet. Send a task or run regression to inspect AI raw outputs and all 4 Slots.',
        rawAiLabel: 'Raw AI Output',
        feedbackLabel: 'Tool / Slot 4 Feedback',
        slotsLabel: 'Full 4-Slot Frame Contents'
      },
      zh: {
        tabChat: '对话执行',
        tabInspector: '全栏 & AI 原始日志',
        rollback: '回滚上轮',
        outputBtn: '输出日志',
        key: '密钥',
        clear: '清空',
        langBtn: 'EN',
        keyOk: '密钥已就绪',
        keyMissing: '未设密钥',
        selection: '带当前选区',
        diag: '带 LSP 报错',
        placeholder: '输入开发、修改、排查或测试任务...（Enter 发送，Shift+Enter 换行）',
        send: '发送执行',
        sending: '流式执行中...',
        empty: '4K-8K 固定预算上下文驱动器已就绪。自动适配全语言（.gitignore 过滤 + 9 工具集 + VS Code LSP 诊断直通 + 每轮快照一键回滚）。',
        you: '你',
        agent: 'ContextHarness',
        diffPrefix: '对比 Diff: ',
        viewLogsBtn: '查看全栏 & AI 原始输出',
        liveTitle: '实时微步流',
        regTitle: '全工具回归自检流程（调试专用）',
        regLocalBtn: '跑本地 10 项工具回归 (0 Token)',
        regAiBtn: '跑 AI 全链路工具回归 (Live)',
        noTraces: '暂无追踪日志。发送一次对话或运行工具回归后，可在此查看每步 AI 原始返回与 Slot 1-4 全栏目原文。',
        rawAiLabel: 'AI 原始返回 (Raw JSON)',
        feedbackLabel: '工具执行 / Slot 4 反馈',
        slotsLabel: '4-Slot 完整栏目内容'
      }
    };

    function esc(s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function renderChat(t) {
      const box = document.getElementById('messages');
      let html = '';

      if (state.messages.length === 0 && !state.live) {
        html = '<div class="empty">' + esc(t.empty) + '</div>';
      } else {
        for (const msg of state.messages) {
          const isUser = msg.role === 'user';
          const teleParts = [];
          if (msg.modelTier) teleParts.push(msg.modelTier === 'pro' ? 'Pro' : 'Flash-1017');
          if (typeof msg.frameTokens === 'number') teleParts.push(msg.frameTokens + '/' + (msg.budgetCeiling || 6000) + ' tok');
          if (msg.cacheHitTokens > 0) teleParts.push('hit ' + msg.cacheHitTokens);
          if (msg.staticHeadHash) teleParts.push('#' + msg.staticHeadHash);

          html += '<div class="card ' + (isUser ? 'user' : '') + '">';
          html += '<div class="card-head"><span class="role">' + esc(isUser ? t.you : t.agent) + '</span>';
          if (teleParts.length > 0) {
            html += '<span class="telemetry">' + esc(teleParts.join(' · ')) + '</span>';
          }
          html += '</div>';
          html += '<div class="content">' + esc(msg.content) + '</div>';

          if (msg.actions && msg.actions.length > 0) {
            html += '<div class="actions">';
            for (const act of msg.actions) {
              html += '<div class="act-row">';
              html += '<span class="' + (act.ok ? 'ok' : 'err') + '">' + (act.ok ? 'OK' : 'ERR') + '</span>';
              html += '<span class="tool">' + esc(act.tool) + '</span>';
              html += '<span class="target">' + esc(act.target) + '</span>';
              html += '<span class="summary">— ' + esc(act.summary) + '</span>';
              html += '</div>';
            }
            html += '</div>';
          }

          if (!isUser && (msg.modifiedFiles && msg.modifiedFiles.length > 0 || state.traces.length > 0)) {
            html += '<div class="files-changed">';
            if (msg.modifiedFiles && msg.turnId) {
              for (const f of msg.modifiedFiles) {
                html += '<button class="btn diff-btn" data-turn="' + esc(msg.turnId) + '" data-file="' + esc(f) + '">' + esc(t.diffPrefix + f) + '</button>';
              }
            }
            if (state.traces.length > 0) {
              html += '<button class="btn jump-inspector-btn">' + esc(t.viewLogsBtn) + '</button>';
            }
            html += '</div>';
          }
          html += '</div>';
        }

        if (state.live) {
          const l = state.live;
          html += '<div class="stream-box">';
          html += '<div class="card-head"><span class="role">' + esc(t.liveTitle) + ' (' + l.step + '/' + l.maxSteps + ')</span>';
          html += '<span class="telemetry">' + esc((l.modelTier === 'pro' ? 'Pro' : 'Flash-1017') + ' · ' + l.frameTokens + '/' + l.budgetCeiling + ' tok · #' + l.staticHeadHash) + '</span></div>';
          html += '<div class="content">' + esc(l.statusLine) + '</div>';
          if (l.streamTail) {
            html += '<div class="stream-tail">' + esc(l.streamTail) + '</div>';
          }
          if (l.actions && l.actions.length > 0) {
            html += '<div class="actions">';
            for (const act of l.actions) {
              html += '<div class="act-row"><span class="' + (act.ok ? 'ok' : 'err') + '">' + (act.ok ? 'OK' : 'ERR') + '</span><span class="tool">' + esc(act.tool) + '</span><span class="target">' + esc(act.target) + '</span><span class="summary">— ' + esc(act.summary) + '</span></div>';
            }
            html += '</div>';
          }
          html += '</div>';
        }
      }

      box.innerHTML = html;
      box.scrollTop = box.scrollHeight;

      for (const btn of box.querySelectorAll('.diff-btn')) {
        btn.addEventListener('click', () => {
          vscode.postMessage({
            type: 'openDiff',
            turnId: btn.getAttribute('data-turn'),
            file: btn.getAttribute('data-file')
          });
        });
      }
      for (const btn of box.querySelectorAll('.jump-inspector-btn')) {
        btn.addEventListener('click', () => {
          activeTab = 'inspector';
          render();
        });
      }
    }

    function renderInspector(t) {
      const container = document.getElementById('inspector');
      let html = '';

      html += '<div class="card">';
      html += '<div class="card-head"><span class="role">' + esc(t.regTitle) + '</span>';
      if (state.regressionReport) {
        const r = state.regressionReport;
        html += '<span class="telemetry">' + esc(r.passedCount + '/' + r.totalCount + ' PASS · ' + r.durationMs + 'ms') + '</span>';
      }
      html += '</div>';
      html += '<div class="reg-grid">';
      html += '<button id="btn-reg-local" class="btn btn-primary" ' + (state.busy ? 'disabled' : '') + '>' + esc(t.regLocalBtn) + '</button>';
      html += '<button id="btn-reg-ai" class="btn" ' + (state.busy ? 'disabled' : '') + '>' + esc(t.regAiBtn) + '</button>';
      html += '</div>';

      if (state.regressionReport && state.regressionReport.items) {
        html += '<div style="margin-top:8px;">';
        for (const item of state.regressionReport.items) {
          html += '<div class="reg-row">';
          html += '<div><span class="' + (item.passed ? 'ok' : 'err') + '">' + (item.passed ? 'PASS' : 'FAIL') + '</span> <strong>' + esc(item.name) + '</strong><div class="summary">' + esc(item.detail) + '</div></div>';
          html += '<span class="telemetry">' + item.durationMs + 'ms</span>';
          html += '</div>';
        }
        html += '</div>';
      }
      html += '</div>';

      if (!state.traces || state.traces.length === 0) {
        html += '<div class="empty">' + esc(t.noTraces) + '</div>';
      } else {
        for (let idx = state.traces.length - 1; idx >= 0; idx -= 1) {
          const tr = state.traces[idx];
          const fr = tr.frame || {};
          const headMeta = (tr.modelTier === 'pro' ? 'Pro' : 'Flash') + ' · ' + tr.durationMs + 'ms · finish=' + tr.finishReason + ' · hit=' + tr.cacheHitTokens + ' · ' + (fr.totalTokens || 0) + '/' + (fr.budgetCeiling || 6000) + ' tok';

          html += '<div class="card">';
          html += '<div class="card-head"><span class="role">Step ' + tr.step + ' · ' + esc(tr.parsedTool || 'unknown') + '</span>';
          html += '<span class="telemetry">' + esc(headMeta) + '</span></div>';

          if (tr.parsedReasoning) {
            html += '<div class="summary" style="margin-bottom:4px;">reasoning: ' + esc(tr.parsedReasoning) + '</div>';
          }

          html += '<details open><summary>' + esc(t.rawAiLabel) + '</summary>';
          html += '<div class="code-block">' + esc(tr.rawModelOutput || '(empty)') + '</div></details>';

          html += '<details><summary>' + esc(t.feedbackLabel) + '</summary>';
          html += '<div class="code-block">' + esc(tr.toolFeedback || '') + '</div></details>';

          if (fr.slot1StaticHead) {
            const slots = [fr.slot1StaticHead, fr.slot2ContractAnchors, fr.slot3SurgicalSlice, fr.slot4VerifyFeedback];
            html += '<details><summary>' + esc(t.slotsLabel) + ' (#' + esc(fr.staticHeadHash || '') + ')</summary>';
            for (const s of slots) {
              if (!s) continue;
              html += '<details><summary>' + esc(s.label) + ' (' + s.tokens + '/' + s.maxTokens + ' tok' + (s.pruned ? ' PRUNED' : '') + ')</summary>';
              html += '<div class="code-block">' + esc(s.content) + '</div></details>';
            }
            html += '</details>';
          }

          html += '</div>';
        }
      }

      container.innerHTML = html;

      const regLocalBtn = document.getElementById('btn-reg-local');
      if (regLocalBtn) {
        regLocalBtn.addEventListener('click', () => vscode.postMessage({ type: 'runRegressionLocal' }));
      }
      const regAiBtn = document.getElementById('btn-reg-ai');
      if (regAiBtn) {
        regAiBtn.addEventListener('click', () => {
          activeTab = 'chat';
          vscode.postMessage({ type: 'runRegressionAi' });
        });
      }
    }

    function render() {
      const t = COPY[locale];
      const traceCount = state.traces ? state.traces.length : 0;
      document.getElementById('tab-chat').textContent = t.tabChat;
      document.getElementById('tab-inspector').textContent = traceCount > 0 ? t.tabInspector + ' (' + traceCount + ')' : t.tabInspector;
      document.getElementById('tab-chat').className = 'tab-btn ' + (activeTab === 'chat' ? 'active' : '');
      document.getElementById('tab-inspector').className = 'tab-btn ' + (activeTab === 'inspector' ? 'active' : '');

      document.getElementById('btn-rollback').textContent = t.rollback;
      document.getElementById('btn-rollback').style.display = state.canRollback ? 'inline-block' : 'none';
      document.getElementById('btn-rollback').disabled = state.busy;
      document.getElementById('btn-output').textContent = t.outputBtn;
      document.getElementById('btn-key').textContent = t.key;
      document.getElementById('btn-clear').textContent = t.clear;
      document.getElementById('btn-clear').disabled = state.busy || (state.messages.length === 0 && traceCount === 0);
      document.getElementById('btn-lang').textContent = t.langBtn;
      document.getElementById('ws-label').textContent = state.workspaceName || 'No folder open';
      document.getElementById('key-status').textContent = state.hasApiKey ? t.keyOk : t.keyMissing;
      document.getElementById('lbl-selection').textContent = t.selection;
      document.getElementById('lbl-diag').textContent = t.diag;
      document.getElementById('prompt-input').placeholder = t.placeholder;
      document.getElementById('btn-send').textContent = state.busy ? t.sending : t.send;
      document.getElementById('btn-send').disabled = state.busy;

      const errBox = document.getElementById('error-box');
      if (state.error) {
        errBox.style.display = 'flex';
        document.getElementById('error-text').textContent = state.error;
      } else {
        errBox.style.display = 'none';
      }

      document.getElementById('messages').style.display = activeTab === 'chat' ? 'flex' : 'none';
      document.getElementById('composer').style.display = activeTab === 'chat' ? 'flex' : 'none';
      document.getElementById('inspector').style.display = activeTab === 'inspector' ? 'flex' : 'none';

      if (activeTab === 'chat') {
        renderChat(t);
      } else {
        renderInspector(t);
      }
    }

    function sendTask() {
      const input = document.getElementById('prompt-input');
      const text = input.value.trim();
      if (!text || state.busy) return;
      input.value = '';
      vscode.postMessage({
        type: 'send',
        message: text,
        modelTier: document.getElementById('tier-select').value,
        includeSelection: document.getElementById('chk-selection').checked,
        includeDiagnostics: document.getElementById('chk-diag').checked
      });
    }

    document.getElementById('tab-chat').addEventListener('click', () => { activeTab = 'chat'; render(); });
    document.getElementById('tab-inspector').addEventListener('click', () => { activeTab = 'inspector'; render(); });
    document.getElementById('btn-send').addEventListener('click', sendTask);
    document.getElementById('prompt-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTask();
      }
    });
    document.getElementById('btn-rollback').addEventListener('click', () => vscode.postMessage({ type: 'rollback' }));
    document.getElementById('btn-output').addEventListener('click', () => vscode.postMessage({ type: 'showOutput' }));
    document.getElementById('btn-key').addEventListener('click', () => vscode.postMessage({ type: 'setApiKey' }));
    document.getElementById('btn-clear').addEventListener('click', () => vscode.postMessage({ type: 'clear' }));
    document.getElementById('btn-dismiss-err').addEventListener('click', () => {
      state.error = null;
      render();
    });
    document.getElementById('btn-lang').addEventListener('click', () => {
      locale = locale === 'zh' ? 'en' : 'zh';
      render();
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'state') {
        state = msg.state;
        render();
      } else if (msg.type === 'prefill') {
        activeTab = 'chat';
        render();
        const input = document.getElementById('prompt-input');
        input.value = msg.text || '';
        input.focus();
      } else if (msg.type === 'openInspector') {
        activeTab = 'inspector';
        render();
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
