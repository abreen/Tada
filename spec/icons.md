# Icons

Tada draws its own icons as hand-written SVGs. Sites load no icon fonts or
third-party icon sets.

Every icon uses one stroke width, 1.65px, with round caps and round joins. Each
SVG's viewBox matches its rendered pixel size (a 20px icon uses
`viewBox="0 0 20 20"`), so the stroke renders at exactly 1.65px everywhere.
Icons never scale with font size. The `contrast-standard` stripes are the one
exception to the stroke width: they use 1.25px so the striped half reads
lighter than the solid half of `contrast-high`, which is a single filled path
with no stroke.

## Mask icons

`src/_icons.scss` defines the CSS mask icons on `:root`. Each `define-icon`
call emits `--icon-<name>` (an SVG data URI) and `--icon-<name>-size`.
Components paint them in `currentColor` through the `contained-mask` mixin.
The `icon-svg` function and `$icon-stroke-width` in `src/_mixins.scss` supply
the shared SVG attributes.

| Icon | Size | Used by |
| --- | --- | --- |
| `external-link` | 20px | External links |
| `search` | 20px | Header search field |
| `contrast-standard` | 20px | Contrast picker, standard endpoint |
| `contrast-high` | 20px | Contrast picker, high endpoint |
| `info` | 40px | Note alerts |
| `info-compact` | 20px | Note entries in the table of contents |
| `warning` | 40px | Warning alerts |
| `warning-compact` | 20px | Inline `i.warning` and warning TOC entries |
| `breadcrumb-separator` | 24px | Breadcrumb separators |
| `heading-present` | 24px | Slide-title presentation buttons |
| `check` | 18px | Checked checkboxes |
| `question-correct` | 22px | Correct multiple-choice answers |
| `question-incorrect` | 22px | Incorrect multiple-choice selections |

Inline elements use the `.mask-icon` class with a `.mask-icon-<name>` modifier,
which sets `--mask-icon` and `--mask-icon-size`. Pseudo-elements consume the
`--icon-<name>` variables directly.

## Inline SVG icons

Some icons are inline SVG elements and repeat the same stroke attributes: the
animated header menu (24px), the time zone reset button (24px), and the trace
navigation buttons (16px). The slide annotation and eraser cursors are 24px
two-tone SVGs that interpolate `$icon-stroke-width`.

## Adding an icon

1. Pick a fixed pixel size.
2. Draw the paths in a coordinate space of that size. Keep stroke ends at
   least 0.825px (half the stroke) inside the viewBox.
3. Add a `define-icon` call to `src/_icons.scss`, or use `$icon-stroke-width`
   and the same size/viewBox rule for an inline SVG.
