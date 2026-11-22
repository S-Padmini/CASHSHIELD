import { addDays, format, parseISO } from 'date-fns';
import type {
  DatasetBundle,
  ScenarioComparisonResult,
  ScenarioModification,
} from '../../src/models/schemas.ts';
import { runFullAnalysis } from '../services/analysisService.ts';

export function applyScenarioModification(
  baseDataset: DatasetBundle,
  mod: ScenarioModification
): { modifiedDataset: DatasetBundle; changedAssumptions: string[] } {
  const cloned: DatasetBundle = structuredClone(baseDataset);
  const changedAssumptions: string[] = [];

  if (mod.openingCashDelta !== undefined && mod.openingCashDelta !== 0) {
    cloned.businessProfile.currentCash = Math.max(
      0,
      cloned.businessProfile.currentCash + mod.openingCashDelta
    );
    changedAssumptions.push(
      `Opening cash adjusted by ${mod.openingCashDelta >= 0 ? '+' : ''}₹${mod.openingCashDelta.toLocaleString('en-IN')} to ₹${cloned.businessProfile.currentCash.toLocaleString('en-IN')}`
    );
  }

  if (mod.minimumReserveOverride !== undefined) {
    cloned.businessProfile.minimumCashReserve = Math.max(0, mod.minimumReserveOverride);
    changedAssumptions.push(
      `Minimum reserve set to ₹${cloned.businessProfile.minimumCashReserve.toLocaleString('en-IN')}`
    );
  }

  if (mod.financingUnavailable) {
    cloned.financingOptions = cloned.financingOptions.map((f) => ({
      ...f,
      availableAmount: 0,
    }));
    cloned.receivables = cloned.receivables.map((r) => ({
      ...r,
      eligibleForFinancing: false,
    }));
    changedAssumptions.push('All external financing and receivable discounting marked unavailable');
  } else {
    if (mod.financingRateOverridePct !== undefined) {
      cloned.financingOptions = cloned.financingOptions.map((f) => ({
        ...f,
        annualRatePct: mod.financingRateOverridePct!,
      }));
      cloned.receivables = cloned.receivables.map((r) =>
        r.eligibleForFinancing
          ? { ...r, financingRatePct: mod.financingRateOverridePct! }
          : r
      );
      changedAssumptions.push(
        `All illustrative financing annual rates set to ${mod.financingRateOverridePct}% p.a.`
      );
    } else if (mod.financingRateDeltaPct !== undefined && mod.financingRateDeltaPct !== 0) {
      cloned.financingOptions = cloned.financingOptions.map((f) => ({
        ...f,
        annualRatePct: Math.max(0, Number((f.annualRatePct + mod.financingRateDeltaPct!).toFixed(2))),
      }));
      cloned.receivables = cloned.receivables.map((r) =>
        r.eligibleForFinancing
          ? {
              ...r,
              financingRatePct: Math.max(
                0,
                Number((r.financingRatePct + mod.financingRateDeltaPct!).toFixed(2))
              ),
            }
          : r
      );
      changedAssumptions.push(
        `Illustrative financing rates shifted by ${mod.financingRateDeltaPct >= 0 ? '+' : ''}${mod.financingRateDeltaPct}%`
      );
    }
  }

  if (mod.receivableDelayAdjustments) {
    for (const adj of mod.receivableDelayAdjustments) {
      const rec = cloned.receivables.find((r) => r.receivableId === adj.receivableId);
      if (!rec) continue;
      if (adj.delayDays !== 0) {
        rec.expectedPaymentDate = format(
          addDays(parseISO(rec.expectedPaymentDate), adj.delayDays),
          'yyyy-MM-dd'
        );
        if (adj.delayDays > 0) {
          rec.financingDays = Math.max(0, rec.financingDays + adj.delayDays);
        }
        changedAssumptions.push(
          `${rec.customerName} payment ${adj.delayDays > 0 ? `delayed by ${adj.delayDays}d` : `accelerated by ${Math.abs(adj.delayDays)}d`} (to ${rec.expectedPaymentDate})`
        );
      }
      if (adj.disableFinancing) {
        rec.eligibleForFinancing = false;
        changedAssumptions.push(`${rec.customerName} receivable marked ineligible for financing`);
      }
    }
  }

  if (mod.payableDelayAdjustments) {
    for (const adj of mod.payableDelayAdjustments) {
      const pay = cloned.payables.find((p) => p.payableId === adj.payableId);
      if (!pay) continue;
      if (adj.extraGraceDays !== 0) {
        pay.dueDate = format(addDays(parseISO(pay.dueDate), adj.extraGraceDays), 'yyyy-MM-dd');
        if (pay.agreementDays != null) {
          pay.agreementDays = Math.max(0, pay.agreementDays + adj.extraGraceDays);
        }
        changedAssumptions.push(
          `${pay.supplierName} due date ${adj.extraGraceDays > 0 ? `extended by ${adj.extraGraceDays}d` : `shortened by ${Math.abs(adj.extraGraceDays)}d`} (to ${pay.dueDate})`
        );
      }
    }
  }

  return { modifiedDataset: cloned, changedAssumptions };
}

