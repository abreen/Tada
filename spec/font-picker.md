# Font Picker

Every page includes a font picker in the appearance control row after the
optional Tada attribution footer. The row also includes the
[contrast picker](contrast-picker.md). The two `Aa` buttons select between
sans-serif and serif typography for both prose and monospaced text.

Sans-serif is the default when `defaultFont` is omitted from the site config.
Authors can set `defaultFont: serif` to build every page with serif typography
already active. Sans mode uses Inter for body text and headings and Google Sans
Code for monospaced text. Serif mode uses this bundled pairing:

- body text and headings: Source Serif 4, then Times New Roman, Times, serif
- monospaced text: Libertinus Mono, then Courier New, Courier, monospace

The inactive font button uses its system fallback for its preview, so rendering
the picker does not request the alternate bundled family.

Serif mode uses the same base `1rem` size and `1.7` line height as sans mode.
Source Serif 4 uses its automatic optical-size axis.

All faces use `font-display: swap`. A build preloads only its configured default
pair: Inter and Google Sans Code for sans, or Source Serif 4 and Libertinus Mono
for serif. The alternate pair remains demand-loaded when a visitor switches,
with system fallbacks keeping content visible while it loads.

The buttons expose their state with `aria-pressed`. The root `<html>` records
the configured choice in `data-default-font-preference`; effective serif mode
uses `data-font-preference="serif"`. A visitor selection that differs from the
configured default is stored as `fontPreference=sans` or
`fontPreference=serif`. Choosing the configured default removes the key. A
guarded inline script applies a valid override before paint; without one, it
leaves the build-rendered state untouched.
Each rounded group follows the trace-control styling: a padded secondary
background without an outer border and one neutral, button-shaped knob that
slides between two options separated by the trace controls' standard half-rem
gap. The options inherit the same hover, focus, and active treatments as the
trace-widget buttons. Those transient states do not move the knob; it moves
only after the preference is selected. When the selected option is hovered,
focused, or active, its treatment is painted on the knob itself so the button
background cannot clip the knob while it slides into place.

The font and contrast pickers are one page-local component. They are re-mounted
and synchronized after client-side navigation replaces the page container.
They remain present when the attribution footer is disabled.

The appearance row is rendered at build time so it occupies its final layout
position as soon as the HTML is parsed. All four buttons are initially disabled
and the component enables and synchronizes them when it mounts. With JavaScript
disabled the row remains visible but inert, and the complete page uses the
configured typography. The row is excluded from Pagefind indexing and printed
output.

The font stacks and their OpenType feature settings are separate CSS custom
properties. Inter retains its existing feature settings, while the system serif
and monospaced stacks use normal feature settings.
