import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import type {
  BusinessProfile,
  FinancingOption,
  Payable,
  Receivable,
  RuleApplicability,
} from '../../src/models/schemas.ts';

export function evaluatePayableRules(
  payable: Payable,
  profile: BusinessProfile
): RuleApplicability[] {
  const rules: RuleApplicability[] = [];
  const { ruleConfig, analysisDate } = profile;

  // 1. MSMED Delayed-Payment Rule
  // Section 2(b) defines the appointed day from acceptance/deemed acceptance.
  // We do not infer acceptance from invoice date because that can materially change
  // the statutory clock. Imported records without acceptance evidence stay UNKNOWN.
  const hasAcceptance = Boolean(payable.acceptanceDate);
  const baseDateStr = payable.acceptanceDate || null;
  let statutoryDeadlineDate: string | undefined;
  let deadlineExplanation = '';

  if (baseDateStr) {
    const hasWrittenAgreement = payable.writtenAgreementPresent;
    if (hasWrittenAgreement === true && payable.agreementDays != null && payable.agreementDays > 0) {
      const effectiveLimitDays = Math.min(
        payable.agreementDays,
        ruleConfig.msmedMaxWrittenAgreementDays
      );
      statutoryDeadlineDate = format(
        addDays(parseISO(baseDateStr), effectiveLimitDays),
        'yyyy-MM-dd'
      );
      deadlineExplanation =
        `Written agreement of ${payable.agreementDays} day(s), capped at ${ruleConfig.msmedMaxWrittenAgreementDays} days from acceptance/deemed acceptance`;
    } else if (hasWrittenAgreement === false) {
      // "appointed day" is the day immediately after expiry of 15 days.
      const appointedDayOffset = ruleConfig.msmedDefaultNoAgreementDays + 1;
      statutoryDeadlineDate = format(
        addDays(parseISO(baseDateStr), appointedDayOffset),
        'yyyy-MM-dd'
      );
      deadlineExplanation =
        `No written payment-period agreement; appointed day is the day after ${ruleConfig.msmedDefaultNoAgreementDays} days from acceptance/deemed acceptance`;
    } else if (hasWrittenAgreement === true) {
      const appointedDayOffset = ruleConfig.msmedDefaultNoAgreementDays + 1;
      statutoryDeadlineDate = format(
        addDays(parseISO(baseDateStr), appointedDayOffset),
        'yyyy-MM-dd'
      );
      deadlineExplanation =
        `Written-agreement flag is present but no valid credit period was supplied; using the statutory no-period appointed-day fallback`;
    }
  }

  if (payable.mseEligibility === 'eligible' && hasAcceptance && statutoryDeadlineDate) {
    const assumptions = [
      `Configured statutory rate: ${ruleConfig.msmedAnnualInterestRatePct}% p.a. (${ruleConfig.msmedMultiplier} × RBI Bank Rate ${ruleConfig.msmedRbiBankRateAssumptionPct}%)`,
      deadlineExplanation,
      'Acceptance/deemed-acceptance date is taken from the imported record; no invoice-date proxy is used',
      'MSMED Section 16 interest is modeled as compound interest with monthly rests',
    ];

    rules.push({
      ruleId: 'RULE_MSMED_DELAY',
      ruleName: 'MSMED Delayed-Payment Interest Rule',
      status: 'eligible',
      effectiveDate: ruleConfig.msmedEffectiveDate,
      ruleVersion: ruleConfig.msmedRuleVersion,
      configuredInput: `${ruleConfig.msmedAnnualInterestRatePct}% p.a. after ${statutoryDeadlineDate}`,
      statutoryDeadlineDate,
      assumptions,
      sourceMetadata: `Payable ${payable.payableId} (${payable.supplierSize.toUpperCase()}, Udyam=${payable.udyamRegistered ? 'Yes' : 'Recorded'})`,
      explanation: `Eligible Micro/Small supplier. Delaying past ${statutoryDeadlineDate} triggers modeled Section 16 compound interest with monthly rests at ${ruleConfig.msmedAnnualInterestRatePct}% p.a.`,
    });
  } else if (payable.mseEligibility === 'eligible') {
    rules.push({
      ruleId: 'RULE_MSMED_DELAY',
      ruleName: 'MSMED Delayed-Payment Interest Rule',
      status: 'unknown',
      effectiveDate: ruleConfig.msmedEffectiveDate,
      ruleVersion: ruleConfig.msmedRuleVersion,
      configuredInput: 'Verification required (acceptance/deemed-acceptance evidence missing or agreement status unresolved)',
      assumptions: [
        'Supplier is classified as Micro/Small, but the statutory payment clock cannot be safely derived from the supplied evidence',
        !hasAcceptance
          ? 'Acceptance/deemed-acceptance date is missing; invoice date is NOT used as a statutory proxy'
          : 'Written-agreement status or payment period is incomplete',
        'Verify the underlying delivery/acceptance record and written payment terms before finalizing delay decisions',
      ],
      ...(statutoryDeadlineDate ? { statutoryDeadlineDate } : {}),
      sourceMetadata: `Payable ${payable.payableId} (${payable.supplierSize.toUpperCase()})`,
      explanation:
        'MSMED applicability is potentially relevant, but the statutory clock is not calculated until the required acceptance and agreement evidence is verified.',
    });
  } else if (payable.mseEligibility === 'unknown') {
    rules.push({
      ruleId: 'RULE_MSMED_DELAY',
      ruleName: 'MSMED Delayed-Payment Interest Rule',
      status: 'unknown',
      effectiveDate: ruleConfig.msmedEffectiveDate,
      ruleVersion: ruleConfig.msmedRuleVersion,
      configuredInput: 'Verification required (Udyam / acceptance missing)',
      ...(statutoryDeadlineDate ? { statutoryDeadlineDate } : {}),
      assumptions: [
        'Supplier size and Udyam registration are unknown — MSE status is NOT assumed automatically',
        !hasAcceptance
          ? 'Acceptance date is missing in imported record'
          : `Acceptance date recorded as ${payable.acceptanceDate}`,
        'Confirm Udyam certificate before finalizing delay decisions',
      ],
      sourceMetadata: `Payable ${payable.payableId} (Supplier size: unknown)`,
      explanation:
        'Eligibility unknown. System does not assume MSMED interest automatically; verify supplier Udyam registration.',
    });
  } else {
    rules.push({
      ruleId: 'RULE_MSMED_DELAY',
      ruleName: 'MSMED Delayed-Payment Interest Rule',
      status: 'not_eligible',
      effectiveDate: ruleConfig.msmedEffectiveDate,
      ruleVersion: ruleConfig.msmedRuleVersion,
      configuredInput: 'Not applicable (Non-MSE / Medium / Large)',
      assumptions: [
        `Supplier classified as ${payable.supplierSize}; outside Micro/Small supplier scope`,
      ],
      sourceMetadata: `Payable ${payable.payableId} (Udyam MSE: No)`,
      explanation: 'Supplier is not an eligible Micro/Small enterprise under the configured rule.',
    });
  }

  // 2. Early-Payment Discount Rule
  if (payable.discountPct > 0 && payable.discountDeadline) {
    const daysToDeadline = differenceInCalendarDays(
      parseISO(payable.discountDeadline),
      parseISO(analysisDate)
    );
    const discountAmount = Math.round((payable.amount * payable.discountPct) / 100);

    if (daysToDeadline >= 0) {
      rules.push({
        ruleId: 'RULE_EARLY_DISCOUNT',
        ruleName: 'Early-Payment Cash Discount',
        status: 'available',
        effectiveDate: payable.invoiceDate,
        ruleVersion: 'Supplier Invoice Terms',
        configuredInput: `${payable.discountPct}% (₹${discountAmount.toLocaleString('en-IN')}) by ${payable.discountDeadline}`,
        assumptions: [
          `Discount available if settled on or before ${payable.discountDeadline} (${daysToDeadline} days from analysis date)`,
        ],
        sourceMetadata: `Invoice ${payable.invoiceNumber}`,
        explanation: `Paying by ${payable.discountDeadline} captures ₹${discountAmount.toLocaleString('en-IN')} (${payable.discountPct}%). Delaying past deadline forfeits this discount.`,
      });
    } else {
      rules.push({
        ruleId: 'RULE_EARLY_DISCOUNT',
        ruleName: 'Early-Payment Cash Discount',
        status: 'expired',
        effectiveDate: payable.invoiceDate,
        ruleVersion: 'Supplier Invoice Terms',
        configuredInput: `${payable.discountPct}% expired on ${payable.discountDeadline}`,
        assumptions: [
          `Discount window expired ${Math.abs(daysToDeadline)} day(s) before analysis date (${analysisDate}); excluded from savings`,
        ],
        sourceMetadata: `Invoice ${payable.invoiceNumber}`,
        explanation: `Early-payment discount expired on ${payable.discountDeadline} and is no longer available.`,
      });
    }
  } else {
    rules.push({
      ruleId: 'RULE_EARLY_DISCOUNT',
      ruleName: 'Early-Payment Cash Discount',
      status: 'not_applicable',
      effectiveDate: payable.invoiceDate,
      ruleVersion: 'Supplier Invoice Terms',
      configuredInput: '0% (No discount term)',
      assumptions: ['No early-payment discount clause present on invoice'],
      sourceMetadata: `Invoice ${payable.invoiceNumber}`,
      explanation: 'No early-payment discount applies to this payable.',
    });
  }

  // 3. Contractual Late Fee Rule
  if (
    payable.contractHasLateFeeClause &&
    payable.contractualLateRatePct != null &&
    payable.contractualLateRatePct > 0
  ) {
    rules.push({
      ruleId: 'RULE_CONTRACT_LATE_FEE',
      ruleName: 'Contractual Late-Payment Charge',
      status: 'available',
      effectiveDate: payable.invoiceDate,
      ruleVersion: 'Vendor Contract Clause',
      configuredInput: `${payable.contractualLateRatePct}% p.a. simple pro-rata after ${payable.dueDate}`,
      assumptions: [
        'Explicitly configured in synthetic vendor contract terms',
        'Calculated on simple daily pro-rata basis (Amount × Rate × DelayDays / 365)',
      ],
      sourceMetadata: `Contract / Invoice ${payable.invoiceNumber}`,
      explanation: `Explicit contract clause charges ${payable.contractualLateRatePct}% p.a. for settlement past ${payable.dueDate}.`,
    });
  } else {
    rules.push({
      ruleId: 'RULE_CONTRACT_LATE_FEE',
      ruleName: 'Contractual Late-Payment Charge',
      status: 'not_applicable',
      effectiveDate: payable.invoiceDate,
      ruleVersion: 'Vendor Contract Clause',
      configuredInput: 'None configured',
      assumptions: ['No contractual late-fee clause present in vendor terms'],
      sourceMetadata: `Invoice ${payable.invoiceNumber}`,
      explanation: 'No explicit contractual late fee configured.',
    });
  }

  // 4. Mandatory / Critical Protection Rule
  const isMandatoryCategory = profile.mandatoryCategories.includes(payable.category);
  const isCriticalByProfile = profile.criticalSupplierIds.includes(payable.payableId);
  const isMandatory = payable.mandatoryPayment || isMandatoryCategory;
  const isCritical = payable.criticalSupplier || isCriticalByProfile;

  if (isMandatory || isCritical) {
    rules.push({
      ruleId: 'RULE_PROTECTED_OBLIGATION',
      ruleName: isMandatory ? 'Mandatory Payment Protection' : 'Critical Supplier Protection',
      status: 'eligible',
      effectiveDate: profile.analysisDate,
      ruleVersion: 'Business Continuity Policy',
      configuredInput: isMandatory ? `Mandatory (${payable.category})` : 'Critical Supply Chain Partner',
      assumptions: [
        isMandatory
          ? 'Configured mandatory business obligation — cannot be delayed by optimizer'
          : 'Designated critical supplier — protected from payment delay to prevent production halt',
      ],
      sourceMetadata: `Business Profile (${profile.businessName})`,
      explanation: isMandatory
        ? 'Protected as a mandatory obligation; optimizer must schedule on or before due date.'
        : 'Protected as a critical supplier; optimizer prioritizes on-time settlement.',
    });
  }

  return rules;
}

