'use client';

import type {SlotContent, SlotFrame} from '@/lib/harness/types';

interface CompilerInspectorViewProps {
  frame: SlotFrame | null;
}

export function CompilerInspectorView({frame}: CompilerInspectorViewProps) {
  if (!frame) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        No compiled 4-Slot frame available yet. Build or select a task in Workbench first.
      </div>
    );
  }

  const slots: Array<{key: string; data: SlotContent; barColor: string}> = [
    {key: 'slot1', data: frame.slot1StaticHead, barColor: 'bg-slate-900'},
    {key: 'slot2', data: frame.slot2ContractAnchors, barColor: 'bg-slate-600'},
    {key: 'slot3', data: frame.slot3SurgicalSlice, barColor: 'bg-emerald-600'},
    {key: 'slot4', data: frame.slot4VerifyFeedback, barColor: 'bg-amber-600'},
  ];

  const utilizationPct = Math.min(
    100,
    Math.round((frame.totalTokens / frame.budgetCeiling) * 100),
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              4-Slot Context Compiler Output Frame
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-mono">Task {frame.taskId}</span>
              <span aria-hidden="true">·</span>
              <span>Role: {frame.role}</span>
              <span aria-hidden="true">·</span>
              <span>Tier: {frame.modelTier === 'pro' ? 'Pro' : 'Flash-1017'}</span>
              <span aria-hidden="true">·</span>
              <span>Chat History: 0 turns (stateless)</span>
            </div>
          </div>

          <div className="text-right font-mono text-sm tabular-nums">
            <span className="font-semibold text-slate-900">
              {frame.totalTokens.toLocaleString()}
            </span>
            <span className="text-slate-500">
              {' '}
              / {frame.budgetCeiling.toLocaleString()} tok ({utilizationPct}%)
            </span>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex h-3 w-full overflow-hidden rounded-md bg-slate-100">
            {slots.map((slot) => {
              const pct = Math.max(
                1,
                Math.round((slot.data.tokens / frame.budgetCeiling) * 100),
              );
              return (
                <div
                  key={slot.key}
                  style={{width: `${pct}%`}}
                  className={`${slot.barColor} border-r border-white last:border-r-0`}
                  title={`${slot.data.label}: ${slot.data.tokens} tok`}
                />
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
            {slots.map((slot) => (
              <div key={slot.key} className="text-slate-600">
                <div className="font-medium text-slate-800">{slot.data.label}</div>
                <div className="mt-0.5 font-mono tabular-nums text-slate-500">
                  {slot.data.tokens} / {slot.data.maxTokens} tok
                  {slot.data.pruned ? ' · pruned' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4 text-xs text-slate-600">
          <span>
            Prefix Cache Static Hash:
            <strong className="ml-1 font-mono text-slate-900">
              {frame.staticHeadHash}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Cache Expectation:
            <strong className="ml-1 text-slate-900">
              {frame.cacheHitExpected ? 'Byte-identical prefix (Hit)' : 'Cold compile'}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Pruned Slots:
            <strong className="ml-1 font-mono text-slate-900">
              {frame.prunedItems.length > 0
                ? frame.prunedItems.join(', ')
                : 'none'}
            </strong>
          </span>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {slots.map((slot) => (
          <section
            key={slot.key}
            className="rounded-lg border border-slate-200 bg-white"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h2 className="text-xs font-semibold text-slate-900">
                {slot.data.label}
              </h2>
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {slot.data.tokens} tok
              </span>
            </div>
            <pre className="max-h-[300px] overflow-auto p-4 font-mono text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">
              {slot.data.content}
            </pre>
          </section>
        ))}
      </div>
    </div>
  );
}
