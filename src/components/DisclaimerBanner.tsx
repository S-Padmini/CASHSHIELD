import React from 'react';
import { Info } from 'lucide-react';

export const DisclaimerBanner: React.FC = () => {
  return (
    <footer className="mt-10 pt-5 border-t border-slate-200 text-xs text-slate-500 flex items-start gap-2.5 leading-relaxed">
      <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
      <p>
        CashShield provides decision-support estimates for planning purposes. Regulatory, tax,
        financing and contractual outcomes depend on the applicable facts, terms and effective
        rules. Users should verify material decisions with qualified professionals.
      </p>
    </footer>
  );
};
