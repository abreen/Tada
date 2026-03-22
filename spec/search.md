# Search

When the search feature is enabled, a client-side search index is built after
each site build using Pagefind.

## Indexing

Only pages reachable from the home page are indexed. Reachability is determined
by a breadth-first traversal of internal links starting from `index.html`.
If a page is not reachable from `index.html`, it is not included in search
results.

PDF files linked from reachable pages are also indexed. Text is extracted from
each PDF page individually, producing per-page search records. If text extraction
is unavailable, a fallback record with just the filename is created.

The search index is written to a `pagefind/` subdirectory of the output. It is
excluded from production build manifests
(see [Production Builds](production-builds.md)).

## Client-side search

A search combobox in the site header queries the Pagefind index. Results show
excerpts and support keyboard navigation. PDF results are grouped by document,
with individual page numbers shown as sub-results sorted by page number.
