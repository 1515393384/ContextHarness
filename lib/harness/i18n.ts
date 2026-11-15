export type UiLocale = 'en' | 'zh';

export interface UiDictionary {
  nav: {
    chat: string;
    workbench: string;
    compiler: string;
    architecture: string;
    runLoop: string;
    running: string;
    allPassed: string;
    switchLabel: string;
  };
  loading: string;
  dismiss: string;
  sidebar: {
    intakeTitle: string;
    intakeDesc: string;
    promptLabel: string;
    promptPlaceholder: string;
    languageLabel: string;
    symbolLabel: string;
    targetFileLabel: string;
    startLineLabel: string;
    endLineLabel: string;
    contractFileLabel: string;
    testFileLabel: string;
    buildDagBtn: string;
    dagTitle: string;
    attemptsLabel: string;
    statusPassed: string;
    statusDebugging: string;
    statusHalted: string;
    statusPending: string;
  };
  workbench: {
    languagePrefix: string;
    writablePrefix: string;
    readOnlyLockPrefix: string;
    noneText: string;
    compileFrameBtn: string;
    verifyBtn: string;
    stepBtn: string;
    inspectBtn: string;
    resetBtn: string;
    mappingTitle: string;
    criteriaTitle: string;
    gatewayStatusLabel: string;
    gatewayReady: string;
    gatewayUnset: string;
    activeLabel: string;
    adapterLabel: string;
    roleCeiling: string;
    compiledTokens: string;
    staticHash: string;
    dagProgress: string;
    logTitle: string;
    roundsSuffix: string;
    emptyLog: string;
    colRound: string;
    colTaskRole: string;
    colTier: string;
    colTokensCap: string;
    colPrefixCache: string;
    colErrorHash: string;
    colDdiDecision: string;
    colSummary: string;
    cacheHit: string;
    cacheCold: string;
    writableLines: string;
    readOnlyAssertions: string;
  };
  compiler: {
    emptyState: string;
    title: string;
    taskPrefix: string;
    rolePrefix: string;
    tierPrefix: string;
    historyText: string;
    prunedSuffix: string;
    staticHashLabel: string;
    cacheExpectationLabel: string;
    cacheHitDesc: string;
    cacheColdDesc: string;
    prunedSlotsLabel: string;
    noneText: string;
    slotLabels: Record<string, string>;
  };
  ports: {
    title: string;
    subtitle: string;
    activeTag: string;
    port1Desc: string;
    port2Desc: string;
    port3EnvPrefix: string;
    port3Ready: string;
    port3Unset: string;
    port4Title: string;
    port4Desc: string;
    cliTestsTitle: string;
    cliRunTitle: string;
    indexOptions: Record<string, {title: string; desc: string}>;
    probeOptions: Record<string, {title: string; desc: string}>;
    modelOptions: Record<string, {title: string; desc: string}>;
  };
  chat: {
    sidebarTitle: string;
    sidebarDesc: string;
    dirLabel: string;
    dirPlaceholder: string;
    presetSandbox: string;
    presetCurrent: string;
    createMissingLabel: string;
    applyDirBtn: string;
    verifyCmdLabel: string;
    verifyCmdPlaceholder: string;
    runVerifyBtn: string;
    filesTitle: string;
    emptyFiles: string;
    filePreviewTitle: string;
    closePreview: string;
    threadTitle: string;
    clearBtn: string;
    emptyThread: string;
    gatewayReady: string;
    gatewayUnset: string;
    userLabel: string;
    assistantLabel: string;
    actionsTitle: string;
    inputPlaceholder: string;
    tierFlash: string;
    tierPro: string;
    sendBtn: string;
    sendingBtn: string;
  };
}

