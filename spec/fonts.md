# Fonts

Tada ships with bundled font files in two formats:

- **TTF**: used only for favicon generation (rendering the symbol text to images)
- **WOFF2**: copied into the site output for use by browsers

Inter is the default body and heading font. Google Sans Code is the default
monospaced font. The page-bottom [font picker](font-picker.md) pairs Source
Serif 4 with Libertinus Mono in serif mode, which can instead be made the site
default with `defaultFont: serif`. All four families use bundled WOFF2 files and
make no font-network requests to third parties.

Source Serif 4 includes normal and italic variable faces with weight 200–900
and optical size 8–60. Browser optical sizing remains automatic. Libertinus
Mono includes the supplied regular 400 face; browsers may synthesize other
styles when code requests them.

All browser faces are declared in the non-critical stylesheet and use
`font-display: swap`. Each build preloads the normal body and mono faces for its
configured default pairing only. Alternate faces are requested on demand after
a visitor switches. The inactive `Aa` preview uses a system fallback and does
not trigger the alternate pairing. Times New Roman and Courier New remain the
first serif-mode fallbacks while a font loads or if it is unavailable.
