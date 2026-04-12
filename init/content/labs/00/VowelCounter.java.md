---
parent: /labs/00/index.html
parentLabel: Lab 0
title: Counting vowels
author: alex
description: An example of a literate Java program that takes predefined input.
stdin: "hello, world!\n"
---

A Java program can process input in different ways: it could open a file and
read it; it could open a network connection and wait for data from another
computer on the Internet, or it can read from the standard in.

The <dfn>standard in</dfn> (or `stdin`) is one of three streams available to a
running program. The other two streams are the standard out and standard error.

<figure>
<svg viewBox="0 50 410 90" xmlns="http://www.w3.org/2000/svg" font-size="14" fill="none" style="margin:1rem auto;display:block;max-width:410px">
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 Z" stroke="currentColor" fill="currentColor"></path>
    </marker>
  </defs>
  <!-- Java program box -->
  <rect x="155" y="60" width="100" height="60" stroke-width="2" stroke="currentColor"></rect>
  <text x="205" y="95" text-anchor="middle" fill="currentColor">Program</text>
  <!-- stdin arrow (incoming from left) -->
  <path d="M20 90H143" marker-end="url(#arrow)" stroke="currentColor"></path>
  <text x="80" y="82" text-anchor="middle" fill="currentColor" font-family="var(--mono-font)">stdin</text>
  <!-- stdout arrow (outgoing, upper right) -->
  <path d="M267 75H390" marker-end="url(#arrow)" stroke="currentColor"></path>
  <text x="328" y="67" text-anchor="middle" fill="currentColor" font-family="var(--mono-font)">stdout</text>
  <!-- stderr arrow (outgoing, lower right) -->
  <path d="M267 105H390" marker-end="url(#arrow)" stroke="currentColor"></path>
  <text x="328" y="125" text-anchor="middle" fill="currentColor" font-family="var(--mono-font)">stderr</text>
</svg>
<figcaption>
A running Java program (depicted as a box) with the standard in stream as an
incoming arrow and the standard out & error streams as outgoing arrows.
</figcaption>
</figure>

When a Java program calls `System.out.print()` (or `IO.print()`), the program
sends data to the standard out. When a program uses `System.err.print()`, it
sends data to the standard error, an output stream similar to `System.out`
but reserved for error messages.

`System.in` is an `InputStream` object that allows a program to read characters
from the standard input, one character at a time. Its `read()` method returns an
integer value.

- If the integer is positive, it represents a Unicode character coming through
  the stream.
- If the integer is -1, there is no more input in the stream.

The -1 is known as a <dfn>sentinel</dfn>, or a reserved value known ahead of
time to represent a specific condition. Because all Unicode characters are
positive numbers, -1 cannot be converted to a character, and is instead used
to represent the specific condition of "*no more input in the stream*."

Let's implement a program that uses `System.in.read()` to get all the characters
from the standard in, counting how many characters are vowels. When there are
no more characters in the stream, the program prints the total number of vowels.

<!---
Hiding the first few lines keeps us focused on the program's logic,
and avoids discussion of IOException.
```
public class VowelCounter {
    public static void main(String[] args) throws Exception {
```
-->

We'll start the program with a `numVowels` counter initialized to zero,
the additive identity.

```
        int numVowels = 0;
```

Using an indefinite loop (since we don't know in advance how many characters
we'll get), we call the `read()` method and check if it returned the sentinel:

```
        while (true) {
            int ch = System.in.read();
            if (ch == -1) {
                break;
            }
```

If `read()` returns the sentinel, we stop the loop with `break`. Otherwise,
we test whether `ch` is a vowel:

```
            if ("aeiouAEIOU".indexOf(ch) >= 0) {
                numVowels++;
            }
```

<!---
Hide the closing brace of the `while` loop to avoid indenting the conditional.
```
        }
```
-->

Putting lower case and upper case vowels into a `String` allows us to use the
`indexOf()` method to check if `ch` is one of those characters. If `ch` is
nowhere in the string, `indexOf()` returns -1.

When reading input from a terminal, the loop ends when the user presses
<kbd>Ctrl</kbd>+<kbd>D</kbd> on the keyboard. If we type the input

```text
hello, world!
```

Then the last line of the program, which prints the total count, will output 3:

```
        System.out.println("vowels: " + numVowels);
```

<!---
Hiding the closing braces.
```
    }
}
```
-->
