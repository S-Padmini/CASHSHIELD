import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  ExtractedDocumentSchema,
  ParsedWhatIfSchema,
  type AnalysisResult,
  type DatasetBundle,
  type ExtractedDocument,
  type ParsedWhatIf,
  CollectionMessagesSchema,
  type Receivable,
} from '../../src/models/schemas.ts';

function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const MODEL_NAME = 'gemini-4-hydrogen';

export async function parseNaturalLanguageWhatIf(
  query: string,
  dataset: DatasetBundle
): Promise<{ ok: boolean; parsed?: ParsedWhatIf; aiAvailable: boolean; error?: string }> {
  const ai = getClient();
  if (!ai) {
    return {
      ok: false,
      aiAvailable: false,
      error: 'Gemini AI service is not configured in environment. Use the structured scenario controls below.',
    };
  }

  const payablesContext = dataset.payables.map((p) => ({
    payableId: p.payableId,
    supplierName: p.supplierName,
    amount: p.amount,
    dueDate: p.dueDate,
  }));

  const receivablesContext = dataset.receivables.map((r) => ({
    receivableId: r.receivableId,
    customerName: r.customerName,
    amount: r.amount,
    expectedPaymentDate: r.expectedPaymentDate,
    eligibleForFinancing: r.eligibleForFinancing,
  }));

  const financingContext = dataset.financingOptions.map((f) => ({
    optionId: f.optionId,
    name: f.name,
    annualRatePct: f.annualRatePct,
  }));

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Parse this MSME owner's natural-language What-If scenario into a structured modification object.

User query: "${query}"

Available payables: ${JSON.stringify(payablesContext)}
Available receivables: ${JSON.stringify(receivablesContext)}
Available financing options: ${JSON.stringify(financingContext)}
Current opening cash: ${dataset.businessProfile.currentCash}
Current minimum reserve: ${dataset.businessProfile.minimumCashReserve}

Rules:
- Match supplier or customer names strictly to the provided IDs.
- If the request is ambiguous, references an unknown party, or lacks a clear numeric/date change, set confident = false and provide a clear clarificationQuestion.
- Never invent IDs.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            confident: { type: Type.BOOLEAN },
            clarificationQuestion: { type: Type.STRING },
            interpretationSummary: { type: Type.STRING },
            modification: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                openingCashDelta: { type: Type.NUMBER },
                minimumReserveOverride: { type: Type.NUMBER },
                financingRateOverridePct: { type: Type.NUMBER },
                financingRateDeltaPct: { type: Type.NUMBER },
                financingUnavailable: { type: Type.BOOLEAN },
                receivableDelayAdjustments: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      receivableId: { type: Type.STRING },
                      delayDays: { type: Type.INTEGER },
                      disableFinancing: { type: Type.BOOLEAN },
                    },
                    required: ['receivableId', 'delayDays'],
                  },
                },
                payableDelayAdjustments: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      payableId: { type: Type.STRING },
                      extraGraceDays: { type: Type.INTEGER },
                    },
                    required: ['payableId', 'extraGraceDays'],
                  },
                },
              },
            },
          },
          required: ['confident', 'interpretationSummary', 'modification'],
        },
      },
    });

    const rawText = (response.text ?? '{}').trim();
    const rawJson = JSON.parse(rawText);
    const validated = ParsedWhatIfSchema.safeParse(rawJson);

    if (!validated.success) {
      return {
        ok: false,
        aiAvailable: true,
        error: 'Could not validate parsed scenario structure. Please clarify your scenario using specific supplier/customer names and days.',
      };
    }

    const validPayableIds = new Set(dataset.payables.map((p) => p.payableId));
    const validReceivableIds = new Set(dataset.receivables.map((r) => r.receivableId));
    const modification = validated.data.modification;

    const unknownReceivable = (modification.receivableDelayAdjustments || []).find(
      (a) => !validReceivableIds.has(a.receivableId)
    );
    const unknownPayable = (modification.payableDelayAdjustments || []).find(
      (a) => !validPayableIds.has(a.payableId)
    );
    if (unknownReceivable || unknownPayable) {
      return {
        ok: false,
        aiAvailable: true,
        error: 'AI referenced a record that is not present in the current dataset. Please restate the scenario using a visible supplier/customer name.',
      };
    }

    return { ok: true, parsed: validated.data, aiAvailable: true };
  } catch (err) {
    return {
      ok: false,
      aiAvailable: true,
      error: err instanceof Error ? err.message : 'Failed to parse scenario with AI.',
    };
  }
}

