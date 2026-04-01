# Literate Java

Files ending in `.java.md` are treated as literate Java pages. These are
Markdown files that contain embedded Java code blocks. The Java code blocks are
extracted and concatenated into a `.java` source file. The `.java` source files
are included in the built site.

If a Java compiler is available, the `.java` files are compiled, and if they
have a `main()` method, they are executed. The output of each code block is
captured and displayed alongside it in the rendered page.

Code blocks can be marked as hidden so they contribute to the compiled source
but do not appear in the rendered output. This is useful for boilerplate like
import statements.

The rendered page interleaves prose, visible code blocks, and execution output.

If the program reads from standard input, provide the input as a `stdin` front
matter field. The string is sent to the program's stdin when it runs. Use YAML
double-quoted strings to include escape sequences like `\n`:

```
stdin: "hello, world!\n"
```
