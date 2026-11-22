import { addDays, format, parseISO } from 'date-fns';
import type {
  BusinessProfile,
  CashTransaction,
  ForecastDay,
  Payable,
  Receivable,
  ShortfallDriver,
  ShortfallSummary,
} from '../../src/models/schemas.ts';

export interface ScheduledCashFlow {
  id: string;
  date: string;
  label: string;
  amount: number;
  type: 'inflow' | 'outflow' | 'protected' | 'financing';
  category: string;
}

export function buildBaselineFlowsFromDataset(
  profile: BusinessProfile,
  payables: Payable[],
  receivables: Receivable[],
  cashTransactions: CashTransaction[]
): ScheduledCashFlow[] {
  const flows: ScheduledCashFlow[] = [];
  const startStr = profile.analysisDate;
  const endStr = format(addDays(parseISO(startStr), profile.planningHorizonDays - 1), 'yyyy-MM-dd');

  const clampToHorizonStart = (d: string) => (d < startStr ? startStr : d);

  // Protected payroll
  if (profile.protectedPayroll > 0) {
    flows.push({
      id: 'PAYROLL',
      date: clampToHorizonStart(profile.payrollDueDate),
      label: 'Protected Employee Payroll',
      amount: profile.protectedPayroll,
      type: 'protected',
      category: 'Payroll',
    });
  }

  // Payables on original due dates (clamped to analysisDate if already due/overdue)
  for (const p of payables) {
    if (p.status === 'paid') continue;
    const payDate = clampToHorizonStart(p.plannedPaymentDate || p.dueDate);
    if (payDate <= endStr) {
      const isProtected =
        p.mandatoryPayment ||
        p.criticalSupplier ||
        profile.mandatoryCategories.includes(p.category);
      flows.push({
        id: p.payableId,
        date: payDate,
        label: p.supplierName,
        amount: p.amount,
        type: isProtected ? 'protected' : 'outflow',
        category: p.category,
      });
    }
  }

  // Receivables on expected payment dates
  for (const r of receivables) {
    const recDate = clampToHorizonStart(r.expectedPaymentDate);
    if (recDate <= endStr) {
      flows.push({
        id: r.receivableId,
        date: recDate,
        label: `${r.customerName} (${r.invoiceNumber})`,
        amount: r.amount,
        type: 'inflow',
        category: 'Customer Receivable',
      });
    }
  }

  // Non-historical scheduled cash transactions inside horizon
  for (const tx of cashTransactions) {
    if (!tx.isHistorical && tx.date >= startStr && tx.date <= endStr) {
      flows.push({
        id: tx.transactionId,
        date: tx.date,
        label: tx.description,
        amount: tx.amount,
        type: tx.transactionType === 'inflow' ? 'inflow' : 'outflow',
        category: tx.category,
      });
    }
  }

  return flows;
}

export function generateDailyForecast(
  profile: BusinessProfile,
  flows: ScheduledCashFlow[]
): ForecastDay[] {
  const startDate = parseISO(profile.analysisDate);
  const days: ForecastDay[] = [];
  let runningCash = profile.currentCash;

  const flowsByDate = new Map<string, ScheduledCashFlow[]>();
  for (const flow of flows) {
    const existing = flowsByDate.get(flow.date) || [];
    existing.push(flow);
    flowsByDate.set(flow.date, existing);
  }

  for (let i = 0; i < profile.planningHorizonDays; i++) {
    const dateObj = addDays(startDate, i);
    const dateStr = format(dateObj, 'yyyy-MM-dd');
    const label = format(dateObj, 'MMM dd');
    const dayFlows = flowsByDate.get(dateStr) || [];

    const openingCash = runningCash;
    let inflows = 0;
    let outflows = 0;
    let protectedOutflows = 0;

    for (const f of dayFlows) {
      if (f.type === 'inflow' || f.type === 'financing') {
        inflows += f.amount;
      } else if (f.type === 'protected') {
        protectedOutflows += f.amount;
        outflows += f.amount;
      } else {
        outflows += f.amount;
      }
    }

    const closingCash = openingCash + inflows - outflows;
    const shortfallAmount = Math.max(0, profile.minimumCashReserve - closingCash);

    days.push({
      date: dateStr,
      label,
      openingCash,
      inflows,
      outflows,
      protectedOutflows,
      closingCash,
      minimumReserve: profile.minimumCashReserve,
      shortfallAmount,
      isBelowReserve: closingCash < profile.minimumCashReserve,
      events: dayFlows.map((f) => ({
        id: f.id,
        label: f.label,
        type: f.type,
        amount: f.amount,
      })),
    });

    runningCash = closingCash;
  }

  return days;
}

