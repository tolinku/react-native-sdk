import { Links } from '../src/links';
import type { HttpClient } from '../src/client';
import type { ResolvedLink } from '../src/types';

/**
 * Turning a link the operating system handed the app into something routable.
 *
 * The URL an app receives is the one that was tapped, exactly as written. A
 * short link is an opaque code, `/imbwmum/1007100`, and nothing on the device
 * can say what the code stands for. An app parsing the path itself sees a first
 * segment it has never heard of and does nothing, so the link opens the app and
 * appears to fail with no error and no screen.
 *
 * The question has to go to the link's own host, because that is how the
 * platform knows which Appspace is being asked about.
 */

const answer: ResolvedLink = {
  route: { prefix: 'order/{token}/receipt', name: 'Order Receipt', template: 'none', link_type: 'dynamic' },
  token: '1007100',
  deep_link_path: '/order/1007100/receipt',
  appspace: { name: 'Tasonic', slug: 'tasonic' },
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

    const result = await links.resolve('https://links.tasonic.com/imbwmum/1007100');

    expect(post).toHaveBeenCalledWith(
      'https://links.tasonic.com',
      '/v1/api/path',
      { path: '/imbwmum/1007100' },
    );
    expect(result?.token).toBe('1007100');
    expect(result?.deep_link_path).toBe('/order/1007100/receipt');
  });

  it('leaves the query string out of the question', async () => {
    // A tapped link usually carries utm parameters, and they say nothing about
    // which route it is.
    const { client, post } = mockClient();
    await new Links(client).resolve('https://links.tasonic.com/imbwmum/1007100?utm_source=qr');
    expect(post).toHaveBeenCalledWith(expect.anything(), '/v1/api/path', { path: '/imbwmum/1007100' });
  });
});

describe('what it declines to ask about', () => {
  it('says nothing for a custom scheme link', async () => {
    // That one already carries the path the app wants.
    const { client, post } = mockClient();
    expect(await new Links(client).resolve('tasonic://order/1007100/receipt')).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('says nothing for something that is not a URL', async () => {
    const { client, post } = mockClient();
    expect(await new Links(client).resolve('/order/1007100')).toBeNull();
    expect(await new Links(client).resolve('')).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
});

describe('when the answer does not come', () => {
  it('returns null rather than throwing into a cold start', async () => {
    // This runs while the app is opening. An exception here is the difference
    // between a link that did not route and an app that did not start.
    const { client } = mockClient(jest.fn().mockRejectedValue(new Error('network down')));
    await expect(new Links(client).resolve('https://links.tasonic.com/imbwmum/1007100')).resolves.toBeNull();
  });

  it('returns null for a link this Appspace does not own', async () => {
    const { client } = mockClient(jest.fn().mockResolvedValue({}));
    expect(await new Links(client).resolve('https://links.example.com/whatever/1')).toBeNull();
  });
});
