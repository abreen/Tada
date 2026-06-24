# Slides Mode

Create a deck declaratively in any Markdown content extension:

```mdx
<Slides>
  <Slide>

## First slide

Markdown content.

  </Slide>
  <Slide>

## Second slide

More content.

  </Slide>
</Slides>
```

`Slides` requires one or more direct `Slide` children. It emits the static
`data-slides-root` and indexed slide wrappers and marks the page so the normal
template renders disabled `Present` and `Full screen` controls. The browser
component enables those controls when JavaScript mounts; without JavaScript,
the slides remain readable in document flow.

The Tada 1 `slides: true` front matter field and thematic-break segmentation
are removed. Using that field fails with a migration message.

Presentation navigation, trace interaction, answer reveal, fullscreen,
annotations, and the `tada:slides-present` event retain their existing browser
behavior.
