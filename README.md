# Ticket Reviewer

A web app that reviews tickets against the team's definition of ready and shows what
is missing before the work gets picked up.

## Status

Fresh scaffold. The review rules and the UI are deliberately minimal — there is no
tracker integration yet, so the app renders the placeholder tickets in
`src/sampleTickets.ts`.

## Stack

- Vite + TypeScript (no framework yet)
- Vitest for tests

## Getting started

```bash
npm install
npm run dev       # dev server
npm run test      # run tests
npm run typecheck # type-check without emitting
npm run build     # type-check + production build
```

## Layout

| Path                   | What it holds                                        |
| ---------------------- | ---------------------------------------------------- |
| `src/types.ts`         | `Ticket`, `Finding`, `Review` models                 |
| `src/review.ts`        | The review rules and `reviewTicket` / `passes`       |
| `src/sampleTickets.ts` | Placeholder data until a tracker is connected        |
| `src/ui.ts`            | Rendering of the ticket list and its findings        |
| `src/main.ts`          | App entry point                                      |

## Adding a rule

Rules live in the `rules` array in `src/review.ts`. Each one takes a `Ticket` and
returns a `Finding` when it is violated, or `null` when it is satisfied. Severity
`error` blocks a ticket; `warning` does not.
