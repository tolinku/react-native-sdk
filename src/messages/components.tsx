import React from 'react';
import {
  Text,
  View,
  Image,
  TouchableOpacity,
  ImageBackground,
  Linking,
  type TextStyle,
  type ViewStyle,
  type ImageStyle,
} from 'react-native';
import type { MessageAppContext, MessageComponent, ShowMessageOptions } from '../types';
import { isSafeActionUrl, isSafeUrl } from '../validation';
import { debugWarn } from '../debug';

/** The only two shapes React Native lays out: a number, or a percentage. */
type Size = number | `${number}%`;

/** What an Image is given when it has neither a height nor a measurable one. */
const DEFAULT_IMAGE_HEIGHT: Size = 200;

/**
 * Turn a dimension the message builder wrote into one React Native accepts.
 *
 * The builder's width and height are free text: "100%", "200", "200px" and
 * "auto" are all things it invites people to type. React Native takes a number
 * or a percentage string and nothing else, so "200" and "200px" are not sizes
 * to it, they are mistakes. A view given one lays out at zero, which for an
 * image means it renders and cannot be seen, with the rest of the message
 * looking perfectly fine around the hole.
 *
 * "auto" and anything unreadable return undefined, which callers read as "no
 * opinion" and size from the content instead.
 */
export function dimension(raw: unknown): Size | undefined {
  if (typeof raw === 'number' && isFinite(raw) && raw > 0) return raw;
  if (typeof raw !== 'string') return undefined;

  const value = raw.trim();
  if (!value) return undefined;
  if (value.endsWith('%')) {
    return /^\d+(?:\.\d+)?%$/.test(value) ? (value as Size) : undefined;
  }

  // Only digits, with an optional px, are a size anyone meant. parseInt would
  // also read "20rem" as 20, which is not what was asked for.
  const match = /^(\d+(?:\.\d+)?)(?:px)?$/i.exec(value);
  if (!match) {
    debugWarn(`Dimension "${raw}" is not a size React Native understands; ignoring it.`);
    return undefined;
  }
  const parsed = parseFloat(match[1]!);
  return parsed > 0 ? parsed : undefined;
}

/**
 * A number the author set, which may legitimately be zero.
 *
 * `props.x || fallback` throws away a deliberate 0, and 0 is exactly what an
 * author picks for a square corner or a flush edge. Every stock message
 * template sets borderRadius: 0 on its images, so the old form rounded the
 * corners of every one of them on device only.
 */
export function num(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = parseFloat(raw);
    if (isFinite(parsed)) return parsed;
  }
  return fallback;
}

/**
 * A colour React Native can actually parse, or the fallback.
 *
 * The builder's colour fields are free text with no picker, so a browser form
 * anything CSS accepts: `rgb(0 0 0 / 50%)`, `hsl(210 40% 98%)`, `color-mix()`,
 * `var(--brand)`. React Native understands a much smaller set and simply drops
 * what it cannot read, which for a button background means a white button with
 * a white label, an invisible call to action rather than an ugly one.
 */
export function color(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const value = raw.trim();
  if (!value) return fallback;

  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) return value;
  // The comma forms only. The CSS space syntax, rgb(0 0 0 / 50%), is not
  // understood by React Native.
  if (/^(?:rgb|rgba|hsl|hsla)\(\s*[\d.]+\s*,[^)]*\)$/i.test(value)) return value;
  if (/^[a-z]+$/i.test(value)) return value; // named colours, including transparent

  debugWarn(`Colour "${raw}" is not one React Native can read; using ${fallback}.`);
  return fallback;
}