export function evaluateReceivableEligibility(
  receivable: Receivable,
  financingOptions: FinancingOption[]
): {
  eligible: boolean;
  reason: string;
  matchingFacility: FinancingOption | null;
} {
  const recFacility =
    financingOptions.find(
      (f) => f.type === 'receivable_financing' && f.availableAmount > 0
    ) || null;

  if (!recFacility) {
    return {
      eligible: false,
      reason: 'No active receivable financing facility available in current configuration.',
      matchingFacility: null,
    };
  }

  if (receivable.overdueDays > 0) {
    return {
      eligible: false,
      reason: `Invoice is ${receivable.overdueDays} day(s) overdue; overdue receivables are ineligible for invoice discounting.`,
      matchingFacility: recFacility,
    };
  }

  if (!receivable.acceptanceDate) {
    return {
      eligible: false,
      reason: 'Buyer acceptance is not recorded; do not assume a TReDS-style financing unit is financeable without acceptance evidence.',
      matchingFacility: recFacility,
    };
  }

  if (!receivable.eligibleForFinancing) {
    return {
      eligible: false,
      reason: 'Customer/invoice is not marked eligible for anchor-buyer receivable financing.',
      matchingFacility: recFacility,
    };
  }

  if (receivable.amount > recFacility.availableAmount) {
    return {
      eligible: false,
      reason: `Invoice amount exceeds remaining facility limit of ₹${recFacility.availableAmount.toLocaleString('en-IN')}.`,
      matchingFacility: recFacility,
    };
  }

  return {
    eligible: true,
    reason: `Eligible for ${recFacility.name} (${receivable.financingRatePct || recFacility.annualRatePct}% p.a. illustrative rate).`,
    matchingFacility: recFacility,
  };
}
