# Traces

Traces are interactive step-by-step visualizations of program execution. The
trace data model is language-agnostic. Tada currently supports trace backends
for `.java` and `.py` source files.

A trace is embedded in a page using the `renderTrace` template function:

```
<%= renderTrace('MyProgram.java') %>
<%= renderTrace('my_program.py') %>
```

The argument is a path to a source file resolved relative to the page.

## Build processing

At build time, `renderTrace` picks a backend by file extension and executes the
target program to produce a JSONL trace (one JSON object per execution step).
The output is split into chunk files of 50 steps each, plus a `manifest.json`
with metadata and a line-to-step index. These files are written to
`dist/_traces/{Name}/`. Results are cached per source file path.

If the runtime needed for a trace backend is not available, `renderTrace` logs a
warning and emits a disabled widget for that source file. Java traces require
`javac`; Python traces require Python. On Windows, Tada first tries `python`,
then `python3`, then the same commands through PowerShell. The disabled
widget shows the syntax-highlighted source code but has all navigation buttons
disabled and no manifest URL. The client-side component also handles missing
trace data gracefully: if fetching the manifest fails (network error or non-OK
response), the widget stays in its initial state without crashing.

## Widget

The rendered widget uses a vertical layout: the memory diagram on top, the
syntax-highlighted source below it, and program output at the bottom when the
trace has output to show. A toolbar with step buttons and a counter lets the
user navigate through execution steps. Chunks are fetched on demand as the user
steps forward. Trace controls render disabled and are enabled by the
client-side component after the trace data is ready.

The source panel highlights the current line. The memory diagram is rendered as
SVG and depicts stack frames with local variables, heap objects (arrays, objects,
strings), and reference arrows between them. The diagram reads colors from CSS
custom properties and re-renders on color scheme changes.

## Slides Mode

When a trace widget appears on a page that uses [Slides Mode](slides.md),
presentation navigation is trace-aware. `ArrowRight`, `ArrowLeft`, `Space`, and
the single-click advance gesture first try to move the trace widget before
changing slides.

While presenting, the trace toolbar is hidden and restored when presentation
ends. If no trace on the active slide can move in the requested direction,
Slides Mode advances to the next or previous slide as usual. Each time Slides
Mode starts, ready trace widgets are reset to their first step. The trace SVG
diagram scales uniformly to match the resolved Slides Mode font scale and
returns to its normal size when Slides Mode ends.
