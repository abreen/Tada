# Proofreading

`tada watch` checks spelling and grammar in each page's main content and draws
a wavy underline under the problems it finds.

Only `tada watch` proofreads. `tada dev` and `tada prod` never load the checker,
and their output is the same whether or not `proofread` is configured.

## Configuration

Proofreading needs no configuration. To change how it checks, add a
`proofread` object to `site.dev.*`:

```yaml
proofread:
  words:
    - Tada
    - KaTeX
  dialect: british
  rules:
    LongSentences: false
    SpellCheck: true
```

- **words**: optional list of words the spelling check accepts
- **dialect**: optional English dialect to check against: `american` (the
  default), `british`, `australian`, `canadian`, or `indian`
- **rules**: optional map from a Harper rule name to `true` (turn the rule on)
  or `false` (turn it off). Rules not listed keep Harper's defaults. Rule names
  are the keys of Harper's lint config, such as `SpellCheck` and
  `LongSentences`; [Proofreading rules](proofread-rules.md) lists them.
  A name Harper does not have is skipped with a warning, and the other rules
  still apply

To turn proofreading off, set `proofread: false`.

`proofread` is only allowed in the development site config; a `site.prod.*`
file that sets it fails to load.

## Checker

Tada uses [Harper](https://writewithharper.com) (`harper.js`), which runs
locally in WebAssembly with the configured dialect's rules (American English by
default). Harper runs in a worker
thread that watch mode starts when its first build begins, so Harper loads while
scripts compile and pages render, and each page is checked as soon as it
renders. A build writes its output once every page it rendered is checked;
later rebuilds check only the pages they re-render.

If Harper fails to load, its worker stops, or a page cannot be proofread,
watch mode logs a warning and writes the affected pages without underlines. A
failure to check one block of text leaves only that block without underlines.

## What is checked

Tada reads the text inside the page's `<main>` element after the page is
rendered. Each block element, such as a paragraph, list item, table cell, or
heading, is checked on its own. Inline elements such as links and emphasis
continue the sentence around them, and `<br>` counts as whitespace.

Tada does not check text inside:

- `pre`, `script`, `style`, `svg`, `nav`, `button`, `select`, `textarea`,
  `template`, `noscript`, `iframe`, `object`, `canvas`, `audio`, and `video`
- elements with `hidden`, `inert`, `aria-hidden="true"`, or
  `spellcheck="false"`
- elements with `data-pagefind-ignore`, except question answers
- the `Q.` and `A.` labels of [questions](markdown.md)

Inline `code`, `kbd`, `samp`, `tt`, and `var` text and KaTeX math are part of
the sentence for context, but a problem that touches them is not underlined.
KaTeX math contributes only its TeX source.

Problems with whitespace only are not underlined, because browsers collapse
whitespace.

## Output

Each problem is wrapped in a span; one that crosses inline elements gets a span
in each:

- `<span class="proofread-spelling">` for Harper's spelling and typo problems
- `<span class="proofread-grammar">` for every other kind

Every proofread page gets a `<style>` in its `<head>` that underlines these
spans with `text-decoration: underline` and `text-decoration-style: wavy`,
`text-decoration-thickness: 0.1em`, and `text-underline-offset: 4px`, red
for spelling and green for grammar. The colors are the `--proofread-spelling-color`
and `--proofread-grammar-color` custom properties, which have separate light and
dark values (`prefers-color-scheme`) matching the colors of multiple-choice
question results. The underlines are in the built HTML, so
they show without JavaScript. Page text, links, and search results are
otherwise unchanged.

## Messages

Each span carries Harper's message about the problem:

- `title`, the message as plain text, which the browser shows on hover without
  JavaScript; words Harper quotes with backticks are shown in curly quotes
- `data-proofread-message`, the message as HTML, such as words in `<code>`

Every proofread page also gets an inline `<script>` in its `<head>`. When the
pointer moves over a span, the script removes its `title` and shows a
`role="tooltip"` element below the span with the HTML message. The tooltip
has inverted theme colors (`--fg-color` background, `--bg-color` text) and
`--box-shadow`. Harper wraps quoted words in `<code>`; the tooltip shows them in
the tooltip's own font with curly quotes instead of as monospace code. It goes
away when the pointer leaves the span or the page scrolls. The script listens
on `document`, so it keeps working across client-side navigation.
