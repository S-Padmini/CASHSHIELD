import { z } from 'zod';

export const SupplierSizeSchema = z.enum(['micro', 'small', 'medium', 'large', 'unknown']);
export type SupplierSize = z.infer<typeof SupplierSizeSchema>;

export const MseEligibilitySchema = z.enum(['eligible', 'not_eligible', 'unknown']);
export type MseEligibility = z.infer<typeof MseEligibilitySchema>;

export const PayableStatusSchema = z.enum(['pending', 'scheduled', 'paid', 'overdue']);
export type PayableStatus = z.infer<typeof PayableStatusSchema>;

export const RuleConfigSchema = z.object({
  msmedRuleVersion: z.string().min(1),
  msmedEffectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  msmedAnnualInterestRatePct: z.number().min(0).max(60),
  msmedRbiBankRateAssumptionPct: z.number().min(0).max(20),
  msmedMultiplier: z.number().min(1).max(5),
  msmedMaxWrittenAgreementDays: z.number().int().min(15).max(90),
  msmedDefaultNoAgreementDays: z.number().int().min(1).max(45),
  taxTimingEstimateEnabled: z.boolean().default(true),
  taxTimingMarginalRatePct: z.number().min(0).max(50).default(0),
});
export type RuleConfig = z.infer<typeof RuleConfigSchema>;

export const BusinessProfileSchema = z.object({
  businessName: z.string().min(1),
  industry: z.string().optional(),
  analysisDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  planningHorizonDays: z.number().int().min(7).max(90),
  currentCash: z.number().min(0),
  minimumCashReserve: z.number().min(0),
  protectedPayroll: z.number().min(0),
  payrollDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taxYear: z.string().min(1),
  ruleConfig: RuleConfigSchema,
  criticalSupplierIds: z.array(z.string()),
  mandatoryCategories: z.array(z.string()),
  isSyntheticDemo: z.boolean().default(true),
});
export type BusinessProfile = z.infer<typeof BusinessProfileSchema>;

