import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Calculator,
  FileCheck2,
  FileSpreadsheet,
  LayoutDashboard,
  Menu,
  Receipt,
  Shield,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';

export type NavTab =
  | 'overview'
  | 'crisis'
  | 'payables'
  | 'receivables'
  | 'costs'
  | 'whatif'
  | 'evidence'
  | 'import';

interface LayoutShellProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  businessName: string;
  analysisDate: string;
  horizonDays: number;
  isSyntheticDemo: boolean;
  crisisDetected: boolean;
  onResetToLanding?: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{
  id: NavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'crisis', label: 'Cash Crisis', icon: AlertTriangle },
  { id: 'payables', label: 'Payables', icon: Receipt },
  { id: 'receivables', label: 'Receivables', icon: ArrowUpRight },
  { id: 'costs', label: 'Cost Explorer', icon: Calculator },
  { id: 'whatif', label: 'What-If', icon: SlidersHorizontal },
  { id: 'evidence', label: 'Evidence', icon: FileCheck2 },
  { id: 'import', label: 'Data Import', icon: Upload },
];

const TAB_TITLES: Record<NavTab, string> = {
  overview: 'Treasury Overview',
  crisis: 'Cash Crisis Action Plan',
  payables: 'Payables & Payment Rules',
  receivables: 'Receivables & Acceleration',
  costs: 'Action Cost Explorer',
  whatif: 'What-If Scenario Simulator',
  evidence: 'Rules, Assumptions & Evidence',
  import: 'Data Import & Document Extraction',
};

export const LayoutShell: React.FC<LayoutShellProps> = ({
  activeTab,
  onSelectTab,
  businessName,
  analysisDate,
  horizonDays,
  isSyntheticDemo,
  crisisDetected,
  onResetToLanding,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNav = (id: NavTab) => {
    onSelectTab(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 z-30">
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-200">
          <button
            type="button"
            onClick={onResetToLanding}
            className="flex items-center gap-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 rounded"
          >
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <span className="font-display font-bold text-lg tracking-tight text-slate-900 whitespace-nowrap">
              CashShield
            </span>
          </button>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto" aria-label="Primary Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const isCrisisBtn = item.id === 'crisis';

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : isCrisisBtn && crisisDetected
                    ? 'text-red-700 bg-red-50/70 hover:bg-red-50'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {isCrisisBtn && crisisDetected && !isActive && (
                  <span className="text-[11px] font-semibold text-red-700">Action</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
          <div className="font-medium text-slate-700 truncate">{businessName}</div>
          <div className="flex items-center gap-1.5">
            <span>{isSyntheticDemo ? 'Synthetic Demo' : 'Imported Dataset'}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{horizonDays}d</span>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-64 max-w-xs bg-white h-full border-r border-slate-200 flex flex-col z-10">
            <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-slate-900 text-white flex items-center justify-center">
                  <Shield className="w-4 h-4" />
                </div>
                <span className="font-display font-bold text-base text-slate-900">CashShield</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation"
                className="p-2 rounded-md text-slate-500 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNav(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-60 flex flex-col min-w-0">
        {/* Top Bar (Strict 3-zone contract) */}
        <header className="sticky top-0 z-20 h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0 text-sm">
              <span className="font-display font-semibold text-slate-900 truncate">
                {TAB_TITLES[activeTab]}
              </span>
              <span className="hidden sm:inline text-slate-300" aria-hidden="true">
                /
              </span>
              <span className="hidden sm:inline text-slate-500 truncate max-w-[260px]">
                {businessName}
              </span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap shrink-0">
            <Activity className="w-3.5 h-3.5 text-slate-400" />
            <span>As of {analysisDate}</span>
            <span aria-hidden="true">·</span>
            <span>{horizonDays}-day horizon</span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeTab !== 'crisis' ? (
              <button
                type="button"
                onClick={() => onSelectTab('crisis')}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
              >
                Solve Cash Crisis
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onSelectTab('whatif')}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
              >
                Test What-If
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1320px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
