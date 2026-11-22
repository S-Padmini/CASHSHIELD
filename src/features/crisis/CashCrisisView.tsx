
import React, { useState } from 'react';
import {
  AlertOctagon,
  Calculator,
  CheckCircle2,
  HelpCircle,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
} from 'lucide-react';
import { CashFlowChart } from '../../components/CashFlowChart.tsx';
import { ShowMathDrawer } from '../../components/ShowMathDrawer.tsx';
import { WhyModal } from '../../components/WhyModal.tsx';
import type {
  ActionCostEvaluation,
  AnalysisResult,
  RecommendationItem,
} from '../../models/schemas.ts';
import { explainPlanWithAiApi } from '../../services/apiClient.ts';
import { formatINR, formatReadableDate } from '../../utils/format.ts';

interface CashCrisisViewProps {
  analysis: AnalysisResult;
  onRerunAnalysis: () => void;
  rerunning: boolean;
}

const ACTION_BADGE_STYLES: Record<RecommendationItem['actionCode'], string> = {
  PROTECT: 'bg-slate-900 text-white',
  PAY: 'bg-slate-100 text-slate-800 border border-slate-200',
  CAPTURE_DISCOUNT: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
  ACCELERATE: 'bg-sky-50 text-sky-800 border border-sky-200',
  DELAY: 'bg-amber-50 text-amber-800 border border-amber-200',
  FINANCE: 'bg-violet-50 text-violet-800 border border-violet-200',
};

const ACTION_CARD_STYLES: Record<RecommendationItem['actionCode'], string> = {
  PROTECT: 'border-l-slate-700',
  PAY: 'border-l-slate-400',
  CAPTURE_DISCOUNT: 'border-l-emerald-500',
  ACCELERATE: 'border-l-sky-500',
  DELAY: 'border-l-amber-500',
  FINANCE: 'border-l-violet-500',
};

const ACTION_FILTERS = [
  { code: 'ALL', label: 'All Actions' },
  { code: 'PROTECT', label: 'Protect' },
  { code: 'CAPTURE_DISCOUNT', label: 'Discounts' },
  { code: 'PAY', label: 'Pay' },
  { code: 'ACCELERATE', label: 'Accelerate' },
  { code: 'DELAY', label: 'Delay' },
  { code: 'FINANCE', label: 'Finance' },
] as const;

