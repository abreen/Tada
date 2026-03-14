title: A generic `Pair` class
author: alex

<!---
You may hide code from the generated HTML page but still include it in the
final .java file by surrounding a code block with Tada's three-hyphen
HTML comment syntax.

```
import java.util.*;
```
-->

## Definition

A <dfn>pair</dfn> (*a*, *b*) is a sequence (an ordered collection) of two items.
In Java, we can use generic programming to implement a class `Pair` representing
a pair of items where *a* and *b* can be of any type.

If we further restrict the types of the items so that they must implement the
`Comparable` interface, we can then implement `Comparable` in the `Pair` class
by relying on the `compareTo()` methods of the items.

Let's start by defining the `Pair<S, T>` class, introducing two type parameters
`S` and `T`, where `S` must implement `Comparable<S>` and `T` must implement
`Comparable<T>`:

```
public class Pair<
    S extends Comparable<S>,
    T extends Comparable<T>
>
    implements Comparable<Pair<S, T>>
{
```

!!! note

Java does not support syntax like `S implements Comparable<S>` in a generic type
parameter; you must use `extends`, even though `Comparable` is not a class.

!!!


### Immutability

Let's declare two fields for the first and second components of the pair:

```
    public final S first;
    public final T second;
```

Instead of allowing clients to mutate a pair after creation, we've decided
to make both fields `final`. The ability for objects to change state can
sometimes lead to excess complexity, especially in long-running programs.
Immutability can also make debugging easier.

To create a pair, simply specify the first and second components. We will
not allow a component to be `null`.

```
    public Pair(S first, T second) {
        if (first == null || second == null) {
            throw new IllegalArgumentException("components may not be null");
        }

        this.first = first;
        this.second = second;
    }
```

We'll also allow the creation of a new pair by replacing just one of the
components of an existing pair:

```
    public Pair<S, T> first(S newFirst) {
        return new Pair(newFirst, second);
    }

    public Pair<S, T> second(T newSecond) {
        return new Pair(first, newSecond);
    }
```

With the `reversed()` method, we'll allow clients to flip the components
of an existing pair, passing no parameters:

```
    public Pair<T, S> reversed() {
        return new Pair<T, S>(second, first);
    }
```

Then we'll have `toString()` return the standard representation of a pair as
(*a*, *b*).

```
    @Override
    public String toString() {
        return String.format("(%s, %s)", first.toString(), second.toString());
    }
```

To implement `Comparable` for the pair, we'll rely on the `compareTo()` method
of each item in the pair.

- If the first item in the first pair is greater than or less than the first
  item in the second pair, we'll return that comparison result.
- However, if the first items of both pairs are equal, we return the result of
  `compareTo()` on the second items of both pairs.

```
    @Override
    public int compareTo(Pair<S, T> other) {
        int comp1 = first.compareTo(other.first);
        if (comp1 == 0) {
            return second.compareTo(other.second);
        }
        return comp1;
    }
```

We use the `@Override` annotation to inform the Java compiler that we intend
to implement the `compareTo()` method. Since the signature of the method (its
name and parameter list) is unlikely to change, we could have simply omitted it.

Finally, we override `equals()` to delegate to `equals()` on the components.
Since in the constructor we don't allow `null` components, we don't need to
worry about `NullPointerException` here.

```
    @Override
    public boolean equals(Object other) {
        if (!(other instanceof Pair)) {
            return false;
        }
        var o = (Pair<?, ?>)other;
        return first.equals(o.first) && second.equals(o.second);
    }
```

Please note:

-   The `equals()` method takes a parameter of type `Object` because `equals()`
    is defined in the `Object` class; it's not an interface method and is not
    generic.
-   The `@Override` annotation informs the compiler we intend to override the
    inherited version of `equals()` from the `Object` class.
-   The question marks in the type `Pair<?, ?>` are known as
    <dfn>wildcards</dfn> and are used to represent any type.


## Unit tests

To provide some confidence that our `Pair` class works, let's write some tests.

<!---
Code blocks inside of Tada's special containers, like alerts, collapisbles,
sections, etc. are included in the final .java file.
-->

<<< details The `test()` helper method

```
    private static void test(boolean condition) {
        // Get the line number from where this invocation of test() was made
        StackTraceElement[] frames = Thread.currentThread().getStackTrace();
        int lineNumber = frames[2].getLineNumber();

        if (condition) {
            System.out.printf("%d: passed%n", lineNumber);
        } else {
            System.out.printf("%d: FAILED%n", lineNumber);
        }
    }
```

<<<

<!---
When Tada renders a literate code block, it trims leading whitespace common to
all lines in the block. For this reason, and because we don't need to explain
the main() method in this document, we hide the line of code introducing it
from the final HTML page.

```
    public static void main(String[] args) {
```
-->

Let's test the `equals()` and `compareTo()` implementations. We'll create
two objects representing (1, 1) and test if they are considered equal:

```
        {
            var a = new Pair(1, 1);
            var b = new Pair(1, 1);
            test(a.equals(b));
        }
```

Let's make sure `equals()` correctly returns `false` when the components of
two pairs are _not_ the same:

```
        {
            var a = new Pair("foo", "bar");
            var b = new Pair("zap", "pop");
            test(!a.equals(b));
        }
```

Then we'll test the inequalities relating (1, 1) and (2, 2):

```
        {
            var a = new Pair(1, 1);
            var b = new Pair(2, 2);
            test(a.compareTo(a) == 0);
            test(a.compareTo(b) < 0);
            test(b.compareTo(a) > 0);
        }
```

Now we'll test that the second component is used for comparison when the first
component matches:

```
        {
            var a = new Pair(1, 7);
            var b = new Pair(1, 3);
            test(a.compareTo(b) > 0);
            test(b.compareTo(a) < 0);
        }
```

Now let's test `first()` and `second()`, which return a new pair with one
component replaced:

```
        {
            var apple = new Pair(1, "apple");
            var orange = apple.second("orange");

            test(orange.second.equals("orange"));

            // Test that original pair wasn't modified
            test(apple.second.equals("apple"));

            var orange2 = orange.first(2);
            test(orange2.first.equals(2));

            // Test that original pairs weren't modified
            test(orange.first.equals(1));
            test(apple.first.equals(1));
        }
```

Finally, let's test `reversed()`:

```
        {
            var d = new Pair("hello", 42);
            var r = d.reversed();
            test(r.first.equals(42));
            test(r.second.equals("hello"));
        }
```

<!---
As mentioned above, we hide the closing brackets for display purposes. They
are still required to produce valid Java code so they must be present in code
blocks.

```
    }
}
```
-->

