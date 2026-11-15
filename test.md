下面按你给的 5 个方向，把 2024–2026 能查到、且和“强约束上下文 + 编程 Agent”紧密相关的论文挑出来，结合你的两个目标：

- 单次工作上下文锁死在 3K–8K tokens；
- 面向弱推理 / Flash 级模型，用 harness 把它们“用对”。

每个方向里我只列“真论文/技术报告”，不混入博客经验；最后用一段话说“如果我要做 3K–8K 上下文的自研 harness，哪些机制值得直接抄”。

---

## 方向 1：Context Rot 与 Attention Budget

### 1.1 长上下文退化的实证规律

**(1) Context Rot: How Increasing Input Tokens Impacts LLM Performance**（技术报告，Chroma，2025）[1]  
- **ID / 来源**：技术报告（非 arXiv），Chroma Research。  
- **核心方法**：  
  - 在一系列检索和问答任务上，评估 18 个前沿模型（包括 GPT‑4.1、Claude 4、Gemini 2.5、Qwen3 等），系统性改变：
    - 总上下文长度；
    - 有效“needle”（关键信息）所在位置；
    - 干扰信息数量与类型。  
  - 用准确率随输入长度的曲线，刻画所谓 **“Context Rot”**：保持任务难度和关键信息不变，仅增加无关 token，就会出现性能单调下降或 U 型曲线。  
- **对你问题 Q1 的回答**：  
  - 给出了量化规律：  
    - 不是“到 100K–300K 突然掉崖”，而是随着无效 token 增长，准确率呈非线性下降；  
    - 不同模型都有 context rot，只是临界点、衰减速度不同；  
    - 中间位置的证据最容易被丢失，和 “Lost in the Middle”[2] 一致。  
  - 方向上可直接外推到编码任务：只要给的 repository 级上下文是“堆满一堆无关文件+日志+配置”，哪怕总长度没到极限，也会显著拖垮精度。  
- **局限**：  
  - 不是专门针对 SWE‑bench 等代码修复基准，主要是文本检索/Q&A 场景；  
  - 但它提供了 **模型–长度–干扰度** 的定量曲线，可作为你在代码基准上做二次实验的设计模板。  
- **开源**：  
  - 提供了复现实验的 toolkit 仓库，方便你对国内模型（如自家 Flash/Pro）跑一遍同样的 context‑rot 曲线。  

**(2) Lost in the Middle: How Language Models Use Long Contexts**（TACL 2024, arXiv:2307.03172）[2]  
- **核心贡献**：  
  - 提出 “Lost in the Middle” 现象：长上下文中，前后位置的信息被利用得比中间好，准确率呈 U 型。  
  - 直接说明“指令/关键证据放在中段，一旦上下文很长，就很危险”。  
- **和代码 Agent 的关系**：  
  - 许多后续针对代码 Agent 的论文直接引用它，把“长日志 + 多轮对话 + 早期指令被遗忘”归到同一类 attention budget 问题。  

**(3) Diagnosing and Mitigating Context Rot in Long‑horizon Search**（arXiv:2606.29718, 2026）[3]  
- **场景**：长搜索 / 长推理任务（包含编码子任务），研究长时间 agent 运行中的 context rot。  
- **方法与发现**：  
  - 显示随着搜索步数和累计 token 增长，出现 **premature termination**：模型越来越倾向提前给出看似合理但错误的终结回答；  
  - 通过分析 agent 轨迹（思维链+工具调用），给出若干退化模式：重复环路、忽略早期证据、对近期噪声过度拟合；  
  - 提出针对性缓解手段，如对早期关键信息做“硬 pin（固定提醒）”、定期重启上下文等。  
- **对你有用的点**：  
  - 把“长上下文 + 多回合”下的退化拆成可检测的 pattern，可以在 harness 中做监控和自动熔断（和你方向 4 有交集）。  

**(4) Classifier Context Rot: Monitor Performance Degrades with Context Length**（arXiv:2605.12366, 2026）[4]  
- 关注 **使用 LLM 监控 coding agents 行为** 的长日志分类任务（token 可到 500K+），实证显示分类器本身也存在 context rot。  
- 提醒你：如果你打算用 LLM 对自己的 agent 轨迹做“安全/质量评审”，评审模型一样会在长上下文里退化，要么压缩，要么层次化审查。  

**(5) Coding Agents are Effective Long‑Context Processors**（arXiv:2603.20432, 2026）[5]  
- **核心发现**：不是用“一个大模型 + RAG”直接吃 100K–300K 上下文，而是让 **coding agent 以工具和文件系统为外部 memory**、在交互过程中显式地调度读取、编辑和执行操作——这样可以在多个长上下文基准上 **超过 SOTA RAG/长上下文模型**。  
- 对你的启示：  
  - 与其指望 Flash 级模型“一口吃掉整个仓库”，不如通过 IDE/终端工具把任务拆成多个 3K–8K 的高密度子上下文，让 agent 扮演“长上下文编排器”。  

### 1.2 短高信噪比 vs 长全量塞入：有没有 SWE‑bench 上的对比？

