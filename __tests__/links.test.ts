import { Links } from '../src/links';
import type { HttpClient } from '../src/client';
import type { ResolvedLink } from '../src/types';

/**
 * Turning a link the operating system handed the app into something routable.
 *
 * The URL an app receives is the one that was tapped, exactly as written. A
 * short link is an opaque code, `/s7k2p9q/4821`, and nothing on the device
 * can say what the code stands for. An app parsing the path itself sees a first
 * segment it has never heard of and does nothing, so the link opens the app and
 * appears to fail with no error and no screen.
 *
 * The question has to go to the link's own host, because that is how the
 * platform knows which Appspace is being asked about.
 */

const answer: ResolvedLink = {
  route: { prefix: 'order/{token}/receipt', name: 'Order Receipt', template: 'none', link_type: 'dynamic' },
  token: '4821',
  deep_link_path: '/order/4821/receipt',
};

function mockClient(impl?: jest.Mock): { client: HttpClient; post: jest.Mock } {
  const post = impl ?? jest.fn().mockResolvedValue(answer);
  return {
    client: { postPublicToOrigin: post } as unknown as HttpClient,
    post,
  };
}

describe('resolving a short link', () => {
  it('asks the link its own host, with just the path', async () => {
    const { client, post } = mockClient();
    const links = new Links(client);

    const result = await links.resolve('https://links.example.com/s7k2p9q/4821');

    expect(post).toHaveBeenCalledWith(
      'https://links.example.com',
      '/v1/api/path',
      { path: '/s7k2p9q/4821' },
    );
    expect(result?.token).toBe('4821');
    expect(result?.deep_link_path).toBe('/order/4821/receipt');
  });

  it('leaves the query string out of the question', async () => {
    // A tapped link usually carries utm parameters, and they say nothing about
    // which route it is.
    const { client, post } = mockClient();
    await new Links(client).resolve('https://links.example.com/s7k2p9q/4821?utm_source=qr');
    expect(post).toHaveBeenCalledWith(expect.anything(), '/v1/api/path', { path: '/s7k2p9q/4821' });
  });
});

describe('what leaves the device', () => {
  it('asks without the API key, since the host is not necessarily ours', async () => {
    // The origin comes from the URL this was handed. An app resolving a link
    // from somewhere it does not control would otherwise post the Appspace's
    // key to a stranger.
    const { client, post } = mockClient();
    await new Links(client).resolve('https://links.example.com/s7k2p9q/4821');

    // postPublicToOrigin is the unauthenticated door; post() is the one that
    // carries the key, and it must not be the one used here.
    expect(post).toHaveBeenCalled();
    expect((client as unknown as Record<string, unknown>).post).toBeUndefined();
  });
});

describe('what it declines to ask about', () => {
  it('says nothing for a custom scheme link', async () => {
    // That one already carries the path the app wants.
    const { client, post } = mockClient();
    expect(await new Links(client).resolve('example://order/4821/receipt')).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('says nothing for something that is not a URL', async () => {
    const { client, post } = mockClient();
    expect(await new Links(client).resolve('/order/4821')).toBeNull();
    expect(await new Links(client).resolve('')).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
});

describe('an answer that is not a path', () => {
  // resolve sends its question to a host taken from the URL it was given, so an
  // app resolving a link from somewhere it does not control is talking to a
  // stranger. Anything but a path is a redirect waiting to happen.
  it.each([
    ['a full URL', 'https://evil.example.com/take-over'],
    ['a protocol relative URL', '//evil.example.com/take-over'],
    ['a bare word', 'order/4821'],
    ['nothing', ''],
  ])('refuses %s', async (_label, deep_link_path) => {
    const { client } = mockClient(jest.fn().mockResolvedValue({ ...answer, deep_link_path }));
    expect(await new Links(client).resolve('https://links.example.com/s7k2p9q/4821')).toBeNull();
  });
});

describe('when the answer does not come', () => {
  it('returns null rather than throwing into a cold start', async () => {
    // This runs while the app is opening. An exception here is the difference
    // between a link that did not route and an app that did not start.
    const { client } = mockClient(jest.fn().mockRejectedValue(new Error('network down')));
    await expect(new Links(client).resolve('https://links.example.com/s7k2p9q/4821')).resolves.toBeNull();
  });

  it('returns null for a link this Appspace does not own', async () => {
    const { client } = mockClient(jest.fn().mockResolvedValue({}));
    expect(await new Links(client).resolve('https://links.example.com/whatever/1')).toBeNull();
  });
});
