# MAIN canonical staging

The registered source runner accepts --stage-canonical true with its canonical output root. It performs the same committed-input, schema, scope, semantic, raw-artifact and staged-byte checks, but retains completed runs in .cache/research/canonical-stage until MAIN integrates the batch. Receipt paths already name their final immutable src/data/research/runs locations. The clean-worktree gate remains unchanged. This prevents a small run from forcing a separate commit before the next bounded run.

MAIN verifies each staged run against its committed plan, exact pair set and current baseline, then verifies all staged hashes before moving any directory to its declared final location. Existing staging or final directories cannot be overwritten. Move only the explicitly verified batch within the canonical checkout; preserve incomplete runs for diagnosis. Append runs and one batch receipt in a coherent commit, then generate shared projections once. Source acquisition and observation timestamps remain distinct.

This option does not change worker leases, output contracts, frozen skills or source acceptance rules. It is MAIN-owned integration staging, not a claim that an unregistered worker or human approved the evidence.
