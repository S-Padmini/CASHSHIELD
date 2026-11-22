import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  RotateCcw,
  Upload,
} from 'lucide-react';
import type {
  BusinessProfile,
  CashTransaction,
  DatasetBundle,
  ExtractedDocument,
  FinancingOption,
  Payable,
  PaymentTermRecord,
  Receivable,
} from '../../models/schemas.ts';
import { extractDocumentWithAiApi } from '../../services/apiClient.ts';
import {
  CSV_SAMPLE_TEMPLATES,
  parseAndValidateCsv,
  type CsvImportTarget,
} from '../../utils/csvParser.ts';
import { formatINR } from '../../utils/format.ts';

interface DataImportViewProps {
  dataset: DatasetBundle;
  onApplyDataset: (next: DatasetBundle) => Promise<void>;
  onResetDemo: () => Promise<void>;
}

const TARGET_LABELS: Record<CsvImportTarget, string> = {
  payables: 'Payables',
  receivables: 'Receivables',
  cashTransactions: 'Cash Transactions',
  financingOptions: 'Financing Options',
  paymentTerms: 'Payment Terms',
  businessProfile: 'Business Profile',
};

export const DataImportView: React.FC<DataImportViewProps> = ({
  dataset,
  onApplyDataset,
  onResetDemo,
}) => {
  const [target, setTarget] = useState<CsvImportTarget>('payables');
  const [dragActive, setDragActive] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<unknown[]>([]);
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  // AI Document Extraction state (Section 24)
  const [docText, setDocText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractedDraft, setExtractedDraft] = useState<ExtractedDocument | null>(null);

  const handleCsvText = (text: string) => {
    setImportSuccess(null);
    const res = parseAndValidateCsv(target, text, dataset.businessProfile);
    if (!res.ok) {
      setParseErrors(res.errors);
      setPreviewRows([]);
    } else {
      setParseErrors([]);
      setPreviewRows(res.rows);
    }
  };

  const handleFileChange = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        handleCsvText(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadSample = () => {
    const content = CSV_SAMPLE_TEMPLATES[target];
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cashshield_${target}_sample.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirmImport = async () => {
    if (previewRows.length === 0) return;
    setImporting(true);
    setParseErrors([]);
    try {
      const next: DatasetBundle = structuredClone(dataset);
      if (target === 'payables') {
        next.payables = previewRows as Payable[];
      } else if (target === 'receivables') {
        next.receivables = previewRows as Receivable[];
      } else if (target === 'cashTransactions') {
        next.cashTransactions = previewRows as CashTransaction[];
      } else if (target === 'financingOptions') {
        next.financingOptions = previewRows as FinancingOption[];
      } else if (target === 'paymentTerms') {
        next.paymentTerms = previewRows as PaymentTermRecord[];
      } else if (target === 'businessProfile') {
        next.businessProfile = previewRows[0] as BusinessProfile;
      }
      next.businessProfile.isSyntheticDemo = false;

      await onApplyDataset(next);
      setImportSuccess(
        `Imported ${previewRows.length} validated ${TARGET_LABELS[target]} record(s) and re-ran forecast & optimizer.`
      );
      setPreviewRows([]);
    } catch (err) {
      setParseErrors([err instanceof Error ? err.message : 'Failed to apply imported dataset.']);
    } finally {
      setImporting(false);
    }
  };

  const handleExtractText = async () => {
    if (!docText.trim()) return;
    setExtracting(true);
    setExtractError(null);
    setExtractedDraft(null);
    try {
      const res = await extractDocumentWithAiApi({ textContent: docText.trim() });
      if (!res.ok || !res.extracted) {
        setExtractError(res.error || 'Could not extract structured fields from document.');
      } else {
        setExtractedDraft(res.extracted);
      }
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Extraction request failed.');
    } finally {
      setExtracting(false);
    }
  };

  const handleExtractImageFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      if (!base64) return;
      setExtracting(true);
      setExtractError(null);
      setExtractedDraft(null);
      try {
        const res = await extractDocumentWithAiApi({
          base64Data: base64,
          mimeType: file.type || 'image/png',
        });
        if (!res.ok || !res.extracted) {
          setExtractError(res.error || 'Could not extract fields from uploaded document.');
        } else {
          setExtractedDraft(res.extracted);
        }
      } catch (err) {
        setExtractError(err instanceof Error ? err.message : 'File extraction failed.');
      } finally {
        setExtracting(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmExtracted = async () => {
    if (!extractedDraft) return;
    const next: DatasetBundle = structuredClone(dataset);
    if (extractedDraft.docType === 'payable') {
      const id = `PAY-${String(next.payables.length + 101)}`;
      const size = extractedDraft.supplierSize || 'unknown';
      next.payables.push({
        payableId: id,
        supplierName: extractedDraft.partyName,
        invoiceNumber: extractedDraft.invoiceNumber,
        invoiceDate: extractedDraft.invoiceDate,
        acceptanceDate: extractedDraft.acceptanceDate || null,
        dueDate: extractedDraft.dueDate,
        amount: extractedDraft.amount,
        supplierSize: size,
        mseEligibility:
          size === 'micro' || size === 'small'
            ? 'eligible'
            : size === 'medium' || size === 'large'
            ? 'not_eligible'
            : 'unknown',
        udyamRegistered: size === 'micro' || size === 'small' ? true : null,
        writtenAgreementPresent: null,
        agreementDays: null,
        discountPct: extractedDraft.discountPct ?? 0,
        discountDeadline: extractedDraft.discountDeadline || null,
        contractualLateRatePct: extractedDraft.contractualLateRatePct ?? null,
        contractHasLateFeeClause: (extractedDraft.contractualLateRatePct ?? 0) > 0,
        criticalSupplier: false,
        mandatoryPayment: false,
        category: 'Extracted Invoice',
        status: 'pending',
        plannedPaymentDate: null,
      });
    } else {
      const id = `REC-${String(next.receivables.length + 101)}`;
      next.receivables.push({
        receivableId: id,
        customerName: extractedDraft.partyName,
        invoiceNumber: extractedDraft.invoiceNumber,
        invoiceDate: extractedDraft.invoiceDate,
        acceptanceDate: extractedDraft.acceptanceDate || null,
        dueDate: extractedDraft.dueDate,
        amount: extractedDraft.amount,
        expectedPaymentDate: extractedDraft.dueDate,
        overdueDays: 0,
        eligibleForFinancing: false,
        financingRatePct: 0,
        financingDays: 0,
        accelerationFeePct: 0,
      });
    }
    await onApplyDataset(next);
    setImportSuccess(
      `Added reviewed ${extractedDraft.docType} (${extractedDraft.partyName}, ${formatINR(
        extractedDraft.amount
      )}) and re-ran optimizer.`
    );
    setExtractedDraft(null);
    setDocText('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display font-semibold text-lg text-slate-900">
            CSV Data Import &amp; Document Extraction
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Upload validated CSV tables or review AI-extracted invoice terms before adding them to
            your cash model.
          </p>
        </div>
        <button
          type="button"
          onClick={onResetDemo}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 self-start"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Restore Synthetic Demo Data</span>
        </button>
      </section>

      {importSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{importSuccess}</span>
        </div>
      )}

      {/* CSV Importer */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="font-display font-semibold text-base text-slate-900">
            1. Import Validated CSV Table
          </h2>
          <button
            type="button"
            onClick={handleDownloadSample}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 underline underline-offset-2 self-start"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download {TARGET_LABELS[target]} CSV Template</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg">
          {(Object.keys(TARGET_LABELS) as CsvImportTarget[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTarget(key);
                setParseErrors([]);
                setPreviewRows([]);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                target === key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {TARGET_LABELS[key]}
            </button>
          ))}
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            handleFileChange(e.dataTransfer.files?.[0]);
          }}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            dragActive ? 'border-slate-900 bg-slate-50' : 'border-slate-300 bg-slate-50/50'
          }`}
        >
          <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-800">
            Drag and drop a {TARGET_LABELS[target]} CSV file here
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Strict column, date (YYYY-MM-DD), amount, and duplicate-ID checks run before import.
          </p>
          <label className="inline-block mt-4 px-4 py-2 rounded-lg text-xs font-medium bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 cursor-pointer">
            <span>Select CSV File</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files?.[0])}
            />
          </label>
        </div>

        {parseErrors.length > 0 && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 space-y-1.5 text-xs text-red-800">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-red-700" />
              <span>Validation Errors Found — Import Blocked</span>
            </div>
            <ul className="list-disc pl-5 space-y-1">
              {parseErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {previewRows.length > 0 && (
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-800">
                Validated {previewRows.length} row(s) ready to import
              </span>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={importing}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {importing ? 'Applying...' : `Confirm & Replace ${TARGET_LABELS[target]}`}
              </button>
            </div>
            <div className="max-h-52 overflow-auto border border-slate-200 rounded-lg text-xs font-mono p-3 bg-slate-50">
              <pre>{JSON.stringify(previewRows.slice(0, 5), null, 2)}</pre>
            </div>
          </div>
        )}
      </section>

      {/* AI Document Extraction */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="font-display font-semibold text-base text-slate-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-600" />
            <span>2. AI Invoice / PO Field Extraction (Review Before Saving)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Paste invoice/contract text or upload an invoice image/PDF. Extracted fields always
            require your confirmation before entering the deterministic engine.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <textarea
              rows={5}
              value={docText}
              onChange={(e) => setDocText(e.target.value)}
              placeholder="Paste invoice or PO text here (e.g., Tax Invoice #INV-2026-412 from Apex Springs Pvt Ltd, Udyam Small Enterprise, Amount ₹1,25,000, Date 2026-11-10, Due 2026-11-26, 2% discount if paid by 2026-11-23)..."
              className="w-full border border-slate-300 rounded-lg p-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleExtractText}
                disabled={extracting || !docText.trim()}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {extracting ? 'Extracting...' : 'Extract Fields From Text'}
              </button>
              <label className="px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-300 text-slate-800 hover:bg-slate-50 cursor-pointer">
                <span>Upload Invoice Image / PDF</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => handleExtractImageFile(e.target.files?.[0])}
                />
              </label>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
            {extractError && (
              <div className="text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{extractError}</span>
              </div>
            )}

            {!extractedDraft && !extractError && (
              <div className="text-xs text-slate-500 h-full flex items-center justify-center text-center py-6">
                Extracted invoice fields will appear here for human verification and editing before
                commit.
              </div>
            )}

            {extractedDraft && (
              <div className="space-y-3 text-xs">
                <div className="font-semibold text-slate-900">
                  Review Extracted Data (Editable)
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-slate-500 mb-0.5">Type</label>
                    <select
                      value={extractedDraft.docType}
                      onChange={(e) =>
                        setExtractedDraft({
                          ...extractedDraft,
                          docType: e.target.value as 'payable' | 'receivable',
                        })
                      }
                      className="w-full border border-slate-300 rounded px-2 py-1 bg-white"
                    >
                      <option value="payable">Payable</option>
                      <option value="receivable">Receivable</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-0.5">Party Name</label>
                    <input
                      type="text"
                      value={extractedDraft.partyName}
                      onChange={(e) =>
                        setExtractedDraft({ ...extractedDraft, partyName: e.target.value })
                      }
                      className="w-full border border-slate-300 rounded px-2 py-1 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-0.5">Invoice #</label>
                    <input
                      type="text"
                      value={extractedDraft.invoiceNumber}
                      onChange={(e) =>
                        setExtractedDraft({ ...extractedDraft, invoiceNumber: e.target.value })
                      }
                      className="w-full border border-slate-300 rounded px-2 py-1 bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-0.5">Amount (₹)</label>
                    <input
                      type="number"
                      value={extractedDraft.amount}
                      onChange={(e) =>
                        setExtractedDraft({ ...extractedDraft, amount: Number(e.target.value) })
                      }
                      className="w-full border border-slate-300 rounded px-2 py-1 bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-0.5">Invoice Date</label>
                    <input
                      type="text"
                      value={extractedDraft.invoiceDate}
                      onChange={(e) =>
                        setExtractedDraft({ ...extractedDraft, invoiceDate: e.target.value })
                      }
                      className="w-full border border-slate-300 rounded px-2 py-1 bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-0.5">Due Date</label>
                    <input
                      type="text"
                      value={extractedDraft.dueDate}
                      onChange={(e) =>
                        setExtractedDraft({ ...extractedDraft, dueDate: e.target.value })
                      }
                      className="w-full border border-slate-300 rounded px-2 py-1 bg-white font-mono"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setExtractedDraft(null)}
                    className="px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmExtracted}
                    className="px-3 py-1.5 rounded bg-slate-900 text-white font-medium"
                  >
                    Confirm &amp; Add to Dataset
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