export async function explainDeterministicPlan(
  analysis: AnalysisResult
): Promise<{ ok: boolean; explanation?: string; aiAvailable: boolean; error?: string }> {
  const ai = getClient();
  if (!ai) {
    return {
      ok: false,
      aiAvailable: false,
      error: 'AI summary unavailable — deterministic plan and Show Math remain fully functional.',
    };
  }

  const structuredFacts = {
    businessName: analysis.datasetSummary.businessName,
    shortfallStatus: analysis.shortfall.status,
    peakShortfallAmount: analysis.shortfall.peakShortfallAmount,
    firstShortfallDate: analysis.shortfall.firstShortfallDate,
    minimumCashBefore: analysis.shortfall.projectedMinimumCash,
    minimumReserve: analysis.datasetSummary.minimumReserve,
    optimizedFeasible: analysis.optimizedPlan.feasible,
    optimizedTotalCost: analysis.optimizedPlan.totalEstimatedCost,
    baselineTotalCost: analysis.comparison.baselineCost,
    estimatedImprovement: analysis.comparison.estimatedImprovement,
    minimumCashAfterPlan: analysis.optimizedPlan.minimumCashAfterPlan,
    actions: analysis.optimizedPlan.recommendations.map((r) => ({
      action: r.actionCode,
      entity: r.entityName,
      amount: r.amount,
      recommendedDate: r.recommendedDate,
      estimatedCost: r.estimatedCost,
      avoidedCost: r.avoidedCost,
      reasonCodes: r.reasonCodes,
    })),
  };

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Summarize this deterministic cash-crisis plan in 3–4 crisp sentences for the MSME business owner.

Structured Deterministic Facts (SOURCE OF TRUTH):
${JSON.stringify(structuredFacts)}

Strict Rules:
- Use ONLY the exact numbers, dates, entity names, and outcomes in the JSON above.
- Never invent any rupee figure, interest rate, rule, or date.
- Never claim guaranteed savings or legal/tax advice; say "estimated cost" and "illustrative rate".
- Clearly explain why the top actions work together to protect payroll and the cash reserve.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          'You are a precise financial decision-support narrator. You only explain pre-computed deterministic results without altering or inventing numbers.',
      },
    });

    return {
      ok: true,
      explanation: (response.text ?? '').trim(),
      aiAvailable: true,
    };
  } catch (err) {
    return {
      ok: false,
      aiAvailable: true,
      error: err instanceof Error ? err.message : 'Unable to generate AI summary.',
    };
  }
}

export async function extractInvoiceDocument(input: {
  textContent?: string;
  base64Data?: string;
  mimeType?: string;
}): Promise<{ ok: boolean; extracted?: ExtractedDocument; aiAvailable: boolean; error?: string }> {
  const ai = getClient();
  if (!ai) {
    return {
      ok: false,
      aiAvailable: false,
      error: 'Gemini AI extraction unavailable. You can import records via CSV or manual entry.',
    };
  }

  try {
    const promptText = `Extract invoice/PO/contract fields from the provided document for an Indian MSME cash-flow ledger.
Return JSON matching the schema. Use YYYY-MM-DD for all dates.
If supplier size is not explicitly stated, set supplierSize to "unknown".
If an acceptance date, discount, or late fee clause is absent, omit it or set null. Do NOT fabricate numbers.`;

    const contents =
      input.base64Data && input.mimeType
        ? {
            parts: [
              { inlineData: { mimeType: input.mimeType, data: input.base64Data } },
              { text: promptText },
            ],
          }
        : `${promptText}\n\nDocument text:\n${input.textContent || ''}`;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            docType: { type: Type.STRING, enum: ['payable', 'receivable'] },
            partyName: { type: Type.STRING },
            invoiceNumber: { type: Type.STRING },
            amount: { type: Type.NUMBER },
            invoiceDate: { type: Type.STRING },
            dueDate: { type: Type.STRING },
            acceptanceDate: { type: Type.STRING },
            supplierSize: {
              type: Type.STRING,
              enum: ['micro', 'small', 'medium', 'large', 'unknown'],
            },
            discountPct: { type: Type.NUMBER },
            discountDeadline: { type: Type.STRING },
            contractualLateRatePct: { type: Type.NUMBER },
            paymentTerms: { type: Type.STRING },
            extractedClauses: { type: Type.ARRAY, items: { type: Type.STRING } },
            confidenceNotes: { type: Type.STRING },
          },
          required: ['docType', 'partyName', 'invoiceNumber', 'amount', 'invoiceDate', 'dueDate'],
        },
      },
    });

    const raw = JSON.parse((response.text ?? '{}').trim());
    const validated = ExtractedDocumentSchema.safeParse(raw);
    if (!validated.success) {
      return {
        ok: false,
        aiAvailable: true,
        error: `Extracted fields failed validation: ${validated.error.issues.map((i) => i.message).join('; ')}`,
      };
    }

    return { ok: true, extracted: validated.data, aiAvailable: true };
  } catch (err) {
    return {
      ok: false,
      aiAvailable: true,
      error: err instanceof Error ? err.message : 'Document extraction failed.',
    };
  }
}

