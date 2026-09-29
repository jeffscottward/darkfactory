---
name: frontend
description: Use when building or changing DarkFactory pages, components, view-models, client state or accessibility in apps/web and packages/ui.
---

# Frontend

Build the presentation over a contract. Data and behavior stay headless; components only render props.

## Responsibilities

- Load data through the oRPC contract (server-rendered pages use the in-process dispatch). Never query the database from a page.
- Map contract output into a view-model (plain, pre-formatted props) with a pure, unit-tested `to<Name>ViewModel` function in `apps/web/src/features/<name>/view-model.ts`. The component takes only the model. Copy the reference: `apps/web/src/features/dashboard/view-model.ts`, rendered by `apps/web/src/components/portal/dashboard-content.tsx`.
- Build reusable presentational components in `packages/ui` with Tailwind and shadcn tokens, and page-specific ones in `apps/web/src/components/`. `packages/ui` has no workspace dependencies; keep it that way.
- Use XState (`packages/state`) for multi-step lifecycles and Zustand only for ephemeral UI state, never for server data.
- Meet accessibility rules: semantic structure, labels, visible focus, contrast, a 44 px minimum height for fields and buttons, and `prefers-reduced-motion`.
- Check responsive layouts at 375, 768, 1024 and 1440 px.

## Inputs

- The contract output shape from the architect or backend.
- `design-system/darkfactory/MASTER.md` (UI specification) and `.impeccable.md` (design context).
- Existing components in `packages/ui/src/` and pages in `apps/web/src/app/`.

## Outputs

- Pages under `apps/web/src/app/(public)/`, `(auth)/` or `(portal)/`.
- View-model mappers with unit tests.
- Components with unit tests, and Playwright specs (`tests/e2e/*.spec.ts`, or `*.a11y.spec.ts` for axe checks) for user journeys.

## Commands and gates

- `bun run dev` to work at `https://darkfactory.localhost`.
- `pnpm exec vitest run <file>` for view-models and components.
- `bun run test:e2e` and `bun run test:a11y`, or `pnpm exec playwright test --ui`.
- `bun run check`, then `bun run verify:prepush`.
- Gate: the a11y project passes, and the browser error guard in `tests/e2e/fixtures.ts` reports no console errors.

## Handoff

- To **qa**, with the journeys to cover end to end and the seeded accounts they use.
- Back to **architect** if the page needs data the contract does not provide.

## Don'ts

- Do not fetch data or call services inside `packages/ui` components.
- Do not import a `./server` export from client code; it resolves to a throwing stub in the browser.
- Do not store server data or preferences in Zustand.
- Do not use serif fonts, Inter, Roboto, Arial or Open Sans, or hover effects that move or resize elements.
- Do not use real personal data in placeholders. Use `.test` addresses and fictional names.
