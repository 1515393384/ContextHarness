import {NextRequest} from 'next/server';
import {loadSnapshot, sendChatMessage} from '@/lib/harness/server-store';
import type {ModelTier} from '@/lib/harness/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  let payload: {message?: string; modelTier?: ModelTier};
  try {
    payload = (await req.json()) as {message?: string; modelTier?: ModelTier};
  } catch {
    return new Response(
      JSON.stringify({ok: false, error: 'Invalid JSON request body.'}),
      {status: 400, headers: {'Content-Type': 'application/json'}},
    );
  }

  const msg = payload.message?.trim();
  if (!msg) {
    return new Response(
      JSON.stringify({ok: false, error: 'Message cannot be empty.'}),
      {status: 400, headers: {'Content-Type': 'application/json'}},
    );
  }

  const current = await loadSnapshot();
  if (!current.deepseekConfigured) {
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          'DEEPSEEK_API_KEY is not configured in server environment (.env.local).',
      }),
      {status: 400, headers: {'Content-Type': 'application/json'}},
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (data: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        const res = await sendChatMessage(
          current,
          msg,
          payload.modelTier,
          (ev) => sendEvent(ev),
        );
        if (res.ok === false) {
          sendEvent({type: 'error', message: res.error.message});
        } else {
          sendEvent({type: 'done', snapshot: res.value});
        }
      } catch (error) {
        sendEvent({
          type: 'error',
          message:
            error instanceof Error ? error.message : 'Streaming turn failed.',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
