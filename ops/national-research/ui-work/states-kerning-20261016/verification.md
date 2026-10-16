# Invasive Serif 1.004 release

- User approved the final States spacing and authorized publication.
- Shared TTF and WOFF2 updated to 1.004; CSS, preload and font download references use the new revision.
- Full-name SVG and PNG rebuilt with native HarfBuzz shaping. Artwork dimensions and download reference updated.
- All glyph outlines, advance metrics and character coverage are unchanged from production 1.001. Only ta and at kerning pairs differ from production; only at differs from the prior 1.003 proof.
- Compared 2,704 Latin letter pairs; at advances 24 units less than in 1.003. Sta glyph positions remain unchanged. No a/t contour overlap in the rendered proof.
- Packaging verifies TTF/WOFF2 GPOS parity, master outline preservation and approved prior h adjustment.
- Font SHA-256: cc4ab7041a6f777a0fb801166fba8355f0ba457c4c4a30d2f8880581fcb395f2.
- Application lint: 176 files, zero warnings/errors. TypeScript passed.
- Vercel publication regression checks passed. No research, payment, authentication or email configuration changes.
- Visual release checks: About, brand kit, home and support at desktop/mobile sizes; light/dark rendering, loaded font revision, image loading, overflow and downloads.
- Hosted build and production visual verification pending at commit time.
