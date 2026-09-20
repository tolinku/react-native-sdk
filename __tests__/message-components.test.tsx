/**
 * What a message actually renders on a device.
 *
 * Every case here is something the builder lets an author do that used to
 * arrive as nothing, or as something else, with no error anywhere.
 */

jest.mock('react-native', () => ({
  Text: 'Text',
  View: 'View',
  Image: 'Image',
  TouchableOpacity: 'TouchableOpacity',
  ImageBackground: 'ImageBackground',
  Linking: { openURL: jest.fn(() => Promise.resolve()) },
}));

import React from 'react';
import { PuckComponentRenderer, type RenderOptions } from '../src/messages/components';
import type { MessageComponent } from '../src/types';

const app = {
  name: 'Tasonic',
  icon_url: 'https://cdn.example.com/icon.png',
  ios_store_url: 'https://apps.apple.com/app/id1',
  android_store_url: 'https://play.google.com/store/apps/details?id=x',
  deep_link_url: 'https://links.example.com/install',
  ios_badge_url: 'https://links.example.com/images/defaults/badges/ios-store-badge-black.png',
  android_badge_url: 'https://links.example.com/images/defaults/badges/play-store-badge-black.png',
};

const comp = (type: string, props: Record<string, unknown> = {}): MessageComponent => ({
  type,
  props: { id: `${type}-1`, ...props },
});

const render = (component: MessageComponent, options: Partial<RenderOptions> = {}) =>
  PuckComponentRenderer({ component, messageId: 'm1', options: options as RenderOptions }) as any;

/** Every element in the tree, so nesting can be asserted. */
const flatten = (node: any, out: any[] = []): any[] => {
  if (!node) return out;
  if (Array.isArray(node)) {
    node.forEach(n => flatten(n, out));
    return out;
  }
  if (typeof node !== 'object') return out;
  out.push(node);
  flatten(node.props?.children, out);
  return out;
};

describe('sections', () => {
  // Puck stores nested content in zones. Reading props.children, which Puck
  // never writes, rendered every Section as an empty box.
  it('takes children from the zone Puck writes them to', () => {
    // Asserted on the elements the Section hands back rather than their output:
    // nested components are only rendered by React, and this calls the renderer
    // directly. What matters is that the zone was read at all, since the old
    // code looked at props.children and always found nothing.
    const child = comp('Heading', { text: 'Inside the section' });
    const el = render(comp('Section', { id: 'sec1' }), { zones: { 'sec1:content': [child] } });

    const rendered = el.props.children as any[];
    expect(rendered).toHaveLength(1);
    expect(rendered[0].props.component).toBe(child);
  });

  it('finds nothing when the zone belongs to a different section', () => {
    const el = render(comp('Section', { id: 'sec1' }), {
      zones: { 'other:content': [comp('Heading', { text: 'Not mine' })] },
    });
    expect(el.props.children).toHaveLength(0);
  });

  it('is still fine with a section that really is empty', () => {
    const el = render(comp('Section', { id: 'sec1' }), { zones: {} });
    expect(el).toBeTruthy();
  });

  it('keeps a deliberate zero padding', () => {
    const el = render(comp('Section', { id: 'sec1', padding: 0 }), { zones: {} });
    expect(el.props.style.padding).toBe(0);
  });
});

describe('buttons', () => {
  it('opens a deep link, which an http-only rule used to block', () => {
    const onButtonPress = jest.fn();
    const el = render(comp('Button', { label: 'Open', action: 'myapp://order/4821' }), { onButtonPress });
    el.props.onPress();
    expect(onButtonPress).toHaveBeenCalledWith('myapp://order/4821', 'm1');
  });

  it('still refuses a script url', () => {
    const onButtonPress = jest.fn();
    const el = render(comp('Button', { label: 'Tap', action: 'javascript:alert(1)' }), { onButtonPress });
    el.props.onPress();
    expect(onButtonPress).not.toHaveBeenCalled();
  });

  it('dismisses the message on the close action instead of doing nothing', () => {
    const onRequestClose = jest.fn();
    const onButtonPress = jest.fn();
    const el = render(comp('Button', { label: 'No thanks', action: 'close' }), { onRequestClose, onButtonPress });
    el.props.onPress();
    expect(onRequestClose).toHaveBeenCalled();
    expect(onButtonPress).not.toHaveBeenCalled();
  });

  it('renders an outline button as an outline, not a solid block', () => {
    const el = render(comp('Button', { label: 'Go', style: 'outline', bgColor: '#1B1B1B', action: 'https://example.com' }));
    expect(el.props.style.backgroundColor).toBe('transparent');
    expect(el.props.style.borderWidth).toBe(2);
    expect(el.props.style.borderColor).toBe('#1B1B1B');
    const label = flatten(el).find(n => n.type === 'Text');
    expect(label.props.style.color).toBe('#1B1B1B');
  });

  it('renders a soft button with a tint', () => {
    const el = render(comp('Button', { label: 'Go', style: 'soft', bgColor: '#1B1B1B', action: 'https://example.com' }));
    expect(el.props.style.backgroundColor).toBe('#1B1B1B22');
  });

  it('centres a button that is not full width, instead of stretching it', () => {
    const compact = render(comp('Button', { label: 'Go', fullWidth: false, action: 'https://example.com' }));
    expect(compact.props.style.alignSelf).toBe('center');
    expect(compact.props.style.width).toBeUndefined();

    const wide = render(comp('Button', { label: 'Go', fullWidth: true, action: 'https://example.com' }));
    expect(wide.props.style.width).toBe('100%');
  });

  it('shows the emoji the author set', () => {
    const el = render(comp('Button', { label: 'Claim', emoji: '🎁', action: 'https://example.com' }));
    const label = flatten(el).find(n => n.type === 'Text');
    expect(label.props.children).toBe('🎁 Claim');
  });

  it('keeps a deliberate square corner', () => {
    const el = render(comp('Button', { label: 'Go', borderRadius: 0, action: 'https://example.com' }));
    expect(el.props.style.borderRadius).toBe(0);
  });
});

