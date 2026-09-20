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
import type { MessageComponent, ShowMessageOptions } from '../types';
import { isSafeUrl } from '../validation';
import { debugWarn } from '../debug';

/** The only two shapes React Native lays out: a number, or a percentage. */
type Size = number | `${number}%`;

/** What an Image is given when its height is left empty or cannot be read. */
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
 * Width was already read this way. Height was cast straight to a number, so
 * anyone who typed a height into the field lost the image, which is the one
 * thing the field is for.
 *
 * "auto" and anything unreadable fall back, because there is no honest way to
 * size an image we have not measured: a view of height auto with nothing to
 * derive it from is the same invisible zero.
 */
function dimension(raw: unknown, fallback: Size): Size {
  if (typeof raw === 'number' && isFinite(raw) && raw > 0) return raw;
  if (typeof raw !== 'string') return fallback;

  const value = raw.trim();
  if (!value) return fallback;
  if (value.endsWith('%')) {
    return /^\d+(?:\.\d+)?%$/.test(value) ? (value as Size) : fallback;
  }

  // parseInt would read "auto" as NaN and "200px" as 200, which is what we
  // want, but it would also read "20rem" as 20. Only digits, with an optional
  // px, are a size anyone meant.
  const match = /^(\d+(?:\.\d+)?)(?:px)?$/i.exec(value);
  if (!match) {
    debugWarn(`Image dimension "${raw}" is not a size React Native understands; using ${fallback}.`);
    return fallback;
  }
  const parsed = parseFloat(match[1]!);
  return parsed > 0 ? parsed : fallback;
}

interface ComponentRendererProps {
  component: MessageComponent;
  messageId: string;
  options: ShowMessageOptions;
}

export function PuckComponentRenderer({ component, messageId, options }: ComponentRendererProps): React.ReactElement | null {
  const { props } = component;

  switch (component.type) {
    case 'Heading': {
      const style: TextStyle = {
        fontSize: (props.fontSize as number) || 28,
        fontWeight: '700',
        color: (props.color as string) || '#1B1B1B',
        textAlign: (props.alignment as TextStyle['textAlign']) || 'left',
        lineHeight: ((props.fontSize as number) || 28) * 1.2,
        marginBottom: 8,
      };
      return <Text style={style}>{(props.text as string) || ''}</Text>;
    }

    case 'TextBlock': {
      const style: TextStyle = {
        fontSize: (props.fontSize as number) || 15,
        color: (props.color as string) || '#555555',
        textAlign: (props.alignment as TextStyle['textAlign']) || 'left',
        lineHeight: ((props.fontSize as number) || 15) * 1.5,
        marginBottom: 8,
      };
      return <Text style={style}>{(props.content as string) || ''}</Text>;
    }

    case 'Image': {
      const imageUrl = (props.url as string) || '';

      // Skip rendering if URL is empty or not safe
      if (!imageUrl || !imageUrl.trim()) {
        debugWarn('Image component has empty URL, skipping render.');
        return null;
      }
      if (!isSafeUrl(imageUrl)) {
        debugWarn(`Image URL blocked (unsafe protocol): ${imageUrl}`);
        return null;
      }

      const style: ImageStyle = {
        width: dimension(props.width, '100%'),
        height: dimension(props.height, DEFAULT_IMAGE_HEIGHT),
        borderRadius: (props.borderRadius as number) || 8,
        alignSelf: 'center',
        marginBottom: 8,
      };
      return (
        <Image
          source={{ uri: imageUrl }}
          style={style}
          resizeMode="cover"
          accessibilityLabel={(props.alt as string) || ''}
        />
      );
    }

    case 'Button': {
        const handlePress = () => {
          const action = (props.action as string) || '';
          if (!action) return;

          // Checked before either path, including the caller's own handler. The
          // URL comes from message content, and a handler is ordinary app code
          // that will reasonably pass it to Linking.openURL without looking. The
          // Android and Flutter SDKs validate in the same place.
          if (!isSafeUrl(action)) {
            debugWarn(`Button action URL blocked (unsafe protocol): ${action}`);
            return;
          }

          if (options.onButtonPress) {
            options.onButtonPress(action, messageId);
          } else {
            Linking.openURL(action).catch(() => {});
          }
        };

      const containerStyle: ViewStyle = {
        backgroundColor: (props.bgColor as string) || '#1B1B1B',
        borderRadius: (props.borderRadius as number) || 8,
        paddingVertical: 10,
        paddingHorizontal: 20,
        marginVertical: 8,
        alignItems: 'center',
        ...(props.fullWidth ? { width: '100%' } : {}),
      };

      const textStyle: TextStyle = {
        color: (props.textColor as string) || '#ffffff',
        fontSize: (props.fontSize as number) || 16,
        fontWeight: '600',
      };

      return (
        <TouchableOpacity onPress={handlePress} style={containerStyle} activeOpacity={0.7}>
          <Text style={textStyle}>{(props.label as string) || 'Click'}</Text>
        </TouchableOpacity>
      );
    }

    case 'Section': {
      const children = (props.children as MessageComponent[]) || [];
      const containerStyle: ViewStyle = {
        backgroundColor: (props.bgColor as string) || undefined,
        padding: (props.padding as number) || 16,
        borderRadius: (props.borderRadius as number) || 0,
        marginVertical: 8,
      };

      const bgImage = (props.bgImage as string) || '';

      const content = children.map((child, index) => (
        <PuckComponentRenderer
          key={`${messageId}-section-${index}-${child.type}`}
          component={child}
          messageId={messageId}
          options={options}
        />
      ));

      if (bgImage) {
        // Validate background image URL
        if (!isSafeUrl(bgImage)) {
          debugWarn(`Section background image URL blocked (unsafe protocol): ${bgImage}`);
          return <View style={containerStyle}>{content}</View>;
        }

        return (
          <ImageBackground
            source={{ uri: bgImage }}
            style={containerStyle}
            resizeMode={(props.bgSize as string) === 'contain' ? 'contain' : 'cover'}
            imageStyle={{ borderRadius: (props.borderRadius as number) || 0 }}
          >
            {content}
          </ImageBackground>
        );
      }

      return <View style={containerStyle}>{content}</View>;
    }

    case 'Spacer': {
      const style: ViewStyle = {
        height: (props.height as number) || 24,
      };
      return <View style={style} />;
    }

    case 'Divider': {
      const style: ViewStyle = {
        borderTopWidth: (props.thickness as number) || 1,
        borderTopColor: (props.color as string) || '#e5e5e5',
        marginVertical: 8,
      };
      return <View style={style} />;
    }

    default:
      return null;
  }
}
