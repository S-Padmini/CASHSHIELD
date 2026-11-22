
import React, { useState } from 'react';
import { CashFlowChart } from '../../components/CashFlowChart.tsx';
import type { NavTab } from '../../components/LayoutShell.tsx';
import type { AnalysisResult } from '../../models/schemas.ts';
import { formatINR, formatReadableDate } from '../../utils/format.ts';

interface DashboardViewProps {
  analysis: AnalysisResult;
  onNavigate: (tab: NavTab) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ analysis, onNavigate }) => {
  const [overlayOptimized, setOverlayOptimized] = useState(false);
  const { datasetSummary, shortfall, unmitigatedForecast, optimizedPlan } = analysis;

  const isCrisis = shortfall.status === 'crisis';
  const isWarning = shortfall.status === 'warning';

  const statusText = isCrisis
    ? 'Cash Position Needs Immediate Action'
    : isWarning
      ? 'Buffer Approaching Minimum Reserve'
      : 'Cash Plan Is Healthy';

  const statusColor = isCrisis
    ? 'text-red-700'
    : isWarning
      ? 'text-amber-700'
      : 'text-emerald-700';

  const metrics = [
    {
      label: 'Cash Available',
      value: formatINR(datasetSummary.openingCash),
      detail: formatINR(datasetSummary.openingCash, true),
      type: 'default',
    },
    {
      label: 'Total Payables',
      value: formatINR(datasetSummary.totalPayables),
      detail: `${datasetSummary.payableCount} supplier invoices`,
      type: 'link',
      tab: 'payables' as NavTab,
    },
    {
      label: 'Total Receivables',
      value: formatINR(datasetSummary.totalReceivables),
      detail: `${datasetSummary.receivableCount} customer invoices`,
      type: 'link',
      tab: 'receivables' as NavTab,
    },
    {
      label: 'Protected Payroll',
      value: formatINR(datasetSummary.protectedPayroll),
      detail: 'Hard constraint',
      type: 'default',
    },
    {
      label: 'Financing Capacity',
      value: formatINR(datasetSummary.totalFinancingAvailable),
      detail: 'Fund limits that can be claimed in terms of emergency',
      type: 'default',
    },
  ];

  const shortfallMetrics = [
    {
      label: 'Projected Minimum Cash',
      value: formatINR(shortfall.projectedMinimumCash),
      detail: `On ${formatReadableDate(shortfall.minimumCashDate, 'MMM dd')}`,
      valueClass:
        shortfall.projectedMinimumCash < datasetSummary.minimumReserve
          ? 'text-red-700'
          : 'text-slate-900',
    },
    {
      label: 'Cash Shortfall in upcoming days',
      value:
        shortfall.peakShortfallAmount > 0
          ? formatINR(shortfall.peakShortfallAmount)
          : '₹0',
      detail:
        shortfall.shortfallDurationDays > 0
          ? `${shortfall.shortfallDurationDays} day(s) below reserve`
          : 'No reserve breach',
      valueClass:
        shortfall.peakShortfallAmount > 0
          ? 'text-red-700'
          : 'text-emerald-700',
    },
    {
      label: 'Minimum Cash Reserve',
      value: formatINR(datasetSummary.minimumReserve),
      detail: 'Protected threshold',
      valueClass: 'text-slate-900',
    },
    {
      label: 'Optimized Plan Status',
      value: optimizedPlan.feasible
        ? formatINR(optimizedPlan.totalEstimatedCost)
        : 'Infeasible',
      detail: optimizedPlan.feasible
        ? `Est. cost · Min cash ${formatINR(optimizedPlan.minimumCashAfterPlan)}`
        : 'Check liquidity constraints',
      valueClass: optimizedPlan.feasible
        ? 'text-emerald-700'
        : 'text-red-700',
    },
  ];

  return (
    <div className="space-y-5">

      {/* Cash position overview */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-gradient-to-r from-sky-50 via-white to-white px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-xs font-semibold uppercase tracking-wider ${statusColor}`}
                >
                  {statusText}
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-xs text-slate-500">
                  {datasetSummary.planningHorizonDays}-day forecast from{' '}
                  {formatReadableDate(datasetSummary.analysisDate)}
                </span>
              </div>

              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                  {shortfall.headline}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  {shortfall.explanation}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onNavigate('crisis')}
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
              >
                Solve Cash Crisis
              </button>

              <button
                type="button"
                onClick={() => onNavigate('whatif')}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:ring-offset-2"
              >
                Run What-If
              </button>
            </div>
          </div>
        </div>

        {/* Shortfall summary */}
        <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-4 sm:divide-y-0">
          {shortfallMetrics.map((metric) => (
            <div
              key={metric.label}
              className="min-w-0 px-4 py-4 transition-colors hover:bg-sky-50/50 sm:px-5"
            >
              <p className="text-xs font-medium text-slate-500">
                {metric.label}
              </p>
              <p
                className={`mt-1.5 truncate font-mono text-lg font-semibold tabular-nums ${metric.valueClass}`}
              >
                {metric.value}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {metric.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Financial overview */}
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Financial Overview
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Current cash position and outstanding commitments
            </p>
          </div>
          <span className="text-xs font-medium text-slate-400">
            Key Metrics
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {metrics.map((metric) => {
            const content = (
              <>
                <p className="text-xs font-medium text-slate-500">
                  {metric.label}
                </p>
                <p className="mt-2 truncate font-mono text-xl font-semibold tabular-nums tracking-tight text-slate-900">
                  {metric.value}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {metric.detail}
                </p>
              </>
            );

            return metric.type === 'link' ? (
              <button
                key={metric.label}
                type="button"
                onClick={() => onNavigate(metric.tab!)}
                className="group rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sky-200"
              >
                {content}
              </button>
            ) : (
              <div
                key={metric.label}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md"
              >
                {content}
              </div>
            );
          })}
        </div>
      </section>

      {/* Cash trajectory and shortfall drivers */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">

        {/* Forecast chart */}
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:col-span-8">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Daily Projected Cash Trajectory
              </h2>
              
            </div>

            {optimizedPlan.feasible && (
              <div className="inline-flex w-fit shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setOverlayOptimized(false)}
                  aria-pressed={!overlayOptimized}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    !overlayOptimized
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Unmitigated Cash
                </button>
                <button
                  type="button"
                  onClick={() => setOverlayOptimized(true)}
                  aria-pressed={overlayOptimized}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    overlayOptimized
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Compare With Plan
                </button>
              </div>
            )}
          </div>

          <div className="min-w-0">
            <CashFlowChart
              unmitigatedForecast={unmitigatedForecast}
              optimizedForecast={optimizedPlan.forecastAfterPlan}
              minimumReserve={datasetSummary.minimumReserve}
              showOptimized={overlayOptimized}
              height={320}
            />
          </div>
        </section>

        {/* Main shortfall drivers */}
        <section className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:col-span-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Primary Shortfall Drivers
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Largest outflows arriving before{' '}
              {formatReadableDate(shortfall.minimumCashDate, 'MMM dd')}
            </p>

            {shortfall.primaryDrivers.length === 0 ? (
              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                No reserve breach drivers detected within the planning horizon.
              </div>
            ) : (
              <div className="mt-4 divide-y divide-slate-100">
                {shortfall.primaryDrivers.map((driver, index) => (
                  <div
                    key={`${driver.description}-${index}`}
                    className="flex items-start justify-between gap-3 py-3 transition-colors hover:bg-sky-50/50"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-50 text-xs font-semibold text-sky-700">
                        {index + 1}
                      </span>

                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium text-slate-800">
                          {driver.description}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatReadableDate(driver.date, 'MMM dd')} ·{' '}
                          {driver.category}
                        </p>
                      </div>
                    </div>

                    <p className="shrink-0 whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-slate-800">
                      {formatINR(driver.amount)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-auto border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => onNavigate('crisis')}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:border-sky-300 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:ring-offset-2"
            >
              Inspect Recommended Plan
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