export async function generateCollectionMessages(
  receivable: Receivable,
  businessName: string
): Promise<{
  ok: boolean;
  drafts?: { email: string; whatsapp: string; hinglish: string };
  aiAvailable: boolean;
  error?: string;
}> {
  const ai = getClient();
  if (!ai) {
    // Graceful deterministic template fallback labeled as unavailable AI
    return {
      ok: false,
      aiAvailable: false,
      error: 'Gemini AI unavailable — showing structured draft templates requiring human review.',
      drafts: {
        email: `Subject: Payment Follow-up — Invoice ${receivable.invoiceNumber} (₹${receivable.amount.toLocaleString('en-IN')})\n\nDear ${receivable.customerName} Accounts Team,\n\nWe hope you are doing well. This is a polite reminder regarding Invoice ${receivable.invoiceNumber} dated ${receivable.invoiceDate} for ₹${receivable.amount.toLocaleString('en-IN')}, which had a due date of ${receivable.dueDate} (${receivable.overdueDays} day(s) overdue).\n\nCould you please share the expected remittance date so we can update our treasury schedule?\n\nRegards,\n${businessName}`,
        whatsapp: `Hi ${receivable.customerName} team — polite reminder for Invoice ${receivable.invoiceNumber} (₹${receivable.amount.toLocaleString('en-IN')}), due ${receivable.dueDate} (${receivable.overdueDays}d overdue). Kindly share expected payment date. Thanks, ${businessName}.`,
        hinglish: `Namaste ${receivable.customerName} team — Invoice ${receivable.invoiceNumber} (₹${receivable.amount.toLocaleString('en-IN')}) ki due date ${receivable.dueDate} thi (${receivable.overdueDays} din overdue). Kripya payment release ki expected date confirm karein. Dhanyavaad, ${businessName}.`,
      },
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Generate 3 polite, factual payment follow-up drafts for an Indian MSME receivable:
- Sender business: ${businessName}
- Customer: ${receivable.customerName}
- Invoice number: ${receivable.invoiceNumber}
- Amount: ₹${receivable.amount.toLocaleString('en-IN')}
- Invoice date: ${receivable.invoiceDate}
- Due date: ${receivable.dueDate}
- Overdue days: ${receivable.overdueDays}

Strict Rules:
- Use ONLY the verified numbers and dates above.
- Do NOT make legal threats, cite penalties, or threaten credit action.
- Keep tone courteous, collaborative, and business-appropriate for Indian B2B manufacturing.`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            email: { type: Type.STRING },
            whatsapp: { type: Type.STRING },
            hinglish: { type: Type.STRING },
          },
          required: ['email', 'whatsapp', 'hinglish'],
        },
      },
    });

    const rawDrafts = JSON.parse((response.text ?? '{}').trim());
    const validatedDrafts = CollectionMessagesSchema.safeParse(rawDrafts);
    if (!validatedDrafts.success) {
      return {
        ok: false,
        aiAvailable: true,
        error: 'Generated collection drafts failed output validation. Please retry or use the deterministic template.',
      };
    }
    return { ok: true, drafts: validatedDrafts.data, aiAvailable: true };
  } catch (err) {
    return {
      ok: false,
      aiAvailable: true,
      error: err instanceof Error ? err.message : 'Failed to generate drafts.',
    };
  }
}
