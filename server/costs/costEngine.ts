import { addDays, addMonths, differenceInCalendarDays, differenceInMonths, format, parseISO } from 'date-fns';
import type {
  ActionCostEvaluation,
  BusinessProfile,
  CostComponent,
  FinancingOption,
  Payable,
  Receivable,
  RuleApplicability,
} from '../../src/models/schemas.ts';

export function calculateMsmedCompoundInterest(
  principal: number,
  annualRatePct: number,
  startDate: string,
  endDate: string
): number {
  if (principal <= 0 || annualRatePct <= 0 || endDate <= startDate) return 0;

  // Section 16 requires compound interest with monthly rests. We compound at
  // actual month anniversaries, then pro-rate any remaining partial month on
  // the already-compounded balance. This is an explicit modeling convention
  // for partial months; the statutory requirement itself is monthly rests.
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const fullMonths = Math.max(0, differenceInMonths(end, start));
  const restDate = addMonths(start, fullMonths);
  const remainingDays = Math.max(0, differenceInCalendarDays(end, restDate));
  const monthlyRate = annualRatePct / 100 / 12;
  const balanceAfterMonths = principal * Math.pow(1 + monthlyRate, fullMonths);
  const partialMonthInterest =
    remainingDays > 0
      ? balanceAfterMonths * (annualRatePct / 100) * (remainingDays / 365)
      : 0;

  return Math.round(balanceAfterMonths + partialMonthInterest - principal);
}

