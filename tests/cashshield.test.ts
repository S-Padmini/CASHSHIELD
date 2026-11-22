import { describe, expect, it } from 'vitest';
import { DEMO_DATASET } from '../data/demo/demoDataset.ts';
import { calculateFinancingDrawdownCost, calculateMsmedCompoundInterest, calculatePayableActionCost } from '../server/costs/costEngine.ts';
import { buildBaselineFlowsFromDataset, detectShortfall, generateDailyForecast } from '../server/forecast/forecastEngine.ts';
import { validateDatasetIntegrity } from '../server/routes/api.ts';
import { evaluatePayableRules, evaluateReceivableEligibility } from '../server/rules/ruleEngine.ts';
import { runWhatIfScenario } from '../server/scenarios/scenarioEngine.ts';
import { runFullAnalysis } from '../server/services/analysisService.ts';
import { CollectionMessagesSchema, ExtractedDocumentSchema, ParsedWhatIfSchema, type DatasetBundle } from '../src/models/schemas.ts';
import { parseAndValidateCsv } from '../src/utils/csvParser.ts';

describe('CashShield Forecast & Shortfall Detection', () => {
  it('detects projected cash crisis in the demo dataset', () => {
    const flows = buildBaselineFlowsFromDataset(
      DEMO_DATASET.businessProfile,
      DEMO_DATASET.payables,
      DEMO_DATASET.receivables,
      DEMO_DATASET.cashTransactions
    );
    const forecast = generateDailyForecast(DEMO_DATASET.businessProfile, flows);
    const summary = detectShortfall(DEMO_DATASET.businessProfile, forecast, flows);

    expect(forecast).toHaveLength(DEMO_DATASET.businessProfile.planningHorizonDays);
    expect(summary.status).toBe('crisis');
    expect(summary.peakShortfallAmount).toBeGreaterThan(0);
    expect(summary.firstShortfallDate).not.toBeNull();
    expect(summary.primaryDrivers.length).toBeGreaterThan(0);
  });

  it('treats cash exactly equal to minimum reserve as warning, not crisis', () => {
    const exactReserveDataset: DatasetBundle = {
      ...structuredClone(DEMO_DATASET),
      businessProfile: {
        ...DEMO_DATASET.businessProfile,
        currentCash: 100000,
        minimumCashReserve: 100000,
        protectedPayroll: 0,
      },
      payables: [],
      receivables: [],
      cashTransactions: [],
    };
    const flows = buildBaselineFlowsFromDataset(
      exactReserveDataset.businessProfile,
      exactReserveDataset.payables,
      exactReserveDataset.receivables,
      exactReserveDataset.cashTransactions
    );
    const forecast = generateDailyForecast(exactReserveDataset.businessProfile, flows);
    const summary = detectShortfall(exactReserveDataset.businessProfile, forecast, flows);

    expect(summary.status).not.toBe('crisis');
    expect(summary.peakShortfallAmount).toBe(0);
    expect(summary.projectedMinimumCash).toBe(100000);
  });

  it('reports healthy plan when cash stays comfortably above reserve', () => {
    const healthyDataset: DatasetBundle = {
      ...structuredClone(DEMO_DATASET),
      businessProfile: {
        ...DEMO_DATASET.businessProfile,
        currentCash: 2500000,
        minimumCashReserve: 100000,
      },
    };
    const analysis = runFullAnalysis(healthyDataset);
    expect(analysis.shortfall.status).toBe('healthy');
    expect(analysis.optimizedPlan.feasible).toBe(true);
    expect(analysis.optimizedPlan.totalFinancingDrawn).toBe(0);
  });
});

