/**
 * shared/ is environment-agnostic: it must run unchanged in the browser, in Node and in tests.
 * It is compiled WITHOUT the DOM lib and WITHOUT Node types on purpose. The only global we allow
 * ourselves is a minimal console.
 */
declare const console: {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