目前公开论文里，直接写明“3K–10K 高信噪比 vs 100K–300K 全量塞入，在 SWE‑bench 的 Pass@1 差异”的，还没有 **精确到你给的数值** 的实验。但有几篇给了很接近、可迁移的结果：

**(6) The Complexity Trap: Simple Observation Masking Is as Efficient as LLM Summarization for Agent Context Management**（arXiv:2508.21433, 2025）[6]  
- **实验设置**：  
  - 在 **SWE‑agent** 脚手架 + SWE‑bench Verified 上，对比多种上下文管理策略：  
    - Raw：不处理，所有工具输出和历史对话全堆进 prompt；  
    - LLM Summary：用模型自己做多轮摘要；  
    - **Observation Masking**：只保留最近 M 步环境 observation（例如最近 10 个 shell/file 操作的输出），更早的 observation 以占位符隐藏，思维链保留。  
- **关键结果**：  
  - Observation Masking：  
    - 将单实例成本降到 Raw 的约 **47%**（节省 52%+ tokens）[6]；  
    - 同时 **solve rate 仍持平，甚至略超 Raw（+2.6 个百分点左右）**；  
  - 混合策略（先 Observation Masking 再少量 LLM Summary）在同样精度下继续省 7–11% 成本。  
- **对你 Q2 的含义**：  
  - 这基本是一个“短而高信噪比上下文 vs 全量堆入”的公平对比：  
    - Raw ≈ agent 的“长上下文全量塞入”；  
    - Observation Masking ≈ 在有限窗口内只保留最近且相关的环境反馈（等价于强力压缩到小上下文）。  
  - 结果说明：**只要保留正确的那一小段上下文，高信噪的小窗完全可以在 SWE‑bench 级别任务上达到甚至超过“全量长窗”的 Pass@1，同时大幅省钱**。  

**(7) SWE Context Bench / ContextBench: A Benchmark for Context Retrieval in Coding Agents**（arXiv:2602.05892 / 2602.08316, 2026）[7][8]  
- 这两个基准都不直接给“3K vs 100K”的绝对数字，但都证明：  
  - 大多数 coding agents **严重过检索（over‑retrieve）**：抓了很多文件和上下文，真正被模型利用的只占很小一部分；  
  - 在严格控制检索数和输入 tokens 后，通过提升检索质量（比如只送 top‑K 高相关切片），可以显著提升性能和成本 AUC。  
- 可直接指导你设计：  
  - 优先优化“如何选那 3K–8K token”，而不是扩窗。  

### 1.3 对你系统设计可直接抄的机制

如果你把单次上下文锁死在 3K–8K，方向 1 文献里最值得抄的是：

1. **Observation Masking 模式**（直接来自 [6]）：  
   - 把 agent 轨迹拆成：  
     - 持久的“高层任务摘要 + 关键设计决策”（可以非常短）；  
     - 最近 M 条环境 observation（终端输出、文件 diff、编译错误等）；  
     - 必要的当前代码切片（见方向 3）；  
   - prompt 构造策略：  
     - 只把最近 M 条 observation 以原文形式放进上下文；  
     - 更早的 observation 用极短的标记 “\<omitted 12 earlier commands\>” 代替；  
     - 历史指令/约束放在一个稳定的前缀区（可以借鉴 “CLAUDE.md/AGENTS.md + context rot” 系统化研究[9]）。  
2. **硬控 attention budget，而不是只控 context length**：  
   - 参考 [1][3][4] 的发现，把“干扰 token 占比”作为显式指标：  
     - 例如规定“每次调用前，代码+日志 token 中，‘与当前编辑位置强相关的 token’ 必须 ≥ 40%”；不满足就先压缩。  
3. **对长任务进行阶段性“上下文重启”**：  
   - 借鉴 [3] 中的 premature termination / 退化模式，你可以在 harness 中设规则：  
     - 每 N 步或 N 次失败 patch 后，强制重新生成“当前仓库状态 + 当前目标”的新 issue 描述，把历史 patch 只压缩成一两句“已经尝试过的方法”，避免在烂上下文里越陷越深。  

---

## 方向 2：无状态 Agent 与多轮轨迹压缩

### 2.1 Trajectory Reduction 与 AgentDiet

**(8) Reducing Cost of LLM Agents with Trajectory Reduction（AgentDiet）**  
Proceedings of the ACM on Software Engineering, FSE 2026（arXiv:2509.23586）[10]  
- **核心 idea**：  
  - 观察真实 coding agents 轨迹，发现大量 token 是“对同一文件的重复浏览、重复日志、早期无用思考”等废料；  
  - 提出 **AgentDiet**：在推理时对 agent 轨迹做 deterministic 的“剪枝”，自动删除冗余历史，而不改变当前 agent policy。  
- **算法大致结构**：  
  - 以每轮对话/工具调用为节点，维护一个轻量级的状态摘要：  
    - 当前打开的文件、光标位置；  
    - 最近的失败/成功命令；  
    - 当前子任务标签等。  
  - 在准备下一轮 prompt 时：  
    - 对已经“被后续操作完全覆盖”的历史 observation 直接丢弃（如旧版本 diff、已撤销操作）；  
    - 对反复出现的模式只保留最近一次；  
    - 必要信息压缩进一个短的 machine‑readable summary。  
