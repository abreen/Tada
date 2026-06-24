# Java Prose MDX Regressions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct literate Java math parsing, Java prose expression rendering, and relative Java prose partial resolution.

**Architecture:** Parse only a protected copy during literate-code extraction, keep raw Java source for MDX prose rendering, and pass the source path plus dependency collector through the existing renderer boundary. Downloadable source substitution remains unchanged.

**Tech Stack:** TypeScript, Bun, MDX 3, Bun test

---

### Task 1: Literate Java Math Extraction

**Files:**
- Modify: `build/utils/mdx.ts`
- Modify: `build/utils/literate-java.ts`
- Test: `build/utils/literate-java.test.ts`

- [ ] **Step 1: Add a failing regression test**

Add a literate Java document containing `$\\text{hello world}$` before a Java
fence and assert that `parseLiterateJava` extracts the Java source without an
MDX/acorn error.

- [ ] **Step 2: Verify the regression test fails**

Run: `bun run test:unit build/utils/literate-java.test.ts`

Expected: FAIL because acorn parses the TeX braces as an MDX expression.

- [ ] **Step 3: Protect math during extraction**

Export the existing MDX math-source preprocessor and call it only for the
`createProcessor(...).parse(...)` input in `parseLiterateJava`. Keep the
returned `content` unchanged.

- [ ] **Step 4: Verify the focused test passes**

Run: `bun run test:unit build/utils/literate-java.test.ts`

Expected: PASS.

### Task 2: Raw Java Prose Expressions

**Files:**
- Modify: `build/utils/render.ts`
- Test: `build/code.test.ts`
- Test: `build/utils/render.test.ts`

- [ ] **Step 1: Add a failing regression test**

Render `/// {vars.label}` with `vars.label` set to `*literal*` and assert the
HTML contains the literal asterisks rather than an `<em>` element.

- [ ] **Step 2: Verify the regression test fails**

Run: `bun run test:unit build/code.test.ts build/utils/render.test.ts`

Expected: FAIL because the substituted value is reparsed as Markdown.

- [ ] **Step 3: Render prose from raw source**

Pass `rawSource` to `renderCodeWithComments` in `renderCodePageAsset`. Continue
using `applySourceExpressions` for copied/downloadable Java source.

- [ ] **Step 4: Verify the focused tests pass**

Run: `bun run test:unit build/code.test.ts build/utils/render.test.ts`

Expected: PASS.

### Task 3: Java Prose Partial Context

**Files:**
- Modify: `build/utils/code.ts`
- Modify: `build/utils/render.ts`
- Test: `build/code.test.ts`

- [ ] **Step 1: Add a failing regression test**

Capture the `renderCodeWithComments` call from `renderCodePageAsset` and assert
that it receives the Java source path and the page's dependency collector. The
existing MDX partial tests cover relative reads and dependency registration.

- [ ] **Step 2: Verify the regression test fails**

Run: `bun run test:unit build/code.test.ts`

Expected: FAIL because the renderer currently receives neither source context
nor the dependency collector.

- [ ] **Step 3: Pass source context into MDX**

Extend `renderCodeWithComments` with the Java source path and optional
`RenderDependencyCollector`. Pass them from `renderCodePageAsset`, and forward
them to `renderMdx` as `filePath` and `dependencyCollector`.

- [ ] **Step 4: Verify the focused test passes**

Run: `bun run test:unit build/code.test.ts`

Expected: PASS.

### Task 4: Complete Verification

**Files:**
- Modify if behavior changed: `spec/code-pages.md`

- [ ] **Step 1: Run static and unit verification**

Run: `bun run typecheck && bun run lint && bun run test:unit`

Expected: all commands pass.

- [ ] **Step 2: Run browser and functional verification**

Run: `bun run test:playwright`

Run: `bun run test:functional`

Expected: 45 Playwright tests and the complete functional suite pass.

- [ ] **Step 3: Audit the final diff**

Run: `git diff --check`

Expected: no whitespace errors and no changes implementing the unrelated raw
script or nested-fence review comments.
