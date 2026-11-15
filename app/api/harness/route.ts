import {NextRequest, NextResponse} from 'next/server';
import {
  clearChatHistory,
  createFreshSnapshot,
  executeClosedLoop,
  executeStep,
  loadSnapshot,
  previewTaskFrame,
  readChatWorkspaceFile,
  saveSnapshot,
  sendChatMessage,
  setChatWorkspace,
  verifyActiveTask,
  verifyChatWorkspace,
} from '@/lib/harness/server-store';
import type {AdapterProfile, ModelTier, TargetLanguage} from '@/lib/harness/types';

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
        | 'reset'
        | 'set_chat_workspace'
        | 'read_chat_file'
        | 'verify_chat_workspace'
        | 'chat_send'
        | 'clear_chat';
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
      workspaceDir?: string;
      verifyCommand?: string;
      createIfMissing?: boolean;
      filePath?: string;
      message?: string;
      modelTier?: ModelTier;
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

      case 'set_chat_workspace': {
        const res = await setChatWorkspace(
          current,
          body.workspaceDir ?? '',
          body.verifyCommand,
          Boolean(body.createIfMissing),
        );
        if (res.ok === false) {
          return NextResponse.json(
            {ok: false, error: res.error.message},
            {status: 400},
          );
        }
        return NextResponse.json({ok: true, snapshot: res.value});
      }

      case 'read_chat_file': {
        if (!body.filePath) {
          return NextResponse.json(
            {ok: false, error: 'Missing filePath.'},
            {status: 400},
          );
        }
        const res = await readChatWorkspaceFile(current, body.filePath);
        if (res.ok === false) {
          return NextResponse.json(
            {ok: false, error: res.error.message},
            {status: 400},
          );
        }
        return NextResponse.json({ok: true, fileContent: res.value, snapshot: current});
      }

      case 'verify_chat_workspace': {
        const next = await verifyChatWorkspace(current, body.verifyCommand);
        return NextResponse.json({ok: true, snapshot: next});
      }

      case 'chat_send': {
        const msg = body.message?.trim();
        if (!msg) {
          return NextResponse.json(
            {ok: false, error: 'Message cannot be empty.'},
            {status: 400},
          );
        }
        if (!current.deepseekConfigured) {
          return NextResponse.json(
            {
              ok: false,
              error:
                'DEEPSEEK_API_KEY is not configured in server environment (.env.local). Configure DEEPSEEK_API_KEY and restart the server, or use Run Verify in the target directory.',
            },
            {status: 400},
          );
        }
        const res = await sendChatMessage(current, msg, body.modelTier);
        if (res.ok === false) {
          return NextResponse.json(
            {ok: false, error: res.error.message},
            {status: 400},
          );
        }
        return NextResponse.json({ok: true, snapshot: res.value});
      }

      case 'clear_chat': {
        const next = await clearChatHistory(current);
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