export function calculatePayableActionCost(
  payable: Payable,
  actionType: 'pay_on_time' | 'capture_discount' | 'delay_payable',
  executionDate: string,
  profile: BusinessProfile,
  rules: RuleApplicability[]
): ActionCostEvaluation {
  const { ruleConfig, analysisDate } = profile;
  const components: CostComponent[] = [];
  const assumptions: string[] = [];
  let avoidedCostOrDiscountSavings = 0;

  const msmedRule = rules.find((r) => r.ruleId === 'RULE_MSMED_DELAY');
  const discountRule = rules.find((r) => r.ruleId === 'RULE_EARLY_DISCOUNT');
  const lateFeeRule = rules.find((r) => r.ruleId === 'RULE_CONTRACT_LATE_FEE');

  const dueDateObj = parseISO(payable.dueDate);
  const execDateObj = parseISO(executionDate);
  const delayDays = Math.max(0, differenceInCalendarDays(execDateObj, dueDateObj));

  // 1. Discount Evaluation
  if (discountRule?.status === 'available' && payable.discountDeadline) {
    const discountValue = Math.round((payable.amount * payable.discountPct) / 100);
    const deadlineObj = parseISO(payable.discountDeadline);

    if (differenceInCalendarDays(execDateObj, deadlineObj) <= 0) {
      avoidedCostOrDiscountSavings = discountValue;
      assumptions.push(
        `Captures ${payable.discountPct}% early-payment discount worth ₹${discountValue.toLocaleString('en-IN')} by paying on/before ${payable.discountDeadline}`
      );
    } else {
      components.push({
        type: 'lost_discount',
        label: 'Forfeited Early-Payment Discount',
        amount: discountValue,
        formula: `₹${payable.amount.toLocaleString('en-IN')} × ${payable.discountPct}%`,
        inputs: {
          invoiceAmount: payable.amount,
          discountPct: payable.discountPct,
          discountDeadline: payable.discountDeadline,
          plannedDate: executionDate,
        },
      });
      assumptions.push(
        `Settling on ${executionDate} misses the ${payable.discountDeadline} discount deadline, forfeiting ₹${discountValue.toLocaleString('en-IN')}`
      );
    }
  } else if (discountRule?.status === 'expired') {
    assumptions.push(
      `Early-payment discount (${payable.discountPct}%) expired on ${payable.discountDeadline} and is excluded`
    );
  }

  // 2. Delay Costs (only when paying past due date / statutory deadline)
  if (delayDays > 0 || differenceInCalendarDays(execDateObj, parseISO(analysisDate)) > 0) {
    // MSMED interest if eligible
    if (msmedRule?.status === 'eligible' && msmedRule.statutoryDeadlineDate) {
      const statutoryObj = parseISO(msmedRule.statutoryDeadlineDate);
      const msmedDelayDays = Math.max(0, differenceInCalendarDays(execDateObj, statutoryObj));
      if (msmedDelayDays > 0) {
        const msmedInterest = calculateMsmedCompoundInterest(
          payable.amount,
          ruleConfig.msmedAnnualInterestRatePct,
          msmedRule.statutoryDeadlineDate,
          executionDate
        );
        components.push({
          type: 'msmed_interest',
          label: 'Estimated MSMED Delay Interest',
          amount: msmedInterest,
          formula: `Monthly-rest compounding: ₹${payable.amount.toLocaleString('en-IN')} × (1 + ${ruleConfig.msmedAnnualInterestRatePct}% / 12)^${differenceInMonths(execDateObj, statutoryObj)} + pro-rated partial-month remainder − principal`,
          inputs: {
            principal: payable.amount,
            annualRatePct: ruleConfig.msmedAnnualInterestRatePct,
            statutoryDeadline: msmedRule.statutoryDeadlineDate,
            msmedDelayDays,
          },
        });
        assumptions.push(
          `MSMED interest calculated from statutory deadline ${msmedRule.statutoryDeadlineDate} to ${executionDate} (${msmedDelayDays} days) at configured ${ruleConfig.msmedAnnualInterestRatePct}% p.a.`
        );
        if (ruleConfig.taxTimingEstimateEnabled) {
          assumptions.push(
            `Tax-timing flag for ${profile.taxYear}: for tax year 2026-27 onward, the MSME payment deduction rule is Section 37(2)(g) of the Income-tax Act, 2025. CashShield does not quantify a tax amount and does not provide tax advice.`
          );
        }
      }
    } else if (msmedRule?.status === 'unknown' && delayDays > 0) {
      assumptions.push(
        'MSMED applicability is UNKNOWN (missing Udyam/acceptance verification); statutory interest not included in deterministic sum, flagged for verification'
      );
    }

    // Contractual late fee (only if explicitly configured)
    if (
      lateFeeRule?.status === 'available' &&
      payable.contractualLateRatePct &&
      payable.contractualLateRatePct > 0 &&
      delayDays > 0
    ) {
      const lateFee = Math.round(
        (payable.amount * (payable.contractualLateRatePct / 100) * delayDays) / 365
      );
      components.push({
        type: 'contractual_late_fee',
        label: 'Contractual Late-Payment Fee',
        amount: lateFee,
        formula: `₹${payable.amount.toLocaleString('en-IN')} × ${payable.contractualLateRatePct}% × (${delayDays} / 365)`,
        inputs: {
          principal: payable.amount,
          contractualRatePct: payable.contractualLateRatePct,
          delayDays,
        },
      });
      assumptions.push(
        `Explicit contractual late charge at ${payable.contractualLateRatePct}% p.a. for ${delayDays} day(s) past ${payable.dueDate}`
      );
    }
  }

  const totalEstimatedCost = components.reduce((sum, c) => sum + c.amount, 0);

  return {
    actionType,
    entityId: payable.payableId,
    entityName: payable.supplierName,
    amount: payable.amount,
    delayDays,
    executionDate,
    totalEstimatedCost,
    avoidedCostOrDiscountSavings,
    components,
    assumptions: assumptions.length > 0 ? assumptions : ['Settled on due date with zero incremental delay cost'],
    ruleReferences: rules,
    dataSource: `Payables ledger (${payable.invoiceNumber})`,
  };
}

