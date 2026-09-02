# Vendored UI typefaces

Both files are the `latin` subset of the upstream **variable** build (weight
axis only). They are committed deliberately: the console must render correctly
on an edge node with no route to a font CDN.

| File | Family | Axis | Licence |
| --- | --- | --- | --- |
| `Inter-Variable-latin.woff2` | Inter | `wght 400..700` | SIL Open Font License 1.1 |
| `JetBrainsMono-Variable-latin.woff2` | JetBrains Mono | `wght 400..600` | SIL Open Font License 1.1 |

The SIL OFL permits redistribution and bundling, including in a commercial
product, provided the fonts are not sold on their own and the licence notice
travels with them. Neither font is renamed, so the Reserved Font Name clause
is satisfied.

- Inter — © The Inter Project Authors — <https://github.com/rsms/inter>
- JetBrains Mono — © The JetBrains Mono Project Authors — <https://github.com/JetBrains/JetBrainsMono>

Full licence text: <https://openfontlicense.org/open-font-license-official-text/>

## On Kern Standard

Shield AI's own site uses **Kern Standard** (Pizza Typefaces), confirmed from
the `@font-face` rules on shield.ai. It is a commercial licence we do not
hold, and Pizza Typefaces requires direct contact for SaaS/platform use — so
it is not vendored here.

Inter is the stand-in. To swap once licensed: drop the woff2 in this folder,
add a matching `@font-face` to `src/styles/fonts.css`, and move the family to
the front of `--font-sans` in `src/styles/tokens.css`. No component changes.