- **实验结果**：  
  - 在顶级 coding agent + 两个基准（包括 SWE‑bench 系列）上：  
    - 输入 tokens 减少 **39.9%–59.7%**；  
    - 总计算成本降低 **21.1%–35.9%**；  
    - 任务成功率几乎不变，甚至有场景略有提升（因为减少了无关干扰）。  
- **意义**：  
  - 说明 coding agent 的“多轮长对话 history”有很大一部分完全可以视作 **pure overhead**，删掉不会伤性能；  
  - 对你来说，可以把 3K–8K 视作固定预算，通过类似 AgentDiet 的策略来保证 agent 永远不会把无效轨迹拖进这个预算。  

### 2.2 Observation Masking：零对话历史的无状态近似

前面提到的 **Observation Masking**[6] 本质上已经是在做一种“准无状态”agent：

- LLM 只看 **当前思考 + 最近少量 observation**，不存在长对话 history；
- 外部框架负责维护“完整会话日志”和“文件系统状态”。

对你的 Q1：

> 把状态外置为确定性状态机、每次调用只传干净当前帧（0 对话历史 / Observation Masking）的论文结论和收益数据是什么？

综合 [6][10]：  

- 在 SWE‑agent + SWE‑bench Verified 上，Observation Masking：  
  - **成本减半（52%+）**，solve rate 不降反升 2–3 个百分点左右[6]；  
- 在 FSE 2026 的 AgentDiet 实验里：  
  - 在多个 agent + SWE‑bench 系列上，**tokens 减少 40–60%，成本减少 20–36%，成功率基本持平**[10]。  

也就是说，**“无状态/准无状态 + 外部确定性状态机 + 统计化轨迹压缩”是有数据支持的，不是玄学**。

### 2.3 Stateless Language Agents (SLA) 与长程搜索

**(9) Stateless Language Agents: Scaling Long‑Horizon Automated Research**（arXiv:2610.07625, NeurIPS 2026）[11]  
- 虽然场景是自动化科研，但架构理念对编码 Agent 非常有借鉴意义：  
  - **Stateful search, stateless agents**：  
    - 所有持久状态（候选解、评估分数、搜索树）都存放在外部 harness 中，以结构化数据形式维护；  
    - LLM 作为 **无状态的单步决策器**：每次只看到当前候选和极小上下文，对“下一步操作/修改”做出建议。  
  - 结果表明，相比直接让 agent 自己在长对话中携带全部状态：  
    - token 浪费显著下降；  
    - 长程任务上的最终成功率反而提升。  

将其映射到代码：  
- 可以设计一个 **“仓库状态机 + Patch DAG”**：  
  - 外部数据结构记录：当前仓库版本、已尝试过的 patch、测试结果；  
  - Flash 级模型每次只看到“当前需要编辑的切片 + 局部测试结果 + 简短全局 spec”，完全不需要历史对话。  

### 2.4 Exploration vs Editing 上下文分离的最新范式

虽然没有专门以“Planner‑Coder”命名的大会论文，但从多个工作可以归纳出一个共识模式：

- **搜索/规划子 Agent**：  
  - 负责在较高层次上推理：“应该修改哪个模块 / 哪个文件 / 哪一函数”；  
  - 使用 **更抽象、更轻量级的上下文**：需求描述、组件依赖图、简单调用图。  
- **编辑子 Agent**：  
  - 只关心当前 patch 的代码切片 + 测试反馈；  
  - 其上下文必须严格小且结构化（3K–8K token 完全够，只要切片选得好——见方向 3 & 4）。  
- 这种分离在：  
  - OPENDEV: *Building AI Coding Agents for the Terminal*（arXiv:2603.05344, 2026）[12]  
  - 各类 repository‑level benchmark（SWE‑Chain、SWE‑CI 等）中都被广泛采用。  

### 2.5 对你可直接抄的机制

在 3K–8K 固定上下文前提下，建议直接抄：

1. **“无历史 + 外部状态机” 模式**（组合 [6][10][11]）：  
   - 每次 LLM 调用只看到：  
     - 当前文件/函数切片；  
     - 最近 M 条 observation（编译/测试结果、终端输出）；  
     - 一小段全局 spec / 规则（从 CLAUDE.md/AGENTS.md 之类的文件中抽取）。  
   - 所有其它内容——历史对话、过期日志、旧 patch——全部只留在外部状态机里。  
2. **在线 Trajectory Reduction（AgentDiet 思路）**：  
   - 在每次调用前，让一个 deterministic 的“轨迹清理器”扫描当前会话缓冲区：  
     - 删除已被新 patch 覆盖的旧 diff；  
     - 对多次重复失败的同一命令/错误，只保留最近一两次及其总结；  
   - 目标是让传给 LLM 的上下文稳定在 3K–8K 内。  
3. **显式划分“搜索回合”和“编辑回合”**：  
   - 搜索回合用稍强一点的模型（或者同一模型但更宽松的 token 限制）做 repo‑level 定位，输出的是结构化计划（例如 JSON 的“file + region + intent” 列表）；  
   - 编辑回合严格在 3K–8K 内完成 patch 生成和本地验证。  

---

