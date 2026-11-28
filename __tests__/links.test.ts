import { Links, normaliseLink } from '../src/links';
import { HttpClient } from '../src/client';
import type { ResolvedLink } from '../src/types';

/**
 * Turning a link the operating system handed the app into something routable.
 *
 * The URL an app receives is the one that was tapped, exactly as written. A
 * short link is an opaque code, `/s7k2p9q/4821`, and nothing on the device
 * can say what the code stands for. The question goes to the link's own host,
 * because that is how the platform knows which Appspace is being asked about.
 * A link in an email arrives wrapped in the email platform's click tracking
 * domain, so when that host is not Tolinku's the configured API is asked
 * instead. Each question is asked once: asking a click tracking host again
 * would count the email click twice.
 *
 * These run the real HttpClient against a mocked fetch, so what is counted is
 * what would go over the wire.
 */

const answer: ResolvedLink = {
  route: { prefix: 'order/{token}/receipt', name: 'Order Receipt', template: 'none', link_type: 'dynamic' },
  token: '4821',
  deep_link_path: '/order/4821/receipt',
};

const KEY = 'tolk_pub_test_key';

type Reply = { status: number; body: string; tolinku?: boolean } | Error;

function json(status: number, body: unknown, tolinku = false): Reply {
  return { status, body: JSON.stringify(body), tolinku };
}

const ok = json(200, answer);
const tolinkuNotFound = json(404, { error: 'Route not found' });
const tolinkuNotFoundWithWebUrl = json(404, { error: 'Route not found', web_url: 'https://example.com/fallback' });
const htmlNotFound: Reply = { status: 404, body: '<html><body>Not Found</body></html>' };

const realFetch = global.fetch;
let fetchMock: jest.Mock;

/** Each call to fetch takes the next reply in line. */
function replies(...queue: Reply[]): jest.Mock {
  fetchMock = jest.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error('unexpected request');
    if (next instanceof Error) throw next;
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      statusText: '',
      headers: { get: (name: string) => (next.tolinku && name.toLowerCase() === 'x-tolinku' ? '1' : null) },
      text: async () => next.body,
      json: async () => JSON.parse(next.body),
    };
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function makeLinks(opts: { apiKey?: string; baseUrl?: string } = {}): Links {
  const client = new HttpClient({
    apiKey: opts.apiKey ?? KEY,
    baseUrl: opts.baseUrl ?? 'https://api.tolinku.com',
    debug: false,
    timeout: 30000,
  });
  return new Links(client);
}

function call(n: number): { url: string; init: RequestInit & { headers: Record<string, string> }; body: unknown } {
  const [url, init] = fetchMock.mock.calls[n];
  return { url, init, body: JSON.parse(init.body) };
}

