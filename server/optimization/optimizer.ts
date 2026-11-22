import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import type {
  ActionCostEvaluation,
  BusinessProfile,
  CashTransaction,
  CostComponent,
  FinancingDrawdown,
  FinancingOption,
  ForecastDay,
  Payable,
  PlanResult,
  Receivable,
  RecommendationItem,
  RuleApplicability,
  ValidationCheckResult,
} from '../../src/models/schemas.ts';
import {
  calculateFinancingDrawdownCost,
  calculatePayableActionCost,
  calculateReceivableAccelerationCost,
} from '../costs/costEngine.ts';
import {
  generateDailyForecast,
  type ScheduledCashFlow,
} from '../forecast/forecastEngine.ts';
import {
  evaluatePayableRules,
  evaluateReceivableEligibility,
} from '../rules/ruleEngine.ts';

interface PayableOption {
  actionType: 'pay_on_time' | 'capture_discount' | 'delay_payable';
  executionDate: string;
  costEval: ActionCostEvaluation;
}

interface ReceivableOption {
  actionType: 'wait_expected' | 'accelerate_receivable';
  executionDate: string;
  costEval: ActionCostEvaluation | null;
}

interface CandidateDecisionSet {
  payableChoices: Map<string, PayableOption>;
  receivableChoices: Map<string, ReceivableOption>;
}

interface SolverEvaluation {
  feasible: boolean;
  totalCost: number;
  actionCost: number;
  financingCost: number;
  minCashAfterPlan: number;
  minCashDateAfterPlan: string;
  endCash: number;
  totalDelayDays: number;
  delayedCount: number;
  drawdowns: FinancingDrawdown[];
  forecast: ForecastDay[];
  infeasibilityReasons: string[];
}

function clampDateToHorizon(dateStr: string, startStr: string, endStr: string): string {
  if (dateStr < startStr) return startStr;
  if (dateStr > endStr) return endStr;
  return dateStr;
}

function isProtectedPayable(payable: Payable, profile: BusinessProfile): boolean {
  return (
    payable.mandatoryPayment ||
    payable.criticalSupplier ||
    profile.criticalSupplierIds.includes(payable.payableId) ||
    profile.mandatoryCategories.includes(payable.category)
  );
}

/**
 * Generates discrete candidate action choices for each payable within the planning horizon.
 */
function buildPayableCandidates(
  payable: Payable,
  rules: RuleApplicability[],
  profile: BusinessProfile
): PayableOption[] {
  const startStr = profile.analysisDate;
  const endStr = format(addDays(parseISO(startStr), profile.planningHorizonDays - 1), 'yyyy-MM-dd');
  const clampedDue = clampDateToHorizon(payable.dueDate, startStr, endStr);
  const protectedFlag = isProtectedPayable(payable, profile);

  const options: PayableOption[] = [];
  const seenDates = new Set<string>();

  // 1. Capture early-payment discount if available
  const discountRule = rules.find((r) => r.ruleId === 'RULE_EARLY_DISCOUNT');
  if (discountRule?.status === 'available' && payable.discountDeadline) {
    const discountExec = clampDateToHorizon(
      payable.discountDeadline <= payable.dueDate ? payable.discountDeadline : payable.dueDate,
      startStr,
      endStr
    );
    seenDates.add(discountExec);
    options.push({
      actionType: 'capture_discount',
      executionDate: discountExec,
      costEval: calculatePayableActionCost(payable, 'capture_discount', discountExec, profile, rules),
    });
  }

  // 2. Pay on original due date (or today if already overdue)
  if (!seenDates.has(clampedDue)) {
    seenDates.add(clampedDue);
    options.push({
      actionType: 'pay_on_time',
      executionDate: clampedDue,
      costEval: calculatePayableActionCost(payable, 'pay_on_time', clampedDue, profile, rules),
    });
  }

  // 3. Delay candidates (strictly disallowed for mandatory/critical protected obligations)
  if (!protectedFlag) {
    const candidateDelays = [7, 14, 21];
    for (const d of candidateDelays) {
      const delayedDate = format(addDays(parseISO(clampedDue), d), 'yyyy-MM-dd');
      const cappedDate = delayedDate > endStr ? endStr : delayedDate;
      if (cappedDate > clampedDue && !seenDates.has(cappedDate)) {
        seenDates.add(cappedDate);
        options.push({
          actionType: 'delay_payable',
          executionDate: cappedDate,
          costEval: calculatePayableActionCost(payable, 'delay_payable', cappedDate, profile, rules),
        });
      }
    }
    // Always include end-of-horizon date (to bridge until late-horizon receivables settle)
    if (endStr > clampedDue && !seenDates.has(endStr)) {
      seenDates.add(endStr);
      options.push({
        actionType: 'delay_payable',
        executionDate: endStr,
        costEval: calculatePayableActionCost(payable, 'delay_payable', endStr, profile, rules),
      });
    }
  }

  return options;
}

/**
 * Exact subset optimization over non-receivable credit facilities to cover a peak deficit G
 * over a required duration window [firstDeficitDate .. recoveryDate].
 */
function solveExactCreditDrawdown(
  peakGap: number,
  durationDays: number,
  creditOptions: FinancingOption[]
): {
  feasible: boolean;
  totalCost: number;
  drawdowns: FinancingDrawdown[];
} {
  if (peakGap <= 0) {
    return { feasible: true, totalCost: 0, drawdowns: [] };
  }

  const eligibleCredits = creditOptions
    .filter((f) => !f.requiresEligibleReceivable && f.availableAmount > 0 && f.maxDurationDays >= durationDays)
    .sort((a, b) => a.annualRatePct - b.annualRatePct || a.optionId.localeCompare(b.optionId));

  const maxCapacity = eligibleCredits.reduce((s, f) => s + f.availableAmount, 0);
  if (maxCapacity < peakGap) {
    return { feasible: false, totalCost: Infinity, drawdowns: [] };
  }

  let bestCost = Infinity;
  let bestDrawdowns: FinancingDrawdown[] = [];

  const n = eligibleCredits.length;
  const totalSubsets = 1 << n;

  for (let mask = 1; mask < totalSubsets; mask++) {
    const chosen: FinancingOption[] = [];
    let subsetCap = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        chosen.push(eligibleCredits[i]);
        subsetCap += eligibleCredits[i].availableAmount;
      }
    }
    if (subsetCap < peakGap) continue;

    // chosen is already sorted by lowest annualRatePct
    let remaining = peakGap;
    let subsetCost = 0;
    const drawdowns: FinancingDrawdown[] = [];

    for (const opt of chosen) {
      if (remaining <= 0) break;
      const draw = Math.min(remaining, opt.availableAmount);
      const { totalCost, components } = calculateFinancingDrawdownCost(opt, draw, durationDays);
      subsetCost += totalCost;
      drawdowns.push({
        optionId: opt.optionId,
        name: opt.name,
        type: opt.type,
        drawnAmount: draw,
        durationDays,
        estimatedCost: totalCost,
        components,
        assumptions: opt.assumptions,
        sourceMetadata: opt.sourceMetadata,
      });
      remaining -= draw;
    }

    if (subsetCost < bestCost) {
      bestCost = subsetCost;
      bestDrawdowns = drawdowns;
    }
  }

  return {
    feasible: bestCost < Infinity,
    totalCost: bestCost,
    drawdowns: bestDrawdowns,
  };
}

