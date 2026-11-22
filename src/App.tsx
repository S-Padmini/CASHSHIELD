
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { LayoutShell, type NavTab } from './components/LayoutShell.tsx';
import { CashCrisisView } from './features/crisis/CashCrisisView.tsx';
import { CostExplorerView } from './features/costs/CostExplorerView.tsx';
import { DashboardView } from './features/dashboard/DashboardView.tsx';
import { EvidenceView } from './features/evidence/EvidenceView.tsx';
import { DataImportView } from './features/import/DataImportView.tsx';
import { LandingView } from './features/landing/LandingView.tsx';
import { PayablesView } from './features/payables/PayablesView.tsx';
import { ReceivablesView } from './features/receivables/ReceivablesView.tsx';
import { WhatIfView } from './features/scenarios/WhatIfView.tsx';
import type { AnalysisResult, DatasetBundle } from './models/schemas.ts';
import { fetchDemoBundle, runAnalysisApi } from './services/apiClient.ts';

export default function App() {
  const [enteredWorkspace, setEnteredWorkspace] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [dataset, setDataset] = useState<DatasetBundle | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDemo = useCallback(async (targetTab: NavTab = 'overview') => {
    setLoading(true);
    setError(null);

    try {
      const bundle = await fetchDemoBundle();
      setDataset(bundle.dataset);
      setAnalysis(bundle.analysis);
      setActiveTab(targetTab);
      setEnteredWorkspace(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to initialize CashShield demo.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const handleImportStart = useCallback(async () => {
    await loadDemo('import');
  }, [loadDemo]);

  const handleApplyDataset = useCallback(async (nextDataset: DatasetBundle) => {
    setLoading(true);
    setError(null);

    try {
      const nextAnalysis = await runAnalysisApi(nextDataset);
      setDataset(nextDataset);
      setAnalysis(nextAnalysis);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to validate and analyze dataset.';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRerunAnalysis = useCallback(async () => {
    if (!dataset) return;

    setLoading(true);
    setError(null);

    try {
      const nextAnalysis = await runAnalysisApi(dataset);
      setAnalysis(nextAnalysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.');
    } finally {
      setLoading(false);
    }
  }, [dataset]);

  if (!enteredWorkspace) {
    return (
      <>
        <LandingView
          onExploreDemo={() => loadDemo('overview')}
          onImportData={handleImportStart}
          loadingDemo={loading}
        />

        {error && (
          <div className="fixed bottom-6 right-6 flex max-w-md items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900 shadow-md">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
            <div>
              <div className="font-semibold">Unable to load demo</div>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}
      </>
    );
  }

  if (!dataset || !analysis) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-6">
          {loading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-5 w-1/2 rounded bg-slate-200" />
              <div className="h-20 rounded bg-slate-100" />
              <div className="h-4 w-3/4 rounded bg-slate-200" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="font-display font-semibold text-slate-900">
                Unable to load analysis state
              </div>

              <p className="text-sm text-slate-600">
                {error || 'Please retry loading the demo.'}
              </p>

              <button
                type="button"
                onClick={() => loadDemo('overview')}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Retry</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <LayoutShell
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      businessName={dataset.businessProfile.businessName}
      analysisDate={dataset.businessProfile.analysisDate}
      horizonDays={dataset.businessProfile.planningHorizonDays}
      isSyntheticDemo={dataset.businessProfile.isSyntheticDemo}
      crisisDetected={analysis.shortfall.status === 'crisis'}
      onResetToLanding={() => setEnteredWorkspace(false)}
    >
      {error && (
        <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-700" />
            <span>{error}</span>
          </div>

          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {activeTab === 'overview' && (
        <DashboardView analysis={analysis} onNavigate={setActiveTab} />
      )}

      {activeTab === 'crisis' && (
        <CashCrisisView
          analysis={analysis}
          onRerunAnalysis={handleRerunAnalysis}
          rerunning={loading}
        />
      )}

      {activeTab === 'payables' && (
        <PayablesView dataset={dataset} analysis={analysis} />
      )}

      {activeTab === 'receivables' && (
        <ReceivablesView dataset={dataset} analysis={analysis} />
      )}

      {activeTab === 'costs' && (
        <CostExplorerView dataset={dataset} analysis={analysis} />
      )}

      {activeTab === 'whatif' && (
        <WhatIfView dataset={dataset} />
      )}

      {activeTab === 'evidence' && (
        <EvidenceView dataset={dataset} analysis={analysis} />
      )}

      {activeTab === 'import' && (
        <DataImportView
          dataset={dataset}
          onApplyDataset={handleApplyDataset}
          onResetDemo={() => loadDemo('overview')}
        />
      )}
    </LayoutShell>
  );
}
