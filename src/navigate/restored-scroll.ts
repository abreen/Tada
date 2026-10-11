// Whether navigation restored a saved scroll position for the current page,
// as on Back, Forward, and dev refreshes. Components that would scroll to
// content on mount leave a restored position alone.
let restored = false;

export function isScrollRestored(): boolean {
  return restored;
}

export function setScrollRestored(value: boolean): void {
  restored = value;
}
