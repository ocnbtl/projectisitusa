# About logo corrections

Scope: restore ISITUSA art to white in dark mode, restore its logo in the About introduction, and correct research-source contrast and optical scale.

- EDDMapS: official reverse artwork from its branding page replaces blanket filtering; screen blending removes the supplied black backing while retaining the MapS knockouts.
- Minnesota: original geometry retained; display bounds accommodate transparent padding, bringing its visible mark to roughly 58px high alongside Virginia Tech at roughly 59px.
- iDigBio: dark-theme brightness improves the original colored mark without replacing its artwork.
- All 23 source identities inspected together in both themes in a local browser proof using the actual source assets and component CSS. This proof is presentation-only, not application verification.
- ISITUSA logo restored next to the independent-initiative introduction using the existing approved v10 lockup; custom font files untouched.
- Application lint: 174 files, zero warnings/errors. No research, payment, email, or authentication data/configuration changes.

Production verified:
- Revision 5d41f71daf42c6bd03f778eceb11514b3dd4bc98, deployment dpl_iqHojigxSQEUsoVYxMMuK5UsfXiJ, READY with isitusa.com/www/team aliases.
- Live Brave rendering at 1440px dark desktop, 390px light/dark phone simulation, and 1024px light tablet simulation. No horizontal overflow, failed loaded images, or identity-layout expansion. About identity height 116px.
- EDDMapS uses the reverse asset in dark mode; original light asset remains. Full source comparison saved in source-comparison.png; production page proof live-dark.png.
- Temporary browser viewport reset and original dark theme restored. Local comparison server stopped.
- Canceled incomplete/superseded builds before publication. One final production release completed.
