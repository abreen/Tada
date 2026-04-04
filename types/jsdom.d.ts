import 'jsdom';

declare module 'jsdom' {
  interface DOMWindow {
    Event: typeof Event;
    MouseEvent: typeof MouseEvent;
    KeyboardEvent: typeof KeyboardEvent;
  }
}