export const PayableSchema = z.object({
  payableId: z.string().min(1),
  supplierName: z.string().min(1),
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  acceptanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  supplierSize: SupplierSizeSchema,
  mseEligibility: MseEligibilitySchema,
  udyamRegistered: z.boolean().nullable().optional(),
  // Explicit written-agreement flag. null means the source did not establish this fact.
  writtenAgreementPresent: z.boolean().nullable().optional(),
  agreementDays: z.number().int().min(0).max(180).nullable().optional(),
  discountPct: z.number().min(0).max(25).default(0),
  discountDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  contractualLateRatePct: z.number().min(0).max(60).nullable().optional(),
  contractHasLateFeeClause: z.boolean().default(false),
  criticalSupplier: z.boolean().default(false),
  mandatoryPayment: z.boolean().default(false),
  category: z.string().min(1),
  status: PayableStatusSchema.default('pending'),
  plannedPaymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
export type Payable = z.infer<typeof PayableSchema>;

export const ReceivableSchema = z.object({
  receivableId: z.string().min(1),
  customerName: z.string().min(1),
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  acceptanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  expectedPaymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  overdueDays: z.number().int().min(0).default(0),
  eligibleForFinancing: z.boolean().default(false),
  financingRatePct: z.number().min(0).max(40).default(0),
  financingDays: z.number().int().min(0).max(180).default(0),
  accelerationFeePct: z.number().min(0).max(10).default(0),
});
export type Receivable = z.infer<typeof ReceivableSchema>;

export const CashTransactionSchema = z.object({
  transactionId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  transactionType: z.enum(['inflow', 'outflow']),
  amount: z.number().positive(),
  category: z.string().min(1),
  linkedInvoiceId: z.string().nullable().optional(),
  description: z.string().min(1),
  isHistorical: z.boolean().default(true),
});
export type CashTransaction = z.infer<typeof CashTransactionSchema>;

export const FinancingTypeSchema = z.enum([
  'receivable_financing',
  'working_capital_od',
  'short_term_credit',
  'promoter_bridge',
]);
export type FinancingType = z.infer<typeof FinancingTypeSchema>;

export const FinancingOptionSchema = z.object({
  optionId: z.string().min(1),
  name: z.string().min(1),
  type: FinancingTypeSchema,
  availableAmount: z.number().min(0),
  annualRatePct: z.number().min(0).max(60),
  maxDurationDays: z.number().int().min(1).max(365),
  requiresEligibleReceivable: z.boolean().default(false),
  fixedFee: z.number().min(0).default(0),
  assumptions: z.array(z.string()),
  sourceMetadata: z.string(),
});
export type FinancingOption = z.infer<typeof FinancingOptionSchema>;

export const PaymentTermRecordSchema = z.object({
  termId: z.string().min(1),
  partyName: z.string().min(1),
  partyType: z.enum(['supplier', 'customer']),
  standardCreditDays: z.number().int().min(0).max(180),
  writtenAgreementPresent: z.boolean(),
  earlyDiscountTerms: z.string(),
  lateFeeClause: z.string(),
  sourceDocument: z.string(),
});
export type PaymentTermRecord = z.infer<typeof PaymentTermRecordSchema>;

export const DatasetBundleSchema = z.object({
  businessProfile: BusinessProfileSchema,
  payables: z.array(PayableSchema),
  receivables: z.array(ReceivableSchema),
  cashTransactions: z.array(CashTransactionSchema),
  financingOptions: z.array(FinancingOptionSchema),
  paymentTerms: z.array(PaymentTermRecordSchema).default([]),
});
export type DatasetBundle = z.infer<typeof DatasetBundleSchema>;

// --- Rule & Cost Types ---

export interface RuleApplicability {
  ruleId: string;
  ruleName: string;
  status: 'eligible' | 'not_eligible' | 'unknown' | 'available' | 'expired' | 'not_applicable';
  effectiveDate: string;
  ruleVersion: string;
  configuredInput: string;
  statutoryDeadlineDate?: string;
  assumptions: string[];
  sourceMetadata: string;
  explanation: string;
}

export interface CostComponent {
  type:
    | 'msmed_interest'
    | 'lost_discount'
    | 'contractual_late_fee'
    | 'financing_interest'
    | 'financing_fixed_fee'
    | 'acceleration_fee'
    | 'tax_timing_estimate';
  label: string;
  amount: number;
  formula: string;
  inputs: Record<string, string | number>;
  isIllustrativeEstimate?: boolean;
}

export interface ActionCostEvaluation {
  actionType:
    | 'pay_on_time'
    | 'capture_discount'
    | 'delay_payable'
    | 'accelerate_receivable'
    | 'draw_financing'
    | 'protect_obligation';
  entityId: string;
  entityName: string;
  amount: number;
  delayDays: number;
  executionDate: string;
  totalEstimatedCost: number;
  avoidedCostOrDiscountSavings: number;
  components: CostComponent[];
  assumptions: string[];
  ruleReferences: RuleApplicability[];
  dataSource: string;
}

// --- Forecast & Shortfall Types ---

export interface ForecastDay {
  date: string;
  label: string;
  openingCash: number;
  inflows: number;
  outflows: number;
  protectedOutflows: number;
  closingCash: number;
  minimumReserve: number;
  shortfallAmount: number;
  isBelowReserve: boolean;
  events: Array<{
    id: string;
    label: string;
    type: 'inflow' | 'outflow' | 'protected' | 'financing';
    amount: number;
  }>;
}

export interface ShortfallDriver {
  date: string;
  description: string;
  amount: number;
  category: string;
}

export interface ShortfallSummary {
  status: 'healthy' | 'warning' | 'crisis';
  headline: string;
  explanation: string;
  openingCash: number;
  minimumReserve: number;
  projectedMinimumCash: number;
  minimumCashDate: string;
  peakShortfallAmount: number;
  firstShortfallDate: string | null;
  shortfallDurationDays: number;
  reserveAtRisk: number;
  primaryDrivers: ShortfallDriver[];
}

// --- Optimization & Recommendation Types ---

export interface FinancingDrawdown {
  optionId: string;
  name: string;
  type: FinancingOption['type'];
  drawnAmount: number;
  durationDays: number;
  estimatedCost: number;
  components: CostComponent[];
  assumptions: string[];
  sourceMetadata: string;
}

export interface RecommendationItem {
  priority: number;
  actionCode: 'PROTECT' | 'PAY' | 'CAPTURE_DISCOUNT' | 'ACCELERATE' | 'DELAY' | 'FINANCE';
  title: string;
  entityId: string;
  entityName: string;
  amount: number;
  originalDate: string;
  recommendedDate: string;
  delayOrAdvanceDays: number;
  estimatedCost: number;
  avoidedCost: number;
  statusLabel: string;
  reasonCodes: string[];
  shortReason: string;
  whyDetails: {
    considered: string;
    selectedReason: string;
    rejectedAlternative: string;
    costDifferenceText: string;
    constraintsApplied: string[];
  };
  mathBreakdown: ActionCostEvaluation;
}

export interface ValidationCheckResult {
  isValid: boolean;
  violatedConstraints: string[];
  checkedConstraints: string[];
}

export interface PlanResult {
  planName: 'baseline' | 'optimized';
  feasible: boolean;
  infeasibilityReasons: string[];
  totalEstimatedCost: number;
  totalFinancingDrawn: number;
  totalReceivablesAccelerated: number;
  totalPayablesDelayedAmount: number;
  minimumCashAfterPlan: number;
  minimumCashDateAfterPlan: string;
  endOfHorizonCash: number;
  forecastAfterPlan: ForecastDay[];
  recommendations: RecommendationItem[];
  financingDrawdowns: FinancingDrawdown[];
  validation: ValidationCheckResult;
  tieBreakNotes: string[];
}

export interface AnalysisResult {
  generatedAt: string;
  datasetSummary: {
    businessName: string;
    analysisDate: string;
    planningHorizonDays: number;
    openingCash: number;
    minimumReserve: number;
    totalPayables: number;
    payableCount: number;
    totalReceivables: number;
    receivableCount: number;
    protectedPayroll: number;
    totalFinancingAvailable: number;
    isSyntheticDemo: boolean;
  };
  unmitigatedForecast: ForecastDay[];
  shortfall: ShortfallSummary;
  baselinePlan: PlanResult;
  optimizedPlan: PlanResult;
  comparison: {
    sameAssumptionsVerified: boolean;
    baselineCost: number;
    optimizedCost: number;
    estimatedImprovement: number;
    improvementPct: number;
  };
  payableRulesAudit: Array<{
    payableId: string;
    supplierName: string;
    amount: number;
    dueDate: string;
    rules: RuleApplicability[];
    costOptions: ActionCostEvaluation[];
  }>;
  receivableAudit: Array<{
    receivableId: string;
    customerName: string;
    amount: number;
    dueDate: string;
    expectedPaymentDate: string;
    overdueDays: number;
    eligibleForFinancing: boolean;
    accelerationEvaluation: ActionCostEvaluation | null;
    eligibilityReason: string;
  }>;
  solverMetadata: {
    method: string;
    nodesEvaluated: number;
    executionMs: number;
    taxTimingDisclaimer: string;
  };
}

// --- What-If Scenario Schemas ---

export const ScenarioModificationSchema = z.object({
  openingCashDelta: z.number().optional(),
  minimumReserveOverride: z.number().min(0).optional(),
  financingRateDeltaPct: z.number().min(-20).max(40).optional(),
  financingRateOverridePct: z.number().min(0).max(60).optional(),
  financingUnavailable: z.boolean().optional(),
  receivableDelayAdjustments: z
    .array(
      z.object({
        receivableId: z.string(),
        delayDays: z.number().int().min(-30).max(60),
        disableFinancing: z.boolean().optional(),
      })
    )
    .optional(),
  payableDelayAdjustments: z
    .array(
      z.object({
        payableId: z.string(),
        extraGraceDays: z.number().int().min(-15).max(45),
      })
    )
    .optional(),
  label: z.string().optional(),
});
export type ScenarioModification = z.infer<typeof ScenarioModificationSchema>;

export interface ScenarioComparisonResult {
  scenarioId: string;
  label: string;
  timestamp: string;
  changedAssumptions: string[];
  baseline: AnalysisResult;
  scenario: AnalysisResult;
  differences: {
    minimumCashDelta: number;
    shortfallDelta: number;
    estimatedCostDelta: number;
    financingDrawnDelta: number;
    shortfallDateChanged: boolean;
    actionChanges: Array<{
      entityName: string;
      baselineAction: string;
      scenarioAction: string;
      costImpact: number;
    }>;
    summaryExplanation: string;
  };
}

// --- AI Schemas (Strictly Validated) ---

export const ParsedWhatIfSchema = z.object({
  confident: z.boolean(),
  clarificationQuestion: z.string().nullable().optional(),
  interpretationSummary: z.string(),
  modification: ScenarioModificationSchema,
});
export type ParsedWhatIf = z.infer<typeof ParsedWhatIfSchema>;

export const ExtractedDocumentSchema = z
  .object({
    docType: z.enum(['payable', 'receivable']),
    partyName: z.string().min(1),
    invoiceNumber: z.string().min(1),
    amount: z.number().positive(),
    invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    acceptanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    supplierSize: SupplierSizeSchema.optional(),
    discountPct: z.number().min(0).max(25).optional(),
    discountDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    contractualLateRatePct: z.number().min(0).max(60).nullable().optional(),
    paymentTerms: z.string().optional(),
    extractedClauses: z.array(z.string()).default([]),
    confidenceNotes: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.dueDate < value.invoiceDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dueDate'], message: 'dueDate cannot precede invoiceDate' });
    }
    if (value.acceptanceDate && value.acceptanceDate < value.invoiceDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['acceptanceDate'], message: 'acceptanceDate cannot precede invoiceDate' });
    }
    if (value.discountDeadline && value.discountDeadline < value.invoiceDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountDeadline'], message: 'discountDeadline cannot precede invoiceDate' });
    }
  });
export type ExtractedDocument = z.infer<typeof ExtractedDocumentSchema>;

export const CollectionMessagesSchema = z.object({
  email: z.string().min(1),
  whatsapp: z.string().min(1),
  hinglish: z.string().min(1),
});
export type CollectionMessages = z.infer<typeof CollectionMessagesSchema>;