export function calculateReceivableAccelerationCost(
  receivable: Receivable,
  facility: FinancingOption,
  analysisDate: string
): ActionCostEvaluation {
  const settlementDate = format(addDays(parseISO(analysisDate), 2), 'yyyy-MM-dd');
  const expectedObj = parseISO(receivable.expectedPaymentDate);
  const settlementObj = parseISO(settlementDate);
  const computedDays = Math.max(1, differenceInCalendarDays(expectedObj, settlementObj));
  const financingDays = receivable.financingDays > 0 ? receivable.financingDays : computedDays;
  const annualRate = receivable.financingRatePct > 0 ? receivable.financingRatePct : facility.annualRatePct;

  const interestCost = Math.round(
    (receivable.amount * (annualRate / 100) * financingDays) / 365
  );
  const accelFee = Math.round(
    (receivable.amount * (receivable.accelerationFeePct || 0)) / 100
  );

  const components: CostComponent[] = [
    {
      type: 'financing_interest',
      label: 'Illustrative Discounting Interest',
      amount: interestCost,
      formula: `₹${receivable.amount.toLocaleString('en-IN')} × ${annualRate}% × (${financingDays} / 365)`,
      inputs: {
        receivableAmount: receivable.amount,
        annualRatePct: annualRate,
        financingDays,
      },
      isIllustrativeEstimate: true,
    },
  ];

  if (accelFee > 0) {
    components.push({
      type: 'acceleration_fee',
      label: 'Platform / Processing Fee',
      amount: accelFee,
      formula: `₹${receivable.amount.toLocaleString('en-IN')} × ${receivable.accelerationFeePct}%`,
      inputs: {
        receivableAmount: receivable.amount,
        feePct: receivable.accelerationFeePct,
      },
      isIllustrativeEstimate: true,
    });
  }

  const totalEstimatedCost = components.reduce((s, c) => s + c.amount, 0);

  return {
    actionType: 'accelerate_receivable',
    entityId: receivable.receivableId,
    entityName: receivable.customerName,
    amount: receivable.amount,
    delayDays: -computedDays,
    executionDate: settlementDate,
    totalEstimatedCost,
    avoidedCostOrDiscountSavings: 0,
    components,
    assumptions: [
      `Illustrative assumption / demo input via ${facility.name}`,
      `Advances expected inflow from ${receivable.expectedPaymentDate} to ${settlementDate} (${computedDays} days earlier)`,
      `Facility fixed fee (₹${facility.fixedFee.toLocaleString('en-IN')}) accounted once per active facility utilization`,
    ],
    ruleReferences: [],
    dataSource: `Receivables ledger (${receivable.invoiceNumber}) & ${facility.sourceMetadata}`,
  };
}

export function calculateFinancingDrawdownCost(
  option: FinancingOption,
  drawnAmount: number,
  durationDays: number
): {
  totalCost: number;
  components: CostComponent[];
} {
  if (drawnAmount <= 0) {
    return { totalCost: 0, components: [] };
  }

  const effectiveDays = Math.max(1, Math.min(durationDays, option.maxDurationDays));
  const interest = Math.round(
    (drawnAmount * (option.annualRatePct / 100) * effectiveDays) / 365
  );

  const components: CostComponent[] = [
    {
      type: 'financing_interest',
      label: `${option.name} Interest`,
      amount: interest,
      formula: `₹${drawnAmount.toLocaleString('en-IN')} × ${option.annualRatePct}% × (${effectiveDays} / 365)`,
      inputs: {
        drawnAmount,
        annualRatePct: option.annualRatePct,
        durationDays: effectiveDays,
      },
      isIllustrativeEstimate: true,
    },
  ];

  if (option.fixedFee > 0) {
    components.push({
      type: 'financing_fixed_fee',
      label: 'Illustrative Facility Drawdown Fee',
      amount: option.fixedFee,
      formula: `Fixed fee ₹${option.fixedFee.toLocaleString('en-IN')} per active facility`,
      inputs: {
        fixedFee: option.fixedFee,
      },
      isIllustrativeEstimate: true,
    });
  }

  return {
    totalCost: interest + option.fixedFee,
    components,
  };
}
