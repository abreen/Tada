# Search

When the search feature is enabled, a client-side search index is built after
each site build using Pagefind.

## Indexing

Only pages reachable from the home page are indexed. Reachability is determined
by a breadth-first traversal of internal `<a href>` links in generated HTML
pages, starting from `index.html`.
If a page is not reachable from `index.html`, it is not included in search
results.

PDF files in `content/` that are linked from reachable pages are also indexed.
Linked files copied from `public/` are not added to the search index. Text is
extracted from each indexed PDF page individually using `mutool`, producing
per-page search records. If `mutool` is not installed, PDFs are not indexed (a
warning is logged). If a PDF yields no extractable text, a fallback record
with just the filename is created.

The search index is written to a `pagefind/` subdirectory of the output. It is
excluded from production build manifests
(see [Production Builds](production-builds.md)).

## Client-side search

A search combobox in the site header queries the Pagefind index. Results show
excerpts and support keyboard navigation. PDF results are grouped by document,
with individual page numbers shown as sub-results sorted by page number.
The combobox is rendered disabled and is enabled only after its client
component has attached the search and keyboard-shortcut listeners. Without
JavaScript it remains disabled.
The complete search control, including its icon, is hidden at viewport widths
of 400px or less; above that breakpoint it remains right-aligned within the
header. When it is hidden or search is disabled, the site title reclaims the
unused header space.
All matching top-level results and nested sub-results are rendered; the result
count reflects the number of grouped top-level results.
If the user opens or types into the combobox before Pagefind finishes loading,
the results panel shows a loading state and reruns the current query once the
index is ready.

When motion is enabled, the results panel fades, moves a short distance, and
subtly scales as it appears and disappears. Its `aria-hidden`, `inert`, and
pointer-interaction states still change immediately; visitors who request
reduced motion get the same immediate visual state change. When a search result
starts page navigation, the panel closes immediately so its exit motion does
not overlap the page View Transition.

After a page-update refresh completes, the client discards any loaded Pagefind
instance and reloads it so later searches use the refreshed index.
