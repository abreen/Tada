# Traces

Traces are interactive step-by-step visualizations of program execution. The
trace data model is language-agnostic. Tada currently supports trace backends
for `.java` and `.py` source files.

A trace is embedded in a page using the `renderTrace` template function:

```
<%= renderTrace('MyProgram.java') %>
<%= renderTrace('my_program.py') %>
<%= renderTrace('Demo.java', ['../../lectures/bag/ArrayBag.java']) %>
```

The first argument is the primary source file, resolved relative to the page.
The optional second argument is an explicit array of companion source files,
also resolved relative to the page. Companions are non-transitive: every source
file that should be traced must be listed.

## Build processing

At build time, `renderTrace` picks a backend by file extension and executes the
target program to produce a JSONL trace (one JSON object per execution step).
The primary file and companions must all use the same supported extension. Tada
copies them into a temporary flat workspace using only their basenames, then
runs the trace from that workspace. Because the workspace is flat, duplicate
basenames in one trace are rejected. Java traces compile all workspace `.java`
files together and run the primary class. Python traces run the primary script
from the workspace so imports such as `import helper` and
`from helper import value` can resolve explicit companion modules.

The output is split into chunk files of 50 steps each, plus a `manifest.json`
with metadata and one source entry per traced file. Tada hashes the serialized
generated manifest and chunk JSON, then writes the files to
`dist/_traces/{Name}/sha256-{hash}/`. The rendered widget points at the
hashed `manifest.json` path, so browsers fetch fresh trace data when a rebuild
produces different trace artifacts. Results are cached for the full primary and
companion file set and are invalidated when any traced source changes.

The manifest shape is `{ totalSteps, chunkSize, primaryFile, sources }`, where
each source entry is `{ file, source, lineToSteps }`. Chunk entries are
`{ file, line, output, svg }`, so each execution step names the source file that
owns the active line.

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
trace has output to show. The output panel preserves stdout and stderr in the
order captured by the tracer. Stdout uses the normal output text color; stderr
is rendered in red. Traced program stderr is part of the trace data and is not
printed among Tada's build logs. A toolbar with step buttons and a counter lets
the user navigate through execution steps. Chunks are fetched on demand as the
user steps forward. Trace controls render disabled and are enabled by the
client-side component after the trace data is ready.

If a Java or Python program terminates because of an uncaught exception, the
trace still builds successfully. The tracer emits a final step on the throwing
source line that includes the exception output on stderr, so examples can show
the program crashing.

The source panel highlights the current line. Multi-file traces render one
highlighted source panel per traced file; as the user navigates, the widget
shows the panel matching the current step's `file` and hides the others. The
memory diagram is rendered as SVG and depicts stack frames with local variables,
heap objects (arrays, objects, strings), and reference arrows between them. The
For Java compact source files, the tracer does not render the implicit `this`
local when the implicitly declared class has no instance fields. If the compact
source file declares instance fields, `this` remains visible so those fields can
be inspected.

The diagram reads colors from CSS custom properties and re-renders on color
scheme changes.

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
