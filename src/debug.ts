/** Global debug flag, controlled by Tolinku.init({ debug: true }) */
let _debugEnabled = false;

export function setDebugEnabled(enabled: boolean): void {
  _debugEnabled = enabled;
}

export function isDebugEnabled(): boolean {
  return _debugEnabled;
}

/** Log a message to the console if debug mode is enabled. */
export function debugLog(message: string): void {
  if (_debugEnabled) {
    console.log(`[TolinkuSDK] ${message}`);
  }
}

/** Log a warning to the console if debug mode is enabled. */
export function debugWarn(message: string): void {
  if (_debugEnabled) {
    console.warn(`[TolinkuSDK] ${message}`);
  }
}
