
import React from 'react';
import { Database, ShieldCheck, Scale, Landmark, BookOpen } from 'lucide-react';
import type { AnalysisResult, DatasetBundle } from '../../models/schemas.ts';
import { formatINR } from '../../utils/format.ts';

interface EvidenceViewProps {
  dataset: DatasetBundle;
  analysis: AnalysisResult;
}

export const EvidenceView: React.FC<EvidenceViewProps> = ({
  dataset,
  analysis,
}) => {
  const { businessProfile, financingOptions, paymentTerms } = dataset;
  const { ruleConfig } = businessProfile;

  return (
    <div className="space-y-5 pb-6">
      {/* Page heading */}
      <section className="relative overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-white via-white to-sky-50/80 p-5 sm:p-6 shadow-sm">
        <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-sky-100/60 blur-3xl pointer-events-none" />

        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <span className="h-2 w-2 rounded-full bg-sky-500" />
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Decision Auditability
            </span>
          </div>

          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Rules, Assumptions &amp; Evidence
          </h1>

          <p className="mt-2 text-xs sm:text-sm text-slate-600 max-w-3xl leading-relaxed">
            Trace each recommendation from its estimated cost and formula
            back to the configured rule and imported input.
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            {['Recommendation', 'Estimated Cost', 'Formula', 'Rule Version', 'Imported Input'].map(
              (item, index) => (
                <React.Fragment key={item}>
                  <span className="rounded-lg border border-sky-100 bg-white/90 px-2.5 py-1.5 text-[10px] font-semibold text-sky-800 shadow-sm">
                    {item}
                  </span>
                  {index < 4 && (
                    <span className="text-slate-300 text-xs">→</span>
                  )}
                </React.Fragment>
              )
            )}
          </div>
        </div>
      </section>

      {/* Regulatory rules and assumptions */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              Payment &amp; Regulatory Rules
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Configured statutory inputs and solver settings
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold text-slate-600">
            2 Configurations
          </span>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {/* MSMED rule */}
          <article className="group rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md transition-all duration-200">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="rounded-lg bg-sky-50 p-2">
                  <Scale className="w-4 h-4 text-sky-700" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    MSMED Delayed-Payment Rule
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {ruleConfig.msmedRuleVersion}
                  </p>
                </div>
              </div>

              <span className="shrink-0 rounded-md bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-800">
                Active
              </span>
            </div>

            <div className="mt-4 rounded-xl bg-gradient-to-r from-sky-50 to-white border border-sky-100 p-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Configured Interest Rate
                  </p>
                  <p className="font-mono text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                    {ruleConfig.msmedAnnualInterestRatePct}%
                    <span className="text-xs font-medium text-slate-500 ml-1">
                      p.a.
                    </span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-500">Effective date</p>
                  <p className="text-xs font-semibold text-slate-700 mt-1">
                    {ruleConfig.msmedEffectiveDate}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-slate-600 mt-2">
                {ruleConfig.msmedMultiplier} × RBI Bank Rate of{' '}
                {ruleConfig.msmedRbiBankRateAssumptionPct}%
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                <p className="text-[10px] text-slate-500">Written agreement</p>
                <p className="text-sm font-bold text-slate-900 mt-1">
                  Up to {ruleConfig.msmedMaxWrittenAgreementDays} days
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                <p className="text-[10px] text-slate-500">No written agreement</p>
                <p className="text-sm font-bold text-slate-900 mt-1">
                  After {ruleConfig.msmedDefaultNoAgreementDays} days
                </p>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-amber-900">
                Eligibility handling
              </p>
              <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                Unknown MSE suppliers remain marked as “Eligibility unknown”;
                they are never automatically assumed eligible.
              </p>
            </div>

            <details className="mt-3 group/details">
              <summary className="cursor-pointer list-none flex items-center justify-between text-[11px] font-semibold text-sky-800 hover:text-sky-950">
                Regulatory reference
                <span className="text-slate-400 group-open/details:rotate-180 transition-transform">
                  ⌄
                </span>
              </summary>
              <p className="mt-2 rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600 leading-relaxed">
                India Code: MSMED Act Sections 2(b), 15, 16 and 23.
                RBI Bank Rate snapshot: 5.75% as of 20 Nov 2026.
              </p>
            </details>
          </article>

          {/* Tax and solver */}
          <article className="group rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md transition-all duration-200">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="rounded-lg bg-violet-50 p-2">
                  <ShieldCheck className="w-4 h-4 text-violet-700" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Tax Timing &amp; Solver Assumptions
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {businessProfile.taxYear}
                  </p>
                </div>
              </div>

              <span
                className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold ${
                  ruleConfig.taxTimingEstimateEnabled
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {ruleConfig.taxTimingEstimateEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                Tax timing reference
              </p>
              <p className="text-sm font-semibold text-slate-900 mt-1">
                Income-tax Act, 2025
              </p>
              <p className="text-xs text-slate-600 mt-1">
                Section 37(2)(g) · Advisory note only
              </p>
            </div>

            <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/70 p-3">
              <p className="text-[11px] font-semibold text-amber-900">
                Professional verification required
              </p>
              <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                Tax amounts are not quantified. Verify the applicable
                Section 37(2)(g) treatment with a tax professional.
              </p>
            </div>

            <div className="mt-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Optimization method
              </p>
              <p className="text-xs font-medium text-slate-800 mt-1.5 leading-relaxed">
                {analysis.solverMetadata.method}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                <p className="text-[10px] text-slate-500">States evaluated</p>
                <p className="font-mono text-lg font-bold text-slate-900 mt-1">
                  {analysis.solverMetadata.nodesEvaluated.toLocaleString('en-IN')}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                <p className="text-[10px] text-slate-500">Execution time</p>
                <p className="font-mono text-lg font-bold text-slate-900 mt-1">
                  {analysis.solverMetadata.executionMs}
                  <span className="text-xs font-medium text-slate-500 ml-1">ms</span>
                </p>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* Financing alternatives */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 sm:px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-sky-50 p-2">
              <Landmark className="w-4 h-4 text-sky-700" />
            </div>
            <div>
              <h2 className="font-display text-sm font-bold text-slate-900">
                Financing Alternatives
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Configured facility limits and cost assumptions
              </p>
            </div>
          </div>

          <span className="w-fit rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-semibold text-amber-800">
            Illustrative demo inputs · Not live quotes
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Facility</th>
                <th className="px-4 py-3 text-right">Available Limit</th>
                <th className="px-4 py-3 text-right">Annual Rate</th>
                <th className="px-4 py-3 text-right">Fixed Fee</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {financingOptions.map((f) => (
                <tr
                  key={f.optionId}
                  className="group hover:bg-sky-50/50 transition-colors duration-150"
                >
                  <td className="px-4 py-3.5">
                    <p className="text-xs font-semibold text-slate-900">
                      {f.name}
                    </p>
                    <p className="font-mono text-[10px] text-slate-400 mt-1">
                      {f.optionId} · Max {f.maxDurationDays} days
                    </p>
                  </td>

                  <td className="px-4 py-3.5 text-right">
                    <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                      {formatINR(f.availableAmount)}
                    </span>
                  </td>

                  <td className="px-4 py-3.5 text-right">
                    <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums">
                      {f.annualRatePct}%
                    </span>
                    <span className="text-[10px] text-slate-400 ml-1">p.a.</span>
                  </td>

                  <td className="px-4 py-3.5 text-right">
                    <span className="font-mono text-xs text-slate-700 tabular-nums">
                      {formatINR(f.fixedFee)}
                    </span>
                  </td>

                  <td className="px-4 py-3.5">
                    <details className="group/details">
                      <summary className="list-none cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-sky-800 hover:bg-sky-50 hover:border-sky-200 transition-colors">
                        View assumptions
                        <span className="text-slate-400 group-open/details:rotate-180 transition-transform">
                          ⌄
                        </span>
                      </summary>

                      <div className="mt-2 min-w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                          Assumptions
                        </p>
                        <ul className="space-y-1.5">
                          {f.assumptions.map((assumption, index) => (
                            <li
                              key={index}
                              className="text-[11px] leading-relaxed text-slate-600"
                            >
                              <span className="text-sky-600 mr-1.5">•</span>
                              {assumption}
                            </li>
                          ))}
                        </ul>
                        <div className="mt-3 border-t border-slate-100 pt-2">
                          <p className="text-[10px] text-slate-400">
                            Source: {f.sourceMetadata}
                          </p>
                        </div>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-2.5">
          <p className="text-[10px] text-slate-500">
            All facility rates, limits and fees are configurable demonstration
            assumptions, not confirmed financing offers.
          </p>
        </div>
      </section>

      {/* Contractual payment terms */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 sm:px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-indigo-50 p-2">
              <BookOpen className="w-4 h-4 text-indigo-700" />
            </div>
            <div>
              <h2 className="font-display text-sm font-bold text-slate-900">
                Contractual Payment Terms
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Imported supplier and customer agreements
              </p>
            </div>
          </div>

          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
            {paymentTerms.length} Records
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Party</th>
                <th className="px-4 py-3">Credit Terms</th>
                <th className="px-4 py-3">Early Discount</th>
                <th className="px-4 py-3">Late Fee</th>
                <th className="px-4 py-3">Source Document</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {paymentTerms.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center">
                    <p className="text-sm font-medium text-slate-700">
                      No payment-term records found
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Imported contractual records will appear here.
                    </p>
                  </td>
                </tr>
              ) : (
                paymentTerms.map((t) => (
                  <tr
                    key={t.termId}
                    className="hover:bg-sky-50/50 transition-colors duration-150"
                  >
                    <td className="px-4 py-3.5">
                      <p className="text-xs font-semibold text-slate-900">
                        {t.partyName}
                      </p>
                      <span className="inline-block mt-1 rounded-md bg-slate-100 px-2 py-0.5 text-[9px] font-medium uppercase text-slate-500">
                        {t.partyType}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <p className="text-xs font-semibold text-slate-800">
                        {t.standardCreditDays} days
                      </p>
                      <span
                        className={`inline-block mt-1 rounded-md px-2 py-0.5 text-[9px] font-semibold ${
                          t.writtenAgreementPresent
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {t.writtenAgreementPresent ? 'Written' : 'Oral'}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-xs text-slate-600 leading-relaxed max-w-56">
                      {t.earlyDiscountTerms}
                    </td>

                    <td className="px-4 py-3.5 text-xs text-slate-600 leading-relaxed max-w-56">
                      {t.lateFeeClause}
                    </td>

                    <td className="px-4 py-3.5 text-[11px] text-slate-500">
                      {t.sourceDocument}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Active dataset */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-sky-50 p-2.5">
              <Database className="w-4 h-4 text-sky-700" />
            </div>

            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Active Dataset
              </p>
              <p className="text-sm font-bold text-slate-900 mt-1">
                {businessProfile.businessName}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {businessProfile.isSyntheticDemo
                  ? 'Synthetic Hackathon Demo'
                  : 'User Imported Dataset'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:min-w-[420px]">
            {[
              { label: 'Payables', value: dataset.payables.length },
              { label: 'Receivables', value: dataset.receivables.length },
              { label: 'Cash Txns', value: dataset.cashTransactions.length },
              { label: 'Facilities', value: dataset.financingOptions.length },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-center hover:bg-sky-50 hover:border-sky-100 transition-colors"
              >
                <p className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                  {item.value}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {item.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-[10px] leading-relaxed text-slate-500">
          CashShield provides decision-support estimates for planning purposes.
          Regulatory, tax, financing and contractual outcomes depend on the
          applicable facts, terms and effective rules. Verify material
          decisions with qualified professionals.
        </p>
      </div>
    </div>
  );
};
