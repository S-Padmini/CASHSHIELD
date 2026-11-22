import { addDays, format, parseISO } from 'date-fns';
import type {
  ActionCostEvaluation,
  AnalysisResult,
  DatasetBundle,
} from '../../src/models/schemas.ts';
import {
  calculatePayableActionCost,
  calculateReceivableAccelerationCost,
} from '../costs/costEngine.ts';
import {
  buildBaselineFlowsFromDataset,
  detectShortfall,
  generateDailyForecast,
} from '../forecast/forecastEngine.ts';
import { runConstrainedOptimizer } from '../optimization/optimizer.ts';
import {
  evaluatePayableRules,
  evaluateReceivableEligibility,
} from '../rules/ruleEngine.ts';

export function runFullAnalysis(dataset: DatasetBundle): AnalysisResult {
  const { businessProfile, payables, receivables, cashTransactions, financingOptions } = dataset;

  // 1. Unmitigated Baseline Cash Forecast & Shortfall Detection
  const baselineFlows = buildBaselineFlowsFromDataset(
    businessProfile,
    payables,
    receivables,
    cashTransactions
  );
  const unmitigatedForecast = generateDailyForecast(businessProfile, baselineFlows);
  const shortfall = detectShortfall(businessProfile, unmitigatedForecast, baselineFlows);

  // 2. Deterministic Rule & Cost Audit for all payables
  const startStr = businessProfile.analysisDate;
  const endStr = format(
    addDays(parseISO(startStr), businessProfile.planningHorizonDays - 1),
    'yyyy-MM-dd'
  );

  const payableRulesAudit = payables.map((p) => {
    const rules = evaluatePayableRules(p, businessProfile);
    const clampedDue = p.dueDate < startStr ? startStr : p.dueDate > endStr ? endStr : p.dueDate;
    const costOptions: ActionCostEvaluation[] = [];

    if (p.discountPct > 0 && p.discountDeadline && p.discountDeadline >= startStr) {
      const discDate = p.discountDeadline <= p.dueDate ? p.discountDeadline : p.dueDate;
      costOptions.push(
        calculatePayableActionCost(p, 'capture_discount', discDate, businessProfile, rules)
      );
    }

    costOptions.push(
      calculatePayableActionCost(p, 'pay_on_time', clampedDue, businessProfile, rules)
    );

    for (const d of [7, 14, 21]) {
      const delayed = format(addDays(parseISO(clampedDue), d), 'yyyy-MM-dd');
      const capped = delayed > endStr ? endStr : delayed;
      if (capped > clampedDue) {
        costOptions.push(
          calculatePayableActionCost(p, 'delay_payable', capped, businessProfile, rules)
        );
      }
    }

    return {
      payableId: p.payableId,
      supplierName: p.supplierName,
      amount: p.amount,
      dueDate: p.dueDate,
      rules,
      costOptions,
    };
  });

  // 3. Deterministic Receivable Eligibility & Acceleration Cost Audit
  const receivableAudit = receivables.map((r) => {
    const elig = evaluateReceivableEligibility(r, financingOptions);
    const accelEval =
      elig.eligible && elig.matchingFacility
        ? calculateReceivableAccelerationCost(r, elig.matchingFacility, startStr)
        : null;
    return {
      receivableId: r.receivableId,
      customerName: r.customerName,
      amount: r.amount,
      dueDate: r.dueDate,
      expectedPaymentDate: r.expectedPaymentDate,
      overdueDays: r.overdueDays,
      eligibleForFinancing: elig.eligible,
      accelerationEvaluation: accelEval,
      eligibilityReason: elig.reason,
    };
  });

  // 4. Constrained Optimization + Greedy Baseline (using exact same inputs)
  const { baselinePlan, optimizedPlan, nodesEvaluated, executionMs } = runConstrainedOptimizer(
    businessProfile,
    payables,
    receivables,
    cashTransactions,
    financingOptions
  );

  const baselineCost = baselinePlan.feasible ? baselinePlan.totalEstimatedCost : 0;
  const optimizedCost = optimizedPlan.feasible ? optimizedPlan.totalEstimatedCost : 0;
  const bothFeasible = baselinePlan.feasible && optimizedPlan.feasible;
  const estimatedImprovement = bothFeasible ? Math.max(0, baselineCost - optimizedCost) : 0;
  const improvementPct =
    bothFeasible && baselineCost > 0
      ? Number(((estimatedImprovement / baselineCost) * 100).toFixed(1))
      : 0;

  return {
    generatedAt: new Date().toISOString(),
    datasetSummary: {
      businessName: businessProfile.businessName,
      analysisDate: businessProfile.analysisDate,
      planningHorizonDays: businessProfile.planningHorizonDays,
      openingCash: businessProfile.currentCash,
      minimumReserve: businessProfile.minimumCashReserve,
      totalPayables: payables.reduce((s, p) => s + p.amount, 0),
      payableCount: payables.length,
      totalReceivables: receivables.reduce((s, r) => s + r.amount, 0),
      receivableCount: receivables.length,
      protectedPayroll: businessProfile.protectedPayroll,
      totalFinancingAvailable: financingOptions.reduce((s, f) => s + f.availableAmount, 0),
      isSyntheticDemo: businessProfile.isSyntheticDemo,
    },
    unmitigatedForecast,
    shortfall,
    baselinePlan,
    optimizedPlan,
    comparison: {
      sameAssumptionsVerified: true,
      baselineCost,
      optimizedCost,
      estimatedImprovement,
      improvementPct,
    },
    payableRulesAudit,
    receivableAudit,
    solverMetadata: {
      method: 'Deterministic bounded combinatorial search + exact facility-subset selection + independent constraint validator',
      nodesEvaluated,
      executionMs,
      taxTimingDisclaimer:
        'Illustrative decision-support estimate only — not legal, lending, or tax advice.',
    },
  };
}
