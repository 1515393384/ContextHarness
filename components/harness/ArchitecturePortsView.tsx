'use client';

import {UI_COPY, type UiLocale} from '@/lib/harness/i18n';
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
  locale: UiLocale;
}

export function ArchitecturePortsView({
  snapshot,
  onUpdateAdapters,
  busy,
  locale,
}: ArchitecturePortsViewProps) {
  const {adapters, deepseekConfigured} = snapshot;
  const t = UI_COPY[locale].ports;

  const indexIds: IndexAdapterKind[] = [
    'treesitter-local',
    'lsp-serena',
    'cpg-codebadger',
  ];
  const probeIds: ProbeAdapterKind[] = ['local-tsc-test', 'runtime-probe'];
  const modelIds: ModelAdapterKind[] = [
    'deepseek-v4.1-flash-1017',
    'deepseek-pro',
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-lg font-semibold text-slate-900">{t.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{t.subtitle}</p>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-200 p-4">
            <h2 className="font-mono text-xs font-semibold text-slate-900">
              1. CodeIndexPort
            </h2>
            <p className="mt-1 text-xs text-slate-500">{t.port1Desc}</p>
            <div className="mt-3 space-y-2">
              {indexIds.map((id) => {
                const active = adapters.indexAdapter === id;
                const opt = t.indexOptions[id];
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={busy}
                    onClick={() => onUpdateAdapters({indexAdapter: id})}
                    className={`w-full rounded-md border p-3 text-left transition-colors ${
                      active
                        ? 'border-slate-900 bg-slate-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-900">
                      <span>{opt.title}</span>
                      {active && <span className="text-slate-700">{t.activeTag}</span>}
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
            <p className="mt-1 text-xs text-slate-500">{t.port2Desc}</p>
            <div className="mt-3 space-y-2">
              {probeIds.map((id) => {
                const active = adapters.probeAdapter === id;
                const opt = t.probeOptions[id];
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={busy}
                    onClick={() => onUpdateAdapters({probeAdapter: id})}
                    className={`w-full rounded-md border p-3 text-left transition-colors ${
                      active
                        ? 'border-slate-900 bg-slate-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-900">
                      <span>{opt.title}</span>
                      {active && <span className="text-slate-700">{t.activeTag}</span>}
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
              {t.port3EnvPrefix}:{' '}
              {deepseekConfigured ? t.port3Ready : t.port3Unset}
            </p>
            <div className="mt-3 space-y-2">
              {modelIds.map((id) => {
                const active = adapters.modelAdapter === id;
                const opt = t.modelOptions[id];
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={busy}
                    onClick={() => onUpdateAdapters({modelAdapter: id})}
                    className={`w-full rounded-md border p-3 text-left transition-colors ${
                      active
                        ? 'border-slate-900 bg-slate-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-900">
                      <span>{opt.title}</span>
                      {active && <span className="text-slate-700">{t.activeTag}</span>}
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
        <h2 className="text-sm font-semibold text-slate-900">{t.port4Title}</h2>
        <p className="mt-1 text-xs text-slate-600">{t.port4Desc}</p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs font-medium text-slate-700">
              {t.cliTestsTitle}
            </div>
            <pre className="mt-1.5 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800">
              npm run test:harness
            </pre>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-700">
              {t.cliRunTitle}
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
