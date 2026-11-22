
import React from 'react';

interface LandingViewProps {
  onExploreDemo: () => void;
  onImportData: () => void;
  loadingDemo: boolean;
}

export const LandingView: React.FC<LandingViewProps> = ({
  onExploreDemo,
  onImportData,
  loadingDemo,
}) => {
  const features = [
    'Forecast upcoming cash shortages',
    'Prioritize supplier payments and protect payroll',
    'Compare payment delays and financing costs',
    'Test scenarios before making decisions',
    'Review calculations behind recommendations',
  ];

  const financialMetrics = [
    { label: 'Cash available', value: '₹4,00,000', detail: 'Opening balance' },
    { label: 'Receivables', value: '₹9,40,000', detail: 'Expected inflows' },
    { label: 'Payables', value: '₹9,15,000', detail: '12 supplier invoices' },
  ];

  const chartBars = [48, 64, 42, 58, 34, 22, 38, 18, 30, 44, 26, 38];

  const decisionSteps = [
    { number: '01', label: 'Analyse', detail: 'Cash position' },
    { number: '02', label: 'Evaluate', detail: 'Available options' },
    { number: '03', label: 'Decide', detail: 'Action plan' },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900">

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 rounded-full bg-sky-600" />
            <span className="text-xl font-semibold tracking-tight text-slate-900">
              CashShield
            </span>
            <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-slate-500 sm:inline-block">
              Cash Flow Intelligence
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 md:inline">
              Built for Indian MSMEs
            </span>
            <button
              type="button"
              onClick={onExploreDemo}
              disabled={loadingDemo}
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingDemo ? 'Loading Demo...' : 'Explore Demo'}
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero and financial preview */}
        <section className="relative overflow-hidden bg-gradient-to-br from-sky-50/80 via-white to-white">
          <div className="pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full bg-sky-100/40 blur-3xl" />

          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-14 sm:px-8 sm:py-16 lg:grid-cols-12 lg:gap-10 lg:px-12 lg:py-20">

            {/* Left: Main introduction */}
            <div className="lg:col-span-6">
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
                AI for Finance
              </p>

              <h1 className="max-w-xl text-4xl font-semibold leading-[1.13] tracking-tight text-slate-950 sm:text-5xl lg:text-[58px]">
                Make better
                <span className="block text-sky-700">cash decisions.</span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
                Understand your business cash flow, plan supplier payments and
                identify potential shortages before they affect daily operations.
              </p>

              <p className="mt-3 max-w-lg text-sm leading-6 text-slate-500">
                CashShield brings forecasting, financial cost analysis and
                optimization together to help Indian MSMEs manage liquidity.
              </p>

              {/* Key capabilities */}
              <div className="mt-7 space-y-3">
                {features.map((feature) => (
                  <div key={feature} className="flex items-start gap-3">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-sky-600" />
                    <p className="text-sm leading-5 text-slate-700">
                      {feature}
                    </p>
                  </div>
                ))}
              </div>

              {/* Main actions */}
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onExploreDemo}
                  disabled={loadingDemo}
                  className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingDemo ? 'Initializing Demo...' : 'Explore Demo'}
                </button>

                <button
                  type="button"
                  onClick={onImportData}
                  className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-all hover:-translate-y-0.5 hover:border-sky-400 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:ring-offset-2"
                >
                  Import Business Data
                </button>
              </div>

              <p className="mt-5 text-xs text-slate-400">
                Built for practical MSME financial planning
              </p>
            </div>

            {/* Right: Financial preview */}
            <div className="lg:col-span-6">
              <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_55px_-35px_rgba(15,23,42,0.28)] sm:p-6">

                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-5">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                      Cash Flow Management
                    </p>
                    <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
                      Financial Overview
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      A snapshot of your business finances
                    </p>
                  </div>

                  <span className="rounded-md bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700">
                    Demo Preview
                  </span>
                </div>

                {/* Financial metrics */}
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {financialMetrics.map((metric) => (
                    <div
                      key={metric.label}
                      className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 transition-colors hover:border-sky-200 hover:bg-sky-50/60"
                    >
                      <p className="text-xs text-slate-500">
                        {metric.label}
                      </p>
                      <p className="mt-2 font-mono text-lg font-semibold tracking-tight text-slate-900">
                        {metric.value}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {metric.detail}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Cash flow forecast */}
                <div className="mt-5 rounded-xl border border-slate-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">
                        Cash Flow Forecast
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Illustrative cash flow trend
                      </p>
                    </div>
                    <span className="text-xs font-medium text-slate-500">
                      30 days
                    </span>
                  </div>

                  <div
                    className="mt-5 flex h-28 items-end gap-1.5 border-b border-l border-slate-200 px-2"
                    aria-label="Illustrative cash flow trend"
                  >
                    {chartBars.map((height, index) => (
                      <div
                        key={index}
                        className="group relative flex h-full flex-1 items-end"
                      >
                        <div
                          className={`w-full rounded-t-sm transition-all duration-300 group-hover:opacity-70 ${
                            index >= 8 ? 'bg-sky-300' : 'bg-sky-600'
                          }`}
                          style={{ height: `${height}%` }}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 flex justify-between text-[10px] text-slate-400">
                    <span>Opening</span>
                    <span>Mid-period</span>
                    <span>Projected</span>
                  </div>
                </div>

                {/* Decision process */}
                <div className="mt-5">
                  <p className="text-xs font-semibold text-slate-700">
                    Financial decision process
                  </p>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {decisionSteps.map((step) => (
                      <div
                        key={step.number}
                        className="rounded-lg bg-slate-50 px-3 py-3 transition-colors hover:bg-sky-50"
                      >
                        <p className="text-[10px] font-semibold tracking-wider text-sky-700">
                          {step.number}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">
                          {step.label}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {step.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                  <span className="text-xs font-medium text-slate-600">
                    Decision support
                  </span>
                  <span className="text-xs text-slate-400">
                    Rule-based analysis · Indian MSMEs
                  </span>
                </div>

              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