## 方向 3：Program Slicing & Code Property Graph（CPG）替代自由搜索

### 3.1 SliceMate：LLM 驱动的静态切片

**(10) SLICEMATE: Accurate and Scalable Static Program Slicing via LLM‑Powered Agents**（arXiv:2507.18957, 2025，ICSE 2026 注册论文）[13]  
- **问题**：传统 static slicing 框架对大规模、多文件工程和复杂语言特性（指针、虚函数、异常等）支持有限；而仅靠 LLM 的“自由搜索”又会上下文滚雪球。  
- **核心思路**：  
  - 不让 LLM 直接读整个仓库，而是让它作为 **多 Agent 协调器** 去调用现有分析工具（编译器前端、控制流图、调用图等），反复生成/修正切片规则；  
  - 将 slicing 任务重述为“一个迭代 code generation 过程”：  
    - LLM 生成约束/查询；  
    - 后端静态分析引擎执行，返回命中的语句/边；  
    - LLM 再基于反馈 refine 约束，直到收敛出 minimal slice。  
- **特点**：  
  - 通过多 Agent 分工（某个负责数据流、某个负责控制流、某个负责跨文件依赖）提升 slice 的准确性和可扩展性；  
  - 在大规模程序上显著优于传统 slicing baseline。  
- **对你 Q1 的意义**：  
  - SliceMate 就是你所想的“在调用 LLM 之前先用 AST/CFG/DFG 算出最小完备切片”的一种实现，只不过它仍然利用 LLM 做 orchestrator（但 LLM 不看原始 full context）。  
- **局限**：  
  - 目前主要针对静态类型语言（Java/C 系列），对 Python/JS 等动态语言支持需要额外工程；  
  - 对于非常动态的反射/元编程仍需 fallback 到更保守（更大的）切片。  

### 3.2 Codebadger / LLMxCPG：用 CPG + Joern 替代模型自由 grep

**(11) Bridging Code Property Graphs and Language Models for Program Analysis（codebadger）**  
arXiv:2603.24837, 2026；PACMSE / 安全会议版本[14]  
- **内容**：  
  - 构建了一个名为 **codebadger** 的开源 MCP server：  
    - 用 Joern 对代码仓库生成 Code Property Graph（AST + CFG + DFG + PDG 的统一图表示）；  
    - 提供一组高层 API：按函数、按变量、按数据流路径检索 relevant code slice；  
    - LLM 不再自己调 grep / find‑references，而是调用这些深度图查询。  
- **对你 Q1 的价值**：  
  - 正是你要的模式：  
    - **先**用纯算法（Joern + CPGQL）在图上求值出“可能相关的函数/语句集合”；  
    - **后**把这些极小切片打包成 3K–8K 的上下文喂给 LLM。  
- **跨文件 & 动态语言问题**：  
  - codebadger 当前主要服务 C/C++/Java 等静态语言；  
  - 动态语言的跨文件引用，可以通过在 CPG 里额外编码“模块导入、属性访问、反射调用”的特定边类型来近似。  

**(12) LLMxCPG: Context‑Aware Vulnerability Detection Through Code Property Graph‑Guided Large Language Models**（arXiv:2507.16585, USENIX Security 2025）[15]  
- 虽然聚焦漏洞检测，但技术路线与你需求高度一致：  
  - 用 CPG 做跨函数/跨文件数据流分析，确定最小“污点传播切片”；  
  - 再把这些切片（通常远小于整个文件甚至整个项目）喂给 LLM 进行解释、修复建议。  
- 表明 CPG + LLM 的组合，在“减少无用上下文 + 保留跨文件语义”上是实测有效的。  

### 3.3 LSP 辅助的混合切片

没有一篇直接叫“LSP slicing”的论文，但有代表性工作：

**(13) LSPRAG: LSP‑Guided RAG for Language‑Agnostic Real‑World Codebases**（arXiv:2510.22210, 2025）[16]  
- 利用 Language Server Protocol (LSP)：  
  - 获取精准的 symbol definition / reference 信息，从而跨文件、跨模块定位相关代码；  
  - 在此基础上构造检索单元（函数/类/模块），替换 naive 的 embedding‑based RAG。  
- 这给你的 Q2（动态语言切片断裂）一个很实用的答案：  
  - 对 Python/JS/TS 等动态语言，可以通过 LSP 提供的语义信息补上 AST/CFG 静态分析的短板；  
  - 组合策略：  
    - 用 LSP 确定 symbol 级别的跨文件关系；  
    - 再在单个文件/函数内用 AST/CFG/DFG 做细粒度切片。  

### 3.4 对你可直接抄的机制

在 3K–8K 上下文约束下，建议直接抄：

1. **“Graph‑First” 的切片工作流**：  
   - 任何“查仓库”类任务都先走：  
     - LSP / Joern / Tree‑sitter -> 抽象语法树 + 调用图 + 数据流图 / CPG；  
     - 用 codebadger / 自研图查询语言，把与当前 issue / failing test 相关的最短路径上的节点作为 candidate slice；  
   - 只有在得到这些最小切片后，才调用 LLM。  
