import { isValid, parseISO } from 'date-fns';
import {
  BusinessProfileSchema,
  CashTransactionSchema,
  FinancingOptionSchema,
  PayableSchema,
  PaymentTermRecordSchema,
  ReceivableSchema,
  type BusinessProfile,
  type CashTransaction,
  type FinancingOption,
  type Payable,
  type PaymentTermRecord,
  type Receivable,
} from '../models/schemas.ts';

export type CsvImportTarget =
  | 'payables'
  | 'receivables'
  | 'cashTransactions'
  | 'financingOptions'
  | 'paymentTerms'
  | 'businessProfile';

export interface CsvParseResult<T> {
  ok: boolean;
  rows: T[];
  errors: string[];
  headers: string[];
}

export function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    const next = normalized[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell.trim());
        cell = '';
      } else if (ch === '\n') {
        row.push(cell.trim());
        if (row.some((c) => c.length > 0)) {
          rows.push(row);
        }
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((c) => c.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function isValidIsoDate(val: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  return isValid(parseISO(val));
}

function parseBool(val: string | undefined, defaultVal = false): boolean {
  if (!val) return defaultVal;
  const v = val.toLowerCase();
  if (['true', 'yes', '1', 'y'].includes(v)) return true;
  if (['false', 'no', '0', 'n'].includes(v)) return false;
  return defaultVal;
}

function parseNum(val: string | undefined): number | null {
  if (val === undefined || val === '') return null;
  const cleaned = val.replace(/[₹,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const REQUIRED_COLUMNS: Record<CsvImportTarget, string[]> = {
  payables: ['payableId', 'supplierName', 'invoiceNumber', 'invoiceDate', 'dueDate', 'amount'],
  receivables: [
    'receivableId',
    'customerName',
    'invoiceNumber',
    'invoiceDate',
    'dueDate',
    'amount',
    'expectedPaymentDate',
  ],
  cashTransactions: ['transactionId', 'date', 'transactionType', 'amount', 'category', 'description'],
  financingOptions: ['optionId', 'name', 'type', 'availableAmount', 'annualRatePct', 'maxDurationDays'],
  paymentTerms: ['termId', 'partyName', 'partyType', 'standardCreditDays'],
  businessProfile: [
    'businessName',
    'analysisDate',
    'planningHorizonDays',
    'currentCash',
    'minimumCashReserve',
    'protectedPayroll',
    'payrollDueDate',
  ],
};

export function parseAndValidateCsv(
  target: CsvImportTarget,
  csvText: string,
  existingProfile?: BusinessProfile
): CsvParseResult<unknown> {
  const matrix = parseCsvMatrix(csvText);
  if (matrix.length < 2) {
    return {
      ok: false,
      rows: [],
      headers: [],
      errors: ['CSV file must contain a header row and at least one data row.'],
    };
  }

  const headers = matrix[0].map((h, idx) => (idx === 0 ? h.replace(/^\uFEFF/, '') : h));
  const required = REQUIRED_COLUMNS[target];
  const missingCols = required.filter((col) => !headers.includes(col));

  if (missingCols.length > 0) {
    return {
      ok: false,
      rows: [],
      headers,
      errors: [
        `Missing required column(s): ${missingCols.join(', ')}. Expected columns include: ${required.join(', ')}.`,
      ],
    };
  }

  const errors: string[] = [];
  const rows: unknown[] = [];

  if (target === 'businessProfile' && matrix.length !== 2) {
    return {
      ok: false,
      rows: [],
      headers,
      errors: ['Business Profile CSV must contain exactly one data row.'],
    };
  }
  const seenIds = new Set<string>();
  const seenInvoices = new Set<string>();

  for (let rIdx = 1; rIdx < matrix.length; rIdx++) {
    const rawRow = matrix[rIdx];
    const rowNum = rIdx + 1;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = rawRow[idx] ?? '';
    });

    if (target === 'payables') {
      const amount = parseNum(obj.amount);
      if (amount === null || amount <= 0) {
        errors.push(`Row ${rowNum}: Invalid or non-positive invoice amount "${obj.amount}".`);
        continue;
      }
      if (!isValidIsoDate(obj.invoiceDate) || !isValidIsoDate(obj.dueDate)) {
        errors.push(`Row ${rowNum}: Dates must be valid YYYY-MM-DD (invoiceDate=${obj.invoiceDate}, dueDate=${obj.dueDate}).`);
        continue;
      }
      if (obj.dueDate < obj.invoiceDate) {
        errors.push(`Row ${rowNum}: Due date (${obj.dueDate}) cannot precede invoice date (${obj.invoiceDate}).`);
        continue;
      }
      if (obj.acceptanceDate && !isValidIsoDate(obj.acceptanceDate)) {
        errors.push(`Row ${rowNum}: Invalid acceptanceDate "${obj.acceptanceDate}".`);
        continue;
      }
      if (seenIds.has(obj.payableId)) {
        errors.push(`Row ${rowNum}: Duplicate payableId "${obj.payableId}".`);
        continue;
      }
      if (seenInvoices.has(obj.invoiceNumber)) {
        errors.push(`Row ${rowNum}: Duplicate invoiceNumber "${obj.invoiceNumber}".`);
        continue;
      }
      seenIds.add(obj.payableId);
      seenInvoices.add(obj.invoiceNumber);

      const candidate: Payable = {
        payableId: obj.payableId,
        supplierName: obj.supplierName,
        invoiceNumber: obj.invoiceNumber,
        invoiceDate: obj.invoiceDate,
        acceptanceDate: obj.acceptanceDate || null,
        dueDate: obj.dueDate,
        amount,
        supplierSize: (['micro', 'small', 'medium', 'large', 'unknown'].includes(obj.supplierSize)
          ? obj.supplierSize
          : 'unknown') as Payable['supplierSize'],
        mseEligibility: (['eligible', 'not_eligible', 'unknown'].includes(obj.mseEligibility)
          ? obj.mseEligibility
          : 'unknown') as Payable['mseEligibility'],
        udyamRegistered: obj.udyamRegistered ? parseBool(obj.udyamRegistered) : null,
        writtenAgreementPresent:
          obj.writtenAgreementPresent === '' ? null : parseBool(obj.writtenAgreementPresent),
        agreementDays: parseNum(obj.agreementDays) ?? null,
        discountPct: parseNum(obj.discountPct) ?? 0,
        discountDeadline: obj.discountDeadline && isValidIsoDate(obj.discountDeadline) ? obj.discountDeadline : null,
        contractualLateRatePct: parseNum(obj.contractualLateRatePct),
        contractHasLateFeeClause:
          parseBool(obj.contractHasLateFeeClause) || (parseNum(obj.contractualLateRatePct) ?? 0) > 0,
        criticalSupplier: parseBool(obj.criticalSupplier),
        mandatoryPayment: parseBool(obj.mandatoryPayment),
        category: obj.category || 'Operations',
        status: 'pending',
        plannedPaymentDate: null,
      };
      const check = PayableSchema.safeParse(candidate);
      if (!check.success) {
        errors.push(`Row ${rowNum}: ${check.error.issues.map((i) => i.message).join('; ')}`);
        continue;
      }
      rows.push(check.data);
    } else if (target === 'receivables') {
      const amount = parseNum(obj.amount);
      if (amount === null || amount <= 0) {
        errors.push(`Row ${rowNum}: Invalid or non-positive receivable amount "${obj.amount}".`);
        continue;
      }
      if (
        !isValidIsoDate(obj.invoiceDate) ||
        !isValidIsoDate(obj.dueDate) ||
        !isValidIsoDate(obj.expectedPaymentDate)
      ) {
        errors.push(`Row ${rowNum}: Dates must be valid YYYY-MM-DD.`);
        continue;
      }
      if (obj.dueDate < obj.invoiceDate || obj.expectedPaymentDate < obj.invoiceDate) {
        errors.push(`Row ${rowNum}: Conflicting dates (due/expected date precedes invoiceDate).`);
        continue;
      }
      if (seenIds.has(obj.receivableId)) {
        errors.push(`Row ${rowNum}: Duplicate receivableId "${obj.receivableId}".`);
        continue;
      }
      seenIds.add(obj.receivableId);

      const candidate: Receivable = {
        receivableId: obj.receivableId,
        customerName: obj.customerName,
        invoiceNumber: obj.invoiceNumber,
        invoiceDate: obj.invoiceDate,
        acceptanceDate: obj.acceptanceDate && isValidIsoDate(obj.acceptanceDate) ? obj.acceptanceDate : null,
        dueDate: obj.dueDate,
        amount,
        expectedPaymentDate: obj.expectedPaymentDate,
        overdueDays: parseNum(obj.overdueDays) ?? 0,
        eligibleForFinancing: parseBool(obj.eligibleForFinancing),
        financingRatePct: parseNum(obj.financingRatePct) ?? 0,
        financingDays: parseNum(obj.financingDays) ?? 0,
        accelerationFeePct: parseNum(obj.accelerationFeePct) ?? 0,
      };
      const check = ReceivableSchema.safeParse(candidate);
      if (!check.success) {
        errors.push(`Row ${rowNum}: ${check.error.issues.map((i) => i.message).join('; ')}`);
        continue;
      }
      rows.push(check.data);
    } else if (target === 'cashTransactions') {
      const amount = parseNum(obj.amount);
      if (amount === null || amount <= 0) {
        errors.push(`Row ${rowNum}: Invalid transaction amount "${obj.amount}".`);
        continue;
      }
      if (!isValidIsoDate(obj.date)) {
        errors.push(`Row ${rowNum}: Invalid date "${obj.date}".`);
        continue;
      }
      if (seenIds.has(obj.transactionId)) {
        errors.push(`Row ${rowNum}: Duplicate transactionId "${obj.transactionId}".`);
        continue;
      }
      seenIds.add(obj.transactionId);

      if (!['inflow', 'outflow'].includes(obj.transactionType)) {
        errors.push(`Row ${rowNum}: transactionType must be exactly "inflow" or "outflow".`);
        continue;
      }
      const candidate: CashTransaction = {
        transactionId: obj.transactionId,
        date: obj.date,
        transactionType: obj.transactionType as CashTransaction['transactionType'],
        amount,
        category: obj.category,
        linkedInvoiceId: obj.linkedInvoiceId || null,
        description: obj.description,
        isHistorical: parseBool(obj.isHistorical, false),
      };
      const check = CashTransactionSchema.safeParse(candidate);
      if (!check.success) {
        errors.push(`Row ${rowNum}: ${check.error.issues.map((i) => i.message).join('; ')}`);
        continue;
      }
      rows.push(check.data);
    } else if (target === 'financingOptions') {
      const availableAmount = parseNum(obj.availableAmount);
      const annualRatePct = parseNum(obj.annualRatePct);
      const maxDurationDays = parseNum(obj.maxDurationDays);
      if (availableAmount === null || availableAmount < 0 || annualRatePct === null || maxDurationDays === null) {
        errors.push(`Row ${rowNum}: Malformed numeric values in financing option.`);
        continue;
      }
      const validFinancingTypes = [
        'receivable_financing',
        'working_capital_od',
        'short_term_credit',
        'promoter_bridge',
      ];
      if (!validFinancingTypes.includes(obj.type)) {
        errors.push(`Row ${rowNum}: Unsupported financing type "${obj.type}".`);
        continue;
      }
      const candidate: FinancingOption = {
        optionId: obj.optionId,
        name: obj.name,
        type: obj.type as FinancingOption['type'],
        availableAmount,
        annualRatePct,
        maxDurationDays,
        requiresEligibleReceivable: parseBool(obj.requiresEligibleReceivable),
        fixedFee: parseNum(obj.fixedFee) ?? 0,
        assumptions: [obj.assumptions || 'Imported illustrative financing assumption'],
        sourceMetadata: obj.sourceMetadata || 'CSV Upload',
      };
      const check = FinancingOptionSchema.safeParse(candidate);
      if (!check.success) {
        errors.push(`Row ${rowNum}: ${check.error.issues.map((i) => i.message).join('; ')}`);
        continue;
      }
      rows.push(check.data);
    } else if (target === 'paymentTerms') {
      const days = parseNum(obj.standardCreditDays);
      if (days === null || days < 0) {
        errors.push(`Row ${rowNum}: Invalid standardCreditDays.`);
        continue;
      }
      if (!['supplier', 'customer'].includes(obj.partyType)) {
        errors.push(`Row ${rowNum}: partyType must be exactly "supplier" or "customer".`);
        continue;
      }
      if (!['true', 'false', 'yes', 'no', '1', '0', 'y', 'n'].includes(obj.writtenAgreementPresent.toLowerCase())) {
        errors.push(`Row ${rowNum}: writtenAgreementPresent must be explicitly true/false (or yes/no).`);
        continue;
      }
      const candidate: PaymentTermRecord = {
        termId: obj.termId,
        partyName: obj.partyName,
        partyType: obj.partyType as PaymentTermRecord['partyType'],
        standardCreditDays: days,
        writtenAgreementPresent: parseBool(obj.writtenAgreementPresent),
        earlyDiscountTerms: obj.earlyDiscountTerms || 'None',
        lateFeeClause: obj.lateFeeClause || 'None',
        sourceDocument: obj.sourceDocument || 'CSV Import',
      };
      const check = PaymentTermRecordSchema.safeParse(candidate);
      if (!check.success) {
        errors.push(`Row ${rowNum}: ${check.error.issues.map((i) => i.message).join('; ')}`);
        continue;
      }
      rows.push(check.data);
    } else if (target === 'businessProfile') {
      const currentCash = parseNum(obj.currentCash);
      const minimumCashReserve = parseNum(obj.minimumCashReserve);
      const protectedPayroll = parseNum(obj.protectedPayroll);
      const planningHorizonDays = parseNum(obj.planningHorizonDays);
      if (
        currentCash === null ||
        currentCash < 0 ||
        minimumCashReserve === null ||
        minimumCashReserve < 0 ||
        protectedPayroll === null ||
        protectedPayroll < 0 ||
        planningHorizonDays === null
      ) {
        errors.push(`Row ${rowNum}: Malformed or negative numeric values in business profile.`);
        continue;
      }
      if (!isValidIsoDate(obj.analysisDate) || !isValidIsoDate(obj.payrollDueDate)) {
        errors.push(`Row ${rowNum}: Invalid analysisDate or payrollDueDate.`);
        continue;
      }
      const candidate: BusinessProfile = {
        ...(existingProfile || {
          taxYear: 'FY 2026-27',
          ruleConfig: {
            msmedRuleVersion: 'MSMED Act Sec 15-16 · RBI Bank Rate snapshot 2026-11-20',
            msmedEffectiveDate: '2006-10-02',
            msmedAnnualInterestRatePct: 17.25,
            msmedRbiBankRateAssumptionPct: 5.75,
            msmedMultiplier: 3,
            msmedMaxWrittenAgreementDays: 45,
            msmedDefaultNoAgreementDays: 15,
            taxTimingEstimateEnabled: true,
            taxTimingMarginalRatePct: 0,
          },
          criticalSupplierIds: [],
          mandatoryCategories: ['Statutory & Tax', 'Utilities & Rent'],
          isSyntheticDemo: false,
        }),
        businessName: obj.businessName,
        industry: obj.industry || existingProfile?.industry,
        analysisDate: obj.analysisDate,
        planningHorizonDays,
        currentCash,
        minimumCashReserve,
        protectedPayroll,
        payrollDueDate: obj.payrollDueDate,
        isSyntheticDemo: false,
      };
      const check = BusinessProfileSchema.safeParse(candidate);
      if (!check.success) {
        errors.push(`Row ${rowNum}: ${check.error.issues.map((i) => i.message).join('; ')}`);
        continue;
      }
      rows.push(check.data);
    }
  }

  return {
    ok: errors.length === 0 && rows.length > 0,
    rows,
    errors,
    headers,
  };
}

export const CSV_SAMPLE_TEMPLATES: Record<CsvImportTarget, string> = {
  payables: `payableId,supplierName,invoiceNumber,invoiceDate,acceptanceDate,dueDate,amount,supplierSize,mseEligibility,udyamRegistered,writtenAgreementPresent,agreementDays,discountPct,discountDeadline,contractualLateRatePct,contractHasLateFeeClause,criticalSupplier,mandatoryPayment,category
PAY-101,Alpha Forge Works,AFW/26/101,2026-10-20,2026-10-21,2026-11-25,180000,small,eligible,true,true,35,0,,0,false,true,false,Raw Materials
PAY-102,Omega Corrugated Boxes,OCB/26/220,2026-10-25,2026-10-25,2026-11-26,95000,medium,not_eligible,false,true,30,2,2026-11-24,12,true,false,false,Packaging`,
  receivables: `receivableId,customerName,invoiceNumber,invoiceDate,acceptanceDate,dueDate,amount,expectedPaymentDate,overdueDays,eligibleForFinancing,financingRatePct,financingDays,accelerationFeePct
REC-101,Bharat Heavy Components,BHC/26/901,2026-10-28,2026-10-29,2026-11-27,210000,2026-12-09,0,true,9.5,18,0.4`,
  cashTransactions: `transactionId,date,transactionType,amount,category,linkedInvoiceId,description,isHistorical
TXN-101,2026-11-24,outflow,15000,Operations,,Weekly plant maintenance float,false`,
  financingOptions: `optionId,name,type,availableAmount,annualRatePct,maxDurationDays,requiresEligibleReceivable,fixedFee,assumptions,sourceMetadata
FIN-101,Illustrative TReDS Line,receivable_financing,400000,9.5,45,true,500,Illustrative demo input,Uploaded CSV`,
  paymentTerms: `termId,partyName,partyType,standardCreditDays,writtenAgreementPresent,earlyDiscountTerms,lateFeeClause,sourceDocument
TERM-101,Alpha Forge Works,supplier,35,true,None,MSMED provisions apply,Vendor PO #101`,
  businessProfile: `businessName,industry,analysisDate,planningHorizonDays,currentCash,minimumCashReserve,protectedPayroll,payrollDueDate
Navaratna Auto Stamping Pvt. Ltd.,Precision Stamping,2026-11-20,30,380000,100000,220000,2026-11-28`,
};
