# Type Scale

Tada sizes its text with a fixed type scale defined in `src/_type.scss`. Each
step is a nominal size in px at a 16px body size: 12, 13, 14, 15, 16, 19, 24,
and 40. A step renders as a multiple of `--font-size`, not of its parent, so
nested text keeps its step instead of compounding, and serif-mode `scale` and
presentation slides resize the whole scale together.

| Step | Text |
| ---- | ---- |
| 40 | `h1` |
| 24 | `h2` |
| 19 | `h3`, blockquotes, styled-list markers |
| 16 | body text, `h4`, styled-list items, text and search inputs |
| 15 | tables, figure captions, the page info row, the footer, the table of contents (levels 1–3 and labels), the document index, the header logo badge, the trace step counter |
| 14 | footnotes |
| 13 | `h5`, buttons, `kbd`, checkbox labels, footnote references, details-preview labels, tab labels, search hints and excerpts, output labels, the page update message, the TOC label and levels 4–6 |
| 12 | `h6` |

Headings are bold, except where Tada already sets another weight. Selects,
superlinks, the document pagination buttons, and code-page file titles inherit
their surrounding size. Monospaced text stays relative to the surrounding
prose with `--mono-font-size`, and the emoji logo and trace memory diagrams
keep their fixed sizes.

## Inter tuning

In sans mode, each step also sets Inter's optical size (`opsz`) and
letter-spacing for its size and weight, from the
[inter-optical-sizing](https://github.com/nanxstats/inter-optical-sizing)
presets, which mimic San Francisco's optical sizing. Letter-spacing is converted
to em, so it follows the rendered size. Each step also passes its values for
weights 400, 500, 600, and 700 to its descendants, so text that only changes its
weight, such as `strong`, `th`, or a search match, is tuned for its inherited
step. A step without its own weight is tuned as regular text, and `b` and
`strong` are tuned as bold.

The optical sizes are chosen for a 16px root size. When a visitor changes the
browser's default font size, the text scales but keeps the same optical sizes.

The tuning is all generated CSS. A root `--inter-tuning` custom property is
empty in sans mode, and `initial` in serif mode and on presentation slides,
which makes every tuning declaration inherit instead. Serif mode therefore
keeps its normal spacing and the browser's automatic optical sizing for Source
Serif 4. Slides, whose size follows the viewport, use the browser's automatic
optical sizing for Inter and their own letter-spacing.