describe('CashShield Deterministic Rule & Cost Engines', () => {
  it('evaluates eligible MSE, unknown MSE, expired discount, and contractual late fee accurately', () => {
    const msePayable = DEMO_DATASET.payables.find((p) => p.payableId === 'PAY-001')!;
    const unknownPayable = DEMO_DATASET.payables.find((p) => p.payableId === 'PAY-008')!;
    const expiredDiscPayable = DEMO_DATASET.payables.find((p) => p.payableId === 'PAY-011')!;

    const mseRules = evaluatePayableRules(msePayable, DEMO_DATASET.businessProfile);
    expect(mseRules.find((r) => r.ruleId === 'RULE_MSMED_DELAY')?.status).toBe('eligible');

    const unknownRules = evaluatePayableRules(unknownPayable, DEMO_DATASET.businessProfile);
    const unknownMsmed = unknownRules.find((r) => r.ruleId === 'RULE_MSMED_DELAY');
    expect(unknownMsmed?.status).toBe('unknown');
    expect(unknownMsmed?.assumptions.some((a) => a.includes('missing'))).toBe(true);

    const expRules = evaluatePayableRules(expiredDiscPayable, DEMO_DATASET.businessProfile);
    expect(expRules.find((r) => r.ruleId === 'RULE_EARLY_DISCOUNT')?.status).toBe('expired');
  });

  it('calculates MSMED monthly-rest interest, discount loss, and financing formulas', () => {
    // Section 16: compound interest with monthly rests (30-day monthly-rest test case).
    expect(calculateMsmedCompoundInterest(100000, 17.25, '2026-11-01', '2026-12-01')).toBe(1438);

    const msePayable = DEMO_DATASET.payables.find((p) => p.payableId === 'PAY-001')!;
    const mseRules = evaluatePayableRules(msePayable, DEMO_DATASET.businessProfile);
    expect(mseRules.find((r) => r.ruleId === 'RULE_MSMED_DELAY')?.statutoryDeadlineDate).toBe('2026-11-26');

    const noAgreement = {
      ...msePayable,
      acceptanceDate: '2026-11-01',
      writtenAgreementPresent: false,
      agreementDays: 45,
    };
    const noAgreementRule = evaluatePayableRules(noAgreement, DEMO_DATASET.businessProfile).find(
      (r) => r.ruleId === 'RULE_MSMED_DELAY'
    );
    expect(noAgreementRule?.statutoryDeadlineDate).toBe('2026-11-17');

    const missingAcceptance = {
      ...msePayable,
      acceptanceDate: null,
      writtenAgreementPresent: true,
    };
    expect(
      evaluatePayableRules(missingAcceptance, DEMO_DATASET.businessProfile).find(
        (r) => r.ruleId === 'RULE_MSMED_DELAY'
      )?.status
    ).toBe('unknown');

    const discountPayable = DEMO_DATASET.payables.find((p) => p.payableId === 'PAY-002')!;
    const discRules = evaluatePayableRules(discountPayable, DEMO_DATASET.businessProfile);

    const captureCost = calculatePayableActionCost(
      discountPayable,
      'capture_discount',
      '2026-11-24',
      DEMO_DATASET.businessProfile,
      discRules
    );
    expect(captureCost.totalEstimatedCost).toBe(0);
    expect(captureCost.avoidedCostOrDiscountSavings).toBe(3000);

    const delayCost = calculatePayableActionCost(
      discountPayable,
      'delay_payable',
      '2026-12-09',
      DEMO_DATASET.businessProfile,
      discRules
    );
    expect(delayCost.totalEstimatedCost).toBe(3000);
    expect(delayCost.components[0]?.type).toBe('lost_discount');

    // Overdue receivable must be ineligible for financing
    const overdueRec = DEMO_DATASET.receivables.find((r) => r.receivableId === 'REC-003')!;
    const elig = evaluateReceivableEligibility(overdueRec, DEMO_DATASET.financingOptions);
    expect(elig.eligible).toBe(false);

    // Financing cost check
    const od = DEMO_DATASET.financingOptions.find((f) => f.optionId === 'FIN-002')!;
    const finCost = calculateFinancingDrawdownCost(od, 100000, 15);
    expect(finCost.totalCost).toBe(Math.round((100000 * 0.125 * 15) / 365) + 1000);
  });
});

describe('CashShield Constrained Optimizer & Safety Validator', () => {
  it('produces a valid, constraint-respecting plan that improves or matches baseline', () => {
    const analysis = runFullAnalysis(DEMO_DATASET);

    expect(analysis.optimizedPlan.feasible).toBe(true);
    expect(analysis.optimizedPlan.validation.isValid).toBe(true);
    expect(analysis.optimizedPlan.minimumCashAfterPlan).toBeGreaterThanOrEqual(
      DEMO_DATASET.businessProfile.minimumCashReserve
    );

    // Must protect payroll & critical/mandatory suppliers
    const pay001 = analysis.optimizedPlan.recommendations.find((r) => r.entityId === 'PAY-001');
    const pay005 = analysis.optimizedPlan.recommendations.find((r) => r.entityId === 'PAY-005');
    expect(pay001?.actionCode).toBe('PAY');
    expect(pay005?.actionCode).toBe('PAY');

    // Optimizer must beat or match greedy baseline on identical inputs
    if (analysis.baselinePlan.feasible) {
      expect(analysis.optimizedPlan.totalEstimatedCost).toBeLessThanOrEqual(
        analysis.baselinePlan.totalEstimatedCost
      );
    }
  });

  it('rejects infeasible plans cleanly when no financing and insufficient cash', () => {
    const noFinDataset: DatasetBundle = {
      ...structuredClone(DEMO_DATASET),
      financingOptions: DEMO_DATASET.financingOptions.map((f) => ({
        ...f,
        availableAmount: 0,
      })),
    };
    const analysis = runFullAnalysis(noFinDataset);
    expect(analysis.optimizedPlan.feasible).toBe(false);
    expect(analysis.optimizedPlan.validation.isValid).toBe(false);
    expect(analysis.optimizedPlan.infeasibilityReasons.length).toBeGreaterThan(0);
  });
});

