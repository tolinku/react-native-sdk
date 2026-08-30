# Changelog

## 0.4.0

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
