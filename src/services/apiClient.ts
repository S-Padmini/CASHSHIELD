import type {
  AnalysisResult,
  DatasetBundle,
  ExtractedDocument,
  ParsedWhatIf,
  Receivable,
  ScenarioComparisonResult,
  ScenarioModification,
} from '../models/schemas.ts';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const detail = Array.isArray(data.issues) ? ` (${data.issues[0]})` : '';
    throw new Error((data.error || 'Request failed') + detail);
  }
  return data as T;
}

export async function fetchDemoBundle(): Promise<{
  dataset: DatasetBundle;
  analysis: AnalysisResult;
}> {
  const res = await fetch('/api/demo');
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Unable to load demo dataset');
  }
  return data;
}

export async function runAnalysisApi(dataset: DatasetBundle): Promise<AnalysisResult> {
  const res = await postJson<{ analysis: AnalysisResult }>('/api/analyze', dataset);
  return res.analysis;
}

export async function runScenarioApi(
  dataset: DatasetBundle,
  modification: ScenarioModification
): Promise<ScenarioComparisonResult> {
  const res = await postJson<{ comparison: ScenarioComparisonResult }>('/api/scenario', {
    dataset,
    modification,
  });
  return res.comparison;
}

export async function parseWhatIfWithAiApi(
  query: string,
  dataset: DatasetBundle
): Promise<{ ok: boolean; parsed?: ParsedWhatIf; aiAvailable: boolean; error?: string }> {
  return postJson('/api/ai/parse-what-if', { query, dataset });
}

export async function explainPlanWithAiApi(
  analysis: AnalysisResult
): Promise<{ ok: boolean; explanation?: string; aiAvailable: boolean; error?: string }> {
  return postJson('/api/ai/explain-plan', { analysis });
}

export async function extractDocumentWithAiApi(payload: {
  textContent?: string;
  base64Data?: string;
  mimeType?: string;
}): Promise<{ ok: boolean; extracted?: ExtractedDocument; aiAvailable: boolean; error?: string }> {
  return postJson('/api/ai/extract-document', payload);
}

export async function generateCollectionDraftApi(
  receivable: Receivable,
  businessName: string
): Promise<{
  ok: boolean;
  drafts?: { email: string; whatsapp: string; hinglish: string };
  aiAvailable: boolean;
  error?: string;
}> {
  return postJson('/api/ai/collection-message', { receivable, businessName });
}