afterEach(() => {
  global.fetch = realFetch;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('resolving a short link', () => {
  it('asks the link its own host, with the path and the whole link, and no key', async () => {
    replies(ok);
    const result = await makeLinks().resolve('https://links.example.com/s7k2p9q/4821?utm_source=qr');

    expect(result).toEqual(answer);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, body } = call(0);
    expect(url).toBe('https://links.example.com/v1/api/path');
    expect(init.method).toBe('POST');
    expect(init.headers['X-API-Key']).toBeUndefined();
    expect(body).toEqual({
      path: '/s7k2p9q/4821',
      url: 'https://links.example.com/s7k2p9q/4821?utm_source=qr',
    });
  });
});

describe('the link, normalised once', () => {
  it.each([
    ['http upgraded to https', 'http://links.example.com/a', 'https://links.example.com', '/a', 'https://links.example.com/a'],
    ['scheme and host lowercased', 'HTTPS://Links.Example.COM/Order/A', 'https://links.example.com', '/Order/A', 'https://links.example.com/Order/A'],
    ['fragment dropped', 'https://links.example.com/a?b=1#top', 'https://links.example.com', '/a', 'https://links.example.com/a?b=1'],
    ['whitespace trimmed', '  https://links.example.com/a \n', 'https://links.example.com', '/a', 'https://links.example.com/a'],
    ['default https port dropped', 'https://links.example.com:443/a', 'https://links.example.com', '/a', 'https://links.example.com/a'],
    ['default http port dropped', 'http://links.example.com:80/a', 'https://links.example.com', '/a', 'https://links.example.com/a'],
    ['other port kept', 'http://links.example.com:8443/a', 'https://links.example.com:8443', '/a', 'https://links.example.com:8443/a'],
    ['empty path is the root', 'https://links.example.com?x=1', 'https://links.example.com', '/', 'https://links.example.com/?x=1'],
    ['path and query encoding unchanged', 'https://links.example.com/a%2Fb/%E2%9C%93?q=a%20b&r=%2B', 'https://links.example.com', '/a%2Fb/%E2%9C%93', 'https://links.example.com/a%2Fb/%E2%9C%93?q=a%20b&r=%2B'],
  ])('%s', async (_label, input, origin, path, whole) => {
    expect(normaliseLink(input)).toMatchObject({ origin, path, whole });

    replies(ok);
    await makeLinks().resolve(input);
    expect(call(0).url).toBe(`${origin}/v1/api/path`);
    expect(call(0).body).toEqual({ path, url: whole });
  });

  it('sends the API the same normalised link', async () => {
    replies(new Error('network down'), ok);
    await makeLinks().resolve(' HTTP://Url1234.Email.Brand.com:80/uni/ls/click?upn=XYZ#frag ');
    expect(call(0).body).toEqual({
      path: '/uni/ls/click',
      url: 'https://url1234.email.brand.com/uni/ls/click?upn=XYZ',
    });
    expect(call(1).body).toEqual({ url: 'https://url1234.email.brand.com/uni/ls/click?upn=XYZ' });
  });
});

describe('what it declines to ask about', () => {
  it.each([
    ['a custom scheme link', 'example://order/4821/receipt'],
    ['a path', '/order/4821'],
    ['an empty string', ''],
    ['ftp', 'ftp://links.example.com/a'],
  ])('says nothing for %s, before any request', async (_label, input) => {
    replies();
    expect(await makeLinks().resolve(input)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Tolinku's own answer from the link host", () => {
  it.each([
    ['a 404 with error', json(404, { error: 'Route not found' }, true)],
    ['a 404 with error and web_url', json(404, { error: 'Route not found', web_url: 'https://example.com/fallback' }, true)],
    ['a 500 with error', json(500, { error: 'Internal error' }, true)],
    ['a 200 with error', json(200, { error: 'Odd' }, true)],
    ['a marked reply without an error field', json(404, { message: 'no' }, true)],
  ])('is final on %s when marked X-Tolinku: null, and no fallback', async (_label, reply) => {
    replies(reply, ok);
    expect(await makeLinks().resolve('https://url1234.email.brand.com/uni/ls/click?upn=XYZ')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a 404 with error', tolinkuNotFound],
    ['a 404 with error and web_url', tolinkuNotFoundWithWebUrl],
    ['a 500 with error', json(500, { error: 'Internal error' })],
  ])('from a server without the header, is final on %s only on Tolinku\'s own domain', async (_label, reply) => {
    replies(reply, ok);
    expect(await makeLinks().resolve('https://links.tolinku.com/s7k2p9q/4821')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('an email platform\'s JSON error without the header does not stop the unwrap', async () => {
    replies(json(404, { error: 'Link not found' }), ok);
    expect(await makeLinks().resolve('https://url1234.email.brand.com/uni/ls/click?upn=XYZ')).toEqual(answer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('a link host that is not Tolinku', () => {
  const wrapped = 'https://url1234.email.brand.com/uni/ls/click?upn=XYZ';

  it.each([
    ['a non-JSON 404', htmlNotFound],
    ['a network error', new Error('network down')],
    ['JSON without error', json(404, { message: 'nope' })],
    ['a 200 that is not JSON', { status: 200, body: 'OK' } as Reply],
    ['a 500 that is not JSON', { status: 502, body: 'Bad Gateway' } as Reply],
  ])('falls back to the API on %s, with the key', async (_label, reply) => {
    replies(reply, ok);
    expect(await makeLinks().resolve(wrapped)).toEqual(answer);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const { url, init, body } = call(1);
    expect(url).toBe('https://api.tolinku.com/v1/api/links/resolve');
    expect(init.method).toBe('POST');
    expect(init.headers['X-API-Key']).toBe(KEY);
    expect(body).toEqual({ url: wrapped });
  });

  it('returns null when the API does not know the link either', async () => {
    replies(htmlNotFound, json(404, { error: 'No matching link' }));
    expect(await makeLinks().resolve(wrapped)).toBeNull();
  });

  it('returns null when the API cannot be reached', async () => {
    replies(htmlNotFound, new Error('network down'));
    await expect(makeLinks().resolve(wrapped)).resolves.toBeNull();
  });

  it('does not ask the API without a key', async () => {
    replies(htmlNotFound, ok);
    expect(await makeLinks({ apiKey: '' }).resolve(wrapped)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the same host', 'https://api.tolinku.com/s7k2p9q/4821'],
    ['different case', 'https://API.Tolinku.COM/s7k2p9q/4821'],
    ['a port on the link', 'https://api.tolinku.com:8443/s7k2p9q/4821'],
    ['http', 'http://api.tolinku.com/s7k2p9q/4821'],
  ])('does not ask the API about its own host: %s', async (_label, link) => {
    replies(htmlNotFound, ok);
    expect(await makeLinks().resolve(link)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores the port and case of the configured API too', async () => {
    replies(htmlNotFound, ok);
    expect(await makeLinks({ baseUrl: 'https://API.tolinku.com:8443/' }).resolve('https://api.tolinku.com/a')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('one attempt each', () => {
  const wrapped = 'https://url1234.email.brand.com/uni/ls/click?upn=XYZ';

  it('does not retry the link host on a 5xx or the API on a 5xx', async () => {
    replies(
      { status: 503, body: 'Service Unavailable' },
      json(503, { error: 'busy' }),
      ok, ok, ok, ok,
    );
    expect(await makeLinks().resolve(wrapped)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry either on a network error', async () => {
    replies(new Error('down'), new Error('down'), ok, ok, ok, ok);
    expect(await makeLinks().resolve(wrapped)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry the link host on a 429 from Tolinku', async () => {
    replies(json(429, { error: 'Too many requests' }, true), ok, ok);
    expect(await makeLinks().resolve(wrapped)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('the time limit', () => {
  const wrapped = 'https://url1234.email.brand.com/uni/ls/click?upn=XYZ';

  it('sets a 5 second timeout on each request, with a signal', async () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    replies(htmlNotFound, ok);
    await makeLinks().resolve(wrapped);

    const delays = setTimeoutSpy.mock.calls.map((c) => c[1]);
    expect(delays.filter((d) => d === 5000)).toHaveLength(2);
    expect(delays).not.toContain(30000);
    expect(call(0).init.signal).toBeDefined();
    expect(call(1).init.signal).toBeDefined();
  });

  it('gives up on a host that never answers after 5 seconds and falls back once', async () => {
    jest.useFakeTimers();
    let signals: AbortSignal[] = [];
    fetchMock = jest.fn((_url: string, init: RequestInit) => {
      signals.push(init.signal as AbortSignal);
      if (signals.length === 1) {
        return new Promise((_resolve, reject) => {
          init.signal!.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => JSON.stringify(answer),
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const pending = makeLinks().resolve(wrapped);
    await jest.advanceTimersByTimeAsync(4999);
    expect(signals[0]!.aborted).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1);
    expect(signals[0]!.aborted).toBe(true);
    await expect(pending).resolves.toEqual(answer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    signals = [];
  });
});

describe('an answer that is not a path', () => {
  // resolve sends its first question to a host taken from the URL it was
  // given, so an app resolving a link from somewhere it does not control is
  // talking to a stranger. Anything but a path is a redirect waiting to happen.
  const unsafe = [
    ['a full URL', 'https://evil.example.com/take-over'],
    ['a protocol relative URL', '//evil.example.com/take-over'],
    ['a bare word', 'order/4821'],
    ['nothing', ''],
  ];

  it.each(unsafe)('refuses %s from the link host', async (_label, deep_link_path) => {
    replies(json(200, { ...answer, deep_link_path }));
    expect(await makeLinks({ apiKey: '' }).resolve('https://links.example.com/s7k2p9q/4821')).toBeNull();
  });

  it.each(unsafe)('refuses %s from the API', async (_label, deep_link_path) => {
    replies(htmlNotFound, json(200, { ...answer, deep_link_path }));
    expect(await makeLinks().resolve('https://url1234.email.brand.com/uni/ls/click?upn=XYZ')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refuses an answer with no route', async () => {
    replies(json(200, { deep_link_path: '/order/4821' }));
    expect(await makeLinks({ apiKey: '' }).resolve('https://links.example.com/a')).toBeNull();
  });
});

describe('never throws', () => {
  it('returns null on a destroyed client', async () => {
    replies(ok);
    const client = new HttpClient({ apiKey: KEY, baseUrl: 'https://api.tolinku.com', debug: false, timeout: 30000 });
    client.abort();
    await expect(new Links(client).resolve('https://links.example.com/a')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
