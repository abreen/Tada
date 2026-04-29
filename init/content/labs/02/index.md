---
parent: ../index.html
parentLabel: Labs
title: Lab 2
author: alex
description: A page demonstrating slides mode.
slides: true
---

## Selection sort

Selection sort is a well-known comparison-based sorting algorithm.

- Divides the array into a sorted left part and an unsorted right part
- Repeatedly scans left-to-right, looking for the smallest element
- Swaps the smallest in the right part into correct position in the left part

---

<%= renderTrace('selection_sort.py') %>

---

## Impressions

Selection sort's strength is its simplicity.

- `index_smallest()` always scans from `start` to the end
- It requires no additional memory (other than local variables)

However, it has no `break` statements and therefore can't return early if
the array is already sorted.

---

## Performance

- The outer loop always performs $n - 1$ iterations
- There are always $n - 1$ swaps
- At each value of `i`, `index_smallest()` iterates from `i + 1` to the end

---

## Comparisons

The innermost statement compares `nums[i]` and `nums[curr]`.

- when `i` is 0, the comparison is executed $n - 1$ times
- when `i` is 1, the comparison is executed $n - 2$ times
- $\dots$
- when `i` is $n - 3$, the comparison is executed two times
- when `i` is $n - 2$, the comparison is executed one time

Therefore the total number of comparisons is

$$
(n-1) + (n-2) + \dots + 1 = \sum_{i=1}^{n-1}i
$$

---

## Review

??? question The outer loop of selection sort runs
- [ ] $n$ times
- [x] $n - 1$ times
- [ ] $n^2$ times
- [ ] $n - 2$ times
???

??? question What is selection sort's best case?
- [ ] An already sorted array
- [ ] A reverse-sorted array
- [ ] An array filled with the same element
- [x] Its best, worst, and average cases are all the same
???
