import React, { useEffect } from 'react';
import { CheckCircle2, ShieldAlert, X } from 'lucide-react';
import type { RecommendationItem } from '../models/schemas.ts';
import { formatINR, formatReadableDate } from '../utils/format.ts';

interface WhyModalProps {
  recommendation: RecommendationItem | null;
  onClose: () => void;
  onOpenMath: (rec: RecommendationItem) => void;
}

export const WhyModal: React.FC<WhyModalProps> = ({ recommendation, onClose, onOpenMath }) => {
  useEffect(() => {
    if (!recommendation) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [recommendation, onClose]);

  if (!recommendation) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="why-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg max-w-xl w-full overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div>
            <div className="text-xs font-medium text-slate-500">
              Decision Rationale · {recommendation.actionCode} · {recommendation.entityId}
            </div>
            <h3 id="why-modal-title" className="text-lg font-display font-semibold text-slate-900 mt-0.5">
              Why: {recommendation.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close rationale dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 text-sm">
          <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div>
              <div className="text-xs text-slate-500">Amount</div>
              <div className="font-mono font-semibold tabular-nums text-slate-900 mt-0.5">
                {formatINR(recommendation.amount)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Recommended Date</div>
              <div className="font-mono font-medium tabular-nums text-slate-900 mt-0.5">
                {formatReadableDate(recommendation.recommendedDate, 'MMM dd, yyyy')}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Estimated Cost</div>
              <div className="font-mono font-semibold tabular-nums text-slate-900 mt-0.5">
                {formatINR(recommendation.estimatedCost)}
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              1. What the engine considered
            </div>
            <p className="text-slate-700 mt-1 leading-relaxed">{recommendation.whyDetails.considered}</p>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              2. Why this action was selected
            </div>
            <p className="text-slate-900 font-medium mt-1 leading-relaxed">
              {recommendation.whyDetails.selectedReason}
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              3. Alternative rejected &amp; cost comparison
            </div>
            <p className="text-slate-700 mt-1 leading-relaxed">
              {recommendation.whyDetails.rejectedAlternative}
            </p>
            <p className="text-emerald-800 font-medium mt-1">
              {recommendation.whyDetails.costDifferenceText}
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              4. Constraints enforced
            </div>
            <ul className="space-y-1">
              {recommendation.whyDetails.constraintsApplied.map((c, idx) => (
                <li key={idx} className="flex items-center gap-2 text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
              Reason codes: {recommendation.reasonCodes.join(', ')}
            </span>
          </div>
        </div>

        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenMath(recommendation);
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
          >
            Show Math
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
