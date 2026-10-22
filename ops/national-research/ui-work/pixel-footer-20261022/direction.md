# Abstract pixel footer direction

Original procedural image, no AI-image input or photographic source. Layered ridges, stepped tree crowns and an ordered 4x4 square-dot screen. Exported through the already-installed Sharp library; no new browser dependency or third-party image request. Dedicated mobile composition preserves visible trees and hills rather than cropping a panorama.

The transparent alpha plate is colored by CSS. Light uses the official DESIGN.md brand green #00583B over the existing pale page background. Dark uses the existing botanical accent #96D5B5 over #122724. No baked image greens can drift from the interface. The artwork moves from negative space into solid ink at the bottom. Back-to-top belongs with the footer utility controls, above the artwork.

Heading: Rooted in research. Uses the existing section heading size; no forced tiny type or nonwrapping overflow.

## Tool research

- p5.js supports seeded procedural graphics: https://p5js.org/reference/p5/randomSeed/
- ImageMagick documents ordered patterns and monochrome dithering: https://usage.imagemagick.org/quantize/#ordered-dither
- Sharp accepts raw pixel data for optimized static image export: https://sharp.pixelplumbing.com/api-constructor/

Chosen: an original seeded raster composition exported with Sharp, using an ordered dither screen. This provides full control and keeps the production runtime static. Assets are CSS masks, not runtime canvas rendering. No new software installation needed.
