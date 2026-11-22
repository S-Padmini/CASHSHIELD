# CashShield — AI-Assisted Cash-Crisis Decision Engine for Indian MSMEs

> **"I don't have enough cash to pay everyone. What combination of actions should I take to minimize my estimated economic cost while keeping my business financially safe?"**

CashShield combines daily cash-flow forecasting, rule-based eligibility checks, transparent cost modeling, illustrative financing comparison, and deterministic constrained search into a single feasible action plan—with full formula traceability and What-If simulation.

---

## Problem Statement

Indian MSMEs frequently face temporary timing mismatches:
- Opening cash is limited and a minimum operating reserve must stay protected.
- Employee payroll, statutory dues, and critical raw-material suppliers arrive mid-month.
- Customer receivables are due later in the month.
- Payment delays can trigger statutory MSMED delayed-payment interest, forfeited early-payment discounts, or explicit contractual late charges—while receivable discounting (e.g., TReDS-style facilities) or short-term working capital lines carry financing costs.

Traditional accounting tools show balances *after* the fact. CashShield solves the **forward-looking constrained decision problem** before a reserve breach happens.

---

## Architecture: Deterministic Engine vs. AI Boundary

CashShield enforces a strict boundary so **AI never invents or alters financial numbers**:

- **Deterministic Financial & Optimization Engine (`server/`)**
  - **Forecast Engine (`server/forecast/forecastEngine.ts`)**: Computes daily cash inflows/outflows over the planning horizon using `date-fns` and detects shortfalls against the minimum reserve.
  - **Rule Engine (`server/rules/ruleEngine.ts`)**: Evaluates versioned MSMED delayed-payment rules (distinguishing `eligible`, `not_eligible`, and `unknown`), early-payment discount windows (available vs. expired), explicit contractual late fees, mandatory/critical protections, and receivable financing eligibility.
  - **Cost Engine (`server/costs/costEngine.ts`)**: Computes itemized rupee costs (`msmed_interest`, `lost_discount`, `contractual_late_fee`, `financing_interest`, `financing_fixed_fee`, `acceleration_fee`) with transparent formula strings. MSMED Section 16 delay interest uses monthly-rest compounding.
  - **Constrained Optimizer (`server/optimization/optimizer.ts`)**: Runs a deterministic bounded combinatorial search over payable timings and receivable accelerations, with exact subset selection for non-receivable credit facilities. It is warm-started and benchmarked against a Greedy Baseline using identical inputs, followed by an independent post-optimization constraint validator. The bounded search is not presented as a global optimality guarantee.
  - **What-If Scenario Engine (`server/scenarios/scenarioEngine.ts`)**: Applies structural perturbations and computes full Before/After plan diffs.
- **Subordinate AI Layer (`server/ai/geminiService.ts`)**
  - Server-side `@google/genai` (`gemini-4-hydrogen`) with strict Zod schema validation:
    1. Parses natural-language What-If questions into structured scenario patches (asking for clarification if ambiguous).
    2. Summarizes already-computed deterministic plans in plain language without altering numbers.
    3. Extracts candidate fields from uploaded invoice/PO text or images into a mandatory human review step.
    4. Drafts polite overdue payment reminders (email, WhatsApp, Hinglish) labeled for human review.

---

## Synthetic Demo Dataset (`data/demo/demoDataset.ts`)

Ships with an illustrative synthetic MSME scenario (**Vardhman Precision Components Pvt. Ltd.**):
- Opening cash: **₹4,00,000** · Minimum reserve: **₹1,00,000** · Protected payroll: **₹2,50,000** (Nov 28)
- 12 Payables totaling **₹9,15,000** (mix of eligible MSEs, unknown-Udyam supplier, critical suppliers, configured mandatory statutory/tax/utility demo obligations, active & expired early discounts, contractual late fees)
- 10 Receivables totaling **₹9,40,000** (mix of TReDS-eligible anchor invoices, overdue invoices ineligible for financing, and non-eligible receivables)
- 32 Historical & scheduled cash transactions + 4 illustrative financing options + 5 payment-term records.

---

## Setup, Running & Testing

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables (optional for Gemini AI features; deterministic engine works standalone)
cp .env.example .env

# 3. Start full-stack dev server (Express API + Vite on port 3000)
npm run dev

# 4. Run automated unit & integration tests (Vitest)
npm test

# 5. Typecheck & production build
npm run lint
npm run build
```

---

## Limitations & Disclaimer

- Financing rates and facility limits in the demo dataset are **illustrative assumptions / demo inputs**, not live quotes or credit offers.
- MSMED Section 15–16 logic is configurable but grounded in the statutory 45-day cap / 15-day no-agreement appointed-day rule and the RBI Bank Rate snapshot used by the demo. Tax timing references the Income-tax Act, 2025 Section 37(2)(g); CashShield does not calculate tax liabilities. All outputs remain decision-support estimates, not legal, lending, or tax advice.
- Users should verify material financial, contractual, and statutory decisions with qualified professionals.
