package com.tolinku.rnsdk;

import androidx.annotation.NonNull;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Registers the install referrer module with React Native's autolinking.
 *
 * <p>Implements {@link ReactPackage} rather than extending {@code
 * BaseReactPackage}, which is what React Native now recommends and why the
 * compiler reports {@code createNativeModules} as deprecated from 0.88.
 * {@code BaseReactPackage} arrived in React Native 0.74, and this package
 * declares a peer range starting at 0.72, so adopting it would drop two
 * versions of support to silence a warning. Deprecated is not removed: under
 * the New Architecture this is carried by the interop layer and works, which
 * the standalone Android build in CI compiles on 0.88 to confirm.
 *
 * <p>When the peer floor next rises above 0.74, extend {@code BaseReactPackage}
 * and implement {@code getModule} plus {@code getReactModuleInfoProvider}
 * instead. Until then this warning is expected and should be left alone.
 */
public class TolinkuInstallReferrerPackage implements ReactPackage {

    @Override
    @NonNull
    public List<NativeModule> createNativeModules(@NonNull ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new TolinkuInstallReferrerModule(reactContext));
        return modules;
    }

    @Override
    @NonNull
    public List<ViewManager> createViewManagers(@NonNull ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}
