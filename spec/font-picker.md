# Font Picker

Every page includes a font picker in the appearance control row after the
optional Tada attribution footer. The row also includes the
[contrast picker](contrast-picker.md). The two `Aa` buttons select between
sans-serif and serif typography for both prose and monospaced text.

Sans-serif is the default. It uses Inter for body text and headings and Google
Sans Code for monospaced text. Serif mode uses this bundled pairing:

- body text and headings: Source Serif 4, then Times New Roman, Times, serif
- monospaced text: Libertinus Mono, then Courier New, Courier, monospace

The serif button uses the system serif fallback for its preview so mounting the
picker in the default sans mode does not request Source Serif 4.

Serif mode uses the same base `1rem` size and `1.7` line height as sans mode.
Source Serif 4 uses its automatic optical-size axis.

The serif faces use `font-display: swap` and are not preloaded. On a first-time
sans visit, the browser does not request them. Selecting serif—or restoring a
stored serif preference—requests only the normal, italic, and monospaced faces
needed by the page, with the system fallbacks keeping content visible while
they load.

The buttons expose their state with `aria-pressed`. Selecting serif sets
`data-font-preference="serif"` on the root `<html>` element and stores
`fontPreference=serif` in local storage. Selecting sans-serif removes both the
attribute and the stored value. An inline script restores serif mode in the
document head so the stored preference applies before the page is painted.
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
default sans-serif typography. The row is excluded from Pagefind indexing and
printed output.

The font stacks and their OpenType feature settings are separate CSS custom
properties. Inter retains its existing feature settings, while the system serif
and monospaced stacks use normal feature settings.
