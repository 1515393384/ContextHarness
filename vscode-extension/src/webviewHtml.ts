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
      padding: 6px 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 4px;
    }
    .messages {
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
    .stream-tail {
      margin-top: 6px;
      padding: 6px;
      border-radius: 4px;
      background: var(--vscode-textCodeBlock-background);
      font-family: var(--vscode-editor-font-family);
      font-size: 10px;
      max-height: 90px;
      overflow: hidden;
      white-space: pre-wrap;
      word-break: break-all;
      color: var(--vscode-descriptionForeground);
    }
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
      <button id="btn-key" class="btn"></button>
      <button id="btn-clear" class="btn"></button>
      <button id="btn-lang" class="btn">中文</button>
    </div>
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

  <div class="composer">
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
    let state = {
      workspaceName: '',
      hasApiKey: false,
      busy: false,
      canRollback: false,
      messages: [],
      live: null,
      error: null
    };

    const COPY = {
      en: {
        rollback: 'Rollback',
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
        liveTitle: 'Live Micro-Step'
      },
      zh: {
        rollback: '回滚上轮',
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
        liveTitle: '实时微步流'
      }
    };

    function esc(s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function render() {
      const t = COPY[locale];
      document.getElementById('btn-rollback').textContent = t.rollback;
      document.getElementById('btn-rollback').style.display = state.canRollback ? 'inline-block' : 'none';
      document.getElementById('btn-rollback').disabled = state.busy;
      document.getElementById('btn-key').textContent = t.key;
      document.getElementById('btn-clear').textContent = t.clear;
      document.getElementById('btn-clear').disabled = state.busy || state.messages.length === 0;
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

          if (msg.modifiedFiles && msg.modifiedFiles.length > 0 && msg.turnId) {
            html += '<div class="files-changed">';
            for (const f of msg.modifiedFiles) {
              html += '<button class="btn diff-btn" data-turn="' + esc(msg.turnId) + '" data-file="' + esc(f) + '">' + esc(t.diffPrefix + f) + '</button>';
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

    document.getElementById('btn-send').addEventListener('click', sendTask);
    document.getElementById('prompt-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTask();
      }
    });
    document.getElementById('btn-rollback').addEventListener('click', () => vscode.postMessage({ type: 'rollback' }));
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
        const input = document.getElementById('prompt-input');
        input.value = msg.text || '';
        input.focus();
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
