# Round 1 independent critique

Score: **8/10**. This is convincing operator-console chrome within the implemented shell scope. It is deliberately spare rather than pretending to be an operational picture. The score does not approve unfinished maps, mission processing, simulation, replay or production readiness.

## Method

I independently launched headless Microsoft Edge through Playwright against the running production preview at http://127.0.0.1:5183. I captured my own screenshots and inspected the image files using view_image. I did not use the implementer's captures and did not modify product source or tests.

Viewports: 1024×768, 1440×900, 1920×1080 and 3840×2160 CSS pixels. Captures include default Tactical workspace, Command Picture, 3D and Timeline tabs, splits, options menu, disabled-module tooltip, keyboard shortcuts dialog, focused tab, hidden Views sidebar and all-tabs-closed recovery. The 3840 screenshots were additionally shown scaled down by the image display; text-size measurements were taken from the browser to avoid mistaking image scaling for a layout defect.

## Visual judgment

- The hierarchy is immediately legible: narrow identity/clock bar, persistent activity rail, compact view list, restrained tab strip and dominant workspace. It resembles a desktop workbench rather than a dark SaaS dashboard.
- Near-black blue-undertone surfaces, neutral active-edge marks and subtle washes are consistent. No decorative accent colour, fake metrics, charts, oversized cards, glow or ornamental content appear.
- The supplied logo is appropriately small and neutral. The UTC+8 clock is compact and typographically distinct from labels.
- Empty states report the implementation boundary plainly. They do not fill the canvas with fictional tracks or imply a map is loaded.
- Tab focus is visibly distinct from active selection. Menus and the shortcut dialog have square, compact geometry and credible contrast. Pane boundaries remain quiet while the workspace stays understandable in a two-pane arrangement.
- The shell scales without viewport scrolling at all four tested sizes. It does not stretch chrome into oversized controls on larger displays.

This is an 8 rather than a 9: some microcopy is smaller than professional instrument readability warrants, and a little repeated chrome remains. The score reflects the visual consistency and the successful actual interactions, not merely checklist completion. I would accept this shell as the visual baseline for adding the real operational views.

## Highest-priority remaining defects and fixes

1. **Fix malformed accessible labels.** Disabled Activity Bar buttons contain an actual U+FFFD replacement character: `Home � not implemented` (likewise the other unavailable modules). The browser output and UTF-8 source inspection both confirmed it. Replace it with an ordinary comma or correctly encoded separator. This is a small source defect, not a visible layout failure.
2. **Increase constraint microtext to approximately 10px.** `N/A` and `VIEW ONLY` are 8px; `NOT IMPLEMENTED` is 9px. Their meaning is valuable but the small size works against reading under pressure. Keep them neutral and recessed. `N/A` is also less precise than an unavailable marker; the hover label correctly explains `Not implemented`, so this is not a hidden functional promise, but the always-visible shorthand could be clearer.
3. **Eventually consolidate duplicate close controls.** A selected tab has a close icon and its immediately adjacent pane toolbar repeats another close icon. Both work, but the duplicate adds controls without adding capability. Keep one sufficiently discoverable close action and the view menu's equivalent, or have a documented reason for the toolbar duplicate when future content arrives. This is polish, not a blocker.

## Interaction evidence

All of the following were exercised rather than inferred from screenshots:

- Activity Bar Command Picture action selected the existing Command Picture tab; changing the active view updated the neutral Activity Bar and Views selection indicators.
- 3D View options → Open to Side created a second tab group; Timeline did the same at 1920 and 3840.
- Dragging the Command Picture tab to the workspace's right edge docked it as a split.
- Mouse dragging a divider moved its x-position from 846 to 722. Three keyboard ArrowLeft presses moved a divider from 846 to 816.
- Closing 3D removed its tab; reopening it through Views restored one tab.
- Closing every tab produced `No open views` plus a working recovery button; recovery reopened Tactical Map.
- Hiding and restoring the Views list preserved the workbench.
- Activity Bar ArrowDown moved keyboard focus from Map to Command Picture. Enter activated it.
- F6 transferred focus from the selected Command Picture tab to its view's first control.
- Ctrl+Delete closed a focused Command Picture tab.
- The shortcuts dialog opened, Escape dismissed it, and focus returned to its trigger.
- Unavailable modules were disabled and visibly receded; hover disclosed the module name and `Not implemented` before interaction.
- Clock rendered `23:19:57` alongside UTC+8 while its machine timestamp was `2026-09-10T15:19:57.008Z`, the correct +8-hour relation. Subsequent captures showed the clock advancing.
- Document scroll width/height matched each tested viewport. No browser page errors were observed.

Raw browser observations are in checks.json and additional-checks.json. Reproducible capture scripts are capture.mjs and additional-capture.mjs; run them from the repository root while the preview is listening on port 5183.

## Limits

This review does not establish dense operational-data readability, imagery-overlay contrast, backend authority, renderer continuity, long-session performance, assistive-technology behaviour beyond inspected semantics, or pop-out correctness. Those need real implemented features and separate verification. No score penalty was assigned for intentionally absent later-phase features.

## Verification addendum

After the implementer corrected the malformed accessible-label separator and rebuilt the preview, I independently loaded a fresh Edge browser context. All six unavailable module buttons now use the ASCII separator ` - not implemented`, and none contains U+FFFD. This resolves finding 1. The original critique and 8/10 score are preserved; no further aesthetic review was performed. Evidence: label-fix-check.json and verify-label-fix.mjs.
