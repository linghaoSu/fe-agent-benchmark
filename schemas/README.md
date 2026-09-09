# Canonical schemas

All contract files are JSON Schema Draft 2020-12 documents. V1 uses integer
`schemaVersion: 1`; the CLI rejects another integer major before structural
validation. Core objects are closed, while top-level `extensions`, protocol
event data, and tool argument/result maps are the only open namespaces.

The architecture leaves identifier syntax, timestamp formatting, protocol
payload detail, public outcome taxonomy, and comparison aggregation layout
open. V0.3 therefore uses opaque non-empty identifiers and timestamps, the
smallest payload required to distinguish each frame, four coarse public outcome
codes, and per-configuration comparison aggregates. Cross-record closure,
timestamp ordering, state transitions, scan outcome consistency, and checksum
verification remain semantic/runtime checks in later stages.

Document kind detection is content-based and deterministic. The CLI tests the
architecture-named top-level markers documented by `pnpm eval help` in order,
then selects Result for `runId` and Task as the fallback. Missing-required
fixtures retain their marker so errors are reported against the intended
schema.
