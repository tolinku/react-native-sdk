const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => store[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => { store[k] = v; }),
    removeItem: jest.fn(async (k: string) => { delete store[k]; }),
  },
}));

import { matchesTriggerValue, messageQuery } from '../src/messages/query';
import { isMessageDismissed, saveMessageDismissal } from '../src/storage';

describe('messageQuery', () => {
  it('sends trigger_value when one is given', () => {
    expect(messageQuery('event', 'purchase', 'u1')).toEqual({ trigger: 'event', trigger_value: 'purchase', user_id: 'u1' });
  });

  it('sends no trigger_value without one', () => {
    expect(messageQuery('event')).toEqual({ trigger: 'event' });
    expect(messageQuery()).toEqual({});
  });
});

describe('matchesTriggerValue', () => {
  // An older server ignores trigger_value and returns every message of the
  // trigger, so the provider narrows them itself, the way the server does.
  const returned = [
    { id: 'purchase', trigger_value: 'purchase' },
    { id: 'signup', trigger_value: 'signup' },
    { id: 'any', trigger_value: null },
    { id: 'empty', trigger_value: '' },
  ];

  it('keeps the named messages and the ones that name none', () => {
    expect(returned.filter(m => matchesTriggerValue(m, 'purchase')).map(m => m.id)).toEqual(['purchase', 'any', 'empty']);
  });

  it('keeps everything when no name is asked for', () => {
    expect(returned.filter(m => matchesTriggerValue(m)).map(m => m.id)).toEqual(['purchase', 'signup', 'any', 'empty']);
  });
});

describe('close memory', () => {
  it('does not remember a close without dismiss_days, and does with a number', async () => {
    await saveMessageDismissal('m1');
    expect(await isMessageDismissed('m1', null)).toBe(false);
    expect(await isMessageDismissed('m1', 0)).toBe(false);
    expect(await isMessageDismissed('m1', 3)).toBe(true);
  });
});
