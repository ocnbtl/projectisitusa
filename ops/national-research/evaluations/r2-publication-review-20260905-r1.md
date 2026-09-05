# R2 retained-object and publication review

Status: NO-GO for publication under the existing 8,000,000,000-byte project limit. This review authorizes no provider action.

The read-only inventory at 2026-09-05T01:44:50.294Z contains 7,709,331,640 bytes. The exact local candidate research-f82117aa15e6-adc0aad1c6ffddc2 requires 3,195 new content objects (1,324,886,168 bytes), plus manifest and pointer reserve. Projected retained storage is 9,035,784,267 bytes, exceeding the limit by 1,035,784,267 bytes.

Candidate source commit: f82117aa15e68ac3230b409acea3d0a429cd7ce4
Candidate manifest SHA-256: 98413594ccdea47c86874d5d26b532e088b3bb5e3832701f7ac3689162d64662
Read-only report: r2-candidate-preflight-20260905-r1.json
Read-only report SHA-256: f2d6dcab4251029dbac274dae39c4d24e4c07c654db641bda4655d921f994aed

The JSON report contains an exact, sorted reviewOnlyHistoricalRemoval key-and-byte list. It covers only objects referenced exclusively by the seven historical releases outside the current release and two-release rollback window, plus those seven manifests. It excludes content referenced by the candidate, the current release, either retained rollback release, and unrelated or unreferenced objects.

Review-only removal: 22,236 objects, 6,494,152,987 bytes.
Removal-list SHA-256 (compact JSON key-and-byte array): eca9d4494a1c70b960b32707987c7931a205c03aa2f87eb8e4cea6c9b965884e
If this entire list were separately approved and safely removed, projected storage including the candidate would be 2,541,631,280 bytes. This is a capacity calculation, not a recommendation to delete every listed object or permission to do so. A smaller explicitly reviewed subset could also restore the required headroom.

Protected release identities:

- research-e2115f6a705f-163982b59c8351b2
- research-7427b6e8b43e-37943bb5dba1460c
- research-a2951a092577-a039963dbd5201e6

The fresh dashboard observation is recorded in r2-usage-observation-20260905-r1.json. It showed 26.3k Class A and 62.24k Class B operations for August 18 - September 18, with $0.00 displayed billable usage. These are rounded and may lag. The report's single-invocation publish/promote estimate is 3,223 new A and 3,201 new B requests before any deletion. The requested two-phase release, full verification, cleanup, and retries require a separate final operation budget; this estimate is not a two-phase request maximum.

Before any authorized removal, refresh reachability, verify the protected releases, and compare the approved exact key set and bytes. Stop on pointer, manifest, key-set, or byte-count drift. Before any separately authorized publication, recompute the two-phase budget, validate the exact candidate manifest and all local hashes, and enforce the storage and cadence checks. No upload, promotion, deletion, push, or deployment occurred in this review.
