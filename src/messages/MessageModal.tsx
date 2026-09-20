import React from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Text,
  StyleSheet,
} from 'react-native';
import type { Message, MessageAppContext, ShowMessageOptions } from '../types';
import { saveMessageDismissal } from '../storage';
import { PuckComponentRenderer, color, num, drawsAnything } from './components';

interface MessageModalProps {
  message: Message | null;
  visible: boolean;
  onClose: () => void;
  options: ShowMessageOptions;
  app?: MessageAppContext | null;
}

/**
 * The colour a gradient starts with.
 *
 * React Native has no gradient without a native module this package will not
 * pull in, and five of the stock message templates are designed on one. Left
 * alone they arrive as a plain white card. The first stop is a much closer
 * likeness than white, so the message still looks like the thing that was
 * designed.
 */
function gradientStartColor(gradient: unknown): string | null {
  if (typeof gradient !== 'string' || !gradient) return null;
  const match = /#[0-9a-f]{3,8}|rgba?\([^)]*\)/i.exec(gradient);
  if (!match) return null;
  // Checked like any other colour: the pattern above will happily match a
  // five digit hex or the space syntax, both of which React Native drops,
  // leaving a card with no background at all.
  const validated = color(match[0], '');
  return validated || null;
}

export function MessageModal({ message, visible, onClose, options, app }: MessageModalProps): React.ReactElement {
  if (!message) {
    return <></>;
  }

  const handleDismiss = async () => {
    await saveMessageDismissal(message.id);
    options.onDismiss?.(message.id);
    onClose();
  };

  const rootProps = (message.content?.root?.props || {}) as Record<string, unknown>;

  // Root background: what the author set on the message surface, then the
  // message's own colour field, then white. All of it was ignored before, so a
  // message designed on a gradient arrived as a plain white card.
  // The gradient wins over the colour, which is what CSS does for the same
  // pair and therefore what the preview and the WebView show. It matters
  // because the builder writes bgColor: '#ffffff' into every saved root, so
  // reading the colour first meant a gradient message was always white here.
  const background =
    gradientStartColor(rootProps.bgGradient) ||
    (typeof rootProps.bgColor === 'string' && rootProps.bgColor ? color(rootProps.bgColor, '') : '') ||
    message.background_color ||
    '#ffffff';

  const cardStyle = {
    backgroundColor: background,
    padding: Math.max(0, num(rootProps.padding, 20)),
    // Clamped, unlike the other authored numbers. A padding of zero is a
    // choice; a width of zero is the whole message gone, and the field's own
    // minimum is zero. The bounds and the default match the server renderer.
    maxWidth: Math.min(2000, Math.max(100, num(rootProps.contentWidth, 480))),
  };

  const content = message.content?.content || [];

  // A message may carry only a title and a body, with nothing designed in the
  // builder at all, and one saved before the palette was narrowed may be made
  // entirely of components this renderer skips. Either way the card used to
  // come up empty but for its close button.
  const hasDesignedContent = drawsAnything(content, app);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <Pressable style={styles.overlay} onPress={handleDismiss}>
        <Pressable style={[styles.card, cardStyle]} onPress={() => {}}>
          <TouchableOpacity
            onPress={handleDismiss}
            style={styles.closeButton}
            accessibilityLabel="Close message"
            accessibilityRole="button"
          >
            <Text style={styles.closeText}>{'\u00d7'}</Text>
          </TouchableOpacity>

          <ScrollView
            style={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {hasDesignedContent ? (
              content.map((component, index) => (
                <PuckComponentRenderer
                  key={`${message.id}-${index}-${component.type}`}
                  component={component}
                  messageId={message.id}
                  options={{
                    ...options,
                    zones: message.content?.zones,
                    app,
                    onRequestClose: handleDismiss,
                  }}
                />
              ))
            ) : (
              <>
                {message.title ? <Text style={styles.fallbackTitle}>{message.title}</Text> : null}
                {message.body ? <Text style={styles.fallbackBody}>{message.body}</Text> : null}
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    position: 'relative',
    width: '90%',
    maxHeight: '80%',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 10,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 18,
    lineHeight: 20,
    opacity: 0.6,
  },
  scrollContent: {
    marginTop: 8,
  },
  // Used only when a message has no designed content, so its title and body
  // are all there is to show.
  fallbackTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1B1B1B',
    marginBottom: 8,
  },
  fallbackBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#555555',
  },
});
