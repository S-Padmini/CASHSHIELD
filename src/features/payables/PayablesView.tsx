
import React, { useMemo, useState } from 'react';
import { ShowMathDrawer } from '../../components/ShowMathDrawer.tsx';
import type {
  ActionCostEvaluation,
  AnalysisResult,
  DatasetBundle,
} from '../../models/schemas.ts';
import { formatINR, formatReadableDate } from '../../utils/format.ts';

interface PayablesViewProps {
  dataset: DatasetBundle;
  analysis: AnalysisResult;
}

export const PayablesView: React.FC<PayablesViewProps> = ({
  dataset,
  analysis,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'mse' | 'protected'>('all');
  const [selectedPayableId, setSelectedPayableId] = useState<string | null>(
    null
  );

  const [mathTarget, setMathTarget] = useState<{
    math: ActionCostEvaluation;
    title: string;
  } | null>(null);

  const recMap = useMemo(
    () =>
      new Map(
        analysis.optimizedPlan.recommendations.map((r) => [r.entityId, r])
      ),
    [analysis]
  );

  const auditMap = useMemo(
    () =>
      new Map(
        analysis.payableRulesAudit.map((a) => [a.payableId, a])
      ),
    [analysis]
  );

  const isProtected = (payable: (typeof dataset.payables)[number]) =>
    payable.mandatoryPayment ||
    payable.criticalSupplier ||
    dataset.businessProfile.criticalSupplierIds.includes(
      payable.payableId
    ) ||
    dataset.businessProfile.mandatoryCategories.includes(
      payable.category
    );

  const mseEligibleCount = dataset.payables.filter(
    (p) => p.mseEligibility === 'eligible'
  ).length;

  const protectedCount = dataset.payables.filter(isProtected).length;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return dataset.payables.filter((p) => {
      const matchesSearch =
        !query ||
        p.supplierName.toLowerCase().includes(query) ||
        p.invoiceNumber.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query);

      if (!matchesSearch) return false;

      if (filter === 'mse') {
        return p.mseEligibility === 'eligible';
      }

      if (filter === 'protected') {
        return isProtected(p);
      }

      return true;
    });
  }, [dataset, search, filter]);

  const selectedPayable = dataset.payables.find(
    (p) => p.payableId === selectedPayableId
  );

  const selectedRecommendation = selectedPayable
    ? recMap.get(selectedPayable.payableId)
    : undefined;

  const selectedAudit = selectedPayable
    ? auditMap.get(selectedPayable.payableId)
    : undefined;

  const selectedMsmedRule = selectedAudit?.rules.find(
    (r) => r.ruleId === 'RULE_MSMED_DELAY'
  );

  const selectedDiscountRule = selectedAudit?.rules.find(
    (r) => r.ruleId === 'RULE_EARLY_DISCOUNT'
  );

  return (
    <div className="space-y-5">
      {/* Page heading */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="font-display font-semibold text-lg text-slate-900">
              Payables &amp; Rule Eligibility
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {dataset.payables.length} supplier obligations · Total{' '}
              {formatINR(analysis.datasetSummary.totalPayables)}
            </p>
          </div>

          <div className="w-full sm:w-auto">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search supplier or invoice..."
              aria-label="Search payables"
              className="w-full sm:w-64 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-100 focus:border-sky-400 transition"
            />
          </div>
        </div>
      </div>

      {/* Payables register */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-100">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Payables Register
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Review supplier obligations and payment details.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  {
                    id: 'all',
                    label: `All ${dataset.payables.length}`,
                  },
                  {
                    id: 'mse',
                    label: `MSE Eligible ${mseEligibleCount}`,
                  },
                  {
                    id: 'protected',
                    label: `Protected ${protectedCount}`,
                  },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                    filter === item.id
                      ? 'bg-sky-50 border-sky-200 text-sky-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3.5 px-4 sm:px-5">
                  Supplier / Invoice
                </th>
                <th className="py-3.5 px-4 whitespace-nowrap">
                  Due Date
                </th>
                <th className="py-3.5 px-4 text-right">
                  Amount
                </th>
                <th className="py-3.5 px-4 text-right">
                  Inspect
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="py-12 px-4 text-center text-sm text-slate-500"
                  >
                    No payables match your search or selected filter.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr
                    key={p.payableId}
                    className="hover:bg-sky-50/40 transition-colors"
                  >
                    <td className="py-3.5 px-4 sm:px-5">
                      <div className="font-medium text-sm text-slate-900">
                        {p.supplierName}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        <span className="font-mono">
                          {p.invoiceNumber}
                        </span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        {p.category}
                        {isProtected(p) && (
                          <span className="ml-2 text-sky-700 font-medium">
                            · Protected
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-sm text-slate-600 whitespace-nowrap">
                      {formatReadableDate(p.dueDate, 'MMM dd, yyyy')}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <span className="font-semibold text-sm text-slate-900 whitespace-nowrap">
                        {formatINR(p.amount)}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedPayableId(p.payableId)
                        }
                        className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-sky-800 bg-sky-50 border border-sky-200 hover:bg-sky-100 hover:border-sky-300 transition-colors"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 sm:px-5 py-3 border-t border-slate-100 bg-slate-50/60">
          <p className="text-xs text-slate-500">
            Showing {filtered.length} of {dataset.payables.length} supplier
            obligations
          </p>
        </div>
      </div>

      {/* Selected payable details */}
      {selectedPayable && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3 sm:p-5"
          onClick={() => setSelectedPayableId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="payable-detail-title"
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-4 flex items-start justify-between gap-4">
              <div>
                <h2
                  id="payable-detail-title"
                  className="text-base font-semibold text-slate-900"
                >
                  Payable Details
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {selectedPayable.supplierName} ·{' '}
                  {selectedPayable.invoiceNumber}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedPayableId(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Supplier and invoice information */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                  Supplier &amp; Invoice Information
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                    <p className="text-xs text-slate-500">Supplier</p>
                    <p className="text-sm font-semibold text-slate-900 mt-1">
                      {selectedPayable.supplierName}
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                    <p className="text-xs text-slate-500">Invoice Number</p>
                    <p className="text-sm font-semibold text-slate-900 mt-1">
                      {selectedPayable.invoiceNumber}
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                    <p className="text-xs text-slate-500">Category</p>
                    <p className="text-sm font-medium text-slate-900 mt-1">
                      {selectedPayable.category}
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                    <p className="text-xs text-slate-500">Supplier Size</p>
                    <p className="text-sm font-medium text-slate-900 mt-1">
                      {selectedPayable.supplierSize || 'Not specified'}
                    </p>
                  </div>
                </div>
              </section>

              {/* Payment information */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                  Payment Information
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg bg-sky-50/70 border border-sky-100 p-3">
                    <p className="text-xs text-slate-500">Invoice Amount</p>
                    <p className="text-lg font-semibold text-slate-900 mt-1">
                      {formatINR(selectedPayable.amount)}
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                    <p className="text-xs text-slate-500">Due Date</p>
                    <p className="text-sm font-semibold text-slate-900 mt-1">
                      {formatReadableDate(
                        selectedPayable.dueDate,
                        'MMM dd, yyyy'
                      )}
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                    <p className="text-xs text-slate-500">MSE Eligibility</p>
                    <p className="text-sm font-medium text-slate-900 mt-1">
                      {selectedPayable.mseEligibility === 'eligible'
                        ? `Eligible (${selectedPayable.supplierSize})`
                        : selectedPayable.mseEligibility === 'unknown'
                          ? 'Needs verification'
                          : `Not eligible (${selectedPayable.supplierSize})`}
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                    <p className="text-xs text-slate-500">Payment Priority</p>
                    <p className="text-sm font-medium text-slate-900 mt-1">
                      {isProtected(selectedPayable)
                        ? selectedPayable.mandatoryPayment
                          ? 'Mandatory payment'
                          : 'Protected / Critical supplier'
                        : 'Standard payment'}
                    </p>
                  </div>
                </div>
              </section>

              {/* Rule eligibility */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                  Rule Eligibility
                </h3>

                <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-800">
                        MSMED payment rule
                      </p>
                      <span
                        className={`text-xs font-semibold ${
                          selectedMsmedRule?.status === 'unknown'
                            ? 'text-amber-700'
                            : selectedPayable.mseEligibility === 'eligible'
                              ? 'text-emerald-700'
                              : 'text-slate-600'
                        }`}
                      >
                        {selectedMsmedRule?.status === 'unknown'
                          ? 'Needs verification'
                          : selectedPayable.mseEligibility === 'eligible'
                            ? 'Eligible'
                            : selectedPayable.mseEligibility === 'unknown'
                              ? 'Unknown'
                              : 'Not eligible'}
                      </span>
                    </div>

                    {selectedMsmedRule?.statutoryDeadlineDate && (
                      <p className="text-xs text-slate-500 mt-1">
                        Statutory deadline:{' '}
                        {formatReadableDate(
                          selectedMsmedRule.statutoryDeadlineDate,
                          'MMM dd, yyyy'
                        )}
                      </p>
                    )}

                    {selectedMsmedRule?.status === 'unknown' && (
                      <p className="text-xs text-slate-500 mt-1">
                        Verify acceptance date and written payment terms.
                      </p>
                    )}
                  </div>

                  <div className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-800">
                        Early payment discount
                      </p>
                      <span className="text-xs font-semibold text-slate-700">
                        {selectedDiscountRule?.status === 'available'
                          ? 'Available'
                          : selectedDiscountRule?.status === 'expired'
                            ? 'Expired'
                            : 'Not available'}
                      </span>
                    </div>

                    {selectedDiscountRule?.status === 'available' && (
                      <p className="text-xs text-slate-500 mt-1">
                        {selectedPayable.discountPct}% discount by{' '}
                        {formatReadableDate(
                          selectedPayable.discountDeadline,
                          'MMM dd, yyyy'
                        )}
                      </p>
                    )}

                    {selectedDiscountRule?.status === 'expired' && (
                      <p className="text-xs text-slate-500 mt-1">
                        Discount deadline:{' '}
                        {formatReadableDate(
                          selectedPayable.discountDeadline,
                          'MMM dd, yyyy'
                        )}
                      </p>
                    )}
                  </div>

                  <div className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-800">
                        Contractual late fee
                      </p>
                      <span className="text-xs font-semibold text-slate-700">
                        {selectedPayable.contractHasLateFeeClause
                          ? 'Applicable'
                          : 'Not specified'}
                      </span>
                    </div>

                    {selectedPayable.contractHasLateFeeClause &&
                      selectedPayable.contractualLateRatePct && (
                        <p className="text-xs text-slate-500 mt-1">
                          Contract late fee:{' '}
                          {selectedPayable.contractualLateRatePct}% p.a.
                        </p>
                      )}
                  </div>
                </div>
              </section>

              {/* Engine recommendation */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                  Engine Decision
                </h3>

                {selectedRecommendation ? (
                  <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-4">
                    <p className="text-sm font-semibold text-slate-900">
                      {selectedRecommendation.actionCode.replace(/_/g, ' ')}
                    </p>

                    <p className="text-xs text-slate-600 mt-2">
                      {selectedRecommendation.title}
                    </p>

                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div>
                        <p className="text-xs text-slate-500">
                          Recommended Date
                        </p>
                        <p className="text-sm font-medium text-slate-800 mt-1">
                          {formatReadableDate(
                            selectedRecommendation.recommendedDate,
                            'MMM dd, yyyy'
                          )}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-500">
                          Estimated Cost
                        </p>
                        <p className="text-sm font-semibold text-slate-900 mt-1">
                          {formatINR(selectedRecommendation.estimatedCost)}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setMathTarget({
                          math: selectedRecommendation.mathBreakdown,
                          title: selectedRecommendation.title,
                        })
                      }
                      className="mt-4 px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-800 bg-white border border-sky-200 hover:bg-sky-50 transition-colors"
                    >
                      Show calculation
                    </button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-700">
                      No specific engine recommendation available.
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      This payable remains under its existing schedule.
                    </p>
                  </div>
                )}
              </section>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-3 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedPayableId(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Close details
              </button>
            </div>
          </div>
        </div>
      )}

      <ShowMathDrawer
        mathData={mathTarget?.math || null}
        title={mathTarget?.title}
        onClose={() => setMathTarget(null)}
      />
    </div>
  );
};
