# @runwayops/cash-engine

Pure deterministic cash engine for RunwayOps Phase 3.

This package intentionally has no database, network, AI, or app imports. It uses integer minor-unit money arithmetic and deterministic date handling.

## Contract Note

`src/types.ts` uses shared primitives from `@runwayops/domain`, including `Money`, `EvidenceRef`, promise types, payment status, invoice status, and risk status. Cash-engine input types are intentionally small projections over the domain model so deterministic calculations do not depend on database, AI, network, or UI state.

The cash-engine public function contracts should remain pure and should import domain types only, never DB or application modules.
