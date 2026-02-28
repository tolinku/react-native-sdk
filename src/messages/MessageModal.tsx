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
import type { Message, ShowMessageOptions } from '../types';
import { saveMessageDismissal } from '../storage';
import { PuckComponentRenderer } from './components';

interface MessageModalProps {
  message: Message | null;
  visible: boolean;
  onClose: () => void;
  options: ShowMessageOptions;
}

export function MessageModal({ message, visible, onClose, options }: MessageModalProps): React.ReactElement {
  if (!message) {
    return <></>;
  }

  const handleDismiss = async () => {
    await saveMessageDismissal(message.id);
    options.onDismiss?.(message.id);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <Pressable style={styles.overlay} onPress={handleDismiss}>
        <Pressable style={[styles.card, { backgroundColor: message.background_color || '#ffffff' }]} onPress={() => {}}>
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
            {message.content?.content?.map((component, index) => (
              <PuckComponentRenderer
                key={`${message.id}-${index}-${component.type}`}
                component={component}
                messageId={message.id}
                options={options}
              />
            ))}
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
    maxWidth: 375,
    width: '90%',
    maxHeight: '80%',
    borderRadius: 16,
    padding: 24,
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
});