export const CashCrisisView: React.FC<CashCrisisViewProps> = ({
  analysis,
  onRerunAnalysis,
  rerunning,
}) => {
  const [whyTarget, setWhyTarget] = useState<RecommendationItem | null>(null);

  const [mathTarget, setMathTarget] = useState<{
    math: ActionCostEvaluation;
    title: string;
  } | null>(null);

  const [filterAction, setFilterAction] = useState<string>('ALL');

  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  const {
    shortfall,
    optimizedPlan,
    baselinePlan,
    comparison,
    unmitigatedForecast,
    datasetSummary,
  } = analysis;

  const recommendations = optimizedPlan.recommendations;

  const filteredRecs =
    filterAction === 'ALL'
      ? recommendations
      : recommendations.filter((r) => r.actionCode === filterAction);

  const getActionCount = (code: string) =>
    code === 'ALL'
      ? recommendations.length
      : recommendations.filter((r) => r.actionCode === code).length;

  const handleGenerateAiExplanation = async () => {
    setAiLoading(true);
    setAiMessage(null);

    try {
      const res = await explainPlanWithAiApi(analysis);

      if (res.ok && res.explanation) {
        setAiExplanation(res.explanation);
      } else {
        setAiMessage(res.error || 'AI explanation unavailable.');
      }
    } catch (err) {
      setAiMessage(
        err instanceof Error
          ? err.message
          : 'Unable to reach AI narrative service.'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const metrics = [
    {
      label: 'Projected Shortfall',
      value: formatINR(shortfall.peakShortfallAmount),
      note: 'Peak reserve gap',
      style:
        shortfall.peakShortfallAmount > 0
          ? 'text-rose-700'
          : 'text-emerald-700',
      background: 'bg-rose-50/70',
      accent: 'bg-rose-400',
    },
    {
      label: 'First Breach Expected',
      value: shortfall.firstShortfallDate
        ? formatReadableDate(shortfall.firstShortfallDate, 'MMM dd')
        : 'None',
      note: 'Expected first reserve breach',
      style: 'text-slate-900',
      background: 'bg-sky-50/70',
      accent: 'bg-sky-400',
    },
    {
      label: 'Reserve at Risk',
      value: formatINR(shortfall.reserveAtRisk),
      note: 'Minimum reserve exposure',
      style: 'text-slate-900',
      background: 'bg-amber-50/70',
      accent: 'bg-amber-400',
    },
    {
      label: 'Optimized Plan Cost',
      value: optimizedPlan.feasible
        ? formatINR(optimizedPlan.totalEstimatedCost)
        : 'Infeasible',
      note: 'Estimated execution cost',
      style: 'text-emerald-700',
      background: 'bg-emerald-50/70',
      accent: 'bg-emerald-500',
    },
  ];

  return (
    <div className="space-y-5 pb-6">
      {/* Main crisis header */}
      <section className="relative overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-white via-white to-sky-50/80 shadow-sm">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-sky-100/50 blur-3xl pointer-events-none" />
        <div className="absolute right-40 -bottom-28 h-48 w-48 rounded-full bg-blue-100/40 blur-3xl pointer-events-none" />

        <div className="relative p-5 sm:p-6">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.10)]" />
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  {shortfall.status === 'crisis'
                    ? 'Cash Crisis Decision Engine'
                    : 'Cash Plan Verification'}
                </span>
              </div>

              <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-snug">
                {shortfall.status === 'crisis'
                  ? `Resolve ${formatINR(shortfall.peakShortfallAmount)} Projected Reserve Shortfall`
                  : shortfall.headline}
              </h1>

              <p className="text-xs sm:text-sm text-slate-500 mt-2 max-w-2xl leading-relaxed">
                A prioritized action plan to protect your minimum cash reserve,
                manage supplier obligations, and bridge the projected liquidity gap.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleGenerateAiExplanation}
                disabled={aiLoading}
                className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border border-sky-200 bg-white/90 text-sky-800 shadow-sm hover:bg-sky-50 hover:border-sky-300 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
              >
                <MessageSquareText className="w-4 h-4" />
                {aiLoading ? 'Summarizing...' : 'AI Plain-Language Summary'}
              </button>

              <button
                type="button"
                onClick={onRerunAnalysis}
                disabled={rerunning}
                className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-slate-900 text-white shadow-sm hover:bg-slate-800 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
              >
                <RefreshCw
                  className={`w-4 h-4 ${rerunning ? 'animate-spin' : ''}`}
                />
                {rerunning ? 'Running...' : 'Re-Run Analysis'}
              </button>
            </div>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4 gap-3 mt-6">
            {metrics.map((metric, index) => (
              <div
                key={metric.label}
                className={`group relative overflow-hidden rounded-xl border border-white/80 ${metric.background} p-4 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-200`}
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1 ${metric.accent} opacity-80`}
                />

                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {metric.label}
                </p>

                <p
                  className={`mt-2 font-mono text-xl sm:text-2xl font-bold tracking-tight tabular-nums ${metric.style}`}
                >
                  {metric.value}
                </p>

                <p className="mt-1.5 text-[11px] text-slate-500">
                  {metric.note}
                </p>
              </div>
            ))}
          </div>

          {/* AI explanation */}
          {(aiExplanation || aiMessage) && (
            <div className="mt-5 rounded-xl border border-sky-200 bg-white/90 p-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-2 mb-2">
                <span className="rounded-md bg-sky-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-800">
                  AI Summary
                </span>
                <span className="text-[11px] text-slate-400">
                  Based on deterministic plan output
                </span>
              </div>

              {aiExplanation ? (
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {aiExplanation}
                </p>
              ) : (
                <p className="text-sm text-amber-700">{aiMessage}</p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Infeasible plan */}
      {!optimizedPlan.feasible && (
        <section className="rounded-xl border border-rose-200 bg-rose-50/80 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-rose-100 p-2">
              <AlertOctagon className="w-5 h-5 text-rose-700" />
            </div>

            <div className="min-w-0">
              <h2 className="font-display font-semibold text-base text-rose-900">
                No Feasible Plan Preserves All Constraints
              </h2>

              <p className="text-sm text-rose-800 mt-1 leading-relaxed">
                CashShield rejected invalid candidate schedules because one or
                more mandatory rules or reserve limits could not be satisfied:
              </p>

              <ul className="list-disc pl-5 mt-3 text-sm text-rose-800 space-y-1.5">
                {optimizedPlan.infeasibilityReasons.map((reason, idx) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Cash flow chart */}
      {optimizedPlan.feasible && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow duration-300">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-slate-50/90 to-sky-50/50 px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                <h2 className="font-display text-base font-bold text-slate-900">
                  Before vs. After Cash Curve
                </h2>
              </div>

              <p className="mt-1.5 max-w-2xl text-xs text-slate-500 leading-relaxed">
                Dashed line shows unmitigated cash shortfall; solid green line
                preserves the {formatINR(datasetSummary.minimumReserve)} reserve
                on every day.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600">
                <span className="w-5 border-t-2 border-dashed border-slate-400" />
                Unmitigated
              </span>

              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-800">
                <span className="w-5 border-t-2 border-emerald-600" />
                Optimized Plan
              </span>
            </div>
          </div>

          <div className="p-3 sm:p-5">
            <CashFlowChart
              unmitigatedForecast={unmitigatedForecast}
              optimizedForecast={optimizedPlan.forecastAfterPlan}
              minimumReserve={datasetSummary.minimumReserve}
              showOptimized={true}
              height={280}
            />
          </div>
        </section>
      )}

      {/* Recommended action sequence */}
      <section className="space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-bold text-slate-900">
                Recommended Action Sequence
              </h2>

              <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-800">
                {recommendations.length} Actions
              </span>
            </div>

            <p className="text-xs text-slate-500 mt-1.5">
              Solved deterministically across{' '}
              {analysis.solverMetadata.nodesEvaluated.toLocaleString('en-IN')}{' '}
              decision states in {analysis.solverMetadata.executionMs} ms.
            </p>
          </div>

          {/* Action filters */}
          <div className="max-w-full overflow-x-auto pb-1">
            <div className="inline-flex min-w-max items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1">
              {ACTION_FILTERS.map((item) => {
                const active = filterAction === item.code;
                const count = getActionCount(item.code);

                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => setFilterAction(item.code)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-200 ${
                      active
                        ? 'bg-white text-sky-800 shadow-sm ring-1 ring-slate-200'
                        : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
                    }`}
                  >
                    {item.label}
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] tabular-nums ${
                        active
                          ? 'bg-sky-100 text-sky-800'
                          : 'bg-slate-200/80 text-slate-500'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Action cards */}
        {filteredRecs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-sm font-medium text-slate-700">
              No actions in this category.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Choose another action filter to see recommendations.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filteredRecs.map((rec) => (
              <article
                key={`${rec.entityId}-${rec.actionCode}`}
                className={`group relative overflow-hidden rounded-xl border border-slate-200 border-l-[3px] ${
                  ACTION_CARD_STYLES[rec.actionCode]
                } bg-white shadow-sm hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg transition-all duration-200`}
              >
                <div className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-400 tabular-nums">
                        {String(rec.priority).padStart(2, '0')}
                      </span>

                      <span
                        className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                          ACTION_BADGE_STYLES[rec.actionCode]
                        }`}
                      >
                        {rec.actionCode.replace('_', ' ')}
                      </span>
                    </div>

                    <span className="shrink-0 rounded-md bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">
                      {formatReadableDate(rec.recommendedDate, 'MMM dd, yyyy')}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <h3 className="font-display text-sm sm:text-base font-bold text-slate-900 leading-snug group-hover:text-sky-900 transition-colors">
                      {rec.entityName}
                    </h3>

                    <span className="shrink-0 font-mono text-base font-bold tabular-nums text-slate-900">
                      {formatINR(rec.amount)}
                    </span>
                  </div>

                  <p className="mt-2.5 text-xs sm:text-sm text-slate-600 leading-relaxed">
                    {rec.shortReason}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-600">
                      {rec.statusLabel}
                    </span>

                    <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] text-slate-600">
                      Est. cost:{' '}
                      <strong className="font-mono font-semibold text-slate-800">
                        {formatINR(rec.estimatedCost)}
                      </strong>
                    </span>

                    {rec.avoidedCost > 0 && (
                      <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] text-emerald-800">
                        Saves{' '}
                        <strong className="font-mono font-bold">
                          {formatINR(rec.avoidedCost)}
                        </strong>
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                      Decision details
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setWhyTarget(rec)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 active:scale-[0.97] transition-all duration-200"
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                        Why?
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setMathTarget({
                            math: rec.mathBreakdown,
                            title: rec.title,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800 active:scale-[0.97] shadow-sm hover:shadow-md transition-all duration-200"
                      >
                        <Calculator className="h-3.5 w-3.5" />
                        Show Math
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Feasibility and cost comparison */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div
          className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 ${
            optimizedPlan.feasible
              ? 'bg-gradient-to-r from-emerald-50 to-white'
              : 'bg-gradient-to-r from-rose-50 to-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`rounded-xl p-2.5 ${
                optimizedPlan.feasible ? 'bg-emerald-100' : 'bg-rose-100'
              }`}
            >
              {optimizedPlan.feasible ? (
                <ShieldCheck className="h-5 w-5 text-emerald-700" />
              ) : (
                <AlertOctagon className="h-5 w-5 text-rose-700" />
              )}
            </div>

            <div>
              <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
                {optimizedPlan.feasible
                  ? 'Plan Remains Feasible'
                  : 'Feasibility Check Failed'}
              </h2>

              <p className="mt-0.5 text-xs text-slate-500">
                {optimizedPlan.feasible
                  ? 'All required constraints have been verified.'
                  : 'One or more required constraints could not be satisfied.'}
              </p>
            </div>
          </div>

          <span className="inline-flex w-fit rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-slate-500">
            {optimizedPlan.validation.checkedConstraints.length} constraint
            classes checked
          </span>
        </div>

        <div className="p-4 sm:p-5">
          {/* Summary metrics */}
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="group rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                Minimum Cash After Plan
              </p>
              <p className="mt-2 font-mono text-xl font-bold tabular-nums text-emerald-800">
                {formatINR(optimizedPlan.minimumCashAfterPlan)}
              </p>
              <p className="mt-1 text-[11px] text-emerald-700">
                Target reserve: {formatINR(datasetSummary.minimumReserve)}
              </p>
            </div>

            <div className="group rounded-xl border border-sky-100 bg-sky-50/60 p-4 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">
                Optimized Estimated Cost
              </p>
              <p className="mt-2 font-mono text-xl font-bold tabular-nums text-slate-900">
                {formatINR(comparison.optimizedCost)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                End-of-horizon cash:{' '}
                {formatINR(optimizedPlan.endOfHorizonCash)}
              </p>
            </div>

            <div className="group rounded-xl border border-slate-200 bg-slate-50 p-4 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Greedy Baseline Plan Cost
              </p>
              <p className="mt-2 font-mono text-xl font-bold tabular-nums text-slate-800">
                {baselinePlan.feasible
                  ? formatINR(comparison.baselineCost)
                  : 'Infeasible'}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Same rules &amp; financing inputs
              </p>
            </div>

            <div className="group rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                <TrendingDown className="h-3.5 w-3.5" />
                Improvement vs. Baseline
              </p>
              <p className="mt-2 font-mono text-xl font-bold tabular-nums text-emerald-800">
                {formatINR(comparison.estimatedImprovement)}
              </p>
              <p className="mt-1 text-[11px] text-emerald-700">
                {comparison.improvementPct > 0
                  ? `${comparison.improvementPct}% lower estimated cost`
                  : 'Matches baseline optimum'}
              </p>
            </div>
          </div>

          {/* Tie-break note */}
          {optimizedPlan.tieBreakNotes.length > 0 && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 leading-relaxed">
              <span className="font-semibold text-slate-800">
                Deterministic tie-break note:
              </span>{' '}
              {optimizedPlan.tieBreakNotes[0]}
            </div>
          )}

          {/* Verified constraints */}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Verified Constraints
              </h3>
              <span className="text-[10px] text-slate-400">
                Post-optimization validation
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {optimizedPlan.validation.checkedConstraints.map((c, i) => (
                <div
                  key={i}
                  className="group flex items-start gap-2.5 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5 hover:border-emerald-200 hover:bg-emerald-50/50 transition-colors duration-200"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="text-xs leading-relaxed text-slate-600 group-hover:text-slate-800">
                    {c}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Existing explanation and calculation components */}
      <WhyModal
        recommendation={whyTarget}
        onClose={() => setWhyTarget(null)}
        onOpenMath={(rec) =>
          setMathTarget({
            math: rec.mathBreakdown,
            title: rec.title,
          })
        }
      />

      <ShowMathDrawer
        mathData={mathTarget?.math || null}
        title={mathTarget?.title}
        onClose={() => setMathTarget(null)}
      />
    </div>
  );
};
