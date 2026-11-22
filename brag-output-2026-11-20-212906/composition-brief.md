# Hyperframes Composition Brief: CashShield — Team FINOVIX

## Objective

Create an exact 240-second, narrated, cinematic-but-professional CashShield product demonstration for the ArthaThon Hackathon evaluation panel. Use the approved scene schedule and narration in `brag-plan.md`.

## Output

- Composition directory: `brag-output-2026-11-20-212906/composition/`
- Preview: Hyperframes browser preview; do not render the final MP4 yet.
- Canvas: landscape, 1920×1080 at 30fps.
- Root duration: exactly 240 seconds.
- Problem framing: Scene 3 uses the supplied MSME challenge and CashShield approach. The official ArthaThon wording was not found in project materials and is not claimed.

## Source material

- Project root: `/Users/padmini/Downloads/cashshield (2)`
- Main application: `src/App.tsx`
- Live app screens: original 4K captures in `composition/assets/screens/`; 1600×900 presentation crops in `composition/assets/screens/video/`
- Feature screens: `src/features/{landing,dashboard,crisis,payables,receivables,costs,scenarios,evidence,import}/`
- Financial logic: `server/forecast/`, `server/rules/`, `server/costs/`, `server/optimization/`, `server/scenarios/`
- Demo data: `data/demo/demoDataset.ts`
- Readme, landing page, fonts and product claims: `README.md`, `index.html`, `src/index.css`, feature components.
- Synthetic data only. Never include real customer records or external credentials.

## Creative direction

- Tone: cinematic / polished FinTech evaluation film.
- Opening sequence: greeting → ArthaThon Hackathon → prominent Team FINOVIX title immediately afterward → AI for Finance → supplied MSME problem framing → CashShield.
- The project and final product result are presented as synthetic-demo decision support, not as legal, tax, lending or live financing advice.
- Exact scene timings and narration are in `brag-plan.md`.
- Do not redesign or modify the existing CashShield app.
- Do not present bounded combinatorial search as a global optimality guarantee.

## Visual identity

- Background `#f8fafc`; text `#0f172a`.
- Red marks the actual unmitigated reserve breach; amber indicates the reserve threshold; emerald indicates the actual feasible plan.
- Fonts: Plus Jakarta Sans, DM Sans and JetBrains Mono. Use local/bundled Hyperframes-compatible alternatives if a font cannot be resolved.
- Actual 4K screen captures are supplied in `composition/assets/screens/`; crop/scale them without changing text or data.

## Audio

- Narration: Kokoro local TTS, one scene-aligned clip per scene, based on `brag-plan.md`; use a clear English voice. Keep every narration segment inside its scene. Use the supplied Scene 3 and Scene 4 narration verbatim.
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3`, CC BY 4.0, repeated under the 240-second duration with a short final fade.
- Music bed: 0.12–0.15 while narration is present; never mask speech.
- SFX: use selected local low/medium-risk UI/transition assets only; leave exact choices to motion needs.
- No remote assets, network media fetches or hosted voice provider.

## Composition implementation notes

- Use Hyperframes native composition format and set root `data-duration="240"`, `data-width="1920"`, `data-height="1080"`, `data-fps="30"`.
- Keep all scene boundaries exactly as listed in `brag-plan.md`.
- Use actual captured app screens for the corresponding scenes. Title/architecture scenes may use restrained graphics grounded in the product source.
- Use readable, persistent captions; no flashing text. Motion should come from slow fades, focused camera-scale changes, cursor/selection cues and real UI screen transitions.
- Make root timeline seek-safe and all visible state deterministic.
- Run Hyperframes `check` and fix blockers before preview. Preview the composition locally and stop for review. Do **not** run `render`.

## Known environment and data notes

- The CashShield dev server was already running at `http://127.0.0.1:3000/`; captured screens and `/api/demo` outputs were used.
- Demo date: 2026-11-20. The dataset is explicitly synthetic.
- The official ArthaThon PS wording is absent from the source project. Scene 3 presents the supplied challenge framing without claiming it is the official statement.

## Review preview

- The persistent Hyperframes Studio preview is running at `http://localhost:3002/#project/composition`.
- Open that URL and scrub the 04:00 timeline to review the scenes. The preview is not an MP4 render.
- To restart it later, run `npm install` and `npm run dev` from `composition/`; use `npm run check` to validate. Do not run `npm run render` until the video is approved.
