# @tolinku/react-native-sdk

[![npm version](https://img.shields.io/npm/v/@tolinku/react-native-sdk.svg)](https://www.npmjs.com/package/@tolinku/react-native-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

The official [Tolinku](https://tolinku.com) SDK for **React Native**. Add deep linking, analytics, referral tracking, deferred deep links, and in-app messages to your React Native app. Works with both React Native CLI and Expo projects.

## What is Tolinku?

[Tolinku](https://tolinku.com) is a deep linking platform for mobile and web apps. It handles Universal Links (iOS), App Links (Android), deferred deep linking, referral programs, analytics, and smart banners. Tolinku provides a complete toolkit for user acquisition, attribution, and engagement across platforms.

Get your API key at [tolinku.com](https://tolinku.com) and check out the [documentation](https://tolinku.com/docs) to get started.

## Installation

```bash
npm install @tolinku/react-native-sdk @react-native-async-storage/async-storage
```

Or with yarn:

```bash
yarn add @tolinku/react-native-sdk @react-native-async-storage/async-storage
```

`@react-native-async-storage/async-storage` is a required peer dependency used for message impression tracking and dismissal state.

### Expo

This SDK is compatible with [Expo](https://expo.dev). No custom native modules are required.

```bash
npx expo install @tolinku/react-native-sdk @react-native-async-storage/async-storage
```

Most features (analytics, referrals, in-app messages) work in Expo Go. However, deep linking (Universal Links and App Links) requires a [development build](https://docs.expo.dev/develop/development-builds/introduction/) or production build, since Expo Go cannot register custom domain associations. Use `npx expo run:ios` or `eas build --profile development` to create a dev build for testing deep links.

### React Native CLI

For bare React Native projects, install the packages above and run pod install for iOS:

```bash
cd ios && pod install
```

## Quick Start

```typescript
import { Tolinku } from '@tolinku/react-native-sdk';

// Initialize the SDK (typically at app startup)
Tolinku.init({ apiKey: 'tolk_pub_your_api_key' });

// Identify a user
Tolinku.setUserId('user_123');

// Track a custom event
await Tolinku.track('purchase', { plan: 'growth' });
```

## Features

### Analytics

Track custom events with automatic batching. Events are queued and sent in batches of 10, or every 5 seconds.

```typescript
await Tolinku.track('signup_completed', { source: 'landing_page' });

// Flush queued events immediately
await Tolinku.flush();
```

### Referrals

Create and manage referral programs with leaderboards and reward tracking.

```typescript
// Create a referral
const { referral_code, referral_url } = await Tolinku.referrals.create({
  userId: 'user_123',
  userName: 'Alice',
});

// Look up a referral
const info = await Tolinku.referrals.get(referral_code);

// Complete a referral
await Tolinku.referrals.complete({
  code: referral_code,
  referredUserId: 'user_456',
  referredUserName: 'Bob',
});

// Update milestone
await Tolinku.referrals.milestone({
  code: referral_code,
  milestone: 'first_purchase',
});

// Claim reward
await Tolinku.referrals.claimReward(referral_code);

// Fetch leaderboard
const { leaderboard } = await Tolinku.referrals.leaderboard(10);
```

### Ecommerce

Track purchases, cart activity, and product events with built-in revenue analytics. Available on paid plans.

```typescript
Tolinku.setUserId('user_123');

// Track a product view
await Tolinku.ecommerce.viewItem({
  items: [{ item_id: 'sku_1', item_name: 'T-Shirt', price: 24.99 }]
});

// Track a purchase
await Tolinku.ecommerce.purchase({
  transaction_id: 'order_456',
  revenue: 49.99,
  currency: 'USD',
  items: [{ item_id: 'sku_1', item_name: 'T-Shirt', price: 24.99, quantity: 2 }]
});

// Flush ecommerce events
await Tolinku.ecommerce.flush();
```

The SDK supports 13 event types covering the full shopping journey. Cart IDs are managed automatically via `AsyncStorage` and cleared after purchase. Events auto-flush when the app enters the background.

### Deferred Deep Links

Recover deep link context for users who installed your app after clicking a link. Deferred deep linking lets you route users to specific content even when the app was not installed at the time of the click.

```typescript
// Claim by referrer token (from Play Store referrer or clipboard)
const link = await Tolinku.deferred.claimByToken('abc123');
if (link) {
  console.log(link.deep_link_path); // e.g. "/merchant/xyz"
}

// Claim by device signal matching (auto-detects timezone, language, screen size)
const link = await Tolinku.deferred.claimBySignals({
  appspaceId: 'your_appspace_id',
});
```

### In-App Messages (React Native Component)

Display server-configured in-app messages using the `<TolinkuMessages>` component. Drop it anywhere in your React Native component tree to automatically fetch and render messages as a modal overlay. Messages are created and managed from the Tolinku dashboard without shipping app updates.

```tsx
import { TolinkuMessages } from '@tolinku/react-native-sdk';

function App() {
  return (
    <>
      <MainContent />
      <TolinkuMessages
        trigger="milestone"
        triggerValue="first_purchase"
        onButtonPress={(action, messageId) => {
          console.log(`Action: ${action}, Message: ${messageId}`);
        }}
        onDismiss={(messageId) => {
          console.log(`Dismissed: ${messageId}`);
        }}
      />
    </>
  );
}
```

The component automatically filters dismissed and suppressed messages, and shows the highest-priority match. It respects `dismiss_days`, `max_impressions`, and `min_interval_hours` settings from the server.

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `trigger` | `string?` | Filter messages by trigger type |
| `triggerValue` | `string?` | Match a specific trigger value |
| `onButtonPress` | `(action, messageId) => void` | Called when a message button is pressed |
| `onDismiss` | `(messageId) => void` | Called when a message is dismissed |

## Configuration Options

```typescript
Tolinku.init({
  apiKey: 'tolk_pub_your_api_key',      // Required. Your Tolinku publishable API key.
  baseUrl: 'https://api.tolinku.com',  // Optional. API base URL.
  debug: false,                         // Optional. Enable debug logging.
  timeout: 30000,                       // Optional. Request timeout in ms.
});

// Set user identity at any time
Tolinku.setUserId('user_123');

// Shut down the SDK
await Tolinku.destroy();
```

## API Reference

### `Tolinku`

| Method | Description |
|--------|-------------|
| `init(config)` | Initialize the SDK (static) |
| `isConfigured()` | Check if the SDK is initialized (static) |
| `setUserId(userId)` | Set or clear the current user ID (static) |
| `getUserId()` | Get the current user ID (static) |
| `track(eventType, properties?)` | Track a custom event (static) |
| `flush()` | Flush queued analytics events (static) |
| `destroy()` | Shut down the SDK and release resources (static) |

### `Tolinku.referrals`

| Method | Description |
|--------|-------------|
| `create(options)` | Create a new referral |
| `get(code)` | Get referral details by code |
| `complete(options)` | Mark a referral as converted |
| `milestone(options)` | Update a referral milestone |
| `claimReward(code)` | Claim a referral reward |
| `leaderboard(limit?)` | Fetch the referral leaderboard |

### `Tolinku.ecommerce`

| Method | Description |
|--------|-------------|
| `viewItem(params)` | Track a product view |
| `addToCart(params)` | Track item added to cart |
| `removeFromCart(params)` | Track item removed from cart |
| `addToWishlist(params)` | Track item added to wishlist |
| `viewCart()` | Track cart view |
| `addPaymentInfo()` | Track payment info entered |
| `beginCheckout(params?)` | Track checkout started |
| `purchase(params)` | Track a purchase |
| `refund(params)` | Track a refund |
| `search(params)` | Track a product search |
| `share(params)` | Track a product share |
| `rate(params)` | Track a product rating |
| `spendCredits(params)` | Track loyalty credits spent |
| `flush()` | Send all queued ecommerce events |

### `Tolinku.deferred`

| Method | Description |
|--------|-------------|
| `claimByToken(token)` | Claim a deferred link by token |
| `claimBySignals(options)` | Claim a deferred link by device signals |

### `<TolinkuMessages>`

| Prop | Description |
|------|-------------|
| `trigger` | Filter messages by trigger type |
| `triggerValue` | Match a specific trigger value |
| `onButtonPress` | Callback for button presses |
| `onDismiss` | Callback for message dismissal |

## Documentation

Full documentation is available at [tolinku.com/docs](https://tolinku.com/docs).

## Community

- [GitHub](https://github.com/tolinku)
- [X (Twitter)](https://x.com/trytolinku)
- [Facebook](https://facebook.com/trytolinku)
- [Instagram](https://www.instagram.com/trytolinku/)

## License

MIT