2. **统一的切片打包规范**：  
   - 借鉴 LLMxCPG[15] 中做法：  
     - 对每个切片输出：  
       - 上下文注释（此函数的角色）；  
       - 输入/输出变量列表；  
       - 关键数据流路径的摘要；  
     - 这样即使切片小，语义信息也足够密集。  
3. **动态语言 = LSP + conservative slicing**：  
   - Python/JS/TS 场景下，不强求完美精确切片，采取“略微过大但仍远小于全仓库”的保守策略；  
   - 优先保证：  
     - 保留同一 symbol 的所有引用/定义；  
     - 覆盖测试中引发错误的调用路径。  

---

## 方向 4：弱模型/小模型增强与运行时调试闭环

### 4.1 TDD 与契约驱动的小窗局部编码

**(14) TDD‑Agent: Test‑Driven Reasoning for Code Generation**（arXiv:2608.16742, 2026）[17]  
- **思路**：把经典 TDD 流程 agent 化：  
  1. 根据需求/issue，先由 LLM 生成一组测试用例和断言（包括失败用例）；  
  2. 再指导 LLM 编写最小通过这些测试的实现；  
  3. 失败后，利用测试输出做 targeted 修正。  
- **对弱模型的意义**：  
  - 即使模型推理能力有限，只要它能正确理解/维护“强类型契约 + 断言”，通过小范围 patch＋重复运行测试也能逼近正确实现；  
  - 可以对 Flash 级模型采用：  
    - “**先写测试 & 契约**（可用稍强模型或人工协作完成），再约束它只在 1–2 个函数的局部上下文内改动”，从而把 3K–8K 窗口用在最关键的那部分代码和测试输出。  

### 4.2 动态切片与运行时状态采样

**(15) Debug like a Human: A Large Language Model Debugger（LDB）**（arXiv:2402.16906, 2024）[18]  
- 为调试 Java/C 等程序设计的 LLM debugger：  
  - 在执行过程中，在 **每个 basic block** 后采集变量状态和栈信息；  
  - 但不会把完整 trace 塞给 LLM，而是通过自动过滤和压缩，只保留：  
    - 变量值异常跳变的位置；  
    - 错误路径上的若干关键 snapshot。  
- **模式**：  
  - “**动态切片 + 稀疏变量快照**” 是避免日志撑爆上下文的关键：  
    - 通过执行 trace 找到 bug 所在路径上的少数几步；  
    - 只把这几步的变量状态快照和对应源码切片给 LLM。  

**(16) InspectCoder: Dynamic Analysis‑Driven Self Repair for Programs**（arXiv:2510.18327, 2025）[19]  
- 一个 agentic 修复系统：  
  - 通过集成 debugger，让 LLM 可以灵活断点、单步执行、查看变量；  
  - 由一个策略组件决定“采哪些点的状态”再反馈给 LLM。  
- **对你 Q2 的回答**：  
  - 运行时调试闭环里，成功做法都不会把整条执行日志直接给模型，而是使用：  
    - 断点采样（在错误附近多采点，正常路径上稀疏采样）；  
    - 仅保留那些影响错误条件的变量集合（等价于动态切片）。  

**(17) The Debugging Decay Index: Rethinking Debugging Strategies for Code LLMs**（arXiv:2506.18403, 2025）[20]  
- 提出 **Debugging Decay Index (DDI)**：  
  - 数学上描述多轮自修复过程中，随着轮数/历史上下文增长，LLM 调试有效性的指数衰减；  
  - 实验显示：多数模型在 2–3 轮后，修复成功率已经掉了 60–80%。  
- **启示**：  
  - 不能无止境地“修改–重试–再修改”，必须：  
    - 设定最大调试轮数（如 3–5 次），再不行就触发更强模型或人工；  
    - 每轮尽量在 clean context 下进行，而不是把所有历史尝试一直堆在 prompt 里。  

### 4.3 Patch Oscillation、熔断与弱强路由

**(18) A Survey of LLM‑based Automated Program Repair**（arXiv:2506.23749, TOSEM 2026）[21]  
- 总结了 60+ 篇 LLM‑APR 工作中处理多轮修复、错误 oscillation 的经验：  
  - 典型策略包括：  
    - **多样化采样 + 打分**：一次生成多个 patch，用静态分析/执行结果筛选最佳，而不是线性迭代单一路径；  
    - **回滚到上一次“最少失败测试”的版本**，从那里分叉探索（类似 search tree）；  
    - 使用更强大的 verifier / router，在检测到在小模型上卡壳时，切换到大模型。  

**(19) SWE‑Router: Routing in Multi‑turn Agentic Software Engineering Systems**（arXiv:2607.00053, 2026）[22]  
- 研究在多轮 coding agent 系统中，如何在 **弱–强模型对** 之间进行动态路由：  
  - 在 SWE‑bench 和其他 SWE 数据集上，针对（weak, strong）模型对：  
    - 通过学习一个 router，根据当前任务难度和中间信号（失败次数、测试结果等）决定是否升级到 strong；  
  - 结果：在保持接近 strong-only 性能的同时，大幅降低总成本。  
- 对你的 Q3：  
  - 这是最标准的 **Weak‑Strong Routing** 实证研究，可直接照抄：  
    - 在 Flash 级模型连续几轮失败或 DDI 达到阈值时，升级到 Pro 模型；  
    - 升级后可在新的 clean context 内重新规划 patch，而不是继续在污染上下文中挣扎。  

