# Water Quality Portal positive field counts

The registered `wqp-retained-field-counts@1.0.0` adapter replays retained WQP Results and Station CSV responses for exactly Corbicula fluminea and Dreissena polymorpha. It never acquires data during replay, changes projections directly, or emits absence or non-detection.

The method requires exact published taxon, positive finite Count/count, Final or Accepted status, an understood value type, explicit Population Census or Species Density intent, and a permitted environmental field activity. Toxicity, quality-control, unidentified, qualified and unreviewed fine-zooplankton records are excluded. Original sample dates and source identities are retained.

Join OrganizationIdentifier plus MonitoringLocationIdentifier to exactly one active official Station county FIPS. Preserve both result and station source rows and retrieval times. The repository's generalized 1:5,000,000 cartographic topology is diagnostic only: small river-border offsets and missing open-water polygons do not override explicit official source geography. Specific uncertain rows can be held while clear alternative samples support the same pair; never reassign them automatically.

Two isolated reviewers independently reconstructed California and Kansas witnesses using Python CSV parsing. MAIN retained the recommendations and source context in the r13 evaluation and input directories. The method pins those records by hash. NARS fine-zooplankton Count records require a separate interpretation review, leaving four preflight pairs on hold. The initial registered scope has 138 candidate pairs in 20 states; these are not compiled gains until national reconciliation.

A Final estimated or calculated count can support occurrence when the source explicitly identifies a collected environmental sample and named taxon. The original value type remains visible in retained witnesses; the method does not reconstruct abundance. MAIN reviewed the four such candidate rows: NJDEP benthic kick-net collection with APHA sample processing and TDEC qualitative-sediment dip-net sampling. The state reviewers' scopes contained only Actual values.

Each run emits one assertion and accepted machine review per selected county-species pair, grouped rejection records, scoped evidence-found outcomes, and exact witness locators. Raw-record SHA-256 includes the original line terminator; zero-based data-record index excludes the header, and physical end line includes multiline fields. This convention is distinct from the honey-bee source's no-terminator line hashes. Repeated rows are not summed into progress or falsely identified as separate specimens.

The preflight acquisition receipt's codeCommit is repository HEAD during acquisition. Its separately retained gzip recipe preserves the exact executed task-created acquisition bytes. The later immutable run's code_commit identifies the registered interpretation code. No lineage is rewritten to imply fresh acquisition.

Cite the contributing agency, WQP DOI 10.5066/P9QRKUVJ, exact query and access date. CEDEN also receives its network credit. Public attribution is stored in assertion caveats so it reaches the website without leaking internal audit paths. No blanket CC0 license or provider endorsement is claimed.

The WQX 2.2 responses exclude USGS records added after March 11, 2024. Complete response counts prove only the bounded profile/query retrieval, not a current national inventory, established population, current persistence, countywide prevalence or completed research protocol.

Physical line numbers are counted from decoded source bytes through each parsed record byte offset, with CRLF counted once. The parser's info.lines counter is unsuitable for quoted CRLF fields. The r13 correction audit independently checked all 9,780 retained records with Python. Original failed pilot outputs and historical source-review records are preserved; their raw hashes remain valid and any inflated physical-line fields are superseded by corrected run witnesses.