describe('CashShield What-If Scenario Engine', () => {
  it('recomputes plan when customer delays payment or financing rates jump', () => {
    const delayedCust = runWhatIfScenario(DEMO_DATASET, {
      receivableDelayAdjustments: [{ receivableId: 'REC-001', delayDays: 10 }],
    });
    expect(delayedCust.scenario.shortfall.peakShortfallAmount).toBeGreaterThanOrEqual(
      delayedCust.baseline.shortfall.peakShortfallAmount
    );

    const rateSpike = runWhatIfScenario(DEMO_DATASET, {
      financingRateOverridePct: 24,
    });
    expect(rateSpike.differences.estimatedCostDelta).toBeGreaterThan(0);

    const cashDrop = runWhatIfScenario(DEMO_DATASET, {
      openingCashDelta: -100000,
    });
    expect(cashDrop.differences.minimumCashDelta).toBe(-100000);
  });
});

describe('CSV Validation, Dataset Integrity & AI Schema Guards', () => {
  it('blocks CSVs with missing columns, negative amounts, duplicate IDs, or conflicting dates', () => {
    const badCols = parseAndValidateCsv('payables', 'payableId,supplierName\nP1,Acme');
    expect(badCols.ok).toBe(false);
    expect(badCols.errors[0]).toContain('Missing required column');

    const badValues = parseAndValidateCsv(
      'payables',
      'payableId,supplierName,invoiceNumber,invoiceDate,dueDate,amount\nP1,Acme,INV1,2026-11-20,2026-11-10,-500'
    );
    expect(badValues.ok).toBe(false);

    const dupIds = parseAndValidateCsv(
      'payables',
      'payableId,supplierName,invoiceNumber,invoiceDate,dueDate,amount\nP1,Acme,INV1,2026-11-10,2026-11-25,1000\nP1,Beta,INV2,2026-11-10,2026-11-25,2000'
    );
    expect(dupIds.ok).toBe(false);
    expect(dupIds.errors[0]).toContain('Duplicate payableId');

    const badTransactionType = parseAndValidateCsv(
      'cashTransactions',
      'transactionId,date,transactionType,amount,category,description\nT1,2026-11-20,sideways,1000,Operations,Test'
    );
    expect(badTransactionType.ok).toBe(false);
    expect(badTransactionType.errors[0]).toContain('transactionType');

    const bomCsv = parseAndValidateCsv(
      'cashTransactions',
      '\uFEFFtransactionId,date,transactionType,amount,category,description\nT2,2026-11-20,inflow,1000,Other,Test'
    );
    expect(bomCsv.ok).toBe(true);
  });

  it('validates dataset integrity against conflicting dates', () => {
    const badDataset = structuredClone(DEMO_DATASET);
    badDataset.payables[0].dueDate = '2026-09-01'; // before invoiceDate
    const issues = validateDatasetIntegrity(badDataset);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('enforces strict Zod validation on AI structured outputs', () => {
    const validWhatIf = ParsedWhatIfSchema.safeParse({
      confident: true,
      interpretationSummary: 'Delay REC-001 by 10 days',
      modification: {
        receivableDelayAdjustments: [{ receivableId: 'REC-001', delayDays: 10 }],
      },
    });
    expect(validWhatIf.success).toBe(true);

    const malformedDoc = ExtractedDocumentSchema.safeParse({
      docType: 'payable',
      partyName: 'Test Corp',
      amount: -100, // invalid negative
    });
    expect(malformedDoc.success).toBe(false);

    const validCollectionDrafts = CollectionMessagesSchema.safeParse({
      email: 'Email draft',
      whatsapp: 'WhatsApp draft',
      hinglish: 'Hinglish draft',
    });
    expect(validCollectionDrafts.success).toBe(true);
  });
});
