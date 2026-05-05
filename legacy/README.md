# Legacy RunwayPilot prototype

Archived 2026-05-05.

This folder contains the original RunwayPilot exploration:

- `apps/web/` — Next.js web app (App Router, Mongo-backed)
- `scripts/` — voice agent (ElevenLabs + Twilio), Mongo demo seed/reset,
  Fireworks vector search experiments
- `docs/` — implementation notes for the prototype stack
- `data/`, `experiments/` — fixtures and exploratory work

It is preserved (not deleted) because the voice + embedding stack may be
revived in Phase 11+ critical-obligation case work (collection actions
via voice channel, evidence retrieval over historical communications).

The active build is the RunwayOps cash-management product. Source of truth:

- `/New Spec.md`
- `/IMPLEMENTATION_PLAN.md`
- `/packages/{domain,cash-engine,ai,db}`
- `/apps/{api,web,workers}` (forthcoming)

**Do not import from `legacy/` in new code.** Treat it as read-only
reference. If a piece is needed in the active build, port it deliberately
into a real package with its own contracts and tests.
