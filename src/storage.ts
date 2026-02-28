import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_KEY = 'tolinku_message_dismissed';
const IMPRESSIONS_BASE_KEY = 'tolinku_message_impressions';
const LAST_SHOWN_BASE_KEY = 'tolinku_message_last_shown';

/** Current namespace prefix, set when the SDK is initialized. */
let keyPrefix = BASE_KEY;
let impressionsKeyPrefix = IMPRESSIONS_BASE_KEY;
let lastShownKeyPrefix = LAST_SHOWN_BASE_KEY;

/**
 * Set the storage namespace based on the API key.
 * This prevents collisions when the same app uses multiple Appspaces.
 * Uses a simple hash of the API key to keep storage keys short.
 */
export function setStorageNamespace(apiKey: string): void {
  const hash = simpleHash(apiKey);
  keyPrefix = `tolinku_${hash}_message_dismissed`;
  impressionsKeyPrefix = `tolinku_${hash}_message_impressions`;
  lastShownKeyPrefix = `tolinku_${hash}_message_last_shown`;
}

/** Reset to the default (un-namespaced) key. Used during destroy(). */
export function resetStorageNamespace(): void {
  keyPrefix = BASE_KEY;
  impressionsKeyPrefix = IMPRESSIONS_BASE_KEY;
  lastShownKeyPrefix = LAST_SHOWN_BASE_KEY;
}

async function getStore(key: string): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function setStore(key: string, data: Record<string, string>): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Storage unavailable
  }
}

export async function isMessageDismissed(messageId: string, dismissDays: number | null): Promise<boolean> {
  if (!dismissDays || dismissDays <= 0) return false;
  const data = await getStore(keyPrefix);
  const entry = data[messageId];
  if (!entry) return false;
  const dismissedAt = new Date(entry).getTime();
  return (Date.now() - dismissedAt) < (dismissDays * 86400000);
}

export async function saveMessageDismissal(messageId: string): Promise<void> {
  const data = await getStore(keyPrefix);
  data[messageId] = new Date().toISOString();
  await setStore(keyPrefix, data);
}

/**
 * Check if a message should be suppressed based on max_impressions
 * or min_interval_hours. Returns true if the message should NOT be shown.
 */
export async function isMessageSuppressed(
  messageId: string,
  maxImpressions: number | null,
  minIntervalHours: number | null,
): Promise<boolean> {
  // Check max impressions
  if (maxImpressions !== null && maxImpressions > 0) {
    const impressions = await getStore(impressionsKeyPrefix);
    const count = parseInt(impressions[messageId] || '0', 10);
    if (count >= maxImpressions) return true;
  }

  // Check min interval
  if (minIntervalHours !== null && minIntervalHours > 0) {
    const lastShown = await getStore(lastShownKeyPrefix);
    const entry = lastShown[messageId];
    if (entry) {
      const lastShownAt = new Date(entry).getTime();
      const intervalMs = minIntervalHours * 3600000;
      if ((Date.now() - lastShownAt) < intervalMs) return true;
    }
  }

  return false;
}

/** Record that a message was shown (increment impression count and update last-shown time). */
export async function recordMessageImpression(messageId: string): Promise<void> {
  // Increment impression count
  const impressions = await getStore(impressionsKeyPrefix);
  const count = parseInt(impressions[messageId] || '0', 10);
  impressions[messageId] = String(count + 1);
  await setStore(impressionsKeyPrefix, impressions);

  // Update last-shown timestamp
  const lastShown = await getStore(lastShownKeyPrefix);
  lastShown[messageId] = new Date().toISOString();
  await setStore(lastShownKeyPrefix, lastShown);
}

/**
 * Simple string hash (djb2 algorithm). Returns a short hex string.
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(16);
}
