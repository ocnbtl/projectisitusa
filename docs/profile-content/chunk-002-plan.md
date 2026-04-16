# Chunk 2 Plan

## Tranche Structure

The original scaling target was `10 -> 100 -> 500 -> remainder`.

That target still stands at the tranche level, but the next `100` should be executed as four sub-batches of `25` profiles each:

1. Chunk 2A: 25 profiles
2. Chunk 2B: 25 profiles
3. Chunk 2C: 25 profiles
4. Chunk 2D: 25 profiles

Each sub-batch gets its own review pass, source update, and lessons-learned report.

## Why This Is The Better Fit

- It preserves the original growth path
- It keeps the quality loop alive
- It avoids flooding the site with shallow filler profiles
- It gives contributors a clear, repeatable unit of work

## Current Chunk 2A Pilot

The original draft list for Chunk 2A had a contradiction: it was labeled as 25 profiles but only listed 24 species.

Current execution resolves that by treating Chunk 2A as a 15-profile pilot batch inside the broader 100-profile tranche. If quality, source reuse, and validation remain strong, later sub-batches can scale up again.

## Current Chunk 2A Pilot Species

### Insects

- `popillia-japonica`: Japanese beetle
- `halyomorpha-halys`: Brown marmorated stink bug
- `lymantria-dispar`: Spongy moth
- `drosophila-suzukii`: Spotted-wing drosophila
- `solenopsis-invicta`: Red imported fire ant

### Fungi and diseases

- `ophiostoma-novo-ulmi`: Dutch elm disease
- `cryphonectria-parasitica`: Chestnut blight

### Plants

- `rosa-multiflora`: Multiflora rose
- `lonicera-japonica`: Japanese honeysuckle
- `bromus-tectorum`: Cheatgrass
- `convolvulus-arvensis`: Field bindweed
- `alliaria-petiolata`: Garlic mustard
- `lythrum-salicaria`: Purple loosestrife

### Wildlife

- `dreissena-polymorpha`: Zebra mussel
- `cyprinus-carpio`: Common carp

## Deferred From The Earlier Draft 2A List

These species are still strong future candidates, but they were not included in the current pilot:

- `cronartium-ribicola`: White-pine blister rust
- `cyperus-esculentus`: Yellow nutsedge
- `elaeagnus-umbellata`: Autumn olive
- `morus-alba`: White mulberry
- `frangula-alnus`: Glossy buckthorn
- `imperata-cylindrica`: Cogongrass
- `tamarix-ramosissima`: Saltcedar
- `sturnus-vulgaris`: European starling
- `corbicula-fluminea`: Asiatic clam

## Selection Notes

- The list intentionally avoids species that are only high-ranked because they are common but low-signal to most users.
- The list also avoids species that currently lack a usable image or have especially weak public-source coverage.
- If a selected species turns out to have poor source quality, swap it before drafting rather than forcing weak copy into the tranche.

## Exit Criteria For The Pilot

- All 25 profiles have source-backed, species-specific copy
- `docs/source-inventory.md` is updated with every new source used
- Validation and build both pass
- A new chunk report documents what improved and what still needs work
