import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  MessageSquare,
  Play,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { CashFlowChart } from '../../components/CashFlowChart.tsx';
import type {
  DatasetBundle,
  ScenarioComparisonResult,
  ScenarioModification,
} from '../../models/schemas.ts';
import { parseWhatIfWithAiApi, runScenarioApi } from '../../services/apiClient.ts';
import { formatINR, formatReadableDate } from '../../utils/format.ts';

interface WhatIfViewProps {
  dataset: DatasetBundle;
}

export const WhatIfView: React.FC<WhatIfViewProps> = ({ dataset }) => {
  // Structured controls
  const [selectedRecId, setSelectedRecId] = useState<string>(
    dataset.receivables[0]?.receivableId || ''
  );
  const [recDelayDays, setRecDelayDays] = useState<number>(0);
  const [disableRecFinancing, setDisableRecFinancing] = useState<boolean>(false);

  const [selectedPayId, setSelectedPayId] = useState<string>(
    dataset.payables[0]?.payableId || ''
  );
  const [payGraceDays, setPayGraceDays] = useState<number>(0);

  const [openingCashDelta, setOpeningCashDelta] = useState<number>(0);
  const [financingRateOverride, setFinancingRateOverride] = useState<number | ''>('');
  const [financingUnavailable, setFinancingUnavailable] = useState<boolean>(false);

  // Natural language query state
  const [nlQuery, setNlQuery] = useState('');
  const [nlStatus, setNlStatus] = useState<string | null>(null);
  const [nlClarification, setNlClarification] = useState<string | null>(null);
  const [nlLoading, setNlLoading] = useState(false);

  // Scenario result state
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<ScenarioComparisonResult | null>(null);

  const executeScenario = async (mod: ScenarioModification) => {
    setRunning(true);
    setError(null);
    try {
      const result = await runScenarioApi(dataset, mod);
      setComparison(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run scenario simulation.');
    } finally {
      setRunning(false);
    }
  };

  const handleRunStructured = () => {
    const mod: ScenarioModification = {
      openingCashDelta: openingCashDelta !== 0 ? openingCashDelta : undefined,
      financingUnavailable: financingUnavailable || undefined,
      financingRateOverridePct:
        !financingUnavailable && financingRateOverride !== ''
          ? Number(financingRateOverride)
          : undefined,
      receivableDelayAdjustments:
        selectedRecId && (recDelayDays !== 0 || disableRecFinancing)
          ? [
              {
                receivableId: selectedRecId,
                delayDays: recDelayDays,
                disableFinancing: disableRecFinancing,
              },
            ]
          : undefined,
      payableDelayAdjustments:
        selectedPayId && payGraceDays !== 0
          ? [{ payableId: selectedPayId, extraGraceDays: payGraceDays }]
          : undefined,
    };
    executeScenario(mod);
  };

  const handleReset = () => {
    setRecDelayDays(0);
    setDisableRecFinancing(false);
    setPayGraceDays(0);
    setOpeningCashDelta(0);
    setFinancingRateOverride('');
    setFinancingUnavailable(false);
    setNlQuery('');
    setNlStatus(null);
    setNlClarification(null);
    setError(null);
    setComparison(null);
  };

  const handleNaturalLanguageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlQuery.trim()) return;
    setNlLoading(true);
    setNlStatus(null);
    setNlClarification(null);
    setError(null);

    try {
      const res = await parseWhatIfWithAiApi(nlQuery.trim(), dataset);
      if (!res.ok || !res.parsed) {
        setNlClarification(res.error || 'Please specify an entity name and numeric change.');
        return;
      }

      if (!res.parsed.confident) {
        setNlClarification(
          res.parsed.clarificationQuestion ||
            'Could you clarify which supplier/customer and how many days or rupees to adjust?'
        );
        return;
      }

      setNlStatus(`Interpreted: ${res.parsed.interpretationSummary}`);
      await executeScenario(res.parsed.modification);
    } catch (err) {
      setNlClarification(err instanceof Error ? err.message : 'Unable to parse What-If request.');
    } finally {
      setNlLoading(false);
    }
  };

  const runPreset = (label: string, mod: ScenarioModification) => {
    setNlStatus(`Preset: ${label}`);
    setNlClarification(null);
    executeScenario({ ...mod, label });
  };

  return (
    <div className="space-y-6">
      {/* Natural Language What-If Bar */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="font-display font-semibold text-lg text-slate-900">
              What-If Scenario Simulator
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Ask in plain English or adjust the controls below; the deterministic engine
              re-optimizes the plan and diffs every change.
            </p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>

        <form onSubmit={handleNaturalLanguageSubmit} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <MessageSquare className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={nlQuery}
              onChange={(e) => setNlQuery(e.target.value)}
              placeholder='Try: "What if Sharma Steel gives us another 10 days?" or "What if Tata AutoAncillary pays 10 days late?"'
              aria-label="Natural language What-If scenario input"
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
          <button
            type="submit"
            disabled={nlLoading || !nlQuery.trim()}
            className="px-4 py-2.5 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
          >
            {nlLoading ? 'Parsing...' : 'Parse & Simulate'}
          </button>
        </form>

        {/* Quick Demo Presets */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-slate-500">Quick scenarios:</span>
          <button
            type="button"
            onClick={() =>
              runPreset('Tata AutoAncillary pays 10 days late', {
                receivableDelayAdjustments: [{ receivableId: 'REC-001', delayDays: 10 }],
              })
            }
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            Customer pays 10d late
          </button>
          <button
            type="button"
            onClick={() =>
              runPreset('Financing rate rises to 18% p.a.', {
                financingRateOverridePct: 18,
              })
            }
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            Financing rises to 18%
          </button>
          <button
            type="button"
            onClick={() =>
              runPreset('Tata AutoAncillary ineligible for financing', {
                receivableDelayAdjustments: [
                  { receivableId: 'REC-001', delayDays: 0, disableFinancing: true },
                ],
              })
            }
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            Customer A cannot be financed
          </button>
          <button
            type="button"
            onClick={() =>
              runPreset('Available cash ₹50,000 lower', {
                openingCashDelta: -50000,
              })
            }
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            Cash ₹50,000 lower
          </button>
          <button
            type="button"
            onClick={() =>
              runPreset('All external financing unavailable', {
                financingUnavailable: true,
              })
            }
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            No financing available
          </button>
        </div>

        {nlStatus && (
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
            {nlStatus}
          </div>
        )}
        {nlClarification && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{nlClarification}</span>
          </div>
        )}
      </section>

      {/* Structured Simulator Controls */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="flex items-center gap-2 text-sm font-display font-semibold text-slate-900">
          <SlidersHorizontal className="w-4 h-4 text-slate-500" />
          <span>Structured Scenario Parameters</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 text-sm">
          {/* Customer Delay */}
          <div className="space-y-2">
            <label htmlFor="scn-rec" className="block text-xs font-medium text-slate-600">
              Customer Receipt Timing
            </label>
            <select
              id="scn-rec"
              value={selectedRecId}
              onChange={(e) => setSelectedRecId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
            >
              {dataset.receivables.map((r) => (
                <option key={r.receivableId} value={r.receivableId}>
                  {r.customerName} ({formatINR(r.amount)})
                </option>
              ))}
            </select>
            <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
              <span>Delay / Advance:</span>
              <span className="font-mono font-semibold tabular-nums">
                {recDelayDays > 0 ? `+${recDelayDays}d` : `${recDelayDays}d`}
              </span>
            </div>
            <input
              type="range"
              min={-10}
              max={20}
              step={1}
              value={recDelayDays}
              onChange={(e) => setRecDelayDays(Number(e.target.value))}
              aria-label="Customer delay days"
              className="w-full accent-slate-900"
            />
            <label className="flex items-center gap-2 text-xs text-slate-700 pt-1">
              <input
                type="checkbox"
                checked={disableRecFinancing}
                onChange={(e) => setDisableRecFinancing(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>Disable receivable financing for this customer</span>
            </label>
          </div>

          {/* Supplier Grace */}
          <div className="space-y-2">
            <label htmlFor="scn-pay" className="block text-xs font-medium text-slate-600">
              Supplier Deadline Extension
            </label>
            <select
              id="scn-pay"
              value={selectedPayId}
              onChange={(e) => setSelectedPayId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
            >
              {dataset.payables.map((p) => (
                <option key={p.payableId} value={p.payableId}>
                  {p.supplierName} ({formatINR(p.amount)})
                </option>
              ))}
            </select>
            <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
              <span>Additional grace days:</span>
              <span className="font-mono font-semibold tabular-nums">+{payGraceDays}d</span>
            </div>
            <input
              type="range"
              min={0}
              max={21}
              step={1}
              value={payGraceDays}
              onChange={(e) => setPayGraceDays(Number(e.target.value))}
              aria-label="Supplier grace days"
              className="w-full accent-slate-900"
            />
          </div>

          {/* Financing Rate */}
          <div className="space-y-2">
            <label htmlFor="scn-rate" className="block text-xs font-medium text-slate-600">
              Illustrative Financing Rate (% p.a.)
            </label>
            <input
              id="scn-rate"
              type="number"
              min={0}
              max={40}
              step={0.5}
              placeholder="Default (9.5% – 16%)"
              value={financingRateOverride}
              disabled={financingUnavailable}
              onChange={(e) =>
                setFinancingRateOverride(e.target.value === '' ? '' : Number(e.target.value))
              }
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono bg-white disabled:bg-slate-100"
            />
            <label className="flex items-center gap-2 text-xs text-slate-700 pt-2">
              <input
                type="checkbox"
                checked={financingUnavailable}
                onChange={(e) => setFinancingUnavailable(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>Simulate all financing unavailable</span>
            </label>
          </div>

          {/* Opening Cash Adjustment */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-600">Opening Cash Delta</span>
              <span className="font-mono font-semibold tabular-nums text-slate-900">
                {openingCashDelta >= 0 ? '+' : ''}
                {formatINR(openingCashDelta)}
              </span>
            </div>
            <input
              type="range"
              min={-150000}
              max={150000}
              step={10000}
              value={openingCashDelta}
              onChange={(e) => setOpeningCashDelta(Number(e.target.value))}
              aria-label="Opening cash delta"
              className="w-full accent-slate-900"
            />
            <div className="pt-3">
              <button
                type="button"
                onClick={handleRunStructured}
                disabled={running}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <Play className="w-4 h-4" />
                <span>{running ? 'Simulating...' : 'Run Scenario'}</span>
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
            {error}
          </div>
        )}
      </section>

      {/* Before / After Comparison Output */}
      {comparison && (
        <section className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Baseline vs. Scenario Comparison
                </div>
                <h2 className="font-display font-semibold text-lg text-slate-900 mt-0.5">
                  {comparison.label}
                </h2>
              </div>
              <span className="text-xs text-slate-500">
                {comparison.changedAssumptions.join(' · ')}
              </span>
            </div>

            <p className="text-sm text-slate-800 font-medium bg-slate-50 border border-slate-200 rounded-lg p-3.5">
              {comparison.differences.summaryExplanation}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-2.5 px-3">Metric</th>
                    <th className="py-2.5 px-3 text-right">Baseline</th>
                    <th className="py-2.5 px-3 text-right">Scenario</th>
                    <th className="py-2.5 px-3 text-right">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums text-xs sm:text-sm">
                  <tr>
                    <td className="py-2.5 px-3 font-sans text-slate-700">
                      Unmitigated Minimum Cash
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {formatINR(comparison.baseline.shortfall.projectedMinimumCash)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {formatINR(comparison.scenario.shortfall.projectedMinimumCash)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-semibold ${
                        comparison.differences.minimumCashDelta < 0
                          ? 'text-red-700'
                          : comparison.differences.minimumCashDelta > 0
                          ? 'text-emerald-700'
                          : 'text-slate-500'
                      }`}
                    >
                      {comparison.differences.minimumCashDelta >= 0 ? '+' : ''}
                      {formatINR(comparison.differences.minimumCashDelta)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-sans text-slate-700">
                      Peak Reserve Shortfall
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {formatINR(comparison.baseline.shortfall.peakShortfallAmount)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {formatINR(comparison.scenario.shortfall.peakShortfallAmount)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-semibold ${
                        comparison.differences.shortfallDelta > 0
                          ? 'text-red-700'
                          : comparison.differences.shortfallDelta < 0
                          ? 'text-emerald-700'
                          : 'text-slate-500'
                      }`}
                    >
                      {comparison.differences.shortfallDelta >= 0 ? '+' : ''}
                      {formatINR(comparison.differences.shortfallDelta)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-sans text-slate-700">First Shortfall Date</td>
                    <td className="py-2.5 px-3 text-right">
                      {comparison.baseline.shortfall.firstShortfallDate
                        ? formatReadableDate(
                            comparison.baseline.shortfall.firstShortfallDate,
                            'MMM dd'
                          )
                        : 'None'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {comparison.scenario.shortfall.firstShortfallDate
                        ? formatReadableDate(
                            comparison.scenario.shortfall.firstShortfallDate,
                            'MMM dd'
                          )
                        : 'None'}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-500">
                      {comparison.differences.shortfallDateChanged ? 'Shifted' : 'Same'}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-sans text-slate-700">
                      Liquidity / Financing Mobilized
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {formatINR(
                        comparison.baseline.optimizedPlan.totalFinancingDrawn +
                          comparison.baseline.optimizedPlan.totalReceivablesAccelerated
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {formatINR(
                        comparison.scenario.optimizedPlan.totalFinancingDrawn +
                          comparison.scenario.optimizedPlan.totalReceivablesAccelerated
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {comparison.differences.financingDrawnDelta >= 0 ? '+' : ''}
                      {formatINR(comparison.differences.financingDrawnDelta)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-semibold text-slate-900">
                      Optimized Plan Estimated Cost
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold">
                      {comparison.baseline.optimizedPlan.feasible
                        ? formatINR(comparison.baseline.optimizedPlan.totalEstimatedCost)
                        : 'Infeasible'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold">
                      {comparison.scenario.optimizedPlan.feasible
                        ? formatINR(comparison.scenario.optimizedPlan.totalEstimatedCost)
                        : 'Infeasible'}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-bold ${
                        comparison.differences.estimatedCostDelta > 0
                          ? 'text-red-700'
                          : comparison.differences.estimatedCostDelta < 0
                          ? 'text-emerald-700'
                          : 'text-slate-500'
                      }`}
                    >
                      {comparison.scenario.optimizedPlan.feasible
                        ? `${comparison.differences.estimatedCostDelta >= 0 ? '+' : ''}${formatINR(
                            comparison.differences.estimatedCostDelta
                          )}`
                        : 'N/A'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {comparison.differences.actionChanges.length > 0 && (
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Recommended Plan Changes
                </h3>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {comparison.differences.actionChanges.map((ch, idx) => (
                    <div
                      key={idx}
                      className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs"
                    >
                      <span className="font-semibold text-slate-900">{ch.entityName}</span>
                      <div className="flex items-center gap-2 text-slate-600">
                        <span>{ch.baselineAction}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-semibold text-slate-900">{ch.scenarioAction}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {comparison.scenario.optimizedPlan.feasible && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="font-display font-semibold text-sm text-slate-900 mb-3">
                Scenario Cash Curve (Unmitigated vs. Re-Optimized Plan)
              </h3>
              <CashFlowChart
                unmitigatedForecast={comparison.scenario.unmitigatedForecast}
                optimizedForecast={comparison.scenario.optimizedPlan.forecastAfterPlan}
                minimumReserve={comparison.scenario.datasetSummary.minimumReserve}
                showOptimized={true}
                height={240}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
};
