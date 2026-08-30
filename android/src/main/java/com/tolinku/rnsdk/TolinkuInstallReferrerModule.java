package com.tolinku.rnsdk;

import androidx.annotation.NonNull;

import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Reads the Play Install Referrer.
 *
 * A Tolinku link sends an Android visitor to the store with
 * {@code referrer=tolk_token=<token>} attached. Play keeps that string through
 * the install and hands it back on first launch, which names the exact click
 * instead of inferring it from device signals.
 *
 * Only the raw referrer string is returned. Finding our token inside it is done
 * in JavaScript, where it is covered by tests that run on every platform rather
 * than only where an Android toolchain exists.
 */
public class TolinkuInstallReferrerModule extends ReactContextBaseJavaModule {

    public static final String NAME = "TolinkuInstallReferrer";

    public TolinkuInstallReferrerModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    @NonNull
    public String getName() {
        return NAME;
    }

    /**
     * Resolves with the raw referrer string, or null when there is nothing to
     * report.
     *
     * Never rejects. An organic install, a device without Play Services, and a
     * store other than Play are all ordinary outcomes rather than errors, and
     * the caller falls back to signal matching for every one of them. Rejecting
     * would turn a routine absence into an unhandled promise on first launch.
     */
    @ReactMethod
    public void getInstallReferrer(final Promise promise) {
        final InstallReferrerClient client;
        try {
            client = InstallReferrerClient.newBuilder(getReactApplicationContext()).build();
        } catch (Throwable t) {
            promise.resolve(null);
            return;
        }

        // The Play listener can fire more than once on some devices, and
        // resolving a promise twice is an error in React Native.
        final AtomicBoolean settled = new AtomicBoolean(false);

        try {
            client.startConnection(new InstallReferrerStateListener() {
                @Override
                public void onInstallReferrerSetupFinished(int responseCode) {
                    if (!settled.compareAndSet(false, true)) {
                        return;
                    }
                    String referrer = null;
                    try {
                        if (responseCode == InstallReferrerClient.InstallReferrerResponse.OK) {
                            referrer = client.getInstallReferrer().getInstallReferrer();
                        }
                    } catch (Throwable t) {
                        referrer = null;
                    } finally {
                        endQuietly(client);
                    }
                    promise.resolve(referrer);
                }

                @Override
                public void onInstallReferrerServiceDisconnected() {
                    if (!settled.compareAndSet(false, true)) {
                        return;
                    }
                    endQuietly(client);
                    promise.resolve(null);
                }
            });
        } catch (Throwable t) {
            if (settled.compareAndSet(false, true)) {
                endQuietly(client);
                promise.resolve(null);
            }
        }
    }

    private static void endQuietly(InstallReferrerClient client) {
        try {
            client.endConnection();
        } catch (Throwable ignored) {
            // Already gone.
        }
    }
}