export const UI_COPY: Record<UiLocale, UiDictionary> = {
  en: {
    nav: {
      chat: 'Workspace Chat',
      workbench: 'Workbench',
      compiler: '4-Slot Compiler',
      architecture: 'Ports & Adapters',
      runLoop: 'Run Closed Loop',
      running: 'Running...',
      allPassed: 'All Tasks Passed',
      switchLabel: '中文',
    },
    loading: 'Loading ContextHarness workspace...',
    dismiss: 'Dismiss',
    sidebar: {
      intakeTitle: 'Requirement Intake',
      intakeDesc:
        'Bind a requirement to an exact file slice, contract anchor, and test suite.',
      promptLabel: 'Requirement Prompt',
      promptPlaceholder: 'Describe the target behavior and invariants...',
      languageLabel: 'Language',
      symbolLabel: 'Target Symbol',
      targetFileLabel: 'Editable Implementation File',
      startLineLabel: 'Start Line',
      endLineLabel: 'End Line',
      contractFileLabel: 'Read-Only Contract File',
      testFileLabel: 'Read-Only Test File',
      buildDagBtn: 'Build Contract & Task DAG',
      dagTitle: 'Atomic Task DAG',
      attemptsLabel: 'Attempts',
      statusPassed: 'Passed',
      statusDebugging: 'Debugging',
      statusHalted: 'Halted',
      statusPending: 'Pending',
    },
    workbench: {
      languagePrefix: 'Language',
      writablePrefix: 'Writable',
      readOnlyLockPrefix: 'Read-Only Lock',
      noneText: 'none',
      compileFrameBtn: 'Compile 4-Slot Frame',
      verifyBtn: 'Run Local Verify',
      stepBtn: 'Step Active Task',
      inspectBtn: 'Inspect Frame',
      resetBtn: 'Reset',
      mappingTitle: 'Contract & Verification Mapping',
      criteriaTitle: 'Acceptance Criteria',
      gatewayStatusLabel: 'Gateway Status',
      gatewayReady: 'DEEPSEEK_API_KEY configured (live inference ready)',
      gatewayUnset: 'DEEPSEEK_API_KEY unset (local compile & verify active)',
      activeLabel: 'Active',
      adapterLabel: 'Adapter',
      roleCeiling: 'Role Token Ceiling',
      compiledTokens: 'Compiled Frame Tokens',
      staticHash: 'Static Prefix Hash',
      dagProgress: 'DAG Pass Progress',
      logTitle: 'Execution & Verification Log',
      roundsSuffix: 'rounds',
      emptyLog:
        'No execution rounds recorded yet. Run Compile 4-Slot Frame, Run Local Verify, or Step Active Task.',
      colRound: 'Round',
      colTaskRole: 'Task & Role',
      colTier: 'Tier',
      colTokensCap: 'Tokens / Cap',
      colPrefixCache: 'Prefix Cache',
      colErrorHash: 'Error Hash',
      colDdiDecision: 'DDI Decision',
      colSummary: 'Summary',
      cacheHit: 'Hit',
      cacheCold: 'Cold',
      writableLines: 'Writable lines',
      readOnlyAssertions: 'Read-only locked assertions',
    },
    compiler: {
      emptyState:
        'No compiled 4-Slot frame available yet. Build or select a task in Workbench first.',
      title: '4-Slot Context Compiler Output Frame',
      taskPrefix: 'Task',
      rolePrefix: 'Role',
      tierPrefix: 'Tier',
      historyText: 'Chat History: 0 turns (stateless)',
      prunedSuffix: 'pruned',
      staticHashLabel: 'Prefix Cache Static Hash',
      cacheExpectationLabel: 'Cache Expectation',
      cacheHitDesc: 'Byte-identical prefix (Hit)',
      cacheColdDesc: 'Cold compile',
      prunedSlotsLabel: 'Pruned Slots',
      noneText: 'none',
      slotLabels: {
        slot1: 'Slot 1 · Static Head (Prefix Cache)',
        slot2: 'Slot 2 · Contract & Type Anchors',
        slot3: 'Slot 3 · Line-Numbered Surgical Slice',
        slot4: 'Slot 4 · Masked Verify & Probe Feedback',
      },
    },
    ports: {
      title: 'Ports & Pluggable Adapters',
      subtitle:
        'Core orchestration logic (DAG Scheduler, 4-Slot Compiler, DDI Circuit Breaker) depends exclusively on 4 decoupled Port interfaces.',
      activeTag: 'Active',
      port1Desc: 'Supplies bounded repo skeletons, slices, and 1-hop callers.',
      port2Desc:
        'Normalizes compiler/test failures into deterministic error hashes.',
      port3EnvPrefix: 'Server env',
      port3Ready: 'DEEPSEEK_API_KEY ready',
      port3Unset: 'DEEPSEEK_API_KEY unset',
      port4Title: '4. WorkspaceEditPort & CLI Commands',
      port4Desc:
        'Enforces line-range replace_lines patches, read-only locks on contracts/tests, and instant snapshot rollback on DDI circuit break.',
      cliTestsTitle: 'Run Core Unit Tests (node:test)',
      cliRunTitle: 'Run CLI Against Local Workspace',
      indexOptions: {
        'treesitter-local': {
          title: 'Tree-sitter Local Slicer',
          desc: 'Zero external daemon; extracts export signatures and bounded line slices directly from workspace files.',
        },
        'lsp-serena': {
          title: 'Serena (LSP MCP) Symbol Adapter',
          desc: 'Routes getSlice and get1HopCallers through Language Server Protocol symbol definitions and references.',
        },
        'cpg-codebadger': {
          title: 'codebadger (Joern CPG) Graph Adapter',
          desc: 'Computes minimal AST + CFG + DFG slices and taint paths prior to invoking the LLM.',
        },
      },
      probeOptions: {
        'local-tsc-test': {
          title: 'Local Typecheck + Test Runner',
          desc: 'Runs tsc --noEmit and tsx --test locally, stripping noisy framework stack frames.',
        },
        'runtime-probe': {
          title: 'InspectCoder Runtime Probe Adapter',
          desc: 'Captures bounded JSON variable snapshots before failing assertions without log flooding.',
        },
      },
      modelOptions: {
        'deepseek-v4.1-flash-1017': {
          title: 'DeepSeek-V4.1-Flash-1017 (Primary)',
          desc: 'Default fast micro-step execution tier with Prefix Cache ordering and strict JSON tool calling.',
        },
        'deepseek-pro': {
          title: 'DeepSeek Pro / Reasoner (Escalation)',
          desc: 'Activated automatically by SWE-Router after DDI 2-round identical error escalation.',
        },
      },
    },
    chat: {
      sidebarTitle: 'Target Directory & Verify',
      sidebarDesc:
        'Point the stateless 4-Slot agent at an isolated sandbox or any local directory so it never damages ContextHarness itself.',
      dirLabel: 'Workspace Directory Path',
      dirPlaceholder: './workspace-sandbox or E:\\path\\to\\project',
      presetSandbox: 'Sandbox (./workspace-sandbox)',
      presetCurrent: 'Current Dir (.)',
      createMissingLabel: 'Create directory if missing',
      applyDirBtn: 'Set Directory',
      verifyCmdLabel: 'Verify Command (Optional)',
      verifyCmdPlaceholder: 'Auto-detects *.test.ts & tsc if empty',
      runVerifyBtn: 'Run Verify in Directory',
      filesTitle: 'Files in Target Directory',
      emptyFiles: 'Directory is currently empty. Ask the agent to create files.',
      filePreviewTitle: 'File Preview',
      closePreview: 'Close',
      threadTitle: 'Stateless 4-Slot Agent Dialog',
      clearBtn: 'Clear Chat',
      emptyThread:
        'Type any coding task below (e.g., "Create a rate-limiter module with unit tests and run verification"). Every micro-step executes within a bounded 4K-8K token frame inside the selected directory.',
      gatewayReady: 'DEEPSEEK_API_KEY configured',
      gatewayUnset: 'DEEPSEEK_API_KEY unset (directory verify still works)',
      userLabel: 'You',
      assistantLabel: 'ContextHarness Agent',
      actionsTitle: 'Executed Micro-Steps',
      inputPlaceholder:
        'Ask the agent to create, edit, debug, or test code inside the target directory... (Enter to send, Shift+Enter for newline)',
      tierFlash: 'Flash-1017',
      tierPro: 'Pro (Reasoner)',
      sendBtn: 'Send Task',
      sendingBtn: 'Executing...',
    },
  },
  zh: {
    nav: {
      chat: '对话工作区',
      workbench: '契约工作台',
      compiler: '4-Slot 上下文编译器',
      architecture: '端口与适配层',
      runLoop: '运行闭环',
      running: '执行中...',
      allPassed: '全部任务已通过',
      switchLabel: 'EN',
    },
    loading: '正在加载 ContextHarness 工作区...',
    dismiss: '关闭',
    sidebar: {
      intakeTitle: '需求与写锁绑定',
      intakeDesc: '将需求精确绑定到可写代码切片、只读契约锚点与单测套件。',
      promptLabel: '需求描述',
      promptPlaceholder: '输入目标行为、边界条件与不变量约束...',
      languageLabel: '目标语言',
      symbolLabel: '目标符号',
      targetFileLabel: '可写实现文件',
      startLineLabel: '起始行号',
      endLineLabel: '结束行号',
      contractFileLabel: '只读契约文件',
      testFileLabel: '只读单测文件',
      buildDagBtn: '生成契约与任务 DAG',
      dagTitle: '原子任务 DAG',
      attemptsLabel: '尝试次数',
      statusPassed: '已通过',
      statusDebugging: '调试中',
      statusHalted: '已熔断',
      statusPending: '待执行',
    },
    workbench: {
      languagePrefix: '语言',
      writablePrefix: '可写区间',
      readOnlyLockPrefix: '只读锁',
      noneText: '无',
      compileFrameBtn: '编译 4-Slot 帧',
      verifyBtn: '本地校验',
      stepBtn: '单步执行当前任务',
      inspectBtn: '查看编译帧',
      resetBtn: '重置状态',
      mappingTitle: '契约与验证映射',
      criteriaTitle: '验收标准',
      gatewayStatusLabel: '模型网关状态',
      gatewayReady: 'DEEPSEEK_API_KEY 已配置（可执行实时推理）',
      gatewayUnset: 'DEEPSEEK_API_KEY 未配置（仅启用本地编译与校验）',
      activeLabel: '当前任务',
      adapterLabel: '当前模型适配器',
      roleCeiling: '角色 Token 上限',
      compiledTokens: '已编译帧 Token 数',
      staticHash: '静态前缀哈希',
      dagProgress: 'DAG 通过进度',
      logTitle: '执行与验证追踪日志',
      roundsSuffix: '轮',
      emptyLog:
        '暂无执行记录。可先点击「编译 4-Slot 帧」、「本地校验」或「单步执行当前任务」。',
      colRound: '轮次',
      colTaskRole: '任务与角色',
      colTier: '模型档位',
      colTokensCap: 'Tokens / 上限',
      colPrefixCache: '前缀缓存',
      colErrorHash: '错误哈希',
      colDdiDecision: 'DDI 熔断决策',
      colSummary: '摘要',
      cacheHit: '命中',
      cacheCold: '冷启动',
      writableLines: '可写行区间',
      readOnlyAssertions: '只读锁定断言',
    },
    compiler: {
      emptyState: '暂无已编译的 4-Slot 上下文帧，请先在工作台生成或选择任务。',
      title: '4-Slot 上下文编译器输出帧',
      taskPrefix: '任务',
      rolePrefix: '角色',
      tierPrefix: '档位',
      historyText: '历史对话：0 轮（无状态单步执行）',
      prunedSuffix: '已裁剪',
      staticHashLabel: 'Prefix Cache 静态头哈希',
      cacheExpectationLabel: '缓存预期',
      cacheHitDesc: '字节级前缀一致（命中）',
      cacheColdDesc: '首次冷编译',
      prunedSlotsLabel: '裁剪槽位',
      noneText: '无',
      slotLabels: {
        slot1: 'Slot 1 · 静态系统前缀 (Prefix Cache)',
        slot2: 'Slot 2 · 契约与类型锚点',
        slot3: 'Slot 3 · 带行号局部切片与只读单测',
        slot4: 'Slot 4 · 观察掩码后的校验与探针反馈',
      },
    },
    ports: {
      title: '四层六边形端口与可插拔适配器',
      subtitle:
        '核心编排引擎（DAG 调度器、4-Slot 编译器、DDI 熔断器）仅依赖 4 个解耦的 Port 接口，不绑定具体外部工具。',
      activeTag: '当前启用',
      port1Desc: '提供有界仓库骨架、符号切片与 1-hop 调用链。',
      port2Desc: '将编译与测试失败归一化为确定性错误哈希。',
      port3EnvPrefix: '服务端环境变量',
      port3Ready: 'DEEPSEEK_API_KEY 已就绪',
      port3Unset: 'DEEPSEEK_API_KEY 未设置',
      port4Title: '4. WorkspaceEditPort 与本地 CLI 命令',
      port4Desc:
        '强制执行行区间 replace_lines 补丁、契约/单测只读锁，以及 DDI 熔断时的瞬时快照回滚。',
      cliTestsTitle: '运行核心单元测试 (node:test)',
      cliRunTitle: '针对本地工作区运行 CLI',
      indexOptions: {
        'treesitter-local': {
          title: 'Tree-sitter 本地切片器',
          desc: '零外部守护进程；直接从工作区文件提取导出签名与有界行切片。',
        },
        'lsp-serena': {
          title: 'Serena (LSP MCP) 符号适配器',
          desc: '通过 Language Server Protocol 的定义与引用索引路由 getSlice 与 1-hop 调用查询。',
        },
        'cpg-codebadger': {
          title: 'codebadger (Joern CPG) 图谱适配器',
          desc: '在调用模型前先通过 AST + CFG + DFG 与污点路径计算出最小完备切片。',
        },
      },
      probeOptions: {
        'local-tsc-test': {
          title: '本地类型检查 + 单测执行器',
          desc: '本地执行 tsc --noEmit 与 tsx --test，自动剔除框架冗余堆栈帧。',
        },
        'runtime-probe': {
          title: 'InspectCoder 运行时探针适配器',
          desc: '在失败断言前采集有界 JSON 变量快照，避免长日志撑爆上下文。',
        },
      },
      modelOptions: {
        'deepseek-v4.1-flash-1017': {
          title: 'DeepSeek-V4.1-Flash-1017（默认主力）',
          desc: '默认高速微步执行档位，配合 Prefix Cache 静态前缀排序与严格 JSON 工具调用。',
        },
        'deepseek-pro': {
          title: 'DeepSeek Pro / Reasoner（升级档位）',
          desc: '连续两轮相同错误哈希触发 DDI 熔断后，由 SWE-Router 自动升级接入。',
        },
      },
    },
    chat: {
      sidebarTitle: '目标目录与校验命令',
      sidebarDesc:
        '将无状态 4-Slot Agent 指向隔离沙盒或任意本地目录，避免误改 ContextHarness 自身源码。',
      dirLabel: '工作目录路径',
      dirPlaceholder: './workspace-sandbox 或 E:\\你的测试目录',
      presetSandbox: '安全沙盒 (./workspace-sandbox)',
      presetCurrent: '当前目录 (.)',
      createMissingLabel: '目录不存在时自动创建',
      applyDirBtn: '切换工作目录',
      verifyCmdLabel: '校验命令（可选）',
      verifyCmdPlaceholder: '留空则自动检测 *.test.ts 与 tsc',
      runVerifyBtn: '在当前目录运行校验',
      filesTitle: '目标目录文件列表',
      emptyFiles: '当前目录为空，可直接发对话指令让 Agent 创建文件并测试。',
      filePreviewTitle: '文件预览',
      closePreview: '关闭',
      threadTitle: '无状态 4-Slot 对话执行窗口',
      clearBtn: '清空对话',
      emptyThread:
        '在下方输入任意编程任务（例如：“在当前目录写一个令牌桶限流器并附带单元测试，跑通全部测试”）。每一步都会在 4K-8K 固定 Token 帧内操作目标目录。',
      gatewayReady: 'DEEPSEEK_API_KEY 已配置',
      gatewayUnset: 'DEEPSEEK_API_KEY 未配置（仍可执行目录校验与文件浏览）',
      userLabel: '你',
      assistantLabel: 'ContextHarness Agent',
      actionsTitle: '执行微步记录',
      inputPlaceholder:
        '输入要在目标目录中创建、修改、排查或测试的任务...（Enter 发送，Shift+Enter 换行）',
      tierFlash: 'Flash-1017',
      tierPro: 'Pro (Reasoner)',
      sendBtn: '发送执行',
      sendingBtn: '执行中...',
    },
  },
};