function evaluateDecisionSet(
  decisions: CandidateDecisionSet,
  profile: BusinessProfile,
  payables: Payable[],
  receivables: Receivable[],
  cashTransactions: CashTransaction[],
  financingOptions: FinancingOption[]
): SolverEvaluation {
  const startStr = profile.analysisDate;
  const endStr = format(addDays(parseISO(startStr), profile.planningHorizonDays - 1), 'yyyy-MM-dd');
  const flows: ScheduledCashFlow[] = [];

  // 1. Protected Payroll
  if (profile.protectedPayroll > 0) {
    const payrollDate = clampDateToHorizon(profile.payrollDueDate, startStr, endStr);
    flows.push({
      id: 'PAYROLL',
      date: payrollDate,
      label: 'Protected Employee Payroll',
      amount: profile.protectedPayroll,
      type: 'protected',
      category: 'Payroll',
    });
  }

  // 2. Payables
  let actionCost = 0;
  let totalDelayDays = 0;
  let delayedCount = 0;

  for (const p of payables) {
    if (p.status === 'paid') continue;
    const choice = decisions.payableChoices.get(p.payableId);
    if (!choice) continue;

    actionCost += choice.costEval.totalEstimatedCost;
    if (choice.actionType === 'delay_payable') {
      totalDelayDays += choice.costEval.delayDays;
      delayedCount += 1;
    }

    const protectedFlag = isProtectedPayable(p, profile);
    flows.push({
      id: p.payableId,
      date: choice.executionDate,
      label: p.supplierName,
      amount: p.amount,
      type: protectedFlag ? 'protected' : 'outflow',
      category: p.category,
    });
  }

  // 3. Receivables
  const recFacility =
    financingOptions.find((f) => f.type === 'receivable_financing' && f.availableAmount > 0) || null;
  let totalRecAccelerated = 0;
  let recFacilityUsed = false;

  for (const r of receivables) {
    const choice = decisions.receivableChoices.get(r.receivableId);
    const execDate = choice ? choice.executionDate : clampDateToHorizon(r.expectedPaymentDate, startStr, endStr);

    if (choice?.actionType === 'accelerate_receivable' && choice.costEval) {
      recFacilityUsed = true;
      totalRecAccelerated += r.amount;
      actionCost += choice.costEval.totalEstimatedCost;
    }

    if (execDate <= endStr) {
      flows.push({
        id: r.receivableId,
        date: execDate,
        label:
          choice?.actionType === 'accelerate_receivable'
            ? `${r.customerName} (Accelerated)`
            : `${r.customerName} (${r.invoiceNumber})`,
        amount: r.amount,
        type: choice?.actionType === 'accelerate_receivable' ? 'financing' : 'inflow',
        category: 'Customer Receivable',
      });
    }
  }

  // Check receivable facility cap
  if (recFacilityUsed && recFacility && totalRecAccelerated > recFacility.availableAmount) {
    return {
      feasible: false,
      totalCost: Infinity,
      actionCost: Infinity,
      financingCost: 0,
      minCashAfterPlan: -Infinity,
      minCashDateAfterPlan: startStr,
      endCash: -Infinity,
      totalDelayDays,
      delayedCount,
      drawdowns: [],
      forecast: [],
      infeasibilityReasons: [
        `Accelerated receivables (₹${totalRecAccelerated.toLocaleString('en-IN')}) exceed facility limit (₹${recFacility.availableAmount.toLocaleString('en-IN')}).`,
      ],
    };
  }

  let recFixedFee = 0;
  const drawdowns: FinancingDrawdown[] = [];
  if (recFacilityUsed && recFacility) {
    recFixedFee = recFacility.fixedFee;
    const recInterestAndFees = Array.from(decisions.receivableChoices.values())
      .filter((c) => c.actionType === 'accelerate_receivable' && c.costEval)
      .reduce((s, c) => s + (c.costEval?.totalEstimatedCost || 0), 0);

    drawdowns.push({
      optionId: recFacility.optionId,
      name: recFacility.name,
      type: recFacility.type,
      drawnAmount: totalRecAccelerated,
      durationDays: Math.max(
        1,
        ...Array.from(decisions.receivableChoices.values())
          .filter((c) => c.actionType === 'accelerate_receivable' && c.costEval)
          .map((c) => Math.abs(c.costEval?.delayDays || 15))
      ),
      estimatedCost: recInterestAndFees + recFixedFee,
      components: [
        {
          type: 'financing_interest',
          label: 'Receivable Discounting Interest & Fees',
          amount: recInterestAndFees,
          formula: 'Sum of accelerated receivable discounting charges',
          inputs: { totalAccelerated: totalRecAccelerated },
          isIllustrativeEstimate: true,
        },
        ...(recFixedFee > 0
          ? [
              {
                type: 'financing_fixed_fee' as const,
                label: 'TReDS Facility Platform Fixed Fee',
                amount: recFixedFee,
                formula: `Fixed fee ₹${recFixedFee.toLocaleString('en-IN')}`,
                inputs: { fixedFee: recFixedFee },
                isIllustrativeEstimate: true,
              },
            ]
          : []),
      ],
      assumptions: recFacility.assumptions,
      sourceMetadata: recFacility.sourceMetadata,
    });
  }

  // 4. Non-historical scheduled transactions
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

  const preCreditForecast = generateDailyForecast(profile, flows);

  let peakGap = 0;
  let firstDeficitDate: string | null = null;
  let lastDeficitDate: string | null = null;

  for (const day of preCreditForecast) {
    if (day.shortfallAmount > 0) {
      if (day.shortfallAmount > peakGap) peakGap = day.shortfallAmount;
      if (!firstDeficitDate) firstDeficitDate = day.date;
      lastDeficitDate = day.date;
    }
  }

  if (peakGap === 0) {
    let minDay = preCreditForecast[0];
    for (const d of preCreditForecast) {
      if (d.closingCash < minDay.closingCash) minDay = d;
    }
    const endCash = preCreditForecast[preCreditForecast.length - 1]?.closingCash ?? profile.currentCash;
    return {
      feasible: true,
      totalCost: actionCost + recFixedFee,
      actionCost,
      financingCost: recFixedFee,
      minCashAfterPlan: minDay.closingCash,
      minCashDateAfterPlan: minDay.date,
      endCash,
      totalDelayDays,
      delayedCount,
      drawdowns,
      forecast: preCreditForecast,
      infeasibilityReasons: [],
    };
  }

  // Determine the required bridge duration from the first deficit until the unmitigated cash position recovers.
  // If recovery does not occur inside the horizon, the model requires repayment at horizon end;
  // an unpaid loan is never silently removed from the cash ledger.
  const drawdownStart = firstDeficitDate!;
  const recoveryDay = preCreditForecast.find(
    (d) => d.date > lastDeficitDate! && d.closingCash >= profile.minimumCashReserve
  );
  const drawdownEnd = recoveryDay ? recoveryDay.date : endStr;
  const durationDays = Math.max(
    1,
    differenceInCalendarDays(parseISO(drawdownEnd), parseISO(drawdownStart)) + 1
  );

  const creditSolution = solveExactCreditDrawdown(peakGap, durationDays, financingOptions);

  if (!creditSolution.feasible) {
    const maxCap = financingOptions
      .filter((f) => !f.requiresEligibleReceivable && f.maxDurationDays >= durationDays)
      .reduce((s, f) => s + f.availableAmount, 0);
    return {
      feasible: false,
      totalCost: Infinity,
      actionCost,
      financingCost: Infinity,
      minCashAfterPlan: profile.minimumCashReserve - peakGap,
      minCashDateAfterPlan: firstDeficitDate!,
      endCash: preCreditForecast[preCreditForecast.length - 1]?.closingCash ?? 0,
      totalDelayDays,
      delayedCount,
      drawdowns: [...drawdowns],
      forecast: preCreditForecast,
      infeasibilityReasons: [
        `Remaining liquidity gap of ₹${peakGap.toLocaleString('en-IN')} over ${durationDays} days exceeds eligible credit facility limit of ₹${maxCap.toLocaleString('en-IN')}.`,
      ],
    };
  }

  // Inject credit inflow on drawdownStart and a recorded repayment at recovery or horizon end
  const finalFlows = [...flows];
  finalFlows.push({
    id: 'CREDIT_DRAW',
    date: drawdownStart,
    label: `Credit Facility Drawdown (${creditSolution.drawdowns.map((d) => d.name).join(' + ')})`,
    amount: peakGap,
    type: 'financing',
    category: 'Financing',
  });

  finalFlows.push({
    id: 'CREDIT_REPAY',
    date: drawdownEnd,
    label: recoveryDay
      ? 'Credit Bridge Repayment (upon customer receipts)'
      : 'Credit Bridge Repayment (at horizon end)',
    amount: peakGap,
    type: 'outflow',
    category: 'Financing',
  });

  const finalForecast = generateDailyForecast(profile, finalFlows);
  let minAfter = finalForecast[0];
  for (const d of finalForecast) {
    if (d.closingCash < minAfter.closingCash) minAfter = d;
  }

  const endCash = finalForecast[finalForecast.length - 1]?.closingCash ?? 0;
  return {
    feasible: minAfter.closingCash >= profile.minimumCashReserve,
    totalCost: actionCost + recFixedFee + creditSolution.totalCost,
    actionCost,
    financingCost: recFixedFee + creditSolution.totalCost,
    minCashAfterPlan: minAfter.closingCash,
    minCashDateAfterPlan: minAfter.date,
    endCash,
    totalDelayDays,
    delayedCount,
    drawdowns: [...drawdowns, ...creditSolution.drawdowns],
    forecast: finalForecast,
    infeasibilityReasons:
      minAfter.closingCash >= profile.minimumCashReserve
        ? []
        : [`Cash drops below minimum reserve on ${minAfter.date}.`],
  };
}

