# Fonts

Tada ships with bundled font files in two formats:

- **TTF**: used only for favicon generation (rendering the symbol text to images)
- **WOFF2**: copied into the site output for use by browsers

Inter is the default body and heading font. Google Sans Code is the default
monospaced font. The page-bottom [font picker](font-picker.md) pairs Source
Serif 4 with Libertinus Mono in serif mode, which can instead be made the site
default with `defaultFont: serif`. All four families use bundled WOFF2 files and
make no font-network requests to third parties.

Tada fixes browser text-size adjustment at 100% so responsive font sizes remain
consistent on mobile browsers. In particular, iOS Safari does not independently
autosize nested prose blocks such as list levels. User zoom remains available.

Source Serif 4 includes normal and italic variable faces with weight 200–900
and optical size 8–60. Browser optical sizing remains automatic. Libertinus
Mono includes the supplied regular 400 face; browsers may synthesize other
styles when code requests them. Ordered-list markers use old-style numerals
while serif mode is effective; list content and sans mode retain their normal
numeric style. Serif faces without old-style numerals fall back to their normal
figures.

## Custom serif overrides

The optional `fontOverrides.serif` and `fontOverrides.serifMono` configuration
replace either serif family independently with licensed WOFF2 files from the
site's `public/` directory. Each override requires a regular face and may add
italic, bold, and bold-italic faces. Tada declares these as fixed 400/700,
normal/italic faces under internal family aliases. When a styled face is
omitted, the browser may synthesize it. Source Serif 4 or Libertinus Mono stays
next in the corresponding fallback stack, followed by the system fallbacks.

A family can also specify unique four-character OpenType feature tags. The
features apply whenever that family is active. Before building, Tada parses
each configured face and requires every requested feature to be available in
every face. Invalid paths, missing or malformed files, and incompatible
features stop the build with a diagnostic naming the configuration key and
asset path. Watch mode preserves its last successful output after such an
error.

Each override may also carry font-specific `tuning`. The serif family supports
`scale`, `lineHeight`, `headingScale`, `headingWeight`, and `fontSizeAdjust`;
the serif-mono family supports `scale`, `lineHeight`, and `fontSizeAdjust`.
Body scaling changes the serif-mode
base font size, so authored content and inheriting interface text such as
metadata and navigation scale together.
Heading sizes are derived from stable sizes for h1 through h6 and remain
independent of body scaling. Slide headings apply the configured scale in
relative units during presentation so they continue to follow the responsive
slide size. Compact code-page file titles retain their interface sizing. This
is useful for a face with a smaller x-height:
its prose can be enlarged without also making every heading larger. A 400
heading weight uses the regular custom face directly instead of resolving
Tada's semibold heading styles to a static 700 face. Mono scale remains relative
to the surrounding prose. These rules are generated into the stylesheet at
build time and only apply while serif mode is effective; there is no client-side
work or additional font request.

`fontSizeAdjust` is the positive cap-height-to-font-size ratio of the custom
faces. Tada applies it through the two-value `font-size-adjust` syntax to keep
the custom family and its fallbacks at a more consistent apparent size during
font swapping. An inaccurate value also rescales the final custom face, so
authors should derive it from their font files. Proportional and monospaced
adjustments are independent, including for inline SVG text that selects
`var(--mono-font)`. KaTeX retains its own font metrics, and omitted adjustments
retain normal font sizing.

All browser faces are declared in the non-critical stylesheet and use
`font-display: swap`. Each build preloads the normal body and mono faces for its
configured default pairing only. Alternate faces are requested on demand after
a visitor switches. The inactive `Aa` preview uses a system fallback and does
not trigger the alternate pairing. Times New Roman and Courier New remain the
first serif-mode fallbacks while a font loads or if it is unavailable.
Configured size adjustments reduce the visual size change during that fallback
without changing which faces load.

When serif is the configured default, each custom regular face replaces its
corresponding bundled font in the preload pair. Styled custom faces are never
preloaded. A sans-default visit neither preloads nor requests custom serif
fonts; switching to serif demand-loads the faces that the page uses. Public
asset URLs remain relative to the generated stylesheet, so the same output
works at root and non-root base paths.

Custom font files and their licenses belong to the site author. Tada only
validates and publishes files explicitly placed in that site's `public/`
directory.
