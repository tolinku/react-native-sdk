/**
 * An image in a message is sized from free text the builder wrote: "100%",
 * "200", "200px", "auto". React Native takes a number or a percentage and
 * nothing else, and lays a view out at zero when given anything else, so a
 * height it cannot read is an image that renders and cannot be seen while the
 * message around it looks fine. These assert the sizes that reach the style.
 */

jest.mock('react-native', () => ({
  Text: 'Text',
  View: 'View',
  Image: 'Image',
  TouchableOpacity: 'TouchableOpacity',
  ImageBackground: 'ImageBackground',
  Linking: { openURL: jest.fn() },
}));

import { PuckComponentRenderer } from '../src/messages/components';

const sizeOf = (props: Record<string, unknown>) => {
  const el = PuckComponentRenderer({
    component: { type: 'Image', props: { url: 'https://cdn.example.com/a.jpg', ...props } },
    messageId: 'm1',
    options: {},
  }) as any;
  return el?.props?.style ?? null;
};

// React Native accepts a number, or a string only when it is a percentage.
const isUsable = (v: unknown) =>
  (typeof v === 'number' && isFinite(v) && v > 0) ||
  (typeof v === 'string' && /^\d+(\.\d+)?%$/.test(v));

describe('image dimensions reaching the style', () => {
  it('reads a bare number, the field\'s own example', () => {
    expect(sizeOf({ height: '200' }).height).toBe(200);
  });

  it('reads a px value', () => {
    expect(sizeOf({ height: '200px' }).height).toBe(200);
    expect(sizeOf({ width: '320px' }).width).toBe(320);
  });

  it('keeps a percentage as a percentage', () => {
    expect(sizeOf({ width: '50%' }).width).toBe('50%');
    expect(sizeOf({ height: '50%' }).height).toBe('50%');
  });

  it('takes a number as given', () => {
    expect(sizeOf({ height: 240 }).height).toBe(240);
  });

  it('falls back for auto, which cannot size an unmeasured image', () => {
    expect(sizeOf({ height: 'auto' }).height).toBe(200);
    expect(sizeOf({ width: 'auto' }).width).toBe('100%');
  });

  it('falls back for empty, missing and nonsense', () => {
    expect(sizeOf({}).height).toBe(200);
    expect(sizeOf({ height: '' }).height).toBe(200);
    expect(sizeOf({ height: '   ' }).height).toBe(200);
    expect(sizeOf({ height: 'tall' }).height).toBe(200);
    expect(sizeOf({ height: '20rem' }).height).toBe(200);
    expect(sizeOf({ height: 0 }).height).toBe(200);
    expect(sizeOf({ height: -50 }).height).toBe(200);
    expect(sizeOf({ height: null }).height).toBe(200);
  });

  it('never hands React Native a size it lays out as zero', () => {
    const inputs = ['200', '200px', '50%', 'auto', '', '   ', 'tall', '20rem', '0', '-5', 'NaN'];
    for (const value of inputs) {
      const style = sizeOf({ height: value, width: value });
      expect(isUsable(style.height)).toBe(true);
      expect(isUsable(style.width)).toBe(true);
    }
  });
});
