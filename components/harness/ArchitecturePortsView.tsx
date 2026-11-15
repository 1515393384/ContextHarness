'use client';

import type {
  AdapterProfile,
  HarnessWorkspaceSnapshot,
  IndexAdapterKind,
  ModelAdapterKind,
  ProbeAdapterKind,
} from '@/lib/harness/types';

interface ArchitecturePortsViewProps {
  snapshot: HarnessWorkspaceSnapshot;
  onUpdateAdapters: (adapters: Partial<AdapterProfile>) => void;
  busy: boolean;
}

export function ArchitecturePortsView({
  snapshot,
  onUpdateAdapters,
  busy,
}: ArchitecturePortsViewProps) {
  const {adapters, deepseekConfigured} = snapshot;

  const indexOptions: Array<{
    id: IndexAdapterKind;
    title: string;
    desc: string;
  }> = [
    {
      id: 'treesitter-local',
      title: 'Tree-sitter Local Slicer',
      desc: 'Zero external daemon; extracts export signatures and bounded line slices directly from workspace files.',
    },
    {
      id: 'lsp-serena',
      title: 'Serena (LSP MCP) Symbol Adapter',
      desc: 'Routes getSlice and get1HopCallers through Language Server Protocol symbol definitions and references.',
    },
    {
      id: 'cpg-codebadger',
      title: 'codebadger (Joern CPG) Graph Adapter',
      desc: 'Computes minimal AST + CFG + DFG slices and taint paths prior to invoking the LLM.',
    },
  ];

  const probeOptions: Array<{
    id: ProbeAdapterKind;
    title: string;
    desc: string;
  }> = [
    {
      id: 'local-tsc-test',
      title: 'Local Typecheck + Test Runner',
      desc: 'Runs tsc --noEmit and tsx --test locally, stripping noisy framework stack frames.',
    },
    {
      id: 'runtime-probe',
      title: 'InspectCoder Runtime Probe Adapter',
      desc: 'Captures bounded JSON variable snapshots before failing assertions without log flooding.',
    },
  ];

  const modelOptions: Array<{
    id: ModelAdapterKind;
    title: string;
    desc: string;
  }> = [
    {
      id: 'deepseek-v4.1-flash-1017',
      title: 'DeepSeek-V4.1-Flash-1017 (Primary)',
      desc: 'Default fast micro-step execution tier with Prefix Cache ordering and strict JSON tool calling.',
    },
    {
      id: 'deepseek-pro',
      title: 'DeepSeek Pro / Reasoner (Escalation)',
      desc: 'Activated automatically by SWE-Router after DDI 2-round identical error escalation.',
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-lg font-semibold text-slate-900">
          Ports & Pluggable Adapters
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Core orchestration logic (DAG Scheduler, 4-Slot Compiler, DDI Circuit Breaker) depends exclusively on 4 decoupled Port interfaces.
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-200 p-4">
            <h2 className="font-mono text-xs font-semibold text-slate-900">
              1. CodeIndexPort
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Supplies bounded repo skeletons, slices, and 1-hop callers.
            </p>
            <div className="mt-3 space-y-2">
              {indexOptions.map((opt) => {
                const active = adapters.indexAdapter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={busy}
                    onClick={() => onUpdateAdapters({indexAdapter: opt.id})}
                    className={`w-full rounded-md border p-3 text-left transition-colors ${
                      active
                        ? 'border-slate-900 bg-slate-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-900">
                      <span>{opt.title}</span>
                      {active && <span className="text-slate-700">Active</span>}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <h2 className="font-mono text-xs font-semibold text-slate-900">
              2. VerifyProbePort
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Normalizes compiler/test failures into deterministic error hashes.
            </p>
            <div className="mt-3 space-y-2">
              {probeOptions.map((opt) => {
                const active = adapters.probeAdapter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={busy}
                    onClick={() => onUpdateAdapters({probeAdapter: opt.id})}
                    className={`w-full rounded-md border p-3 text-left transition-colors ${
                      active
                        ? 'border-slate-900 bg-slate-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-900">
                      <span>{opt.title}</span>
                      {active && <span className="text-slate-700">Active</span>}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <h2 className="font-mono text-xs font-semibold text-slate-900">
              3. ModelGatewayPort
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Server env: {deepseekConfigured ? 'DEEPSEEK_API_KEY ready' : 'DEEPSEEK_API_KEY unset'}
            </p>
            <div className="mt-3 space-y-2">
              {modelOptions.map((opt) => {
                const active = adapters.modelAdapter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={busy}
                    onClick={() => onUpdateAdapters({modelAdapter: opt.id})}
                    className={`w-full rounded-md border p-3 text-left transition-colors ${
                      active
                        ? 'border-slate-900 bg-slate-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-900">
                      <span>{opt.title}</span>
                      {active && <span className="text-slate-700">Active</span>}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">
          4. WorkspaceEditPort & CLI Commands
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          Enforces line-range replace_lines patches, read-only locks on contracts/tests, and instant snapshot rollback on DDI circuit break.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs font-medium text-slate-700">
              Run Core Unit Tests (node:test)
            </div>
            <pre className="mt-1.5 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800">
              npm run test:harness
            </pre>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700">
              Run CLI Against Local Workspace
            </div>
            <pre className="mt-1.5 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800">
              npm run harness -- --compile-only
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
}
