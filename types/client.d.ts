// Types for scripts a Tada site compiles from its src/ directory, published
// as `@abreen/tada`. Import them with `import type`, which is removed at build
// time, so a site builds without installing the package.

/** What Tada passes to a script's default export each time its page is shown */
export interface MountOptions {
  window: Window;
  /** Aborted when the visitor leaves the page, before the cleanup function runs */
  signal: AbortSignal;
}

/** Undoes a mount when the visitor leaves the page */
export type Unmount = () => void;

/**
 * The default export of a script listed in `scripts`. It runs each time the
 * page is shown: on a full page load and after each client-side navigation to
 * the page. Code at the top level of the module runs once per visit.
 */
export type Mount = (
  options: MountOptions,
) => void | Unmount | Promise<void | Unmount>;

/** The detail of the `tada:navigation` event dispatched on `window` */
export interface NavigationEventDetail {
  /** The pathname and query of the page now shown, including the base path */
  path: string;
  validators: { etag: string | null; lastModified: string | null };
}

declare global {
  interface WindowEventMap {
    'tada:navigation': CustomEvent<NavigationEventDetail>;
  }
}