/** The "soft" button variant's tint, matching the builder and the web. */
function softVariant(hex: string): string {
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}22` : hex;
}

/**
 * Render the [text](url) links the TextBlock field promises.
 *
 * The field label says "Markdown links supported" and the builder preview
 * draws them, so an author has every reason to believe they work. Only the
 * preview did: everywhere else the brackets and the raw URL were shown to the
 * end user as text.
 */
function richText(text: string, onPressUrl: (url: string) => void): React.ReactNode {
  if (!text) return '';
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const [full, label, rawUrl] = match;
    const url = (rawUrl || '').trim();
    if (isSafeActionUrl(url)) {
      parts.push(
        <Text
          key={`link-${key++}`}
          style={{ textDecorationLine: 'underline' }}
          onPress={() => onPressUrl(url)}
        >
          {label}
        </Text>,
      );
    } else {
      parts.push(full);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length === 1 ? parts[0] : parts;
}

/**
 * The proportions of a remote image, once the platform can tell us.
 *
 * React Native cannot know them without asking, and asking is asynchronous, so
 * a caller gets null until the answer arrives and lays out from a fallback in
 * the meantime. `enabled` exists because measuring costs a request and is
 * pointless when the size is already known.
 */
function useImageRatio(uri: string, enabled: boolean): number | null {
  const [ratio, setRatio] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!enabled || !uri) return;
    let cancelled = false;
    Image.getSize(
      uri,
      (w, h) => {
        // Guarded so a slow answer cannot set state on an unmounted message,
        // which is a warning in development and a leak in production.
        if (!cancelled && w > 0 && h > 0) setRatio(w / h);
      },
      () => {
        // Unreachable, or something the platform cannot measure. Callers fall
        // back rather than render nothing.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [uri, enabled]);

  return ratio;
}

/**
 * An image sized the way the builder means it.
 *
 * A height left empty means natural proportions, not a fixed box. Picking a
 * number instead is how a 44px icon ends up as a 44 by 200 strip with its
 * middle cropped out, which is what every template icon looked like.
 */
function MessageImage({
  uri,
  width,
  height,
  borderRadius,
  borderWidth,
  borderColor,
  alt,
}: {
  uri: string;
  width: Size | undefined;
  height: Size | undefined;
  borderRadius: number;
  borderWidth: number;
  borderColor: string;
  alt: string;
}): React.ReactElement {
  const wantsNaturalHeight = height === undefined;
  const ratio = useImageRatio(uri, wantsNaturalHeight);

  const style: ImageStyle = {
    width: width ?? '100%',
    borderRadius,
    alignSelf: 'center',
    marginBottom: 8,
    ...(borderWidth > 0 ? { borderWidth, borderColor } : {}),
    ...(wantsNaturalHeight
      ? ratio
        ? { aspectRatio: ratio }
        : { height: DEFAULT_IMAGE_HEIGHT }
      : { height }),
  };

  return (
    <Image
      source={{ uri }}
      style={style}
      // Contain while the proportions are still unknown, so a measurement that
      // never arrives leaves the picture whole rather than cropped.
      resizeMode={wantsNaturalHeight && !ratio ? 'contain' : 'cover'}
      accessibilityLabel={alt}
    />
  );
}

/**
 * One store badge, at the height the author asked for.
 *
 * A remote image in React Native needs both dimensions, so the width comes
 * from the badge's own proportions rather than a number written here. Apple's
 * and Google's artwork are close but not identical (3.47 against 3.46), and
 * either way a guess shows as a badge slightly shorter than asked for, since
 * "contain" shrinks it to fit whatever box it is given.
 */
function StoreBadge({
  uri,
  height,
  label,
  onPress,
}: {
  uri: string | undefined;
  height: number;
  label: string;
  onPress: () => void;
}): React.ReactElement {
  const usable = !!uri && isSafeUrl(uri);
  const ratio = useImageRatio(usable ? uri! : '', usable);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button">
      {usable ? (
        <Image
          source={{ uri: uri! }}
          // Until measured, a badge-shaped box. Both stores' artwork is within
          // a percent of this, so the correction on arrival is imperceptible.
          style={{ height, width: height * (ratio || 3.47), marginHorizontal: 6 }}
          resizeMode="contain"
          accessibilityLabel={label}
        />
      ) : (
        // A text link rather than a blank space, for the case where the badge
        // artwork itself cannot be loaded.
        <Text style={{ color: '#1B1B1B', fontSize: 15, fontWeight: '600', marginHorizontal: 6 }}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

/** The component types this renderer draws. */
const SUPPORTED = new Set([
  'Heading',
  'TextBlock',
  'Image',
  'Button',
  'DeepLinkButton',
  'Section',
  'Spacer',
  'Divider',
  'AppIcon',
  'StoreButtons',
]);

/**
 * Whether anything in this content would actually draw.
 *
 * A message saved before the builder's palette was narrowed can be made
 * entirely of components this renderer skips, and skipping all of them leaves
 * an empty card with a close button. Asking first lets the message fall back
 * to its title and body instead.
 */
export function drawsAnything(content: MessageComponent[] | undefined): boolean {
  return (content || []).some(c => SUPPORTED.has(c?.type));
}

export interface RenderOptions extends ShowMessageOptions {
  /** Section children, keyed "<component id>:content", as Puck stores them. */
  zones?: Record<string, MessageComponent[]>;
  /** The app the message belongs to, for the components that describe it. */
  app?: MessageAppContext | null;
  /** Dismiss the message. A button action of "close" calls this. */
  onRequestClose?: () => void;
}

interface ComponentRendererProps {
  component: MessageComponent;
  messageId: string;
  options: RenderOptions;
}

export function PuckComponentRenderer({ component, messageId, options }: ComponentRendererProps): React.ReactElement | null {
  const { props } = component;
  const app = options.app;

  /** Open a URL the way the host app asked us to, or the way the OS would. */
  const follow = (url: string) => {
    if (options.onButtonPress) options.onButtonPress(url, messageId);
    else Linking.openURL(url).catch(() => {});
  };

  switch (component.type) {
    case 'Heading': {
      const fontSize = num(props.fontSize, 28);
      const style: TextStyle = {
        fontSize,
        fontWeight: '700',
        color: color(props.color, '#1B1B1B'),
        textAlign: (props.alignment as TextStyle['textAlign']) || 'left',
        lineHeight: fontSize * 1.2,
        marginBottom: 8,
      };
      return <Text style={style}>{(props.text as string) || ''}</Text>;
    }

    case 'TextBlock': {
      const fontSize = num(props.fontSize, 15);
      const style: TextStyle = {
        fontSize,
        color: color(props.color, '#555555'),
        textAlign: (props.alignment as TextStyle['textAlign']) || 'left',
        lineHeight: fontSize * 1.5,
        marginBottom: 8,
      };
      return <Text style={style}>{richText((props.content as string) || '', follow)}</Text>;
    }

    case 'Image': {
      const imageUrl = (props.url as string) || '';

      if (!imageUrl || !imageUrl.trim()) {
        debugWarn('Image component has empty URL, skipping render.');
        return null;
      }
      if (!isSafeUrl(imageUrl)) {
        debugWarn(`Image URL blocked (unsafe protocol): ${imageUrl}`);
        return null;
      }

      return (
        <MessageImage
          uri={imageUrl}
          width={dimension(props.width) ?? '100%'}
          height={dimension(props.height)}
          borderRadius={num(props.borderRadius, 8)}
          borderWidth={num(props.borderWidth, 0)}
          borderColor={color(props.borderColor, '#1B1B1B')}
          alt={(props.alt as string) || ''}
        />
      );
    }

    case 'Button':
    case 'DeepLinkButton': {
      const isDeepLink = component.type === 'DeepLinkButton';
      // A deep link button opens the app's own link, which the message content
      // has no way to know; it comes with the app context.
      const action = isDeepLink ? app?.deep_link_url || '' : (props.action as string) || '';
      const label = isDeepLink
        ? (props.label as string) || 'Open in App'
        : (props.label as string) || '';

      // A deep link button with nowhere to point is a dead control, so it is
      // left out rather than drawn.
      if (isDeepLink && !action) return null;

      const handlePress = () => {
        if (!action) return;

        // "close" is an action the builder offers and the WebView renderer has
        // always honoured. Here it used to fail the URL check and do nothing,
        // so a dismiss button left the message on screen.
        if (action === 'close') {
          options.onRequestClose?.();
          return;
        }

        // Checked before either path, including the caller's own handler. The
        // URL comes from message content, and a handler is ordinary app code
        // that will reasonably pass it to Linking.openURL without looking.
        if (!isSafeActionUrl(action)) {
          debugWarn(`Button action URL blocked (unsafe protocol): ${action}`);
          return;
        }

        follow(action);
      };

      const variant = (props.style as string) || 'filled';
      const isOutline = variant === 'outline';
      const isSoft = variant === 'soft';
      const baseColor = color(props.bgColor, '#1B1B1B');
      const background = isOutline ? 'transparent' : isSoft ? softVariant(baseColor) : baseColor;
      const labelColor = isOutline || isSoft ? baseColor : color(props.textColor, '#ffffff');

      const containerStyle: ViewStyle = {
        backgroundColor: background,
        borderRadius: num(props.borderRadius, 8),
        paddingVertical: 12,
        paddingHorizontal: 24,
        marginVertical: 8,
        alignItems: 'center',
        ...(isOutline ? { borderWidth: 2, borderColor: baseColor } : {}),
        // A button that is not full width is a compact, centred one. Without
        // alignSelf it stretches to the column anyway, which made the setting
        // do nothing at all.
        ...(props.fullWidth ? { width: '100%' as const } : { alignSelf: 'center' as const }),
      };

      const textStyle: TextStyle = {
        color: labelColor,
        fontSize: num(props.fontSize, 16),
        fontWeight: '600',
      };

      const emoji = (props.emoji as string) || '';

      return (
        <TouchableOpacity onPress={handlePress} style={containerStyle} activeOpacity={0.7}>
          <Text style={textStyle}>{emoji ? `${emoji} ${label}` : label}</Text>
        </TouchableOpacity>
      );
    }

    case 'Section': {
      // Puck stores a drop zone's children under "<component id>:content" at
      // the top level of the content, never in props.children. Reading
      // props.children rendered every Section as an empty box and lost
      // everything an author put inside it.
      const zoneKey = `${(props.id as string) || ''}:content`;
      const children = options.zones?.[zoneKey] || [];

      const containerStyle: ViewStyle = {
        backgroundColor: typeof props.bgColor === 'string' && props.bgColor
          ? color(props.bgColor, 'transparent')
          : undefined,
        padding: num(props.padding, 16),
        borderRadius: num(props.borderRadius, 0),
        marginVertical: 8,
      };

      const content = children.map((child, index) => (
        <PuckComponentRenderer
          key={`${messageId}-section-${index}-${child.type}`}
          component={child}
          messageId={messageId}
          options={options}
        />
      ));

      const bgImage = (props.bgImage as string) || '';
      if (bgImage) {
        if (!isSafeUrl(bgImage)) {
          debugWarn(`Section background image URL blocked (unsafe protocol): ${bgImage}`);
          return <View style={containerStyle}>{content}</View>;
        }

        return (
          <ImageBackground
            source={{ uri: bgImage }}
            style={containerStyle}
            resizeMode={(props.bgSize as string) === 'contain' ? 'contain' : 'cover'}
            imageStyle={{ borderRadius: num(props.borderRadius, 0) }}
          >
            {content}
          </ImageBackground>
        );
      }

      return <View style={containerStyle}>{content}</View>;
    }

    case 'Spacer':
      return <View style={{ height: num(props.height, 24) }} />;

    case 'Divider':
      return (
        <View
          style={{
            borderTopWidth: num(props.thickness, 1),
            borderTopColor: color(props.color, '#e5e5e5'),
            marginVertical: 8,
          }}
        />
      );

    case 'AppIcon': {
      const size = num(props.size, 80);
      const borderRadius = num(props.borderRadius, 16);
      const iconUrl = app?.icon_url || '';

      // A placeholder rather than a hole. The author put an icon here, and an
      // app with no logo set is a setting to fix, not a reason to render a
      // message with a gap in it.
      if (!iconUrl || !isSafeUrl(iconUrl)) {
        return (
          <View
            style={{ width: size, height: size, borderRadius, backgroundColor: '#f0f0f0', alignSelf: 'center', marginBottom: 8 }}
          />
        );
      }

      return (
        <Image
          source={{ uri: iconUrl }}
          style={{ width: size, height: size, borderRadius, alignSelf: 'center', marginBottom: 8 }}
          resizeMode="cover"
          accessibilityLabel={app?.name || 'App icon'}
        />
      );
    }

    case 'StoreButtons': {
      const iosUrl = (props.iosUrlOverride as string) || app?.ios_store_url || '';
      const androidUrl = (props.androidUrlOverride as string) || app?.android_store_url || '';
      const showIos = props.showIos !== false && !!iosUrl;
      const showAndroid = props.showAndroid !== false && !!androidUrl;
      if (!showIos && !showAndroid) return null;

      const height = num(props.height, 44);
      const alignment = props.alignment as string;
      const justifyContent =
        alignment === 'left' ? 'flex-start' : alignment === 'right' ? 'flex-end' : 'center';

      // The badges are the official artwork, sent with the app context so the
      // SDK is not guessing an origin or a file name.
      return (
        <View style={{ flexDirection: 'row', justifyContent, alignItems: 'center', flexWrap: 'wrap', marginVertical: 8 }}>
          {showIos ? (
            <StoreBadge
              key="ios"
              uri={app?.ios_badge_url}
              height={height}
              label="Download on the App Store"
              onPress={() => follow(iosUrl)}
            />
          ) : null}
          {showAndroid ? (
            <StoreBadge
              key="android"
              uri={app?.android_badge_url}
              height={height}
              label="Get it on Google Play"
              onPress={() => follow(androidUrl)}
            />
          ) : null}
        </View>
      );
    }

    default:
      debugWarn(`Message component "${component.type}" is not supported here; skipping it.`);
      return null;
  }
}
