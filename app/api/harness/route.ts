import {NextRequest, NextResponse} from 'next/server';
import {
  createFreshSnapshot,
  executeClosedLoop,
  executeStep,
  loadSnapshot,
  previewTaskFrame,
  saveSnapshot,
  verifyActiveTask,
} from '@/lib/harness/server-store';
import type {AdapterProfile, TargetLanguage} from '@/lib/harness/types';

export async function GET() {
  const snapshot = await loadSnapshot();
  return NextResponse.json({ok: true, snapshot});
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action:
        | 'plan'
        | 'compile_frame'
        | 'verify'
        | 'step'
        | 'run_loop'
        | 'select_task'
        | 'update_adapters'
        | 'reset';
      prompt?: string;
      targetLanguage?: TargetLanguage;
      targetFile?: string;
      targetSymbol?: string;
      contractFile?: string;
      testFile?: string;
      startLine?: number;
      endLine?: number;
      taskId?: string;
      adapters?: Partial<AdapterProfile>;
    };

    const current = await loadSnapshot();

    switch (body.action) {
      case 'plan': {
        const prompt = body.prompt?.trim();
        if (!prompt) {
          return NextResponse.json(
            {ok: false, error: 'Requirement prompt is required.'},
            {status: 400},
          );
        }
        const next = await createFreshSnapshot(
          {
            userPrompt: prompt,
            targetLanguage: body.targetLanguage ?? current.spec.targetLanguage,
            targetFile: body.targetFile,
            targetSymbol: body.targetSymbol,
            contractFile: body.contractFile,
            testFile: body.testFile,
            startLine: body.startLine,
            endLine: body.endLine,
          },
          current.adapters,
        );
        return NextResponse.json({ok: true, snapshot: next});
      }

      case 'compile_frame': {
        const next = await previewTaskFrame(
          current,
          body.taskId ?? current.activeTaskId,
        );
        return NextResponse.json({ok: true, snapshot: next});
      }

      case 'verify': {
        const next = await verifyActiveTask(current);
        return NextResponse.json({ok: true, snapshot: next});
      }

      case 'step': {
        if (!current.deepseekConfigured) {
          return NextResponse.json(
            {
              ok: false,
              error:
                'DEEPSEEK_API_KEY is not configured in server environment (.env.local). Use Compile 4-Slot Frame or Run Local Verify, or configure DEEPSEEK_API_KEY to run model inference.',
            },
            {status: 400},
          );
        }
        const next = await executeStep(current);
        return NextResponse.json({ok: true, snapshot: next});
      }

      case 'run_loop': {
        if (!current.deepseekConfigured) {
          return NextResponse.json(
            {
              ok: false,
              error:
                'DEEPSEEK_API_KEY is not configured in server environment (.env.local). Use Compile 4-Slot Frame or Run Local Verify, or configure DEEPSEEK_API_KEY to run closed-loop inference.',
            },
            {status: 400},
          );
        }
        const next = await executeClosedLoop(current);
        return NextResponse.json({ok: true, snapshot: next});
      }

      case 'select_task': {
        if (!body.taskId) {
          return NextResponse.json(
            {ok: false, error: 'Missing taskId.'},
            {status: 400},
          );
        }
        const next = await previewTaskFrame(current, body.taskId);
        return NextResponse.json({ok: true, snapshot: next});
      }

      case 'update_adapters': {
        current.adapters = {
          ...current.adapters,
          ...body.adapters,
        };
        await saveSnapshot(current);
        const refreshed = await previewTaskFrame(current, current.activeTaskId);
        return NextResponse.json({ok: true, snapshot: refreshed});
      }

      case 'reset': {
        const next = await createFreshSnapshot(undefined, current.adapters);
        return NextResponse.json({ok: true, snapshot: next});
      }

      default:
        return NextResponse.json(
          {ok: false, error: 'Unsupported action.'},
          {status: 400},
        );
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Request failed.',
      },
      {status: 500},
    );
  }
}
