parent: /labs/index.html
parentLabel: Labs
title: Lab 0
author: alex
description: An example lab page for <%= site.title %>.

In this lab, we'll explore the [`VowelCounter` program](./VowelCounter.html).

## Review questions

??? question What is an input stream?

An input stream is abstraction that represents arbitrary data going into a
program. The data in a stream doesn't have a predefined size or length.
When you write a program that uses an input stream, the program may wait for
more data.

???

??? question What is a sentinel? Provide an example.

A sentinel is a special value a program uses to change its behavior.
For example, `System.in.read()` returns -1 when the standard in stream doesn't
have any more characters.

Another example: the character `'q'` might be reserved to indicate a command
like "quit." When a user types <kbd>q</kbd>, the program exits.

???
