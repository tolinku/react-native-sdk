import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import type { Message, ShowMessageOptions } from '../types';
import { isMessageDismissed, isMessageSuppressed, recordMessageImpression } from '../storage';
import { MessageModal } from './MessageModal';
import { Tolinku } from '../Tolinku';
import { debugWarn } from '../debug';

interface TolinkuMessagesProps {
  /** The trigger type to filter messages by (e.g. "milestone", "event") */
  trigger?: string;
  /** The trigger value to match (e.g. "installed", "first_purchase") */
  triggerValue?: string;
  /** Called when a message is dismissed */
  onDismiss?: (messageId: string) => void;
  /** Called when a button in the message is pressed */
  onButtonPress?: (action: string, messageId: string) => void;
}

/**
 * React component that fetches and displays in-app messages as a modal overlay.
 *
 * Place this component anywhere in your component tree. It will automatically
 * fetch messages matching the given trigger and display the highest-priority
 * non-dismissed message.
 *
 * Example:
 *   <TolinkuMessages trigger="milestone" triggerValue="installed" />
 */
export function TolinkuMessages({
  trigger,
  triggerValue,
  onDismiss,
  onButtonPress,
}: TolinkuMessagesProps): React.ReactElement {
  const [message, setMessage] = useState<Message | null>(null);
  const [visible, setVisible] = useState(false);

  // Stabilize callback refs so they don't trigger re-fetches
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const onButtonPressRef = useRef(onButtonPress);
  onButtonPressRef.current = onButtonPress;

  // Memoize the options object to avoid unnecessary re-renders
  const options: ShowMessageOptions = useMemo(() => ({
    trigger,
    triggerValue,
    onDismiss: (messageId: string) => onDismissRef.current?.(messageId),
    onButtonPress: (action: string, messageId: string) => onButtonPressRef.current?.(action, messageId),
  }), [trigger, triggerValue]);

  useEffect(() => {
    let cancelled = false;

    async function fetchMessages() {
      try {
        const client = Tolinku.getClient();
        const params: Record<string, string> = {};
        if (trigger) params.trigger = trigger;
        const userId = Tolinku.getUserId();
        if (userId) params.user_id = userId;

        const data = await client.get<{ messages: Message[] }>('/v1/api/messages', params);
        if (cancelled || !data.messages || data.messages.length === 0) return;

        // Filter dismissed/suppressed messages and optionally by triggerValue
        const candidates: Message[] = [];
        for (const m of data.messages) {
          if (triggerValue && m.trigger_value !== triggerValue) continue;
          const dismissed = await isMessageDismissed(m.id, m.dismiss_days);
          if (dismissed) continue;
          const suppressed = await isMessageSuppressed(m.id, m.max_impressions, m.min_interval_hours);
          if (!suppressed) candidates.push(m);
        }

        // Sort by priority (highest first)
        candidates.sort((a, b) => b.priority - a.priority);

        if (candidates.length > 0 && !cancelled) {
          await recordMessageImpression(candidates[0].id);
          setMessage(candidates[0]);
          setVisible(true);
        }
      } catch (err) {
        debugWarn(`Failed to fetch messages: ${(err as Error).message}`);
      }
    }

    fetchMessages();

    return () => {
      cancelled = true;
    };
  }, [trigger, triggerValue]);

  const handleClose = useCallback(() => {
    setVisible(false);
    setMessage(null);
  }, []);

  return (
    <MessageModal
      message={message}
      visible={visible}
      onClose={handleClose}
      options={options}
    />
  );
}
