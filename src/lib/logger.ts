// Simple environment-aware logger to reduce noise in production builds
// - debug/info/warn: no-op in production
// - error: always logs

type LogArgs = unknown[];

const isProd = typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'production';
let debugEnabled = !isProd;

function safeConsole(method: 'debug' | 'info' | 'warn' | 'error', args: LogArgs): void {
  // Guard against environments without console
  if (typeof console === 'undefined' || typeof console[method] !== 'function') return;
  (console[method] as (...args: LogArgs) => void)(...args);
}

export const logger = {
  debug: (...args: LogArgs): void => {
    if (debugEnabled) safeConsole('debug', args);
  },
  info: (...args: LogArgs): void => {
    if (debugEnabled) safeConsole('info', args);
  },
  warn: (...args: LogArgs): void => {
    if (debugEnabled) safeConsole('warn', args);
  },
  error: (...args: LogArgs): void => {
    safeConsole('error', args);
  },
  enableDebug: (enabled: boolean): void => {
    debugEnabled = enabled;
  }
};

export default logger;


