import React, { useMemo, useState } from 'react';
import { Calculator, CheckCircle2, XCircle } from 'lucide-react';
import { ShowMathDrawer } from '../../components/ShowMathDrawer.tsx';
import type { ActionCostEvaluation, AnalysisResult, DatasetBundle } from '../../models/schemas.ts';
import { formatINR, formatReadableDate } from '../../utils/format.ts';

interface CostExplorerViewProps {
  dataset: DatasetBundle;
  analysis: AnalysisResult;
}

interface ExplorerRow {
  id: string;
  category: string;
  actionLabel: string;
  entityName: string;
  amount: number;
  estimatedCost: number;
  timing: string;
  feasible: boolean;
  feasibilityNote: string;
  isIllustrative: boolean;
  mathData: ActionCostEvaluation | null;
}

export const CostExplorerView: React.FC<CostExplorerViewProps> = ({ dataset, analysis }) => {
  const [selectedPayableId, setSelectedPayableId] = useState<string>(
    dataset.payables[0]?.payableId || ''
  );
  const [mathTarget, setMathTarget] = useState<{
    math: ActionCostEvaluation;
    title: string;
  } | null>(null);

  const selectedPayable = useMemo(
    () => dataset.payables.find((p) => p.payableId === selectedPayableId) || dataset.payables[0],
    [dataset.payables, selectedPayableId]
  );

  const selectedAudit = useMemo(
    () => analysis.payableRulesAudit.find((a) => a.payableId === selectedPayable?.payableId),
    [analysis.payableRulesAudit, selectedPayable]
  );

  const comparisonRows = useMemo<ExplorerRow[]>(() => {
    if (!selectedPayable || !selectedAudit) return [];
    const rows: ExplorerRow[] = [];
    const isProtected =
      selectedPayable.mandatoryPayment ||
      selectedPayable.criticalSupplier ||
      dataset.businessProfile.criticalSupplierIds.includes(selectedPayable.payableId) ||
      dataset.businessProfile.mandatoryCategories.includes(selectedPayable.category);

    // 1. Payable settlement options
    for (const opt of selectedAudit.costOptions) {
      const label =
        opt.actionType === 'capture_discount'
          ? `Pay early (capture ${selectedPayable.discountPct}% discount)`
          : opt.actionType === 'pay_on_time'
          ? 'Pay on original due date'
          : `Delay supplier by ${opt.delayDays} days`;

      const delayDisallowed = opt.actionType === 'delay_payable' && isProtected;

      rows.push({
        id: `${opt.entityId}-${opt.actionType}-${opt.delayDays}`,
        category: 'Payable Timing',
        actionLabel: label,
        entityName: selectedPayable.supplierName,
        amount: opt.amount,
        estimatedCost: opt.totalEstimatedCost,
        timing: formatReadableDate(opt.executionDate, 'MMM dd, yyyy'),
        feasible: !delayDisallowed,
        feasibilityNote: delayDisallowed
          ? 'Infeasible: mandatory/critical supplier protection forbids deferral'
          : opt.avoidedCostOrDiscountSavings > 0
          ? `Saves ${formatINR(opt.avoidedCostOrDiscountSavings)} discount`
          : 'Permitted within horizon constraints',
        isIllustrative: false,
        mathData: opt,
      });
    }

    // 2. Comparable Receivable Acceleration options
    for (const rAudit of analysis.receivableAudit) {
      if (!rAudit.eligibleForFinancing || !rAudit.accelerationEvaluation) continue;
      rows.push({
        id: `REC-${rAudit.receivableId}`,
        category: 'Receivable Acceleration',
        actionLabel: `Accelerate receivable (${rAudit.customerName})`,
        entityName: rAudit.customerName,
        amount: rAudit.amount,
        estimatedCost: rAudit.accelerationEvaluation.totalEstimatedCost,
        timing: `T+2 (${formatReadableDate(rAudit.accelerationEvaluation.executionDate, 'MMM dd')})`,
        feasible: true,
        feasibilityNote: 'Eligible non-overdue anchor invoice (illustrative rate)',
        isIllustrative: true,
        mathData: rAudit.accelerationEvaluation,
      });
    }

    // 3. Illustrative Credit Drawdowns sized to selectedPayable.amount (up to facility cap)
    const sampleDuration = 15;
    for (const fin of dataset.financingOptions) {
      if (fin.requiresEligibleReceivable) continue;
      const needed = selectedPayable.amount;
      const feasible = fin.availableAmount >= needed && fin.maxDurationDays >= sampleDuration;
      const usedAmount = Math.min(needed, fin.availableAmount);
      const estInterest = Math.round(
        (usedAmount * (fin.annualRatePct / 100) * sampleDuration) / 365
      );
      const totalCost = estInterest + (usedAmount > 0 ? fin.fixedFee : 0);

      rows.push({
        id: `FIN-${fin.optionId}`,
        category: 'Credit Bridge (15d benchmark)',
        actionLabel: `Draw ${fin.name}`,
        entityName: fin.name,
        amount: usedAmount,
        estimatedCost: totalCost,
        timing: `${sampleDuration} days`,
        feasible,
        feasibilityNote: feasible
          ? `Within ${formatINR(fin.availableAmount)} limit`
          : `Infeasible: limit (${formatINR(fin.availableAmount)}) < ${formatINR(needed)}`,
        isIllustrative: true,
        mathData: {
          actionType: 'draw_financing',
          entityId: fin.optionId,
          entityName: fin.name,
          amount: usedAmount,
          delayDays: sampleDuration,
          executionDate: dataset.businessProfile.analysisDate,
          totalEstimatedCost: totalCost,
          avoidedCostOrDiscountSavings: 0,
          components: [
            {
              type: 'financing_interest',
              label: `${fin.name} Interest (${sampleDuration}d)`,
              amount: estInterest,
              formula: `₹${usedAmount.toLocaleString('en-IN')} × ${fin.annualRatePct}% × (${sampleDuration} / 365)`,
              inputs: { usedAmount, ratePct: fin.annualRatePct, days: sampleDuration },
              isIllustrativeEstimate: true,
            },
            ...(fin.fixedFee > 0
              ? [
                  {
                    type: 'financing_fixed_fee' as const,
                    label: 'Illustrative Drawdown Fee',
                    amount: fin.fixedFee,
                    formula: `Fixed fee ₹${fin.fixedFee.toLocaleString('en-IN')}`,
                    inputs: { fixedFee: fin.fixedFee },
                    isIllustrativeEstimate: true,
                  },
                ]
              : []),
          ],
          assumptions: fin.assumptions,
          ruleReferences: [],
          dataSource: fin.sourceMetadata,
        },
      });
    }

    return rows;
  }, [selectedPayable, selectedAudit, analysis.receivableAudit, dataset]);

  const cheapestFeasibleCost = useMemo(() => {
    const feasibleNonZero = comparisonRows.filter((r) => r.feasible && r.category !== 'Payable Timing');
    const feasibleDelays = comparisonRows.filter(
      (r) => r.feasible && r.actionLabel.startsWith('Delay')
    );
    const pool = [...feasibleNonZero, ...feasibleDelays];
    if (pool.length === 0) return null;
    return Math.min(...pool.map((r) => r.estimatedCost));
  }, [comparisonRows]);

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-semibold text-lg text-slate-900">
            Action Cost Explorer
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Compare delaying a payable against accelerating a receivable or drawing short-term
            illustrative financing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="payable-select" className="text-xs font-medium text-slate-600 whitespace-nowrap">
            Benchmark Payable:
          </label>
          <select
            id="payable-select"
            value={selectedPayable?.payableId || ''}
            onChange={(e) => setSelectedPayableId(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {dataset.payables.map((p) => (
              <option key={p.payableId} value={p.payableId}>
                {p.supplierName} ({formatINR(p.amount)})
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Alternative Action</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-right">Estimated Cost</th>
                <th className="py-3 px-4">Timing</th>
                <th className="py-3 px-4">Constraint Feasibility</th>
                <th className="py-3 px-4 text-right">Math</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {comparisonRows.map((row) => {
                const isLowestFeasibleLiquidity =
                  row.feasible &&
                  cheapestFeasibleCost !== null &&
                  row.estimatedCost === cheapestFeasibleCost &&
                  !row.actionLabel.startsWith('Pay');

                return (
                  <tr
                    key={row.id}
                    className={
                      !row.feasible
                        ? 'bg-slate-50/50 text-slate-400'
                        : isLowestFeasibleLiquidity
                        ? 'bg-emerald-50/50'
                        : 'hover:bg-slate-50/70'
                    }
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 flex items-center gap-2">
                        <span>{row.actionLabel}</span>
                        {isLowestFeasibleLiquidity && (
                          <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                            Lowest Feasible Liquidity Cost
                          </span>
                        )}
                      </div>
                      {row.isIllustrative && (
                        <div className="text-[11px] text-amber-700 mt-0.5">
                          Illustrative assumption / demo input
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">{row.category}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                      {formatINR(row.amount)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                      {formatINR(row.estimatedCost)}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-700 whitespace-nowrap">
                      {row.timing}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      {row.feasible ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>{row.feasibilityNote}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-700">
                          <XCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{row.feasibilityNote}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {row.mathData && (
                        <button
                          type="button"
                          onClick={() =>
                            setMathTarget({ math: row.mathData!, title: row.actionLabel })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                        >
                          <Calculator className="w-3.5 h-3.5" />
                          <span>Show Math</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <ShowMathDrawer
        mathData={mathTarget?.math || null}
        title={mathTarget?.title}
        onClose={() => setMathTarget(null)}
      />
    </div>
  );
};
