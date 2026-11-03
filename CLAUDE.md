# vscc-dashboard-client

React + Vite + MUI dashboard for live/historic VSCapture vitals (SciChart, MQTT).

## Quality gate (CI)

`.github/workflows/ci.yml` (Frontend CI) runs on every push and PR:
**eslint** (lint) · **vitest** (tests) · **`tsc -b && vite build`** (typecheck + build).

Before pushing, run locally:

```bash
bun install --frozen-lockfile
bun run lint && bun run test && bun run build
```

## Conventions

- **New code is held to the full eslint ruleset** (type-checked rules on).
- **Grandfathered files** are listed as `per-file-ignores` in `eslint.config.js`
  (e.g. `src/utils/dataParser.ts`, `src/components/Sidebar.tsx` — they parse
  untyped external JSON as `any`). **Don't disable rules repo-wide to silence
  lint**; if you properly type one of these, remove its override in the same PR.
- **Add-on hook** (`src/addons/`, README "Add-on panels"): keep it generic. No
  product-specific ids, names or panels in core; an external build injects them via
  `VSCC_ADDONS`. Core's community filter (`isCommunitySignal`) stays MMS-only
  except for ids an add-on registers in `signals` (WOR-1104); metadata lookups go
  through `signalMeta()` in `src/data/signalMeta.ts`, never `PHYSIO_META` directly.
- **Tests** live next to code as `*.test.ts(x)` and run in jsdom. The parsing
  logic in `src/utils/dataParser.ts` (`processRawData`, `selectFreshRecords`) is
  pure — cover new branches there with unit tests.

## Workflow

- Branch → implement → tests → PR. Merge policy: the global rule applies (merge and deploy by default when the gate is green, in scope, no uncertainty, not in the always-ask set); never force-push. Linear closes the ticket on merge (Closes WOR-#).
- **Tracking is in Linear, team WOR.** Put `Closes WOR-#` in the PR body.
- Never change repo visibility — only Chris does that.
