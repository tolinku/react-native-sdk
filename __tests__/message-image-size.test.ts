/**
 * An image in a message is sized from free text the builder wrote: "100%",
 * "200", "200px", "auto". React Native takes a number or a percentage and
 * nothing else, and lays a view out at zero when given anything else, so a
 * height it cannot read is an image that renders and cannot be seen while the
 * message around it looks fine.
 */

// components.tsx pulls in react-native, which does not run under Node.
jest.mock('react-native', () => ({
  Text: 'Text',
  View: 'View',
  Image: 'Image',
  TouchableOpacity: 'TouchableOpacity',
  ImageBackground: 'ImageBackground',
  Linking: { openURL: jest.fn() },
}));

import { dimension, num, color } from '../src/messages/components';

// React Native accepts a number, or a string only when it is a percentage.
const isUsable = (v: unknown) =>
  (typeof v === 'number' && isFinite(v) && v > 0) ||
  (typeof v === 'string' && /^\d+(\.\d+)?%$/.test(v));

describe('dimensions', () => {
  it("reads a bare number, the field's own example", () => {
    expect(dimension('200')).toBe(200);
  });

  it('reads a px value', () => {
    expect(dimension('200px')).toBe(200);
    expect(dimension('320px')).toBe(320);
  });

  it('keeps a percentage as a percentage', () => {
    expect(dimension('50%')).toBe('50%');
  });

  it('takes a number as given', () => {
    expect(dimension(240)).toBe(240);
  });

  it('has no opinion about auto, so the caller can size from the content', () => {
    expect(dimension('auto')).toBeUndefined();
  });

  it('has no opinion about empty, missing or nonsense', () => {
    expect(dimension('')).toBeUndefined();
    expect(dimension('   ')).toBeUndefined();
    expect(dimension('tall')).toBeUndefined();
    expect(dimension('20rem')).toBeUndefined();
    expect(dimension('50 %')).toBeUndefined();
    expect(dimension(0)).toBeUndefined();
    expect(dimension(-50)).toBeUndefined();
    expect(dimension(null)).toBeUndefined();
    expect(dimension(undefined)).toBeUndefined();
  });

  it('never returns a size React Native lays out as zero', () => {
    const inputs = ['200', '200px', '50%', 'auto', '', '   ', 'tall', '20rem', '0', '-5', 'NaN'];
    for (const value of inputs) {
      const result = dimension(value);
      if (result !== undefined) expect(isUsable(result)).toBe(true);
    }
  });
});

describe('numbers an author chose', () => {
  it('keeps a deliberate zero', () => {
    // Every stock message template sets borderRadius: 0 on its images. The old
    // `props.x || 8` rounded all of them on device only.
    expect(num(0, 8)).toBe(0);
    expect(num(0, 16)).toBe(0);
  });

  it('reads a numeric string, since hand-posted content is not the builder', () => {
    expect(num('30', 24)).toBe(30);
  });

  it('falls back for missing and unreadable', () => {
    expect(num(undefined, 8)).toBe(8);
    expect(num(null, 8)).toBe(8);
    expect(num('', 8)).toBe(8);
    expect(num('wide', 8)).toBe(8);
    expect(num(NaN, 8)).toBe(8);
  });
});

describe('colours', () => {
  it('accepts what React Native can read', () => {
    expect(color('#fff', '#000')).toBe('#fff');
    expect(color('#1B1B1B', '#000')).toBe('#1B1B1B');
    expect(color('#1B1B1B22', '#000')).toBe('#1B1B1B22');
    expect(color('rgba(0,0,0,0.5)', '#000')).toBe('rgba(0,0,0,0.5)');
    expect(color('transparent', '#000')).toBe('transparent');
    expect(color('rebeccapurple', '#000')).toBe('rebeccapurple');
  });

  it('falls back for CSS React Native cannot read, rather than losing the element', () => {
    // A button background that fails to parse is a white button with a white
    // label: an invisible call to action.
    expect(color('rgb(0 0 0 / 50%)', '#1B1B1B')).toBe('#1B1B1B');
    expect(color('color-mix(in srgb, red, blue)', '#1B1B1B')).toBe('#1B1B1B');
    expect(color('var(--brand)', '#1B1B1B')).toBe('#1B1B1B');
    expect(color('linear-gradient(red, blue)', '#1B1B1B')).toBe('#1B1B1B');
    expect(color('', '#1B1B1B')).toBe('#1B1B1B');
    expect(color(undefined, '#1B1B1B')).toBe('#1B1B1B');
  });
});