/**
 * Independent post-optimization constraint verification pass (Section 17).
 */
export function validatePlanFeasibility(
  decisions: CandidateDecisionSet,
  evalResult: SolverEvaluation,
  profile: BusinessProfile,
  payables: Payable[],
  receivables: Receivable[],
  financingOptions: FinancingOption[]
): ValidationCheckResult {
  const violatedConstraints: string[] = [];
  const checkedConstraints: string[] = [
    `Minimum cash reserve >= ₹${profile.minimumCashReserve.toLocaleString('en-IN')} on all horizon days`,
    `Protected payroll ₹${profile.protectedPayroll.toLocaleString('en-IN')} paid on ${profile.payrollDueDate}`,
    'Mandatory & critical supplier payables not delayed past due date',
    'Receivable acceleration limited to eligible non-overdue invoices & facility cap',
    'Credit facility drawdowns within available limits & max duration',
    'No execution dates prior to invoice date',
  ];

  // 1. Minimum reserve check on every day
  for (const day of evalResult.forecast) {
    if (day.closingCash < profile.minimumCashReserve) {
      violatedConstraints.push(
        `Reserve violation on ${day.date}: projected closing cash ₹${day.closingCash.toLocaleString('en-IN')} < reserve ₹${profile.minimumCashReserve.toLocaleString('en-IN')}.`
      );
      break;
    }
  }

  // 2. Mandatory & critical supplier protection check
  const startStr = profile.analysisDate;
  const endStr = format(addDays(parseISO(startStr), profile.planningHorizonDays - 1), 'yyyy-MM-dd');
  for (const p of payables) {
    if (p.status === 'paid') continue;
    const choice = decisions.payableChoices.get(p.payableId);
    if (!choice) {
      violatedConstraints.push(`Payable ${p.payableId} missing scheduled action.`);
      continue;
    }
    const clampedDue = clampDateToHorizon(p.dueDate, startStr, endStr);
    if (isProtectedPayable(p, profile) && choice.executionDate > clampedDue) {
      violatedConstraints.push(
        `Protected payable ${p.supplierName} (${p.payableId}) was scheduled on ${choice.executionDate}, violating due date ${clampedDue}.`
      );
    }
    if (choice.executionDate < p.invoiceDate) {
      violatedConstraints.push(
        `Impossible execution date ${choice.executionDate} before invoice date ${p.invoiceDate} for ${p.payableId}.`
      );
    }
  }

  // 3. Receivable eligibility & limit check
  const recFacility = financingOptions.find((f) => f.type === 'receivable_financing');
  let acceleratedSum = 0;
  for (const r of receivables) {
    const choice = decisions.receivableChoices.get(r.receivableId);
    if (choice?.actionType === 'accelerate_receivable') {
      const elig = evaluateReceivableEligibility(r, financingOptions);
      if (!elig.eligible) {
        violatedConstraints.push(
          `Ineligible receivable ${r.customerName} (${r.receivableId}) scheduled for acceleration: ${elig.reason}`
        );
      }
      acceleratedSum += r.amount;
    }
  }
  if (recFacility && acceleratedSum > recFacility.availableAmount) {
    violatedConstraints.push(
      `Receivable financing total ₹${acceleratedSum.toLocaleString('en-IN')} exceeds facility cap ₹${recFacility.availableAmount.toLocaleString('en-IN')}.`
    );
  }

  // 4. Credit facility limits check
  for (const d of evalResult.drawdowns) {
    const opt = financingOptions.find((f) => f.optionId === d.optionId);
    if (!opt) {
      violatedConstraints.push(`Unknown financing option ${d.optionId}.`);
      continue;
    }
    if (d.drawnAmount > opt.availableAmount) {
      violatedConstraints.push(
        `Financing drawdown ₹${d.drawnAmount.toLocaleString('en-IN')} on ${opt.name} exceeds limit ₹${opt.availableAmount.toLocaleString('en-IN')}.`
      );
    }
    if (d.durationDays > opt.maxDurationDays && d.type !== 'receivable_financing') {
      violatedConstraints.push(
        `Drawdown duration ${d.durationDays}d on ${opt.name} exceeds max duration ${opt.maxDurationDays}d.`
      );
    }
  }

  return {
    isValid: violatedConstraints.length === 0 && evalResult.feasible,
    violatedConstraints:
      violatedConstraints.length > 0 ? violatedConstraints : evalResult.infeasibilityReasons,
    checkedConstraints,
  };
}