describe('text', () => {
  it('renders the markdown links the field label advertises', () => {
    const onButtonPress = jest.fn();
    const el = render(comp('TextBlock', { content: 'See our [terms](https://example.com/t) first' }), { onButtonPress });
    const children = el.props.children as any[];
    const link = children.find(c => c && typeof c === 'object' && c.props?.onPress);
    expect(link.props.children).toBe('terms');
    link.props.onPress();
    expect(onButtonPress).toHaveBeenCalledWith('https://example.com/t', 'm1');
  });

  it('shows an unsafe markdown link as plain text rather than linking it', () => {
    const el = render(comp('TextBlock', { content: '[tap](javascript:alert(1))' }));
    const children = el.props.children as any[];
    const hasLink = (Array.isArray(children) ? children : [children]).some(
      (c: any) => c && typeof c === 'object' && c.props?.onPress,
    );
    expect(hasLink).toBe(false);
  });

  it('leaves ordinary text alone', () => {
    const el = render(comp('TextBlock', { content: 'Just words' }));
    expect(el.props.children).toBe('Just words');
  });
});

describe('the components that describe the app', () => {
  it('draws the app icon', () => {
    const el = render(comp('AppIcon', { size: 64 }), { app });
    expect(el.props.source.uri).toBe(app.icon_url);
    expect(el.props.style.width).toBe(64);
  });

  it('draws a placeholder rather than a gap when there is no icon', () => {
    const el = render(comp('AppIcon', {}), { app: { ...app, icon_url: null } });
    expect(el.type).toBe('View');
    expect(el.props.style.backgroundColor).toBe('#f0f0f0');
  });

  // The badges are their own component (they measure the artwork so the height
  // the author asked for is the height that renders), so these assert on what
  // each badge is handed: nested components are not rendered by a direct call.
  const badges = (el: any) => (el.props.children as any[]).filter(Boolean);

  it('draws both store badges and follows them', () => {
    const onButtonPress = jest.fn();
    const el = render(comp('StoreButtons', {}), { app, onButtonPress });
    const rendered = badges(el);

    expect(rendered.map((b: any) => b.props.uri)).toEqual([app.ios_badge_url, app.android_badge_url]);
    expect(rendered.map((b: any) => b.props.height)).toEqual([44, 44]);

    rendered[0].props.onPress();
    expect(onButtonPress).toHaveBeenCalledWith(app.ios_store_url, 'm1');
    rendered[1].props.onPress();
    expect(onButtonPress).toHaveBeenCalledWith(app.android_store_url, 'm1');
  });

  it('omits a store with no url', () => {
    const el = render(comp('StoreButtons', {}), { app: { ...app, android_store_url: null } });
    expect(badges(el)).toHaveLength(1);
  });

  it('honours the authored height and hidden stores', () => {
    const el = render(comp('StoreButtons', { height: 60, showAndroid: false }), { app });
    const rendered = badges(el);
    expect(rendered).toHaveLength(1);
    expect(rendered[0].props.height).toBe(60);
  });

  it('renders nothing at all when neither store has a url', () => {
    expect(render(comp('StoreButtons', {}), { app: { ...app, ios_store_url: null, android_store_url: null } })).toBeNull();
  });

  it('opens the app link from a deep link button', () => {
    const onButtonPress = jest.fn();
    const el = render(comp('DeepLinkButton', {}), { app, onButtonPress });
    el.props.onPress();
    expect(onButtonPress).toHaveBeenCalledWith(app.deep_link_url, 'm1');
  });

  it('leaves out a deep link button with nowhere to point', () => {
    expect(render(comp('DeepLinkButton', {}), { app: { ...app, deep_link_url: null } })).toBeNull();
  });
});

describe('images', () => {
  it('keeps a deliberate square corner', () => {
    const el = render(comp('Image', { url: 'https://cdn.example.com/a.jpg', borderRadius: 0 }));
    expect(el.props.borderRadius).toBe(0);
  });

  it('passes an explicit height through and leaves an empty one to be measured', () => {
    const fixed = render(comp('Image', { url: 'https://cdn.example.com/a.jpg', height: '200px' }));
    expect(fixed.props.height).toBe(200);

    const natural = render(comp('Image', { url: 'https://cdn.example.com/a.jpg' }));
    expect(natural.props.height).toBeUndefined();
  });

  it('refuses an unsafe image url', () => {
    expect(render(comp('Image', { url: 'javascript:alert(1)' }))).toBeNull();
  });
});

describe('a component this renderer does not know', () => {
  it('is skipped without taking the message down', () => {
    expect(render(comp('ProfileHeader', { name: 'x' }))).toBeNull();
  });
});
