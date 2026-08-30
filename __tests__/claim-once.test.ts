jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 34 },
  NativeModules: {},
  Dimensions: { get: () => ({ width: 412, height: 915 }) },
  PixelRatio: { get: () => 2.625 },
}));

const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => store[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => { store[k] = v; }),
    removeItem: jest.fn(async (k: string) => { delete store[k]; }),
  },
}));

import { Deferred } from '../src/deferred';

/**
 * A deferred claim is a first-launch action. Nothing stops an app calling it on
 * every launch, and each repeat costs a request and records a miss, so an
 * otherwise healthy integration would report a match rate near zero.
 */
describe('claimDeferredLink runs once per install', () => {
  const makeClient = (result: unknown) => ({
    getPublic: jest.fn(async () => result),
    postPublic: jest.fn(async () => result),
  }) as any;

  beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; });

  it('claims on the first call', async () => {
    const client = makeClient({ deep_link_path: '/topup', appspace_id: 'a1' });
    const link = await new Deferred(client).claimDeferredLink({ appspaceId: 'a1' });
    expect(link).toEqual({ deep_link_path: '/topup', appspace_id: 'a1' });
    expect(client.postPublic).toHaveBeenCalledTimes(1);
  });

  it('makes no request on a second call', async () => {
    const first = makeClient({ deep_link_path: '/topup', appspace_id: 'a1' });
    await new Deferred(first).claimDeferredLink({ appspaceId: 'a1' });

    const second = makeClient({ deep_link_path: '/other', appspace_id: 'a1' });
    const link = await new Deferred(second).claimDeferredLink({ appspaceId: 'a1' });
    expect(link).toBeNull();
    expect(second.postPublic).not.toHaveBeenCalled();
  });

  it('retries after a dropped request rather than spending the one attempt', async () => {
    // A transport error is not an answer: the server never said "nothing here".
    const failing = { postPublic: jest.fn(async () => { throw new Error('offline'); }) } as any;
    expect(await new Deferred(failing).claimDeferredLink({ appspaceId: 'a1' })).toBeNull();

    const recovered = makeClient({ deep_link_path: '/topup', appspace_id: 'a1' });
    const link = await new Deferred(recovered).claimDeferredLink({ appspaceId: 'a1' });
    expect(link).toEqual({ deep_link_path: '/topup', appspace_id: 'a1' });
  });

  it('remembers a 404, which is a real answer', async () => {
    const notFound = {
      postPublic: jest.fn(async () => { throw Object.assign(new Error('nf'), { statusCode: 404 }); }),
    } as any;
    expect(await new Deferred(notFound).claimDeferredLink({ appspaceId: 'a1' })).toBeNull();

    const after = makeClient({ deep_link_path: '/x', appspace_id: 'a1' });
    await new Deferred(after).claimDeferredLink({ appspaceId: 'a1' });
    expect(after.postPublic).not.toHaveBeenCalled();
  });

  it('force bypasses the guard', async () => {
    const first = makeClient({ deep_link_path: '/a', appspace_id: 'a1' });
    await new Deferred(first).claimDeferredLink({ appspaceId: 'a1' });

    const forced = makeClient({ deep_link_path: '/b', appspace_id: 'a1' });
    const link = await new Deferred(forced).claimDeferredLink({ appspaceId: 'a1', force: true });
    expect(link).toEqual({ deep_link_path: '/b', appspace_id: 'a1' });
  });
});
