# Proofreading

`tada watch` can check spelling and grammar in each page's main content and
draw a wavy underline under the problems it finds. Proofreading is off by
default; the development site config turns it on.

Only `tada watch` proofreads. `tada dev` and `tada prod` never load the checker,
and their output is the same whether or not proofreading is configured.

## Configuration

Add a `proofread` object to `site.dev.*`:

```yaml
proofread:
  words:
    - Tada
    - KaTeX
```

- **words**: optional list of words the spelling check accepts

`proofread: {}` turns proofreading on with no extra words. `proofread` is
only allowed in the development site config; a `site.prod.*` file that sets it
fails to load.

## Checker

Tada uses [Harper](https://writewithharper.com) (`harper.js`), which runs
locally in WebAssembly with American English rules. Harper loads the first time
watch mode proofreads, which adds a few seconds to the first build; later
rebuilds check only the pages they re-render.

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
spans with `text-decoration: underline` and `text-decoration-style: wavy`, red
for spelling and green for grammar. The underlines are in the built HTML, so
they show without JavaScript. Page text, links, and search results are
otherwise unchanged.
