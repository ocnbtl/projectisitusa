# iNaturalist retained context recovery

Adapter inaturalist-gbif-research-grade 1.1.0 repairs place-name and habitat false exclusions in the retained weekly GBIF snapshot. A garden, zoo, nursery or greenhouse is a location, not by itself an organism cultivation decision. The provider wild field remains mandatory. Explicit cultivation/captivity terms remain review holds, including unresolved negation or another organism in the narrative.

This produces documented historical occurrence only. It does not establish a population or persistence today. The original observation date and provider retrieval time stay distinct from replay interpretation time. A transient greenhouse hitchhiker can document an occurrence without demonstrating establishment.

The registered source runner accepts --archive-replay-commit and --archive-replay-run-id with this adapter. The retained response loader verifies the committed original receipt, output and selected response hashes, original successful requests, snapshot query identity, exact complete pair outcomes and complete pagination. Unknown requests fail closed. Its new provenance artifact links each reused response to the original acquisition; it does not fabricate a historical worker verification file.

The evaluation rechecks 125 original rejection witnesses. Ninety-six rows pass the corrected context and other original filters, spanning 30 unresolved pairs at the fixed 316,240-pair baseline. A first CC0/CC BY metadata subset supplies five candidate witnesses across four unresolved pairs. These are prospective gains, not integrated determinations. The source runner will review all retained rows in each selected species response.

The pilot chooses CC0/CC BY observation metadata and retains attribution. Images and audio have separate permissions and are not downloaded. Existing CC BY-NC acceptance is not retroactively redefined; the remaining 26 BY-NC-only candidate pairs need a concrete intended-use evaluation.

Source guidance: [wild and captive classification](https://help.inaturalist.org/en/support/solutions/articles/151000169932) and [observation and media licenses](https://help.inaturalist.org/en/support/solutions/articles/151000173511), checked 2026-09-07.

Method admission and exact retained evaluation: ops/national-research/receipts/source-evaluations/inaturalist-context-method-admission-20260907-r6.json. Plans: ops/national-research/plans/inaturalist-context-20260907-r6/. Independent pilot review is pending.