### 4.4 对你可直接抄的机制

1. **TDD‑first，本地化 patch**：  
   - 参考 TDD‑Agent[17]：  
     - 先用更可靠的模型或人工写好测试 + 契约（可用自然语言 + 类型签名 + 断言组合）；  
     - 再用 Flash 级模型只在单个函数/文件局部（3K–8K 内）编码/修复，并通过测试反馈约束。  
2. **动态切片 + 稀疏变量快照**：  
   - 大量执行 trace 中，只把导致错误的路径和关键变量变化片段采样给模型；  
   - 使用类似 LDB/InspectCoder 的策略，自动筛选“对错误有贡献的点”。  
3. **调试熔断与路由策略**（组合 [20][21][22]）：  
   - 设定：  
     - 每个 issue 的最大修复轮数 N（如 3 或 5）；  
     - 每轮 token 上限和最大历史窗口（保证 prompt 不超过 3K–8K）；  
   - 若连续 N 轮仍失败，或者 DDI 指标显示严重衰减，则：  
     - 回滚到最近一次“较好状态”的仓库版本；  
     - 把问题升级到强模型或人工，并清空调试上下文，只保留简短的失败摘要。  

---

## 方向 5：跨语言 IR 与 Spec‑Code Alignment

### 5.1 IR 是否可行？还是被证伪？

**(20) IRCoder: Intermediate Representations Make Language Models Better Code Generators**（ACL 2024, 论文 PDF: 2024.acl‑long.802）[23]  
- 结论是 **“IR 有帮助，但要设计得好”**：  
  - 使用编译器 IR（如 LLVM IR）作为中间表示，让模型学习从 IR 生成多语言代码，取得较大收益；  
  - 证明 IR 可以作为“跨语言统一语义层”，有效减少模型对具体语法的敏感度。  

**(21) LLM Translation of Compiler Intermediate Representation**（arXiv:2605.08247, 2026）[24]  
- 探讨如何让 LLM 在编译器 IR 层面做翻译和优化：  
  - 说明 LLM 对 IR 本身是可以理解和操作的，且可与传统编译器流水线耦合。  

**(22) Can Large Language Models Understand Intermediate Representations?**（arXiv:2502.06854, ICML 2025）[25]  
- 系统评估 LLM 理解 IR 的能力：  
  - 发现当前模型对 IR 的语法结构和简单控制流能理解，但在更复杂的指令级推理、控制流和数据依赖上仍有困难；  
  - 提醒不要过分期望“只喂 IR 就万能”，很多语义需要辅助注释或补充结构信息。  

**(23) NL in the Middle: Code Translation with LLMs and Natural‑Language Intermediate Representations**（arXiv:2507.08627, 2025）[26]  
- 尝试把 **自然语言 spec 作为 IR**，用于代码翻译：  
  - 评估“源码 -> NL IR -> 源码”的往返翻译质量；  
  - 发现：
    - 纯依赖 NL IR 有时会丢失细节（如边界条件、异常处理）；  
    - 但在很多业务逻辑层面，NL IR 足以支撑代码迁移，而且更易于人工理解与修改。  

**结论**：  
- 学界并没有“证伪 IR 思路”，反而有大量工作表明：  
  - 恰当设计的 IR（无论是 compiler IR 还是高层 NL spec/架构 IR）能显著提升跨语言迁移与代码生成的鲁棒性；  
- 但也明确：  
  - IR 不可能完美保存所有实现细节，需要与源码和测试双向对齐。  

### 5.2 Spec‑Driven 开发与双向对齐

**(24) SWE‑AGI: Benchmarking Specification‑Driven Software Construction with MoonBit in the Era of Autonomous Agents**  
arXiv:2602.09447, 2026[27]  
- **内容**：  
  - 提供一个完整的 **spec‑driven 软件构建基准**：以 MoonBit 语言为例，从需求规格到系统实现；  
  - 评估 agent 在从结构化 spec 生成完整系统时的能力。  
- **启发**：  
  - 证明可以把人主要限制在 spec 层面，而由 agent 根据 spec 自动补全实现；  
  - 但也显示，**spec 自身的质量和粒度，是性能的上限**。  

**(25) Understanding Specification‑Driven Code Generation with LLMs: An Empirical Study Design**（arXiv:2601.03878, SANER 2026 注册报告）[28]  
- 研究人在 spec 驱动的代码生成过程中，如何与 LLM 交互（完善 spec、完善测试等）；  
- 强调：  
  - 需要将 spec、测试和代码视为 **一个统一的演化系统**，而不是一次性文档。  

**(26) Specification‑Driven Code Translation Powered by Large Language Models**（arXiv:2412.04590, 2026 期刊版）[29]  
- 探索在代码迁移中**只给 NL spec（不直接给源代码）**的模式：  
  - 在一定范围内，纯 NL spec 驱动的翻译代码质量可以接近甚至超越直接代码‑to‑代码翻译，尤其在需要大结构重构、清除 legacy code smell 时。  

