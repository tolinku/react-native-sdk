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

      const widthRaw = (props.width as string) || '100%';
      let imageWidth: number | string = '100%';
      if (widthRaw.endsWith('px')) {
        imageWidth = parseInt(widthRaw, 10);
      } else if (widthRaw.endsWith('%')) {
        imageWidth = widthRaw;
      } else {
        const parsed = parseInt(widthRaw, 10);
        imageWidth = isNaN(parsed) ? '100%' : parsed;
      }

      const style: ImageStyle = {
        width: imageWidth as number,
        height: (props.height as number) || 200,
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
