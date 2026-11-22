import React, { useEffect } from 'react';
import { BookOpen, Calculator, Database, X } from 'lucide-react';
import type { ActionCostEvaluation } from '../models/schemas.ts';
import { formatINR, formatReadableDate } from '../utils/format.ts';

interface ShowMathDrawerProps {
  mathData: ActionCostEvaluation | null;
  title?: string;
  onClose: () => void;
}

export const ShowMathDrawer: React.FC<ShowMathDrawerProps> = ({ mathData, title, onClose }) => {
  useEffect(() => {
    if (!mathData) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mathData, onClose]);

  if (!mathData) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="show-math-title"
    >
      <div className="bg-white w-full max-w-lg h-full border-l border-slate-200 shadow-xl flex flex-col">
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Calculator className="w-3.5 h-3.5" />
              <span>Deterministic Cost Breakdown</span>
            </div>
            <h3 id="show-math-title" className="text-lg font-display font-semibold text-slate-900 mt-0.5">
              {title || mathData.entityName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close math drawer"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 text-sm">
          {/* Core inputs */}
          <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div>
              <div className="text-xs text-slate-500">Principal / Amount</div>
              <div className="font-mono font-semibold tabular-nums text-base text-slate-900 mt-0.5">
                {formatINR(mathData.amount)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Schedule Timing</div>
              <div className="font-mono font-medium tabular-nums text-slate-900 mt-0.5">
                {formatReadableDate(mathData.executionDate, 'MMM dd, yyyy')}
                {mathData.delayDays !== 0 && (
                  <span className="text-xs text-slate-500 ml-1">
                    ({mathData.delayDays > 0 ? `+${mathData.delayDays}d` : `${mathData.delayDays}d`})
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Total Estimated Cost</div>
              <div className="font-mono font-bold tabular-nums text-base text-slate-900 mt-0.5">
                {formatINR(mathData.totalEstimatedCost)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Avoided Cost / Discount</div>
              <div className="font-mono font-semibold tabular-nums text-base text-emerald-700 mt-0.5">
                {formatINR(mathData.avoidedCostOrDiscountSavings)}
              </div>
            </div>
          </div>

          {/* Formula Components */}
          <div>
            <h4 className="font-display font-semibold text-slate-900 mb-2.5">
              Cost Components &amp; Formulas
            </h4>
            {mathData.components.length === 0 ? (
              <div className="p-3.5 border border-slate-200 rounded-lg text-slate-600">
                ₹0 direct delay or financing cost incurred under this action.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                {mathData.components.map((comp, i) => (
                  <div key={i} className="p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-900">{comp.label}</span>
                      <span className="font-mono font-semibold tabular-nums text-slate-900">
                        {formatINR(comp.amount)}
                      </span>
                    </div>
                    <div className="font-mono text-xs text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded border border-slate-100">
                      {comp.formula}
                    </div>
                    {comp.isIllustrativeEstimate && (
                      <div className="text-[11px] text-amber-800">
                        Illustrative assumption / demo input — verify actual facility terms
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Applicable Rules */}
          {mathData.ruleReferences.length > 0 && (
            <div>
              <h4 className="font-display font-semibold text-slate-900 mb-2.5 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-slate-500" />
                <span>Rule Engine Evaluation</span>
              </h4>
              <div className="space-y-2.5">
                {mathData.ruleReferences.map((rule) => (
                  <div key={rule.ruleId} className="p-3.5 border border-slate-200 rounded-lg space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-900">{rule.ruleName}</span>
                      <span className="text-xs font-mono uppercase text-slate-600">
                        {rule.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{rule.explanation}</p>
                    <div className="text-[11px] text-slate-500 pt-1">
                      Version: {rule.ruleVersion} · Effective: {rule.effectiveDate} · Config: {rule.configuredInput}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assumptions & Data Source */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <Database className="w-3.5 h-3.5" />
              <span>Data Source &amp; Assumptions</span>
            </div>
            <div className="text-xs text-slate-700 font-medium">Source: {mathData.dataSource}</div>
            <ul className="list-disc pl-4 space-y-1 text-xs text-slate-600">
              {mathData.assumptions.map((a, idx) => (
                <li key={idx}>{a}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
