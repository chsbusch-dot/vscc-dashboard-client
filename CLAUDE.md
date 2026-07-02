# vscc-dashboard-client

React + Vite + MUI dashboard for live/historic VSCapture vitals (SciChart, MQTT).

## Quality gate (CI)

`.github/workflows/ci.yml` (Frontend CI) runs on every push and PR:
**eslint** (lint) · **vitest** (tests) · **`tsc -b && vite build`** (typecheck + build).

Before pushing, run locally:

```bash
npm ci
npm run lint && npm test && npm run build
```

## Conventions

- **New code is held to the full eslint ruleset** (type-checked rules on).
- **Grandfathered files** are listed as `per-file-ignores` in `eslint.config.js`
  (e.g. `src/utils/dataParser.ts`, `src/components/Sidebar.tsx` — they parse
  untyped external JSON as `any`). **Don't disable rules repo-wide to silence
  lint**; if you properly type one of these, remove its override in the same PR.
- **Tests** live next to code as `*.test.ts(x)` and run in jsdom. The parsing
  logic in `src/utils/dataParser.ts` (`processRawData`, `selectFreshRecords`) is
  pure — cover new branches there with unit tests.

## Workflow

- Branch → implement → tests → PR. **Don't merge your own PR** — leave it for
  Chris to review (an auto-guard enforces this).
- **Tracking is in Linear, team WOR.** Put `Closes WOR-#` in the PR body.
- Never change repo visibility — only Chris does that.
