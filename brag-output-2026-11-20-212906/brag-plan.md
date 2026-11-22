# Brag Plan: CashShield — ArthaThon Hackathon

## Objective

Create a four-minute, 1920×1080, 30fps product demonstration for the ArthaThon Hackathon evaluation panel. The video introduces Team FINOVIX, identifies the AI for Finance domain, explains the MSME cash-flow challenge, and demonstrates the real CashShield workflow using its synthetic demo dataset.

## Product and angle

CashShield is an AI-assisted cash-crisis decision engine for Indian MSMEs. The video follows a single question from a projected reserve breach to a feasible, explainable action plan. Its core distinction is explicit: deterministic code calculates forecasts, rules, costs and the bounded optimization result; AI is subordinate and may parse or explain, but does not create financial results.

## Hook and opening order

1. Greeting to the audience and evaluation panel.
2. ArthaThon Hackathon title.
3. Prominent Team FINOVIX cinematic title immediately after the hackathon title.
4. AI for Finance domain.
5. The supplied MSME cash-flow problem framing.
6. CashShield solution reveal.

**Problem framing:** The official ArthaThon problem-statement wording was not found in project materials. Scene 3 presents the challenge text supplied for this composition and does not label it as the official statement.

## Tone and identity

- Preset: cinematic
- Direction: professional, restrained FinTech evaluation film
- Format: landscape, 1920×1080, 30fps
- Duration: exactly 240 seconds
- Palette: slate-50 `#f8fafc`, slate-900 `#0f172a`, emerald for feasible outcomes, red for reserve breaches, amber for the reserve threshold
- Fonts: Plus Jakarta Sans headings, DM Sans body, JetBrains Mono financial values
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3`, low and steady under speech, repeated to cover the four-minute timeline
- Music cue guidance: bundled cue preset reports 109.96 BPM; use only as optional timing reference. The scene timeline and legibility take priority.
- Audio-reactive treatment: subtle UI/card presence only if supported by the local Hyperframes audio workflow.
- SFX: restrained, low/medium high-frequency-risk clicks, soft transitions and one closing confirmation.
- Music attribution: “Happy Beats / Business Moves vol. 12” by Sascha Ende (ende.app), CC BY 4.0.

## Verified demo data

These values were read from the running `/api/demo` response and live UI on 2026-11-20. The dataset labels this business as synthetic:

- Opening cash: ₹4,00,000
- Minimum reserve: ₹1,00,000
- Protected payroll: ₹2,50,000
- Payables: 12, total ₹9,15,000
- Receivables: 10, total ₹9,40,000
- First projected reserve breach: Nov 24, 2026
- Unmitigated projected minimum cash: -₹7,12,000 on Nov 29, 2026
- Peak reserve shortfall: ₹8,12,000
- Optimized plan: feasible; minimum cash after plan ₹1,00,000; estimated cost ₹6,697
- Greedy baseline estimated cost: ₹10,864
- Estimated improvement vs. baseline: ₹4,167 (38.4%)
- Solver metadata: deterministic bounded combinatorial search, exact facility-subset selection and independent constraint validator; 1,500 states evaluated in the observed run

Financing inputs are explicitly illustrative assumptions/demo inputs, not live quotes or offers. No global-optimality claim is made.

## Storyboard and complete narration

Scene durations are contiguous and sum to exactly 240 seconds. Screenshots referenced below are captures of the actual running CashShield app populated by its synthetic demo dataset. Do not edit the existing application UI.

### Scene 1 — Welcome — 00:00–00:18 — 18s

**Narration:** “Good evening to our audience and to the members of the evaluation panel. Thank you for joining our presentation. We are honored to share our work and guide you through the challenge, our approach and a demonstration. We appreciate your time.”

**Visual:** Minimal slate opening. Greeting appears in large, readable text with a subtle light reveal; no team, product or domain title appears before the next scene.

**Transition/audio:** Slow crossfade; restrained cinematic opening swell.

### Scene 2 — ArthaThon / Team FINOVIX / AI for Finance — 00:18–00:34 — 16s

**Narration:** “We are here at the ArthaThon Hackathon. We are Team FINOVIX. Our assigned domain is AI for Finance. We will outline the problem, then demonstrate the solution and the decisions it supports.”

**Visual:** Show “ARTHATHON HACKATHON”, then immediately replace it with a prominent cinematic “TEAM FINOVIX” title, then show “AI FOR FINANCE”. Preserve this exact order.

**Transition/audio:** Each title resolves before the next; Team FINOVIX gets one low, soft impact accent.

### Scene 3 — The Problem — 00:34–00:52 — 18s

**Narration:** “Indian MSMEs can face cash shortages when supplier payments fall due before customer payments arrive. They need to decide which payments to prioritize or delay, when to accelerate collections, and whether financing is necessary, while protecting essential operating cash.”

**Visual:** A dark slate screen headed “THE PROBLEM” with two separate, readable panels: “THE CHALLENGE” presents both supplied problem paragraphs; “HOW CASHSHIELD ADDRESSES IT” presents the supplied solution summary. Use emerald accents and generous spacing; do not label this wording as the official contest statement.

**Transition/audio:** Two panels resolve in sequence; quiet low pulse.

### Scene 4 — Proposed solution: CashShield — 00:52–01:10 — 18s

**Narration:** “CashShield addresses this challenge by recommending a feasible, lowest-estimated-cost combination of financial actions while protecting minimum cash reserves and mandatory payment obligations.”

**Visual:** Actual CashShield name and shield identity. A two-column diagram distinguishes deterministic forecast/rules/cost/optimization from subordinate AI parsing, document extraction for review and explanation.

**Transition/audio:** Architecture resolves into the app landing screen; soft click.

### Scene 5 — Landing page and demo entry — 01:10–01:28 — 18s

**Narration:** “The landing page introduces the product and offers Explore Demo or Import Business Data. We will follow Explore Demo using the supplied synthetic scenario. Vardhman Precision Components is a fictional demonstration business, not a live customer.”

**Visual:** Actual `landing.png`; show the real hero, synthetic scenario label, “Explore Demo” and “Import Business Data”. Simulate the real Explore Demo action.

**Transition/audio:** Button click and workspace reveal.

### Scene 6 — Treasury overview — 01:28–01:46 — 18s

**Narration:** “The overview brings together cash, payables, receivables, protected payroll, financing capacity and the daily cash chart. This synthetic scenario begins with four lakh rupees in cash, a one-lakh reserve and protected payroll of two lakh fifty thousand.”

**Visual:** Actual `overview.png`, with readable emphasis on those verified figures and the dashboard status. No hand-entered financial result.

**Transition/audio:** Metric focus travels toward the chart; sparse UI ticks.

### Scene 7 — Forecast and crisis detection — 01:46–02:04 — 18s

**Narration:** “The forecast computes closing cash day by day and tests each result against the reserve. Here, CashShield detects a projected reserve breach beginning November twenty-four and a peak shortfall of eight lakh twelve thousand. The chart and driver list show where the pressure comes from.”

**Visual:** Actual `crisis.png`; reveal the reserve threshold, computed breach and actual shortfall drivers from the demo response.

**Transition/audio:** Red breach shading leads into the action-plan view; low alert accent.

### Scene 8 — Payables — 02:04–02:22 — 18s

**Narration:** “In Payables, we can inspect due dates, amounts, MSE status, discount windows and contractual charges. Critical and mandatory items are protected. The demo also flags a supplier with unknown MSE status for verification instead of treating it as eligible.”

**Visual:** Actual `payables.png`; use the source UI’s statuses and one supported discount/unknown-eligibility example.

**Transition/audio:** Filter selection and a restrained rule-card placement.

### Scene 9 — Receivables — 02:22–02:40 — 18s

**Narration:** “Receivables lists expected collections, overdue status and financing eligibility. Eligible acceleration costs are illustrative estimates, not live offers. For overdue invoices, CashShield can draft follow-up messages, clearly marked for human review.”

**Visual:** Actual `receivables.png`; show eligibility and the illustrative label. The collection-message capability is source-verified; show its panel only if captured from the actual application without exposing non-synthetic data.

**Transition/audio:** Receivable selection moves into What-If; quiet select click.

### Scene 10 — What-If — 02:40–02:58 — 18s

**Narration:** “What-If lets us adjust collection timing, supplier grace, financing assumptions or opening cash. We will simulate the supported preset: one customer pays ten days late. The engine re-runs the analysis and presents changes in cash, costs and recommended actions.”

**Visual:** Actual `whatif.png` followed by `whatif-result.png`, generated using the supported “Customer pays 10d late” preset. Show the real baseline/scenario comparison.

**Transition/audio:** Simulated selection and run click; brief scenario-result reveal.

### Scene 11 — Constrained optimization — 02:58–03:20 — 22s

**Narration:** “Under the hood, a deterministic bounded search evaluates payable timing and receivable acceleration, and selects eligible credit facilities. CashShield compares this plan with a greedy baseline using the same inputs. A separate validator checks that reserve and mandatory obligations remain satisfied. This is a bounded search, not a global optimality guarantee.”

**Visual:** Use actual solver method and observed metadata in a restrained process overlay. Show actual candidate action categories and the independent validation result; do not imply exhaustive global optimality.

**Transition/audio:** Candidate pulses resolve into a verified checklist; soft validation cue.

### Scene 12 — Action sequence and cost reasoning — 03:20–03:36 — 16s

**Narration:** “The recommended sequence shows actions with their dates, reasons and estimated costs. Open Why to inspect the rationale, or Show Math to review formulas and inputs. The cost model separates delay interest, lost discount, fees and financing interest when they apply.”

**Visual:** Actual crisis/action-plan screen and cost math. Sequentially spotlight actual recommendation cards; avoid inventing formula values.

**Transition/audio:** Formula drawer slides into Evidence; one soft click.

### Scene 13 — Evidence, result and close — 03:36–04:00 — 24s

**Narration:** “Evidence shows the rule versions, assumptions and source records behind recommendations. In this synthetic run, the plan is feasible and keeps minimum cash at the one-lakh reserve. Estimated cost is six thousand six hundred ninety-seven rupees, versus ten thousand eight hundred sixty-four for the greedy baseline. These are illustrative—not legal, lending or tax advice. CashShield. Thank you.”

**Visual:** Actual `evidence.png`, then the real before/after result from the live demo analysis. End on CashShield and “TEAM FINOVIX”. All numerical claims must match the captured demo response.

**Transition/audio:** Slow close to the project’s slate/white identity; music resolves and one quiet confirmation accent lands before exactly 04:00.

## Duration check

18 + 16 + 18 + 18 + 18 + 18 + 18 + 18 + 18 + 18 + 22 + 16 + 24 = **240 seconds exactly**.

## Share copy draft

CashShield — Team FINOVIX’s AI for Finance solution for turning an MSME cash crisis into a traceable, constraint-aware action plan.