**(27) Specification‑Driven Development Benchmark**（arXiv:2606.00167, 2026）[30]  
- 提出一个专门评价 **AI‑assisted spec‑driven 开发** 的安全与一致性基准；  
- 支持对“spec 变更 -> 代码变更 -> 安全影响”的追踪。  

### 5.3 对你可直接抄的机制

1. **二层 IR 设计**：  
   - **上层 IR**：  
     - 接近 SWE‑AGI 中的结构化 spec：  
       - 用 DSL 或 JSON/YAML 表示模块、接口、数据结构和不变式；  
       - 与测试和监控指标对应（例如每个接口关联一组 contract 和测试集）。  
   - **下层 IR**：  
     - 利用 compiler IR 或 CPG/LSP：  
       - 对每个 spec 元素维护对应的实现位置（文件/函数/类）和依赖关系；  
       - 形成一个 “Spec 节点 ↔ 代码图 子图” 的映射。  
2. **双向同步机制**：  
   - 当 spec 修改时：  
     - 根据映射，自动标记受影响的代码子图，并生成“需要检查/重写”的 patch 列表；  
     - 让 coding agent 只在这些局部区域工作（再次利用你的 3K–8K 窗口）。  
   - 当代码修改（无论是自动还是人工）时：  
     - 通过静态分析 + 测试收集信息，反推 spec 中可能需要调整的条目（例如接口新增参数、语义变化）；  
     - 让一个专门的“Spec 维护 agent”生成 spec 更新建议，由人审核。  
3. **人只面对 spec 层**：  
   - 利用前述机制，你可以把“日常需求沟通、变更决策”都固定在 spec IR 层：  
     - 人用自然语言 + 结构化表单编辑需求；  
     - harness 自动触发代码侧的影响分析与局部更新。  

---

## 总结：在 3K–8K 固定上下文 + 国内 Flash/Pro 模型下的总体建议

综合 5 个方向的论文，可以抽出一套适合你场景的 **“窄窗强编程 Agent Harness 设计准则”**：

1. **上下文是预算，而不是垃圾桶**：  
   - 没有任何证据表明“把 100K–300K 原样塞给模型”在 SWE‑bench 级任务上优于“精心挑选的 3K–8K token”；  
   - 相反，Context Rot[1][3][4]、Observation Masking[6]、AgentDiet[10] 都表明：  
     - 去掉无关 token、控制干扰度，可以在不降甚至略升 Pass@1 的前提下，把成本砍半甚至更多。  

2. **把 Agent 做成“无状态决策器 + 有状态外壳”**：  
   - 借鉴 Stateless Language Agents[11] 和 SWE‑agent/OPENDEV[5][12]：  
     - 外部 harness 负责：
       - 任务管理、搜索树、patch DAG、仓库状态、spec/规则文件；  
       - 程序切片、CPG/LSP 图查询、运行时日志采样；  
     - LLM 每次只看“当前切片 + 最近少量 observation + 必要规则”，不看多轮历史闲聊。  

3. **图驱动的最小上下文：CPG + LSP + Program Slicing**：  
   - 用 SliceMate、codebadger、LSPRAG 等路线[13][14][16]：  
     - 在调用 LLM 前 **必做一次静态/混合切片**，找出最小完备代码子图；  
     - 把 CPG/LSP 作为你的“仓库数据库”，LLM 只问图，不自己乱 grep。  

4. **执行导向的 TDD + 动态切片**：  
   - 针对弱/小模型：  
     - 先用更强模型/人工定义好 spec + 测试（TDD‑Agent 风格[17]）；  
     - 再用小模型在局部切片上迭代 patch，通过动态切片/变量快照（LDB/InspectCoder[18][19]）给出尽量密集但短小的运行时证据。  

5. **熔断与弱‑强路由**：  
   - 使用调试衰减指数[20] 和 SWE‑Router[22] 的思路：  
     - 限制弱模型连续修复轮数，当检测到“调试收益明显下降 / 出现 oscillation”时：  
       - 回滚版本；  
       - 切换到 Pro/更强模型或人工；  
       - 在 clean context 下重新规划，而不是继续堆烂上下文。  

6. **以 IR 为中心的 Spec‑Code 体系**：  
   - 按 SWE‑AGI + IRCoder[23][27] 的范式，建立双层 IR：  
     - 上层 spec IR 作为人和 agent 的共同语言；  
     - 下层 CPG/IR 作为 agent 的代码语义视图。  
   - 所有编辑都通过“IR ↔ 代码 ↔ 测试”的闭环来追踪影响面，减少对整仓库上下文的盲目依赖。  

如果你从零实现一个针对国内 Flash/Pro 模型的 harness，我的建议是：

- **第一优先级**：把 Observation Masking + AgentDiet + LSP/CPG 切片落地，让每个 LLM 调用都只在 3K–8K 的高密度上下文里工作；  
- **第二优先级**：把状态机、调试熔断、Weak‑Strong Routing 做完整，避免模型在上下文 rot 中自杀；  
- **第三优先级**：逐步引入 spec‑driven 的 IR 层，把人与代码解耦，让 agent 只做“从 spec 到切片代码的映射与更新”。  

---

### References