export function detectShortfall(
  profile: BusinessProfile,
  forecast: ForecastDay[],
  flows: ScheduledCashFlow[]
): ShortfallSummary {
  if (forecast.length === 0) {
    return {
      status: 'healthy',
      headline: 'No forecast days configured',
      explanation: 'Add planning horizon days to evaluate projected cash position.',
      openingCash: profile.currentCash,
      minimumReserve: profile.minimumCashReserve,
      projectedMinimumCash: profile.currentCash,
      minimumCashDate: profile.analysisDate,
      peakShortfallAmount: 0,
      firstShortfallDate: null,
      shortfallDurationDays: 0,
      reserveAtRisk: 0,
      primaryDrivers: [],
    };
  }

  let minDay = forecast[0];
  let firstShortfallDay: ForecastDay | null = null;
  let shortfallDays = 0;

  for (const day of forecast) {
    if (day.closingCash < minDay.closingCash) {
      minDay = day;
    }
    if (day.isBelowReserve) {
      shortfallDays += 1;
      if (!firstShortfallDay) {
        firstShortfallDay = day;
      }
    }
  }

  const peakShortfallAmount = Math.max(0, profile.minimumCashReserve - minDay.closingCash);
  const reserveAtRisk =
    minDay.closingCash < profile.minimumCashReserve
      ? Math.min(profile.minimumCashReserve, profile.minimumCashReserve - minDay.closingCash)
      : 0;

  // Identify largest outflows on or before minimumCashDate
  const drivers: ShortfallDriver[] = flows
    .filter(
      (f) =>
        (f.type === 'outflow' || f.type === 'protected') && f.date <= minDay.date
    )
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4)
    .map((f) => ({
      date: f.date,
      description: f.label,
      amount: f.amount,
      category: f.category,
    }));

  if (peakShortfallAmount > 0 && firstShortfallDay) {
    const minFormatted = format(parseISO(minDay.date), 'MMM dd');
    const firstFormatted = format(parseISO(firstShortfallDay.date), 'MMM dd');
    const topDriverNames = drivers
      .slice(0, 2)
      .map((d) => d.description)
      .join(' and ');

    return {
      status: 'crisis',
      headline: 'Projected cash crisis detected',
      explanation: `Projected cash drops ₹${peakShortfallAmount.toLocaleString('en-IN')} below your ₹${profile.minimumCashReserve.toLocaleString('en-IN')} reserve (first breach ${firstFormatted}, trough ${minFormatted}), driven primarily by ${topDriverNames || 'scheduled outflows'} arriving ahead of expected customer receipts.`,
      openingCash: profile.currentCash,
      minimumReserve: profile.minimumCashReserve,
      projectedMinimumCash: minDay.closingCash,
      minimumCashDate: minDay.date,
      peakShortfallAmount,
      firstShortfallDate: firstShortfallDay.date,
      shortfallDurationDays: shortfallDays,
      reserveAtRisk,
      primaryDrivers: drivers,
    };
  }

  const warningThreshold = profile.minimumCashReserve * 1.35;
  if (minDay.closingCash <= warningThreshold) {
    const minFormatted = format(parseISO(minDay.date), 'MMM dd');
    return {
      status: 'warning',
      headline: 'Cash buffer approaches minimum reserve',
      explanation: `No reserve breach projected, though cash dips to ₹${minDay.closingCash.toLocaleString('en-IN')} on ${minFormatted} (within ₹${(minDay.closingCash - profile.minimumCashReserve).toLocaleString('en-IN')} of your ₹${profile.minimumCashReserve.toLocaleString('en-IN')} reserve).`,
      openingCash: profile.currentCash,
      minimumReserve: profile.minimumCashReserve,
      projectedMinimumCash: minDay.closingCash,
      minimumCashDate: minDay.date,
      peakShortfallAmount: 0,
      firstShortfallDate: null,
      shortfallDurationDays: 0,
      reserveAtRisk: 0,
      primaryDrivers: drivers,
    };
  }

  return {
    status: 'healthy',
    headline: 'No immediate cash crisis detected',
    explanation: `Projected cash remains safely above the ₹${profile.minimumCashReserve.toLocaleString('en-IN')} minimum reserve throughout the ${profile.planningHorizonDays}-day planning horizon (lowest point ₹${minDay.closingCash.toLocaleString('en-IN')} on ${format(parseISO(minDay.date), 'MMM dd')}).`,
    openingCash: profile.currentCash,
    minimumReserve: profile.minimumCashReserve,
    projectedMinimumCash: minDay.closingCash,
    minimumCashDate: minDay.date,
    peakShortfallAmount: 0,
    firstShortfallDate: null,
    shortfallDurationDays: 0,
    reserveAtRisk: 0,
    primaryDrivers: [],
  };
}
