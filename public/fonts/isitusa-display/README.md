# ISITUSA Field Display 1.0

A customized derivative of Fraunces by Undercase Type, distributed under the SIL Open Font License 1.1 in OFL.txt. This is not NYBG's proprietary font.

Upstream: https://github.com/undercasetype/Fraunces
Build input: Google Fonts `ofl/fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf`.

The derivative fixes optical size at 72, weight at 800, softness at 25, and wonk at 0. Original flared I and T outlines replace those capitals. Naming records distinguish the derivative; upstream copyright and license remain. The web subset covers Latin letters, basic punctuation, typographic punctuation, euro, trademark, and minus. Use the existing system sans for body text, controls, and data.

Rebuild with `scripts/build-brand-v7.py <upstream.ttf>` using Python, FontTools and Brotli; render the outlined brand files with `scripts/render-brand-v7.mjs`. The outlined wordmark has optical pair spacing. The WOFF2 is self-hosted and does not contact a font service. The TTF is supplied for compatible desktop design tools.

The font is openly licensed; the project name and logo identify ISITUSA and are not a grant of endorsement.
