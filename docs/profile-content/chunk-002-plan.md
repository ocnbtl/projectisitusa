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

## Recommended Chunk 2A Species

These species were chosen because they are recognizable, high-impact, already have images, and mostly have strong county coverage or public relevance:

### Insects

- `popillia-japonica`: Japanese beetle
- `halyomorpha-halys`: Brown marmorated stink bug
- `lymantria-dispar`: Spongy moth
- `drosophila-suzukii`: Spotted-wing drosophila
- `solenopsis-invicta`: Red imported fire ant

### Fungi and diseases

- `ophiostoma-novo-ulmi`: Dutch elm disease
- `cryphonectria-parasitica`: Chestnut blight
- `cronartium-ribicola`: White-pine blister rust

### Plants

- `rosa-multiflora`: Multiflora rose
- `lonicera-japonica`: Japanese honeysuckle
- `bromus-tectorum`: Cheatgrass
- `convolvulus-arvensis`: Field bindweed
- `cyperus-esculentus`: Yellow nutsedge
- `alliaria-petiolata`: Garlic mustard
- `lythrum-salicaria`: Purple loosestrife
- `elaeagnus-umbellata`: Autumn olive
- `morus-alba`: White mulberry
- `frangula-alnus`: Glossy buckthorn
- `imperata-cylindrica`: Cogongrass
- `tamarix-ramosissima`: Saltcedar

### Wildlife

- `dreissena-polymorpha`: Zebra mussel
- `cyprinus-carpio`: Common carp
- `corbicula-fluminea`: Asiatic clam
- `sturnus-vulgaris`: European starling

## Selection Notes

- The list intentionally avoids species that are only high-ranked because they are common but low-signal to most users.
- The list also avoids species that currently lack a usable image or have especially weak public-source coverage.
- If a selected species turns out to have poor source quality, swap it before drafting rather than forcing weak copy into the tranche.

## Exit Criteria For Chunk 2A

- All 25 profiles have source-backed, species-specific copy
- `docs/source-inventory.md` is updated with every new source used
- Validation and build both pass
- A new chunk report documents what improved and what still needs work