export function runWhatIfScenario(
  baseDataset: DatasetBundle,
  mod: ScenarioModification
): ScenarioComparisonResult {
  const baseline = runFullAnalysis(baseDataset);
  const { modifiedDataset, changedAssumptions } = applyScenarioModification(baseDataset, mod);
  const scenario = runFullAnalysis(modifiedDataset);

  const minimumCashDelta =
    scenario.shortfall.projectedMinimumCash - baseline.shortfall.projectedMinimumCash;
  const shortfallDelta =
    scenario.shortfall.peakShortfallAmount - baseline.shortfall.peakShortfallAmount;
  const estimatedCostDelta =
    scenario.optimizedPlan.feasible && baseline.optimizedPlan.feasible
      ? scenario.optimizedPlan.totalEstimatedCost - baseline.optimizedPlan.totalEstimatedCost
      : 0;
  const financingDrawnDelta =
    (scenario.optimizedPlan.totalFinancingDrawn + scenario.optimizedPlan.totalReceivablesAccelerated) -
    (baseline.optimizedPlan.totalFinancingDrawn + baseline.optimizedPlan.totalReceivablesAccelerated);

  const shortfallDateChanged =
    scenario.shortfall.firstShortfallDate !== baseline.shortfall.firstShortfallDate;

  // Detect action changes between baseline & scenario optimized plans
  const baseMap = new Map(
    baseline.optimizedPlan.recommendations.map((r) => [r.entityId, r])
  );
  const scenMap = new Map(
    scenario.optimizedPlan.recommendations.map((r) => [r.entityId, r])
  );

  const actionChanges: ScenarioComparisonResult['differences']['actionChanges'] = [];
  const allEntityIds = new Set([...baseMap.keys(), ...scenMap.keys()]);

  for (const id of allEntityIds) {
    const b = baseMap.get(id);
    const s = scenMap.get(id);
    const bLabel = b ? `${b.actionCode} (${b.recommendedDate})` : 'None';
    const sLabel = s ? `${s.actionCode} (${s.recommendedDate})` : 'None';
    if (bLabel !== sLabel || (b?.estimatedCost || 0) !== (s?.estimatedCost || 0)) {
      actionChanges.push({
        entityName: s?.entityName || b?.entityName || id,
        baselineAction: b ? `${b.actionCode} · ${b.statusLabel}` : 'Not utilized',
        scenarioAction: s ? `${s.actionCode} · ${s.statusLabel}` : 'Not utilized',
        costImpact: (s?.estimatedCost || 0) - (b?.estimatedCost || 0),
      });
    }
  }

  let summaryExplanation = '';
  if (!scenario.optimizedPlan.feasible) {
    summaryExplanation = `Under this scenario, no feasible plan preserves the ₹${modifiedDataset.businessProfile.minimumCashReserve.toLocaleString('en-IN')} reserve: ${scenario.optimizedPlan.infeasibilityReasons[0] || 'liquidity limits exceeded'}.`;
  } else if (actionChanges.length === 0 && estimatedCostDelta === 0) {
    summaryExplanation =
      'The selected action plan remained unchanged under these modified assumptions.';
  } else {
    const dir = estimatedCostDelta > 0 ? 'increased' : estimatedCostDelta < 0 ? 'decreased' : 'changed';
    summaryExplanation = `Total estimated plan cost ${dir} by ₹${Math.abs(estimatedCostDelta).toLocaleString('en-IN')} (${actionChanges.length} action adjustment${actionChanges.length === 1 ? '' : 's'}) while keeping minimum cash at ₹${scenario.optimizedPlan.minimumCashAfterPlan.toLocaleString('en-IN')}.`;
  }

  return {
    scenarioId: `SCN-${Date.now()}`,
    label: mod.label || changedAssumptions[0] || 'Custom What-If Scenario',
    timestamp: new Date().toISOString(),
    changedAssumptions,
    baseline,
    scenario,
    differences: {
      minimumCashDelta,
      shortfallDelta,
      estimatedCostDelta,
      financingDrawnDelta,
      shortfallDateChanged,
      actionChanges,
      summaryExplanation,
    },
  };
}
