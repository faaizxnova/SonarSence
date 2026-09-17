# SonarSense — Operator Console

Frontend for SonarSense, an AI-powered underwater marine debris detection
system (Smart India Hackathon, problem statement SIH26057). An AUV runs
YOLOv8-seg on side-scan sonar imagery and produces geo-referenced debris
detections using acoustic highlight + shadow analysis; this app is the
operator console for that pipeline — sonar waterfall with detection
overlays, a tactical map, per-target detail, and report export.

Stack: Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript,
Mapbox GL JS, jsPDF.

## Running it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

Copy `.env.example` to `.env.local`. Both variables are optional:

| Variable | Purpose | If unset |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the FastAPI backend | Defaults to `http://localhost:8000`; every failed call falls back to the offline simulation below |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox token for the 3D globe view | The map panel falls back to the built-in offline "Radar GIS" canvas view |

### Running without the backend

This is the demo-critical path: **every** API call in `src/lib/api.ts`
(`uploadSonarData`, `getDetections`, `generateReport`, `healthCheck`)
catches network/HTTP failures and falls back to `createMockScenario()`,
a deterministic, hand-authored detection set for each of the 12 sample
sonar datasets in `public/samples/`. Nothing in the UI requires the
backend to be reachable — if it's down, unreachable, or you're offline,
the dashboard keeps working end to end (scenario switching, detection
overlays, the map, PDF/JSON/CSV export) using that simulated data. A
small "Simulated data" notice appears under the top bar whenever the
currently loaded detections came from the fallback rather than a real
backend response, so it's visible without being alarming.

### Running without a Mapbox token

The tactical map defaults to an offline canvas-based "Radar GIS" view
(zoom/pan, bathymetric contours, detection markers) that needs no
external service. Add `NEXT_PUBLIC_MAPBOX_TOKEN` to unlock the pitched
3D globe view; the in-app fallback card explains this and offers a
one-click switch back to Radar GIS if the token is missing or invalid.

## Project structure

```
src/app/layout.tsx          app shell, next/font font loading, Mapbox CSS
src/app/globals.css         design tokens + shared component classes
src/app/page.tsx            dashboard, all state lives here
src/components/ControlPanel.tsx      top bar: dataset picker, actions, export
src/components/SonarWaterfall.tsx    sonar image + detection overlays + stage switcher
src/components/TacticalMap.tsx       Mapbox / offline radar GIS view
src/components/DetectionCard.tsx     selected target detail
src/components/PhysicsModal.tsx      shadow-height mensuration explainer
src/components/MVBModal.tsx          3D bounding volume inspector
src/components/DossierGenerator.tsx  PDF export
src/components/ErrorBoundary.tsx     per-panel crash isolation
src/lib/api.ts               FastAPI client with offline mock fallback
src/lib/export.ts            JSON/CSV report export helpers
src/lib/theme.ts             canvas/SVG colour palette (mirrors globals.css tokens)
src/lib/types.ts             shared interfaces (the API contract)
src/lib/useModalA11y.ts      focus trap / Escape-to-close for modals
```

## Design system

Every colour and spacing value used in a component should resolve to a
token defined in `globals.css` (`--bg-*`, `--text-*`, `--accent-*`,
`--threat-*`, `--surface-viewport*`). The one deliberate exception is
the sonar waterfall and radar map canvases plus the inline-SVG physics
and MVB diagrams: the Canvas2D API and raw SVG presentation attributes
can't read CSS custom properties, so those draw with literal values
from `src/lib/theme.ts` instead — kept in sync with the CSS tokens by
hand. See the comment at the top of `globals.css` and `theme.ts`.

## Scripts

```bash
npm run dev      # start the dev server
npm run build    # production build
npm run lint     # eslint
npx tsc --noEmit # type-check only
```
