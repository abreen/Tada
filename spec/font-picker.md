# Font Picker

By default, every page includes a font picker in the appearance control row
after the optional Tada attribution footer. Set `features.pickers: false` to
omit the entire appearance control row from generated HTML without disabling
configured defaults or stored visitor preferences. The row also includes the
[contrast picker](contrast-picker.md). The two `Aa` buttons select between
sans-serif and serif typography for both prose and monospaced text.

Sans-serif is the default when `defaultFont` is omitted from the site config.
Authors can set `defaultFont: serif` to build every page with serif typography
already active. Sans mode uses Inter for body text and headings and Google Sans
Code for monospaced text. Serif mode uses this bundled pairing:

- body text and headings: Source Serif 4, then Times New Roman, Times, serif
- monospaced text: Libertinus Mono, then Courier New, Courier, monospace

Authors may replace either serif family independently through
`fontOverrides.serif` and `fontOverrides.serifMono`. Custom faces appear before
the bundled family in the stack, without changing the picker, storage, or root
attribute contracts. See [Fonts](fonts.md#custom-serif-overrides) for the face,
feature, tuning, loading, and licensing rules. Font-specific tuning is compiled
into serif-mode CSS and therefore changes neither picker behavior nor first-paint
preference handling.

Custom serif and serif-mono tuning may include independent `fontSizeAdjust`
cap-height ratios. While serif mode is effective, these adjustments reduce the
apparent size change between fallback and custom faces. The inactive previews
do not inherit the active family's adjustment.

The inactive font button uses its system fallback for its preview, so rendering
the picker does not request the alternate bundled family.

Serif mode uses the same base `1rem` size and `1.7` line height as sans mode.
Source Serif 4 uses its automatic optical-size axis.

All faces use `font-display: swap`. A build preloads only its configured default
pair: Inter and Google Sans Code for sans, or Source Serif 4 and Libertinus Mono
for serif. A custom regular face replaces the corresponding bundled serif
preload. The alternate pair remains demand-loaded.

With the CSS Font Loading API available, selecting the alternate pair starts an
atomic common-face barrier before changing the effective preference. The
barrier calls `document.fonts.load()` for proportional 400 normal,
proportional 700 normal, and monospaced 400 normal in the target pair, and every
call must return at least one matching face. The currently applied typography,
root attribute, pressed state, and stored value remain unchanged until all
three calls resolve. Italic and bold-italic faces are deliberately excluded and
remain demand-loaded when content uses them.

A repeated click on the pending target reuses its request. Selecting the
currently applied option cancels the pending intent, and a superseded request
cannot apply later. There is no timeout or pending indicator. A rejected load
or an empty match leaves the current preference applied; a click does not alter
storage, while a stored override remains available for a later retry. When the
Font Loading API is unavailable, selection retains the immediate behavior.

The buttons expose their state with `aria-pressed`. The root `<html>` records
the configured choice in `data-default-font-preference`; effective serif mode
uses `data-font-preference="serif"`. A visitor selection that differs from the
configured default is stored as `fontPreference=sans` or
`fontPreference=serif`. Choosing the configured default removes the key. On a
hard load with an opposite stored preference, a guarded head script leaves the
configured typography applied while it loads the stored pair's common faces,
then applies the override atomically. Without a valid override, it leaves the
build-rendered state untouched.
Each rounded group follows the trace-control styling: a padded secondary
background without an outer border and one neutral, button-shaped knob that
slides between two options separated by the trace controls' standard half-rem
gap. The options inherit the same hover, focus, and active treatments as the
trace-widget buttons. Those transient states do not move the knob; it moves
only after the preference is selected. When the selected option is hovered,
focused, or active, its treatment is painted on the knob itself so the button
background cannot clip the knob while it slides into place.

The font and contrast pickers are one page-local component. When enabled, they
are re-mounted and synchronized after client-side navigation replaces the page
container. A pending font intent survives that navigation and synchronizes the
new controls when it resolves. They remain present when the attribution footer
is disabled.

The appearance row is rendered at build time so it occupies its final layout
position as soon as the HTML is parsed. All four buttons are initially disabled
and the component enables and synchronizes them when it mounts. With JavaScript
disabled the row remains visible but inert, and the complete page uses the
configured typography. The row is excluded from Pagefind indexing and printed
output.

The font stacks and their OpenType feature settings are separate CSS custom
properties. Inter retains its existing feature settings, while the system serif
and monospaced stacks use normal feature settings.
