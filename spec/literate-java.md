# Literate Java

Files ending in `.java.md` are treated as literate Java pages when the code
feature is enabled. These are Markdown files that contain embedded Java code
blocks.

The Java code blocks are extracted, concatenated into a compilable source file,
compiled, and (if a `main()` method exists) executed. The output of each code
block is captured and displayed alongside it in the rendered page.

Code blocks can be marked as hidden so they contribute to the compiled source
but do not appear in the rendered output. This is useful for boilerplate like
import statements.

The rendered page interleaves prose, visible code blocks, and execution output.
