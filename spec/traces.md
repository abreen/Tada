# Traces

Traces are interactive step-by-step visualizations of program execution. The
trace data model is language-agnostic; currently only Java is implemented as a
backend.

A trace is embedded in a page using the `renderTrace` template function:

```
<%= renderTrace('MyProgram.java') %>
```

The argument is a path to a source file resolved relative to the page.

## Build processing

At build time, `renderTrace` invokes a language-specific backend to execute the
program and produce a JSONL trace (one JSON object per execution step). The
output is split into chunk files of 50 steps each, plus a `manifest.json` with
metadata and a line-to-step index. These files are written to
`dist/_traces/{Name}/`. Results are cached per source file path.

## Widget

The rendered widget shows the syntax-highlighted source on the left and a memory
diagram on the right (stacked vertically on narrow viewports). A toolbar with
step buttons and a counter lets the user navigate through execution steps. Chunks
are fetched on demand as the user steps forward.

The source panel highlights the current line. The memory diagram is drawn on an
HTML canvas (Konva) and depicts stack frames with local variables, heap objects
(arrays, objects, strings), and reference arrows between them. The diagram reads
colors from CSS custom properties and re-renders on color scheme changes.