[1] Context Rot: How Increasing Input Tokens Impacts LLM Performance. <https://www.trychroma.com/research/context-rot>  
[2] LOST IN THE MIDDLE: HOW LANGUAGE MODELS USE LONG CONTEXTS. <https://arxiv.org/abs/2307.03172>  
[3] Diagnosing and Mitigating Context Rot in Long-horizon Search. <https://arxiv.org/abs/2606.29718>  
[4] CLASSIFIER CONTEXT ROT: MONITOR PERFORMANCE DEGRADES WITH CONTEXT LENGTH. <https://arxiv.org/abs/2605.12366>  
[5] CODING AGENTS ARE EFFECTIVE LONG-CONTEXT PROCESSORS. <https://arxiv.org/abs/2603.20432>  
[6] THE COMPLEXITY TRAP: SIMPLE OBSERVATION MASKING IS AS EFFICIENT AS LLM SUMMARIZATION FOR AGENT CONTEXT MANAGEMENT. <https://arxiv.org/abs/2508.21433>  
[7] A BENCHMARK FOR CONTEXT RETRIEVAL IN CODING AGENTS (ContextBench). <https://arxiv.org/abs/2602.05892>  
[8] SWE Context Bench: A Benchmark for Context Learning in Coding. <https://arxiv.org/abs/2602.08316>  
[9] Context Rot in AI-Assisted Software Development. <https://arxiv.org/abs/2606.09090>  
[10] REDUCING COST OF LLM AGENTS WITH TRAJECTORY REDUCTION. <https://arxiv.org/abs/2509.23586>  
[11] STATELESS LANGUAGE AGENTS: SCALING LONG-HORIZON AUTOMATED RESEARCH. <https://arxiv.org/abs/2610.07625>  
[12] BUILDING AI CODING AGENTS FOR THE TERMINAL. <https://arxiv.org/abs/2603.05344>  
[13] SLICEMATE: ACCURATE AND SCALABLE STATIC PROGRAM SLICING VIA LLM-POWERED AGENTS. <https://arxiv.org/abs/2507.18957>  
[14] BRIDGING CODE PROPERTY GRAPHS AND LANGUAGE MODELS FOR PROGRAM ANALYSIS (codebadger). <https://arxiv.org/abs/2603.24837>  
[15] LLMxCPG: CONTEXT-AWARE VULNERABILITY DETECTION THROUGH CODE PROPERTY GRAPH-GUIDED LARGE LANGUAGE MODELS. <https://arxiv.org/abs/2507.16585>  
[16] LSPRAG: LSP-GUIDED RAG FOR LANGUAGE-AGNOSTIC REAL-WORLD CODEBASES. <https://arxiv.org/abs/2510.22210>  
[17] TDD-AGENT: TEST-DRIVEN REASONING FOR CODE GENERATION. <https://arxiv.org/abs/2608.16742>  
[18] DEBUG LIKE A HUMAN: A LARGE LANGUAGE MODEL DEBUGGER. <https://arxiv.org/abs/2402.16906>  
[19] INSPECTCODER: DYNAMIC ANALYSIS-DRIVEN SELF REPAIR FOR PROGRAMS. <https://arxiv.org/abs/2510.18327>  
[20] THE DEBUGGING DECAY INDEX: RETHINKING DEBUGGING STRATEGIES FOR CODE LLMS. <https://arxiv.org/abs/2506.18403>  
[21] A SURVEY OF LLM-BASED AUTOMATED PROGRAM REPAIR. <https://arxiv.org/abs/2506.23749>  
[22] SWE-ROUTER: ROUTING IN MULTI-TURN AGENTIC SOFTWARE ENGINEERING SYSTEMS. <https://arxiv.org/abs/2607.00053>  
[23] IRCoder: INTERMEDIATE REPRESENTATIONS MAKE LANGUAGE MODELS BETTER CODE GENERATORS. <https://aclanthology.org/2024.acl-long.802.pdf>  
[24] LLM TRANSLATION OF COMPILER INTERMEDIATE REPRESENTATION. <https://arxiv.org/abs/2605.08247>  
[25] CAN LARGE LANGUAGE MODELS UNDERSTAND INTERMEDIATE REPRESENTATIONS? <https://arxiv.org/abs/2502.06854>  
[26] NL IN THE MIDDLE: CODE TRANSLATION WITH LLMS AND NATURAL-LANGUAGE INTERMEDIATE REPRESENTATIONS. <https://arxiv.org/abs/2507.08627>  
[27] SWE-AGI: BENCHMARKING SPECIFICATION-DRIVEN SOFTWARE CONSTRUCTION WITH MOONBIT IN THE ERA OF AUTONOMOUS AGENTS. <https://arxiv.org/abs/2602.09447>  
[28] UNDERSTANDING SPECIFICATION-DRIVEN CODE GENERATION WITH LLMS: AN EMPIRICAL STUDY DESIGN. <https://arxiv.org/abs/2601.03878>  
[29] SPECIFICATION-DRIVEN CODE TRANSLATION POWERED BY LARGE LANGUAGE MODELS. <https://arxiv.org/abs/2412.04590>  
[30] SPECIFICATION-DRIVEN DEVELOPMENT BENCHMARK. <https://arxiv.org/abs/2606.00167>