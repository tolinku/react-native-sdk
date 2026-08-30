import { SDK_VERSION } from '../src/types';

/**
 * SDK_VERSION is sent in the User-Agent on every request, so a drift from the
 * published version silently misreports which SDK is in the field. It sat at
 * 0.1.0 through two releases before this guard existed.
 */
describe('SDK_VERSION', () => {
  it('matches the published package version', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../package.json');
    expect(SDK_VERSION).toBe(pkg.version);
  });
});