/**
 * Builds human-readable RecommendationItem cards with "Why?" and "Show Math" payloads.
 */
function buildRecommendations(
  decisions: CandidateDecisionSet,
  evalResult: SolverEvaluation,
  profile: BusinessProfile,
  payables: Payable[],
  receivables: Receivable[],
  payableCandidatesMap: Map<string, PayableOption[]>
): RecommendationItem[] {
  const items: RecommendationItem[] = [];
  let priority = 1;

  // 1. Protected Payroll
  if (profile.protectedPayroll > 0) {
    const payrollDate = clampDateToHorizon(
      profile.payrollDueDate,
      profile.analysisDate,
      format(addDays(parseISO(profile.analysisDate), profile.planningHorizonDays - 1), 'yyyy-MM-dd')
    );
    items.push({
      priority: priority++,
      actionCode: 'PROTECT',
      title: `Protect Employee Payroll`,
      entityId: 'PAYROLL',
      entityName: 'Employee Payroll',
      amount: profile.protectedPayroll,
      originalDate: profile.payrollDueDate,
      recommendedDate: payrollDate,
      delayOrAdvanceDays: 0,
      estimatedCost: 0,
      avoidedCost: 0,
      statusLabel: 'Protected Obligation',
      reasonCodes: ['PROTECTED_PAYROLL', 'HARD_CONSTRAINT'],
      shortReason: `Mandatory workforce obligation protected from deferral on ${format(parseISO(payrollDate), 'MMM dd')}.`,
      whyDetails: {
        considered: 'Payroll deferral is disallowed by business continuity constraints.',
        selectedReason: `Scheduled in full (₹${profile.protectedPayroll.toLocaleString('en-IN')}) on ${format(parseISO(payrollDate), 'MMM dd')} while preserving the ₹${profile.minimumCashReserve.toLocaleString('en-IN')} reserve via upstream liquidity actions.`,
        rejectedAlternative: 'Deferring payroll is infeasible under configured protection rules.',
        costDifferenceText: '₹0 direct financing cost; non-negotiable constraint.',
        constraintsApplied: ['Protected Payroll Constraint', `Minimum Reserve >= ₹${profile.minimumCashReserve.toLocaleString('en-IN')}`],
      },
      mathBreakdown: {
        actionType: 'protect_obligation',
        entityId: 'PAYROLL',
        entityName: 'Employee Payroll',
        amount: profile.protectedPayroll,
        delayDays: 0,
        executionDate: payrollDate,
        totalEstimatedCost: 0,
        avoidedCostOrDiscountSavings: 0,
        components: [],
        assumptions: ['Payroll is treated as an unbreakable hard constraint on the scheduled pay date'],
        ruleReferences: [],
        dataSource: `Business Profile (${profile.businessName})`,
      },
    });
  }

  // 2. Payables (sorted by: discount/pay on time urgent -> delayed)
  const sortedPayables = [...payables].sort((a, b) => {
    const ca = decisions.payableChoices.get(a.payableId)?.actionType || '';
    const cb = decisions.payableChoices.get(b.payableId)?.actionType || '';
    const rank = (t: string) => (t === 'capture_discount' ? 0 : t === 'pay_on_time' ? 1 : 2);
    return rank(ca) - rank(cb) || a.dueDate.localeCompare(b.dueDate) || b.amount - a.amount;
  });

  for (const p of sortedPayables) {
    if (p.status === 'paid') continue;
    const choice = decisions.payableChoices.get(p.payableId);
    if (!choice) continue;

    const allOpts = payableCandidatesMap.get(p.payableId) || [];
    const maxDelayOpt = allOpts
      .filter((o) => o.actionType === 'delay_payable')
      .sort((a, b) => b.costEval.delayDays - a.costEval.delayDays)[0];

    const reasonCodes: string[] = [];
    if (p.mandatoryPayment || profile.mandatoryCategories.includes(p.category)) {
      reasonCodes.push('MANDATORY_PAYMENT');
    }
    if (p.criticalSupplier || profile.criticalSupplierIds.includes(p.payableId)) {
      reasonCodes.push('CRITICAL_SUPPLIER');
    }
    if (p.mseEligibility === 'eligible') reasonCodes.push('MSE_SUPPLIER');
    if (p.mseEligibility === 'unknown') reasonCodes.push('MSE_UNKNOWN_VERIFY');
    if (choice.actionType === 'capture_discount') reasonCodes.push('EARLY_DISCOUNT_CAPTURED');
    if (choice.actionType === 'delay_payable') reasonCodes.push('LOWEST_DELAY_COST');

    if (choice.actionType === 'capture_discount') {
      const savings = choice.costEval.avoidedCostOrDiscountSavings;
      items.push({
        priority: priority++,
        actionCode: 'CAPTURE_DISCOUNT',
        title: `Pay ${p.supplierName} Early (Capture ${p.discountPct}% Discount)`,
        entityId: p.payableId,
        entityName: p.supplierName,
        amount: p.amount,
        originalDate: p.dueDate,
        recommendedDate: choice.executionDate,
        delayOrAdvanceDays: differenceInCalendarDays(parseISO(choice.executionDate), parseISO(p.dueDate)),
        estimatedCost: 0,
        avoidedCost: savings,
        statusLabel: `Saves ₹${savings.toLocaleString('en-IN')} discount`,
        reasonCodes,
        shortReason: `Capturing ${p.discountPct}% early-payment discount saves ₹${savings.toLocaleString('en-IN')}, exceeding short-term liquidity cost.`,
        whyDetails: {
          considered: `Evaluated paying by ${p.discountDeadline} vs delaying past ${p.dueDate}.`,
          selectedReason: `Paying by ${format(parseISO(choice.executionDate), 'MMM dd')} captures a guaranteed ₹${savings.toLocaleString('en-IN')} (${p.discountPct}%) invoice discount.`,
          rejectedAlternative: maxDelayOpt
            ? `Delaying ${maxDelayOpt.costEval.delayDays} days forfeits the ₹${savings.toLocaleString('en-IN')} discount and costs ₹${maxDelayOpt.costEval.totalEstimatedCost.toLocaleString('en-IN')}.`
            : 'Paying after deadline forfeits the discount.',
          costDifferenceText: `Net economic advantage of ₹${savings.toLocaleString('en-IN')} over missing the discount window.`,
          constraintsApplied: ['Early-Payment Discount Window', 'Cash Reserve Preservation'],
        },
        mathBreakdown: choice.costEval,
      });
    } else if (choice.actionType === 'pay_on_time') {
      const protectedFlag = isProtectedPayable(p, profile);
      const avoidedDelayCost = maxDelayOpt ? maxDelayOpt.costEval.totalEstimatedCost : 0;

      items.push({
        priority: priority++,
        actionCode: 'PAY',
        title: `Pay ${p.supplierName} On Time`,
        entityId: p.payableId,
        entityName: p.supplierName,
        amount: p.amount,
        originalDate: p.dueDate,
        recommendedDate: choice.executionDate,
        delayOrAdvanceDays: 0,
        estimatedCost: choice.costEval.totalEstimatedCost,
        avoidedCost: avoidedDelayCost,
        statusLabel: protectedFlag
          ? p.mandatoryPayment
            ? 'Mandatory Obligation'
            : 'Critical Supplier'
          : p.mseEligibility === 'eligible'
          ? 'MSE Deadline Protected'
          : 'On-Time Settlement',
        reasonCodes,
        shortReason: protectedFlag
          ? `Protected obligation settled on ${format(parseISO(choice.executionDate), 'MMM dd')}${avoidedDelayCost > 0 ? `; avoids ₹${avoidedDelayCost.toLocaleString('en-IN')} estimated delay cost` : ''}.`
          : `Cheaper to settle on ${format(parseISO(choice.executionDate), 'MMM dd')} than incur ₹${avoidedDelayCost.toLocaleString('en-IN')} in delay costs.`,
        whyDetails: {
          considered: protectedFlag
            ? 'Protected mandatory/critical obligation — evaluated cash timing alongside financing options.'
            : `Evaluated paying on ${format(parseISO(p.dueDate), 'MMM dd')} vs delaying up to ${maxDelayOpt?.costEval.delayDays || 0} days.`,
          selectedReason: protectedFlag
            ? `${p.mandatoryPayment ? 'Configured mandatory obligation' : 'Designated critical supplier'}${p.mseEligibility === 'eligible' ? ' (also an eligible MSE supplier)' : ''}. Delaying violates the configured protection policy.`
            : `Delaying ${p.supplierName} costs ₹${avoidedDelayCost.toLocaleString('en-IN')}, which is higher than alternative cash levers.`,
          rejectedAlternative: maxDelayOpt
            ? `Delaying ${maxDelayOpt.costEval.delayDays} days (estimated cost ₹${maxDelayOpt.costEval.totalEstimatedCost.toLocaleString('en-IN')}).`
            : 'No delay candidate permitted.',
          costDifferenceText:
            avoidedDelayCost > 0
              ? `Avoids ₹${avoidedDelayCost.toLocaleString('en-IN')} in estimated delay costs.`
              : 'Zero incremental delay cost.',
          constraintsApplied: [
            ...(protectedFlag ? ['Protected Obligation Constraint'] : []),
            ...(p.mseEligibility === 'eligible' ? ['MSMED Rule Deadline'] : []),
            'Minimum Cash Reserve Constraint',
          ],
        },
        mathBreakdown: choice.costEval,
      });
    } else {
      items.push({
        priority: priority++,
        actionCode: 'DELAY',
        title: `Defer ${p.supplierName} by ${choice.costEval.delayDays} Days`,
        entityId: p.payableId,
        entityName: p.supplierName,
        amount: p.amount,
        originalDate: p.dueDate,
        recommendedDate: choice.executionDate,
        delayOrAdvanceDays: choice.costEval.delayDays,
        estimatedCost: choice.costEval.totalEstimatedCost,
        avoidedCost: 0,
        statusLabel: `Defer ${choice.costEval.delayDays}d (until ${format(parseISO(choice.executionDate), 'MMM dd')})`,
        reasonCodes,
        shortReason: `Frees ₹${p.amount.toLocaleString('en-IN')} through the trough at only ₹${choice.costEval.totalEstimatedCost.toLocaleString('en-IN')} estimated delay cost.`,
        whyDetails: {
          considered: `Evaluated paying on ${format(parseISO(p.dueDate), 'MMM dd')} using higher-cost credit vs deferring ${choice.costEval.delayDays} days until customer inflows settle.`,
          selectedReason: `${p.mseEligibility === 'eligible' ? 'Although MSE-eligible, deferring inside the horizon was required for liquidity' : 'Non-MSE supplier with lower delay cost'} (₹${choice.costEval.totalEstimatedCost.toLocaleString('en-IN')} for ${choice.costEval.delayDays} days) than borrowing short-term bridge credit or delaying MSE/discount invoices.`,
          rejectedAlternative: `Paying on ${format(parseISO(p.dueDate), 'MMM dd')} would require ₹${p.amount.toLocaleString('en-IN')} additional short-term borrowing or risk breaching the ₹${profile.minimumCashReserve.toLocaleString('en-IN')} reserve.`,
          costDifferenceText: `Estimated delay cost ₹${choice.costEval.totalEstimatedCost.toLocaleString('en-IN')} (${((choice.costEval.totalEstimatedCost / p.amount) * 100).toFixed(2)}% of invoice).`,
          constraintsApplied: [
            'Non-Mandatory & Non-Critical Supplier',
            'Settled Within Planning Horizon',
            'Minimum Cash Reserve Constraint',
          ],
        },
        mathBreakdown: choice.costEval,
      });
    }
  }

  // 3. Accelerated Receivables
  for (const r of receivables) {
    const choice = decisions.receivableChoices.get(r.receivableId);
    if (choice?.actionType === 'accelerate_receivable' && choice.costEval) {
      items.push({
        priority: priority++,
        actionCode: 'ACCELERATE',
        title: `Accelerate ${r.customerName} Receivable`,
        entityId: r.receivableId,
        entityName: r.customerName,
        amount: r.amount,
        originalDate: r.expectedPaymentDate,
        recommendedDate: choice.executionDate,
        delayOrAdvanceDays: Math.abs(choice.costEval.delayDays),
        estimatedCost: choice.costEval.totalEstimatedCost,
        avoidedCost: 0,
        statusLabel: `Pull cash forward ${Math.abs(choice.costEval.delayDays)}d`,
        reasonCodes: ['RECEIVABLE_ACCELERATION', 'ELIGIBLE_ANCHOR_BUYER'],
        shortReason: `Brings ₹${r.amount.toLocaleString('en-IN')} forward to ${format(parseISO(choice.executionDate), 'MMM dd')} at ₹${choice.costEval.totalEstimatedCost.toLocaleString('en-IN')} illustrative discounting cost.`,
        whyDetails: {
          considered: `Evaluated waiting until ${format(parseISO(r.expectedPaymentDate), 'MMM dd')} vs discounting via TReDS-style receivable financing.`,
          selectedReason: `Accelerating unlocks ₹${r.amount.toLocaleString('en-IN')} before the Nov 24–29 payment cluster at an illustrative cost of ₹${choice.costEval.totalEstimatedCost.toLocaleString('en-IN')}, cheaper than higher-rate working capital credit or delaying MSE/discount obligations.`,
          rejectedAlternative: `Waiting until ${format(parseISO(r.expectedPaymentDate), 'MMM dd')} forces additional OD/NBFC borrowing or high-penalty payable delays.`,
          costDifferenceText: `Illustrative financing cost of ₹${choice.costEval.totalEstimatedCost.toLocaleString('en-IN')} (~${r.financingRatePct}% p.a.).`,
          constraintsApplied: ['Non-Overdue Eligible Receivable', 'Receivable Facility Limit'],
        },
        mathBreakdown: choice.costEval,
      });
    }
  }

  // 4. Credit Facility Drawdowns (excluding receivable financing already itemized above, except if fixed fee note needed)
  for (const d of evalResult.drawdowns) {
    if (d.type === 'receivable_financing') continue;
    items.push({
      priority: priority++,
      actionCode: 'FINANCE',
      title: `Draw ${d.name}`,
      entityId: d.optionId,
      entityName: d.name,
      amount: d.drawnAmount,
      originalDate: profile.analysisDate,
      recommendedDate: evalResult.forecast.find((f) => f.events.some((e) => e.id === 'CREDIT_DRAW'))?.date || profile.analysisDate,
      delayOrAdvanceDays: d.durationDays,
      estimatedCost: d.estimatedCost,
      avoidedCost: 0,
      statusLabel: `${d.durationDays}d temporary bridge`,
      reasonCodes: ['LIQUIDITY_BRIDGE', 'ILLUSTRATIVE_FACILITY'],
      shortReason: `Covers remaining ₹${d.drawnAmount.toLocaleString('en-IN')} trough for ${d.durationDays} days at ₹${d.estimatedCost.toLocaleString('en-IN')} illustrative cost.`,
      whyDetails: {
        considered: 'Evaluated remaining credit lines (Promoter Bridge, Bank OD, NBFC Credit) after payable & receivable adjustments.',
        selectedReason: `Lowest-cost feasible bridge facility for the remaining ₹${d.drawnAmount.toLocaleString('en-IN')} peak reserve gap over ${d.durationDays} days.`,
        rejectedAlternative: 'Leaving the gap uncovered violates the minimum cash reserve constraint.',
        costDifferenceText: `Illustrative cost ₹${d.estimatedCost.toLocaleString('en-IN')} including interest & applicable drawdown fee.`,
        constraintsApplied: [`Facility Cap <= ₹${d.drawnAmount.toLocaleString('en-IN')} available`, `Duration <= max limit`],
      },
      mathBreakdown: {
        actionType: 'draw_financing',
        entityId: d.optionId,
        entityName: d.name,
        amount: d.drawnAmount,
        delayDays: d.durationDays,
        executionDate: profile.analysisDate,
        totalEstimatedCost: d.estimatedCost,
        avoidedCostOrDiscountSavings: 0,
        components: d.components,
        assumptions: d.assumptions,
        ruleReferences: [],
        dataSource: d.sourceMetadata,
      },
    });
  }

  return items;
}

