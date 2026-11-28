import type { Message } from '../types';

/**
 * The query for GET /v1/api/messages. `trigger_value` narrows the messages to
 * one event or milestone name on servers that know it; older ones ignore it,
 * which is why the provider also filters with {@link matchesTriggerValue}.
 */
export function messageQuery(trigger?: string, triggerValue?: string, userId?: string | null): Record<string, string> {
  const params: Record<string, string> = {};
  if (trigger) params.trigger = trigger;
  if (triggerValue) params.trigger_value = triggerValue;
  if (userId) params.user_id = userId;
  return params;
}

/**
 * Whether a message belongs to a request for `triggerValue`: always when no
 * name was asked for; otherwise when the message names that one, or names
 * none (a message for any event or milestone of its trigger). The rule the
 * server applies to `trigger_value`, repeated here for servers older than it.
 */
export function matchesTriggerValue(message: Pick<Message, 'trigger_value'>, triggerValue?: string): boolean {
  if (!triggerValue) return true;
  if (!message.trigger_value) return true;
  return message.trigger_value === triggerValue;
}
