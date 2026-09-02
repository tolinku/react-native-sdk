## 0.4.1

### Fixed

- An in-app message button now has its URL checked before `onButtonPress` is
  called, not only before the SDK opens the URL itself. The URL comes from
  message content, and a handler is ordinary app code that will reasonably pass
  it to `Linking.openURL` without looking, so the check belonged before both
  paths. The Android and Flutter SDKs validate in the same place. Only `http`
  and `https` are passed on; anything else is blocked and logged in debug mode.

  If you relied on receiving a custom scheme such as `myapp://` through
  `onButtonPress`, it no longer arrives. Say so and we will add a way to allow
  your own scheme rather than leaving every scheme open.

- `isSafeUrl`, `validateBaseUrl` and `validateEventType` now have tests. They had
  none, despite guarding every image, background and button URL in a message.

# Changelog

## 0.4.0

### Added

- `Tolinku.configure()` initialises the SDK. The name the Android, iOS and
  Flutter SDKs use. `Tolinku.init()` does the same thing and still works; it is
  what this package shipped and breaking it would serve nobody. It is meant for
  deprecation later, once moving off it is a one-line change rather than a
  surprise.

  Teardown needed nothing here: this SDK already called it `destroy()`, which is
  now the name on all five.

### Added

- `claimDeferredLink()` recovers the link that led to an install, asking the Play
  Install Referrer first and falling back to device signal matching. Call it once
  on first launch instead of choosing between `claimByToken` and `claimBySignals`
  yourself.
- The Play Install Referrer is read by this package directly, so nothing extra
  needs installing. Android links already carried a referrer token to the store
  and nothing read it back, which left every install matched only by device
  signals: probabilistic, and expiring two hours after the click.

  Autolinking is per-platform, so an iOS-only app never builds it, and
  `NativeModules` is read lazily so its absence in Expo Go degrades to signal
  matching rather than crashing.

- `claimDeferredLink()` runs once per install and remembers it, so calling it on
  every launch costs nothing after the first. A dropped request is not counted as
  an answer, so a first launch without a connection retries rather than spending
  the install's one chance at attribution.

- Token claims now name their Appspace. It narrows what a token may claim, never
  widens it, and it is what lets a failed claim be counted: the default host
  resolves to no Appspace, so a miss previously belonged to nobody and the
  reported referrer match rate would have read 100% regardless.

### Fixed

- `Tolinku.VERSION` and the `User-Agent` reported 0.1.0 through two releases.
  A test now fails if the constant drifts from the published version.

## 0.3.0

### Fixed

- **Deferred deep link signal matching.** The signals sent for `claimBySignals` did not
  match the values recorded by the landing page, so some of them could never contribute
  to a match. See the per-SDK notes below.
- `claimBySignals` no longer reports a configuration error as a plain "no match". A `403`
  (wrong `appspaceId`) is now surfaced with an explanation instead of being swallowed.

  Note `appspaceId` is your Appspace ID, copied from the dashboard under Settings. It is
  not your subdomain or slug. Sending the slug was the cause of the report behind this
  release, and now produces an explicit error rather than a silent null.
- The language signal defaulted to a bare `en` rather than the device locale, so it
  rarely matched. Now derives the full locale tag from `Intl` when not supplied.
- Matching now also compares device pixel ratio and OS version, and reports them
  automatically where the platform exposes them.