/**
 * Greedy Baseline Strategy (Section 18):
 * 1. Protects mandatory & critical payables.
 * 2. Ranks discretionary payables by lowest cost-per-rupee-day and greedily delays up to 21 days until shortfall clears.
 * 3. Only if shortfall remains, greedily accelerates receivables / draws OD without joint optimization.
 */
function runGreedyBaseline(
  profile: BusinessProfile,
  payables: Payable[],
  receivables: Receivable[],
  cashTransactions: CashTransaction[],
  financingOptions: FinancingOption[],
  payableCandidatesMap: Map<string, PayableOption[]>,
  receivableCandidatesMap: Map<string, ReceivableOption[]>
): { decisions: CandidateDecisionSet; evalResult: SolverEvaluation } {
  const decisions: CandidateDecisionSet = {
    payableChoices: new Map(),
    receivableChoices: new Map(),
  };

  // Start every payable at default due date (NOT actively optimizing early discount capture unless dueDate == discountDeadline)
  for (const p of payables) {
    if (p.status === 'paid') continue;
    const opts = payableCandidatesMap.get(p.payableId) || [];
    const onTime = opts.find((o) => o.actionType === 'pay_on_time') || opts[0];
    decisions.payableChoices.set(p.payableId, onTime);
  }

  for (const r of receivables) {
    const opts = receivableCandidatesMap.get(r.receivableId) || [];
    decisions.receivableChoices.set(r.receivableId, opts[0]); // WAIT_EXPECTED
  }

  let currentEval = evaluateDecisionSet(
    decisions,
    profile,
    payables,
    receivables,
    cashTransactions,
    financingOptions
  );

  // Rank discretionary payables by lowest cost per rupee-day of max delay
  const delayCandidates = payables
    .filter((p) => p.status !== 'paid' && !isProtectedPayable(p, profile))
    .map((p) => {
      const opts = payableCandidatesMap.get(p.payableId) || [];
      const delayOpt = opts
        .filter((o) => o.actionType === 'delay_payable')
        .sort((a, b) => b.costEval.delayDays - a.costEval.delayDays)[0];
      if (!delayOpt) return null;
      const metric = delayOpt.costEval.totalEstimatedCost / (p.amount * Math.max(1, delayOpt.costEval.delayDays));
      return { payable: p, delayOpt, metric };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.metric - b.metric || a.payable.payableId.localeCompare(b.payable.payableId));

  // Greedily delay until no reserve breach or no more delay candidates
  for (const item of delayCandidates) {
    const hasDeficit = currentEval.forecast.some((d) => d.closingCash < profile.minimumCashReserve);
    if (!hasDeficit && currentEval.drawdowns.length === 0) break;

    decisions.payableChoices.set(item.payable.payableId, item.delayOpt);
    currentEval = evaluateDecisionSet(
      decisions,
      profile,
      payables,
      receivables,
      cashTransactions,
      financingOptions
    );
  }

  // If credit is still needed or infeasible, greedily accelerate eligible receivables by lowest rate
  if (currentEval.drawdowns.length > 0 || !currentEval.feasible) {
    const recFacility = financingOptions.find((f) => f.type === 'receivable_financing');
    let usedRecCap = 0;
    const accelCandidates = receivables
      .map((r) => {
        const opts = receivableCandidatesMap.get(r.receivableId) || [];
        const accel = opts.find((o) => o.actionType === 'accelerate_receivable');
        return accel ? { r, accel } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.r.financingRatePct - b.r.financingRatePct);

    for (const item of accelCandidates) {
      if (recFacility && usedRecCap + item.r.amount <= recFacility.availableAmount) {
        decisions.receivableChoices.set(item.r.receivableId, item.accel);
        usedRecCap += item.r.amount;
        const nextEval = evaluateDecisionSet(
          decisions,
          profile,
          payables,
          receivables,
          cashTransactions,
          financingOptions
        );
        currentEval = nextEval;
        if (currentEval.feasible && currentEval.drawdowns.every((d) => d.type === 'receivable_financing')) {
          break;
        }
      }
    }
  }

  return { decisions, evalResult: currentEval };
}

export function runConstrainedOptimizer(
  profile: BusinessProfile,
  payables: Payable[],
  receivables: Receivable[],
  cashTransactions: CashTransaction[],
  financingOptions: FinancingOption[]
): {
  baselinePlan: PlanResult;
  optimizedPlan: PlanResult;
  nodesEvaluated: number;
  executionMs: number;
  payableCandidatesMap: Map<string, PayableOption[]>;
} {
  const startTime = Date.now();
  const startStr = profile.analysisDate;
  const endStr = format(addDays(parseISO(startStr), profile.planningHorizonDays - 1), 'yyyy-MM-dd');

  const payableCandidatesMap = new Map<string, PayableOption[]>();
  for (const p of payables) {
    if (p.status === 'paid') continue;
    const rules = evaluatePayableRules(p, profile);
    payableCandidatesMap.set(p.payableId, buildPayableCandidates(p, rules, profile));
  }

  const receivableCandidatesMap = new Map<string, ReceivableOption[]>();
  for (const r of receivables) {
    const clampedExpected = clampDateToHorizon(r.expectedPaymentDate, startStr, endStr);
    const waitOpt: ReceivableOption = {
      actionType: 'wait_expected',
      executionDate: clampedExpected,
      costEval: null,
    };
    const elig = evaluateReceivableEligibility(r, financingOptions);
    if (elig.eligible && elig.matchingFacility) {
      const costEval = calculateReceivableAccelerationCost(r, elig.matchingFacility, startStr);
      const accelDate =
        costEval.executionDate < clampedExpected ? costEval.executionDate : clampedExpected;
      if (accelDate < clampedExpected) {
        receivableCandidatesMap.set(r.receivableId, [
          waitOpt,
          { actionType: 'accelerate_receivable', executionDate: accelDate, costEval },
        ]);
      } else {
        receivableCandidatesMap.set(r.receivableId, [waitOpt]);
      }
    } else {
      receivableCandidatesMap.set(r.receivableId, [waitOpt]);
    }
  }

  // 1. Greedy Baseline
  const baseline = runGreedyBaseline(
    profile,
    payables,
    receivables,
    cashTransactions,
    financingOptions,
    payableCandidatesMap,
    receivableCandidatesMap
  );

  // 2. Deterministic bounded combinatorial search with exact facility-subset selection
  const discretionaryPayables = payables
    .filter((p) => p.status !== 'paid' && (payableCandidatesMap.get(p.payableId)?.length || 0) > 1)
    .sort((a, b) => b.amount - a.amount || a.payableId.localeCompare(b.payableId));

  const fixedPayables = payables.filter(
    (p) => p.status !== 'paid' && (payableCandidatesMap.get(p.payableId)?.length || 0) <= 1
  );

  const acceleratableReceivables = receivables
    .filter((r) => (receivableCandidatesMap.get(r.receivableId)?.length || 0) > 1)
    .sort((a, b) => b.amount - a.amount || a.receivableId.localeCompare(b.receivableId));

  const fixedReceivables = receivables.filter(
    (r) => (receivableCandidatesMap.get(r.receivableId)?.length || 0) <= 1
  );

  const recFacility = financingOptions.find((f) => f.type === 'receivable_financing');
  const recMaxCap = recFacility?.availableAmount || 0;

  // Determine lowest non-receivable financing daily rate for optimistic lower bound
  const nonRecFacilities = financingOptions.filter(
    (f) => !f.requiresEligibleReceivable && f.availableAmount > 0
  );
  const minCreditAnnualRate =
    nonRecFacilities.length > 0
      ? Math.min(...nonRecFacilities.map((f) => f.annualRatePct))
      : Infinity;

  // Build base decisions for fixed items
  const currentDecisions: CandidateDecisionSet = {
    payableChoices: new Map(),
    receivableChoices: new Map(),
  };

  for (const p of fixedPayables) {
    currentDecisions.payableChoices.set(p.payableId, payableCandidatesMap.get(p.payableId)![0]);
  }
  for (const r of fixedReceivables) {
    currentDecisions.receivableChoices.set(r.receivableId, receivableCandidatesMap.get(r.receivableId)![0]);
  }

  // Warm start best solution with baseline (if valid)
  let bestDecisions: CandidateDecisionSet = {
    payableChoices: new Map(baseline.decisions.payableChoices),
    receivableChoices: new Map(baseline.decisions.receivableChoices),
  };
  let bestEval: SolverEvaluation = baseline.evalResult;
  const tieBreakNotes: string[] = [];

  // Pre-build variable decision list: receivables first (high leverage), then payables
  type DecisionVar =
    | { kind: 'rec'; id: string; options: ReceivableOption[]; amount: number }
    | { kind: 'pay'; id: string; options: PayableOption[]; amount: number };

  const variables: DecisionVar[] = [
    ...acceleratableReceivables.map((r) => ({
      kind: 'rec' as const,
      id: r.receivableId,
      options: [...receivableCandidatesMap.get(r.receivableId)!].sort(
        (a, b) =>
          (a.costEval?.totalEstimatedCost || 0) - (b.costEval?.totalEstimatedCost || 0)
      ),
      amount: r.amount,
    })),
    ...discretionaryPayables.map((p) => ({
      kind: 'pay' as const,
      id: p.payableId,
      options: [...payableCandidatesMap.get(p.payableId)!].sort(
        (a, b) => a.costEval.totalEstimatedCost - b.costEval.totalEstimatedCost
      ),
      amount: p.amount,
    })),
  ];

  // Precompute optimistic latest cash shifts & run 2-pass coordinate descent warm start
  const MAX_NODES = 1500;
  let nodesEvaluated = 0;

  function isStrictlyBetter(candidate: SolverEvaluation, incumbent: SolverEvaluation): boolean {
    if (!candidate.feasible) return false;
    if (!incumbent.feasible) return true;
    if (candidate.totalCost < incumbent.totalCost) return true;
    if (candidate.totalCost > incumbent.totalCost) return false;

    // Deterministic tie-breaking (Section 36)
    if (candidate.minCashAfterPlan > incumbent.minCashAfterPlan) {
      tieBreakNotes.push(
        `Tie at ₹${candidate.totalCost.toLocaleString('en-IN')}: selected plan with higher minimum reserve buffer (₹${candidate.minCashAfterPlan.toLocaleString('en-IN')}).`
      );
      return true;
    }
    if (candidate.minCashAfterPlan < incumbent.minCashAfterPlan) return false;
    if (candidate.delayedCount < incumbent.delayedCount) return true;
    if (candidate.totalDelayDays < incumbent.totalDelayDays) return true;
    return false;
  }

  // Fast global feasibility check: maximize liquidity (accelerate max eligible receivables + delay all discretionary payables to latest date)
  const maxLiquidityDecisions: CandidateDecisionSet = {
    payableChoices: new Map(currentDecisions.payableChoices),
    receivableChoices: new Map(currentDecisions.receivableChoices),
  };
  let maxLiqRecCap = 0;
  for (const v of variables) {
    if (v.kind === 'rec') {
      const accel = v.options.find((o) => o.actionType === 'accelerate_receivable');
      if (accel && maxLiqRecCap + v.amount <= recMaxCap) {
        maxLiquidityDecisions.receivableChoices.set(v.id, accel);
        maxLiqRecCap += v.amount;
      } else {
        maxLiquidityDecisions.receivableChoices.set(v.id, v.options[0]);
      }
    } else {
      const latestOpt = [...v.options].sort(
        (a, b) => b.executionDate.localeCompare(a.executionDate)
      )[0];
      maxLiquidityDecisions.payableChoices.set(v.id, latestOpt);
    }
  }
  const maxLiqEval = evaluateDecisionSet(
    maxLiquidityDecisions,
    profile,
    payables,
    receivables,
    cashTransactions,
    financingOptions
  );
  nodesEvaluated++;
  if (isStrictlyBetter(maxLiqEval, bestEval)) {
    bestEval = maxLiqEval;
    bestDecisions = {
      payableChoices: new Map(maxLiquidityDecisions.payableChoices),
      receivableChoices: new Map(maxLiquidityDecisions.receivableChoices),
    };
  }

  // If even maximum-liquidity schedule is infeasible (e.g. financing unavailable & gap remains),
  // no feasible combination exists — exit early cleanly.
  if (!maxLiqEval.feasible && !bestEval.feasible) {
    nodesEvaluated++;
  } else {
    // 2-pass Coordinate Descent warm start from best known feasible state
    for (let pass = 0; pass < 2; pass++) {
      let improved = false;
      const working: CandidateDecisionSet = {
        payableChoices: new Map(bestDecisions.payableChoices),
        receivableChoices: new Map(bestDecisions.receivableChoices),
      };

      for (const v of variables) {
        if (v.kind === 'rec') {
          const currentUsedRec = Array.from(working.receivableChoices.entries())
            .filter(([id, c]) => id !== v.id && c.actionType === 'accelerate_receivable')
            .reduce((s, [id]) => s + (receivables.find((r) => r.receivableId === id)?.amount || 0), 0);

          for (const opt of v.options) {
            if (opt.actionType === 'accelerate_receivable' && currentUsedRec + v.amount > recMaxCap) {
              continue;
            }
            const prev = working.receivableChoices.get(v.id)!;
            working.receivableChoices.set(v.id, opt);
            const ev = evaluateDecisionSet(
              working,
              profile,
              payables,
              receivables,
              cashTransactions,
              financingOptions
            );
            nodesEvaluated++;
            if (isStrictlyBetter(ev, bestEval)) {
              bestEval = ev;
              bestDecisions = {
                payableChoices: new Map(working.payableChoices),
                receivableChoices: new Map(working.receivableChoices),
              };
              improved = true;
            } else {
              working.receivableChoices.set(v.id, prev);
            }
          }
        } else {
          for (const opt of v.options) {
            const prev = working.payableChoices.get(v.id)!;
            working.payableChoices.set(v.id, opt);
            const ev = evaluateDecisionSet(
              working,
              profile,
              payables,
              receivables,
              cashTransactions,
              financingOptions
            );
            nodesEvaluated++;
            if (isStrictlyBetter(ev, bestEval)) {
              bestEval = ev;
              bestDecisions = {
                payableChoices: new Map(working.payableChoices),
                receivableChoices: new Map(working.receivableChoices),
              };
              improved = true;
            } else {
              working.payableChoices.set(v.id, prev);
            }
          }
        }
      }
      if (!improved) break;
    }

    // Set default values before bounded DFS search
    for (const v of variables) {
      if (v.kind === 'rec') {
        currentDecisions.receivableChoices.set(v.id, v.options[0]);
      } else {
        currentDecisions.payableChoices.set(v.id, v.options[0]);
      }
    }

    function dfs(idx: number, partialActionCost: number, usedRecCap: number) {
      if (nodesEvaluated >= MAX_NODES) return;
      nodesEvaluated++;

      if (bestEval.feasible && partialActionCost > bestEval.totalCost) {
        return;
      }

      if (idx === variables.length) {
        const ev = evaluateDecisionSet(
          currentDecisions,
          profile,
          payables,
          receivables,
          cashTransactions,
          financingOptions
        );
        if (isStrictlyBetter(ev, bestEval)) {
          bestEval = ev;
          bestDecisions = {
            payableChoices: new Map(currentDecisions.payableChoices),
            receivableChoices: new Map(currentDecisions.receivableChoices),
          };
        }
        return;
      }

      const v = variables[idx];

      if (v.kind === 'rec') {
        for (const opt of v.options) {
          const nextRecCap =
            opt.actionType === 'accelerate_receivable' ? usedRecCap + v.amount : usedRecCap;
          if (opt.actionType === 'accelerate_receivable' && nextRecCap > recMaxCap) continue;

          const addCost = opt.costEval ? opt.costEval.totalEstimatedCost : 0;
          if (bestEval.feasible && partialActionCost + addCost > bestEval.totalCost) continue;

          currentDecisions.receivableChoices.set(v.id, opt);
          dfs(idx + 1, partialActionCost + addCost, nextRecCap);
        }
      } else {
        for (const opt of v.options) {
          const addCost = opt.costEval.totalEstimatedCost;
          if (bestEval.feasible && partialActionCost + addCost > bestEval.totalCost) continue;

          currentDecisions.payableChoices.set(v.id, opt);
          dfs(idx + 1, partialActionCost + addCost, usedRecCap);
        }
      }
    }

    dfs(0, 0, 0);
  }

  // Post-optimization validation pass (Section 17)
  const optimizedValidation = validatePlanFeasibility(
    bestDecisions,
    bestEval,
    profile,
    payables,
    receivables,
    financingOptions
  );

  // Safe fallback if branch-and-bound solution failed validation while baseline passed
  let finalOptDecisions = bestDecisions;
  let finalOptEval = bestEval;
  let finalOptValidation = optimizedValidation;

  const baselineValidation = validatePlanFeasibility(
    baseline.decisions,
    baseline.evalResult,
    profile,
    payables,
    receivables,
    financingOptions
  );

  if (!finalOptValidation.isValid && baselineValidation.isValid) {
    finalOptDecisions = baseline.decisions;
    finalOptEval = baseline.evalResult;
    finalOptValidation = baselineValidation;
  }

  const formatPlanResult = (
    name: 'baseline' | 'optimized',
    decisions: CandidateDecisionSet,
    ev: SolverEvaluation,
    validation: ValidationCheckResult,
    notes: string[]
  ): PlanResult => {
    const totalFinancingDrawn = ev.drawdowns
      .filter((d) => d.type !== 'receivable_financing')
      .reduce((s, d) => s + d.drawnAmount, 0);
    const totalReceivablesAccelerated = Array.from(decisions.receivableChoices.entries())
      .filter(([, c]) => c.actionType === 'accelerate_receivable')
      .reduce((s, [id]) => s + (receivables.find((r) => r.receivableId === id)?.amount || 0), 0);
    const totalPayablesDelayedAmount = Array.from(decisions.payableChoices.entries())
      .filter(([, c]) => c.actionType === 'delay_payable')
      .reduce((s, [id]) => s + (payables.find((p) => p.payableId === id)?.amount || 0), 0);

    return {
      planName: name,
      feasible: ev.feasible && validation.isValid,
      infeasibilityReasons: validation.violatedConstraints,
      totalEstimatedCost: Number.isFinite(ev.totalCost) ? ev.totalCost : 0,
      totalFinancingDrawn,
      totalReceivablesAccelerated,
      totalPayablesDelayedAmount,
      minimumCashAfterPlan: Number.isFinite(ev.minCashAfterPlan) ? ev.minCashAfterPlan : 0,
      minimumCashDateAfterPlan: ev.minCashDateAfterPlan,
      endOfHorizonCash: Number.isFinite(ev.endCash) ? ev.endCash : 0,
      forecastAfterPlan: ev.forecast,
      recommendations: buildRecommendations(
        decisions,
        ev,
        profile,
        payables,
        receivables,
        payableCandidatesMap
      ),
      financingDrawdowns: ev.drawdowns,
      validation,
      tieBreakNotes: notes.slice(-3),
    };
  };

  const executionMs = Date.now() - startTime;

  return {
    baselinePlan: formatPlanResult(
      'baseline',
      baseline.decisions,
      baseline.evalResult,
      baselineValidation,
      []
    ),
    optimizedPlan: formatPlanResult(
      'optimized',
      finalOptDecisions,
      finalOptEval,
      finalOptValidation,
      tieBreakNotes
    ),
    nodesEvaluated,
    executionMs,
    payableCandidatesMap,
  };
}
