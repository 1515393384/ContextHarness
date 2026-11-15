import path from 'node:path';
import {DeepSeekModelGateway} from './adapters/deepseek-gateway';
import {
  LocalFsCodeIndexAdapter,
  LocalFsWorkspaceAdapter,
  LocalNodeVerifyAdapter,
} from './adapters/local-fs-adapters';
import {compileSlotFrame} from './core/context-compiler';
import {
  buildSpecAndDag,
  runClosedLoop,
  type OrchestratorState,
} from './core/orchestrator';

function getArg(args: string[], flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const targetDir = path.resolve(getArg(args, '--target', process.cwd()));
  const prompt = getArg(
    args,
    '--prompt',
    'Enforce strict token budget truncation and deterministic line slicing.',
  );
  const targetFile = getArg(args, '--file', 'lib/harness/core/token-budget.ts');
  const targetSymbol = getArg(args, '--symbol', 'truncateToTokenBudget');
  const contractFile = getArg(args, '--contract', 'lib/harness/types.ts');
  const testFile = getArg(args, '--test', 'lib/harness/core/harness.test.ts');
  const startLine = Number(getArg(args, '--start', '32'));
  const endLine = Number(getArg(args, '--end', '78'));
  const compileOnly = args.includes('--compile-only');
  const verifyOnly = args.includes('--verify-only');

  const {spec, tasks} = buildSpecAndDag({
    userPrompt: prompt,
    targetFile,
    targetSymbol,
    contractFile,
    testFile,
    startLine,
    endLine,
  });

  const codeIndex = new LocalFsCodeIndexAdapter(targetDir);
  const workspace = new LocalFsWorkspaceAdapter(targetDir);
  const verifyProbe = new LocalNodeVerifyAdapter(targetDir);

  console.log(`[Spec] ${spec.id}: ${spec.title}`);
  console.log(`[DAG] ${tasks.map((t) => `${t.id}(${t.status})`).join(' -> ')}`);

  if (compileOnly) {
    const frame = await compileSlotFrame({
      task: tasks[1],
      spec,
      role: 'micro_coder',
      modelTier: 'flash',
      round: 1,
      codeIndex,
      workspace,
    });
    console.log(
      `[4-Slot Frame] ${frame.totalTokens}/${frame.budgetCeiling} tok | hash=${frame.staticHeadHash} | pruned=${frame.prunedItems.join(',') || 'none'}`,
    );
    return;
  }

  if (verifyOnly) {
    const verifyRes = await verifyProbe.runVerify(tasks[1]);
    if (!verifyRes.ok) {
      console.error(`[Verify Error] ${verifyRes.error.message}`);
      process.exit(1);
    }
    console.log(
      `[Verify] passed=${verifyRes.value.passed} stage=${verifyRes.value.stage} summary="${verifyRes.value.summary}"`,
    );
    return;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY ?? '';
  if (!apiKey) {
    console.error(
      'DEEPSEEK_API_KEY is not set. Export DEEPSEEK_API_KEY for live inference, or run with --compile-only / --verify-only.',
    );
    process.exit(1);
  }

  const state: OrchestratorState = {
    spec,
    tasks,
    traces: [],
    lastFrame: null,
    lastVerify: null,
    lastStaticHeadHash: null,
  };

  await runClosedLoop(
    state,
    {
      codeIndex,
      workspace,
      verifyProbe,
      modelGateway: new DeepSeekModelGateway({
        apiKey,
        baseUrl: process.env.DEEPSEEK_BASE_URL,
        flashModel: process.env.DEEPSEEK_MODEL_FLASH,
        proModel: process.env.DEEPSEEK_MODEL_PRO,
      }),
    },
    10,
  );

  for (const tr of state.traces) {
    console.log(
      `Round ${tr.round} | ${tr.taskId} | ${tr.role} (${tr.modelTier}) | ${tr.frameTokens}/${tr.budgetCeiling} tok | cache=${tr.cacheHit} | pass=${tr.verifyPassed} | ${tr.ddiDecision}`,
    );
    console.log(`  -> ${tr.summary}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
