import React, { useMemo, useState } from 'react';
import { Check, Copy, Mail, Search } from 'lucide-react';
import type { AnalysisResult, DatasetBundle, Receivable } from '../../models/schemas.ts';
import { generateCollectionDraftApi } from '../../services/apiClient.ts';
import { formatINR, formatReadableDate } from '../../utils/format.ts';

interface ReceivablesViewProps {
  dataset: DatasetBundle;
  analysis: AnalysisResult;
}

export const ReceivablesView: React.FC<ReceivablesViewProps> = ({ dataset, analysis }) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'overdue' | 'eligible'>('all');

  // Collection Message Generator state (Section 26)
  const [selectedOverdue, setSelectedOverdue] = useState<Receivable | null>(null);
  const [drafts, setDrafts] = useState<{
    email: string;
    whatsapp: string;
    hinglish: string;
  } | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const auditMap = useMemo(
    () => new Map(analysis.receivableAudit.map((a) => [a.receivableId, a])),
    [analysis]
  );

  const recMap = useMemo(
    () => new Map(analysis.optimizedPlan.recommendations.map((r) => [r.entityId, r])),
    [analysis]
  );

  const filtered = useMemo(() => {
    return dataset.receivables.filter((r) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        r.customerName.toLowerCase().includes(q) ||
        r.invoiceNumber.toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (filter === 'overdue') return r.overdueDays > 0;
      if (filter === 'eligible') return r.eligibleForFinancing && r.overdueDays === 0;
      return true;
    });
  }, [dataset.receivables, search, filter]);

  const handleGenerateDrafts = async (rec: Receivable) => {
    setSelectedOverdue(rec);
    setDraftLoading(true);
    setDrafts(null);
    setDraftNote(null);
    try {
      const res = await generateCollectionDraftApi(rec, dataset.businessProfile.businessName);
      if (res.drafts) {
        setDrafts(res.drafts);
      }
      if (!res.aiAvailable && res.error) {
        setDraftNote(res.error);
      }
    } catch (err) {
      setDraftNote(err instanceof Error ? err.message : 'Unable to generate drafts.');
    } finally {
      setDraftLoading(false);
    }
  };

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-semibold text-lg text-slate-900">
            Receivables &amp; Acceleration Eligibility
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {dataset.receivables.length} customer invoices · Total{' '}
            {formatINR(analysis.datasetSummary.totalReceivables)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer or invoice..."
              aria-label="Search receivables"
              className="pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'eligible', label: 'Financing Eligible' },
                { id: 'overdue', label: 'Overdue' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilter(t.id)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  filter === t.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Customer / Invoice</th>
                <th className="py-3 px-4">Due / Expected</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4">Financing Eligibility</th>
                <th className="py-3 px-4">Optimizer Action</th>
                <th className="py-3 px-4 text-right">Follow-Up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    No receivables match the current filter.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const audit = auditMap.get(r.receivableId);
                  const rec = recMap.get(r.receivableId);
                  const isOverdue = r.overdueDays > 0;

                  return (
                    <tr key={r.receivableId} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{r.customerName}</div>
                        <div className="text-xs text-slate-500 font-mono">
                          {r.invoiceNumber}
                          {isOverdue && (
                            <span className="text-red-700 font-sans font-semibold">
                              {' '}
                              · {r.overdueDays}d overdue
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        <div>Due: {formatReadableDate(r.dueDate, 'MMM dd')}</div>
                        <div className="text-slate-500">
                          Exp: {formatReadableDate(r.expectedPaymentDate, 'MMM dd')}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                        {formatINR(r.amount)}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {audit?.eligibleForFinancing ? (
                          <div>
                            <span className="font-semibold text-emerald-700">
                              Eligible ({r.financingRatePct}% p.a. illustrative)
                            </span>
                            {audit.accelerationEvaluation && (
                              <div className="text-slate-500 font-mono">
                                Est. accel cost:{' '}
                                {formatINR(audit.accelerationEvaluation.totalEstimatedCost)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500">{audit?.eligibilityReason}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {rec ? (
                          <div>
                            <span className="font-semibold text-blue-800">ACCELERATE</span>
                            <div className="text-slate-500 font-mono">
                              Settlement {formatReadableDate(rec.recommendedDate, 'MMM dd')}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500">Wait for expected receipt</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isOverdue ? (
                          <button
                            type="button"
                            onClick={() => handleGenerateDrafts(r)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-slate-300 text-slate-800 hover:bg-slate-100 whitespace-nowrap"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            <span>Draft Reminder</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">On schedule</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Collection Message Generator Panel */}
      {selectedOverdue && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-200">
            <div>
              <div className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
                Draft Requiring Human Review · Verified Invoice Figures Only
              </div>
              <h2 className="font-display font-semibold text-base text-slate-900 mt-0.5">
                Collection Follow-Up Drafts — {selectedOverdue.customerName} (
                {selectedOverdue.invoiceNumber} · {formatINR(selectedOverdue.amount)})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setSelectedOverdue(null)}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 self-start"
            >
              Close
            </button>
          </div>

          {draftNote && <p className="text-xs text-slate-600">{draftNote}</p>}

          {draftLoading ? (
            <div className="py-8 text-center text-sm text-slate-500">
              Generating polite reminder drafts from verified invoice data...
            </div>
          ) : (
            drafts && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {(
                  [
                    { key: 'email', label: 'Professional Email', content: drafts.email },
                    { key: 'whatsapp', label: 'Concise WhatsApp', content: drafts.whatsapp },
                    { key: 'hinglish', label: 'Hinglish Draft', content: drafts.hinglish },
                  ] as const
                ).map((item) => (
                  <div
                    key={item.key}
                    className="border border-slate-200 rounded-lg p-4 bg-slate-50 flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-800">{item.label}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(item.key, item.content)}
                          className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                        >
                          {copiedKey === item.key ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="whitespace-pre-wrap font-sans text-xs text-slate-700 leading-relaxed">
                        {item.content}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </section>
      )}
    </div>
  );
};
