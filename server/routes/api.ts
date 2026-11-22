import { Router } from 'express';
import { z } from 'zod';
import { DEMO_DATASET } from '../../data/demo/demoDataset.ts';
import {
  DatasetBundleSchema,
  ReceivableSchema,
  ScenarioModificationSchema,
  type DatasetBundle,
} from '../../src/models/schemas.ts';
import {
  explainDeterministicPlan,
  extractInvoiceDocument,
  generateCollectionMessages,
  parseNaturalLanguageWhatIf,
} from '../ai/geminiService.ts';
import { runWhatIfScenario } from '../scenarios/scenarioEngine.ts';
import { runFullAnalysis } from '../services/analysisService.ts';

export const apiRouter = Router();

export function validateDatasetIntegrity(dataset: DatasetBundle): string[] {
  const errors: string[] = [];

  // Duplicate IDs & Invoice numbers
  const payIds = new Set<string>();
  const payInvoices = new Set<string>();
  for (const p of dataset.payables) {
    if (payIds.has(p.payableId)) {
      errors.push(`Duplicate payable ID detected: ${p.payableId}`);
    }
    payIds.add(p.payableId);

    if (payInvoices.has(p.invoiceNumber)) {
      errors.push(`Duplicate payable invoice number detected: ${p.invoiceNumber}`);
    }
    payInvoices.add(p.invoiceNumber);

    if (p.dueDate < p.invoiceDate) {
      errors.push(
        `Conflicting dates on payable ${p.payableId}: due date (${p.dueDate}) precedes invoice date (${p.invoiceDate}).`
      );
    }
    if (p.acceptanceDate && p.acceptanceDate < p.invoiceDate) {
      errors.push(
        `Conflicting dates on payable ${p.payableId}: acceptance date (${p.acceptanceDate}) precedes invoice date (${p.invoiceDate}).`
      );
    }
  }

  const recIds = new Set<string>();
  const recInvoices = new Set<string>();
  for (const r of dataset.receivables) {
    if (recIds.has(r.receivableId)) {
      errors.push(`Duplicate receivable ID detected: ${r.receivableId}`);
    }
    recIds.add(r.receivableId);

    if (recInvoices.has(r.invoiceNumber)) {
      errors.push(`Duplicate receivable invoice number detected: ${r.invoiceNumber}`);
    }
    recInvoices.add(r.invoiceNumber);

    if (r.dueDate < r.invoiceDate) {
      errors.push(
        `Conflicting dates on receivable ${r.receivableId}: due date (${r.dueDate}) precedes invoice date (${r.invoiceDate}).`
      );
    }
    if (r.expectedPaymentDate < r.invoiceDate) {
      errors.push(
        `Conflicting dates on receivable ${r.receivableId}: expected payment date (${r.expectedPaymentDate}) precedes invoice date (${r.invoiceDate}).`
      );
    }
  }

  const txIds = new Set<string>();
  for (const t of dataset.cashTransactions) {
    if (txIds.has(t.transactionId)) {
      errors.push(`Duplicate transaction ID detected: ${t.transactionId}`);
    }
    txIds.add(t.transactionId);
  }

  const finIds = new Set<string>();
  for (const f of dataset.financingOptions) {
    if (finIds.has(f.optionId)) {
      errors.push(`Duplicate financing option ID detected: ${f.optionId}`);
    }
    finIds.add(f.optionId);
  }

  return errors;
}

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'cashshield-api' });
});

apiRouter.get('/demo', (_req, res) => {
  const analysis = runFullAnalysis(DEMO_DATASET);
  res.json({ dataset: DEMO_DATASET, analysis });
});

apiRouter.post('/analyze', (req, res) => {
  const parsed = DatasetBundleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Dataset schema validation failed',
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    return;
  }

  const integrityErrors = validateDatasetIntegrity(parsed.data);
  if (integrityErrors.length > 0) {
    res.status(400).json({
      error: 'Dataset integrity validation failed',
      issues: integrityErrors,
    });
    return;
  }

  const analysis = runFullAnalysis(parsed.data);
  res.json({ analysis });
});

apiRouter.post('/scenario', (req, res) => {
  const bodySchema = z.object({
    dataset: DatasetBundleSchema,
    modification: ScenarioModificationSchema,
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid scenario payload',
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    return;
  }

  const integrityErrors = validateDatasetIntegrity(parsed.data.dataset);
  if (integrityErrors.length > 0) {
    res.status(400).json({
      error: 'Dataset integrity validation failed',
      issues: integrityErrors,
    });
    return;
  }

  const comparison = runWhatIfScenario(parsed.data.dataset, parsed.data.modification);
  res.json({ comparison });
});

apiRouter.post('/ai/parse-what-if', async (req, res) => {
  const bodySchema = z.object({
    query: z.string().min(3),
    dataset: DatasetBundleSchema,
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please enter a valid What-If question.' });
    return;
  }

  const result = await parseNaturalLanguageWhatIf(parsed.data.query, parsed.data.dataset);
  res.json(result);
});

apiRouter.post('/ai/explain-plan', async (req, res) => {
  const analysis = req.body?.analysis;
  if (!analysis || !analysis.optimizedPlan) {
    res.status(400).json({ error: 'Missing structured analysis payload.' });
    return;
  }
  const result = await explainDeterministicPlan(analysis);
  res.json(result);
});

apiRouter.post('/ai/extract-document', async (req, res) => {
  const bodySchema = z.object({
    textContent: z.string().optional(),
    base64Data: z.string().optional(),
    mimeType: z.string().optional(),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success || (!parsed.data.textContent && !parsed.data.base64Data)) {
    res.status(400).json({ error: 'Provide document text or an uploaded file to extract.' });
    return;
  }
  const result = await extractInvoiceDocument(parsed.data);
  res.json(result);
});

apiRouter.post('/ai/collection-message', async (req, res) => {
  const bodySchema = z.object({
    receivable: ReceivableSchema,
    businessName: z.string().min(1),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid receivable payload for collection draft.' });
    return;
  }
  const result = await generateCollectionMessages(
    parsed.data.receivable,
    parsed.data.businessName
  );
  res.json(result);
});
