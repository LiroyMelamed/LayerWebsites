# Deep Linking Setup — MelamedLaw

## Overview

This enables URLs from `client.melamedlaw.co.il` to open the MelamedLaw mobile app
(if installed) instead of the browser. If the app is not installed, the browser opens normally.

**Architecture:** The mobile app is a WebView wrapper around the website.
Deep links open the app → the app loads the URL inside its WebView.

---

## 1. Files Created (Web — already done)

### `frontend/public/.well-known/assetlinks.json` (Android)
- Declares that the Android app (`com.melamedia.melamedlaw`) is allowed to handle
  URLs from `client.melamedlaw.co.il`.
- **ACTION REQUIRED:** Replace `__REPLACE_WITH_PRODUCTION_SHA256_FINGERPRINT__` with
  the real SHA-256 fingerprint of your production signing key.

**How to get the fingerprint:**
```bash
# From EAS (production profile):
eas credentials --platform android

# Or from local keystore:
keytool -list -v -keystore your-upload-key.jks | grep SHA256

# Or from Play Console:
# Google Play Console → App → Setup → App signing → App signing key certificate → SHA-256
```

The fingerprint looks like: `AB:CD:EF:12:34:...` (32 hex pairs separated by colons).

### `frontend/public/.well-known/apple-app-site-association` (iOS)
- Declares which URL paths the iOS app can handle.
- **ACTION REQUIRED:** Replace `__TEAMID__` with your Apple Developer Team ID
  (found at https://developer.apple.com/account → Membership → Team ID).

### `frontend/public/.htaccess`
- Updated to serve `apple-app-site-association` with `Content-Type: application/json`
  (Apple requires this; the file has no `.json` extension).

---

## 2. Mobile App Changes Required (LawyerApp)

### Step A: Update `app.json`

Add the highlighted sections to `LawyerApp/app.json`:

```json
{
  "expo": {
    "scheme": "melamedlaw",
    "ios": {
      "associatedDomains": [
        "applinks:client.melamedlaw.co.il"
      ]
    },
    "android": {
      "intentFilters": [
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [
            {
              "scheme": "https",
              "host": "client.melamedlaw.co.il"
            }
          ],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    }
  }
}
```

**Merge into your existing `app.json`** — add `"scheme"` at the top level of `"expo"`,
add `"associatedDomains"` inside the existing `"ios"` block,
and add `"intentFilters"` inside the existing `"android"` block.

### Step B: Update `App.js` — Handle Deep Links

The key challenge is **authentication**. When a deep link opens the app:
- The user may not be logged in yet (cold start)
- `loginInfo` is in-memory state that starts empty
- The biometric auto-login on `LoginScreen` restores the session
- Only after login does the app navigate to `MainLayout` → `HomeScreen`

**Solution:** Save the deep link URL globally. The normal login flow runs first
(biometric auto-login or manual OTP). After login, `HomeScreen` picks up the
saved URL and loads it in the WebView instead of the default URL.

```javascript
import * as Linking from 'expo-linking';

// ── Global deep link storage (outside component) ──────────────────
let _pendingDeepLink = null;

/** Call once on app boot to capture the URL that launched the app. */
async function capturePendingDeepLink() {
  try {
    const url = await Linking.getInitialURL();
    if (url) {
      const parsed = new URL(url);
      if (parsed.host === 'client.melamedlaw.co.il') {
        _pendingDeepLink = url;
      }
    }
  } catch {}
}

/** Read & clear the pending deep link (called by HomeScreen after login). */
export function consumePendingDeepLink() {
  const url = _pendingDeepLink;
  _pendingDeepLink = null;
  return url;
}

export default function App() {
  const [isAppReady, setIsAppReady] = useState(false);

  // Capture deep link URL as early as possible (before login flow).
  useEffect(() => { capturePendingDeepLink(); }, []);

  if (!isAppReady) {
    return <AppLoadingScreen onFinish={() => setIsAppReady(true)} />;
  }

  return (
    <ActionSheetProvider>
      <PopupProvider>
        <RegisterFieldsProvider>
          <LoginVerifyOtpCodeFieldsProvider>
            <PushTokenRegistrar />
            <NavigationContainer>
              <Stack.Navigator initialRouteName="LoginScreen" screenOptions={{ headerShown: false }}>
                {/* Same screens as before — no changes needed here.
                    Login flow runs normally: LoginScreen → OTP → MainLayout.
                    Deep link URL is consumed by HomeScreen after auth completes. */}
                <Stack.Screen name="LoginScreen" component={LoginScreen} />
                <Stack.Screen name="LoginOtpScreen" component={LoginOtpScreen} />
                <Stack.Screen name="RegisterScreen" component={RegisterScreen} />
                <Stack.Screen name="RegisterOtpScreen" component={RegisterOtpScreen} />
                <Stack.Screen name="MainLayout" component={MainLayout} />
              </Stack.Navigator>
            </NavigationContainer>
          </LoginVerifyOtpCodeFieldsProvider>
        </RegisterFieldsProvider>
      </PopupProvider>
    </ActionSheetProvider>
  );
}
```

**Why not use `NavigationContainer linking`?** Because deep links would try to
navigate directly to `MainLayout` — bypassing login. The user must authenticate
first. Our approach captures the URL early, lets login run normally, then
HomeScreen consumes the URL after the token is available.

### Step C: Update `HomeScreen.js` — Consume Deep Link After Login

HomeScreen already opens `client.melamedlaw.co.il` in its WebView and injects
the auth token. The only change: check for a pending deep link URL and use it
instead of the default URL.

```javascript
import * as Linking from 'expo-linking';
import { consumePendingDeepLink } from '../../App';  // adjust path as needed

const HomeScreen = ({ webviewRef, onNavigationStateChange }) => {
    const navigation = useNavigation();
    const { loginInfo, setLoginInfo } = useLoginVerifyOtpCodeFieldsProvider();

    const baseHost = "client.melamedlaw.co.il";

    // On mount: use deep link URL if available, otherwise default.
    // At this point the user is already authenticated (loginInfo has token).
    const [webSiteUrl] = useState(() => {
        const deepLink = consumePendingDeepLink();
        if (deepLink) {
            // Append fromApp=true so the website knows it's inside the app.
            try {
                const parsed = new URL(deepLink);
                parsed.searchParams.set('fromApp', 'true');
                return parsed.toString();
            } catch {
                return deepLink;
            }
        }
        return `https://${baseHost}?fromApp=true`;
    });

    // Listen for deep links while app is already open (warm start).
    useEffect(() => {
        const sub = Linking.addEventListener('url', ({ url }) => {
            try {
                const parsed = new URL(url);
                if (parsed.host === baseHost && webviewRef.current) {
                    // Append fromApp flag
                    parsed.searchParams.set('fromApp', 'true');
                    webviewRef.current.injectJavaScript(
                        `window.location.href = ${JSON.stringify(parsed.toString())}; true;`
                    );
                }
            } catch {}
        });
        return () => sub.remove();
    }, []);

    // ... rest of existing component (auth injection, WebView, etc.)
    // Change: use the computed webSiteUrl in <WebView source={{ uri: webSiteUrl }} />
};
```

**Flow summary:**
1. User taps `https://client.melamedlaw.co.il/case/123` in an SMS
2. Android/iOS intercepts → opens the app (cold start or warm)
3. **Cold start:** `App.js` captures URL → LoginScreen renders → biometric
   auto-login → navigates to MainLayout → HomeScreen reads pending URL →
   injects token into WebView localStorage → loads `/case/123?fromApp=true`
4. **Warm start (app already open):** Linking `url` event fires →
   HomeScreen's listener injects `window.location.href` into the WebView
5. **Not logged in:** LoginScreen shows → user enters phone → OTP →
   after verify → MainLayout → HomeScreen picks up the deep link URL
6. **App not installed:** Browser opens the URL normally (website fallback)

---

## 3. Build & Deploy Steps

### Order of operations (critical):
1. Deploy the `.well-known` files to `client.melamedlaw.co.il` FIRST
2. Wait for Google/Apple to verify them (Android: immediate if autoVerify;
   iOS: within ~24h after file is live)
3. Then submit the new app build with `associatedDomains` / `intentFilters`

### Build commands:
```bash
cd LawyerApp

# Rebuild native projects (required — associatedDomains/intentFilters are native configs)
npx expo prebuild --clean

# Build for testing
eas build --platform android --profile preview
eas build --platform ios --profile preview

# Build for production
eas build --platform android --profile production
eas build --platform ios --profile production
```

**Important:** Deep linking requires a **new native build**. OTA updates (EAS Update) cannot
add `associatedDomains` or `intentFilters` — they are native-level changes.

---

## 4. Test Plan

### 4A. Verify `.well-known` files are served correctly

```bash
# Android Digital Asset Links
curl -I https://client.melamedlaw.co.il/.well-known/assetlinks.json
# Expected: HTTP 200, Content-Type: application/json

curl https://client.melamedlaw.co.il/.well-known/assetlinks.json
# Expected: JSON array with your package_name and sha256_cert_fingerprints

# iOS App Site Association
curl -I https://client.melamedlaw.co.il/.well-known/apple-app-site-association
# Expected: HTTP 200, Content-Type: application/json

curl https://client.melamedlaw.co.il/.well-known/apple-app-site-association
# Expected: JSON object with applinks

# CRITICAL: No redirects!
curl -v https://client.melamedlaw.co.il/.well-known/apple-app-site-association 2>&1 | grep -i "< HTTP"
# Should show "HTTP/2 200" or "HTTP/1.1 200" — NOT 301/302
```

### 4B. Android — Test on device

```bash
# 1. Install the test build
adb install app-preview.apk

# 2. Check Android App Links verification status
adb shell pm get-app-links com.melamedia.melamedlaw
# Expected: "VERIFIED" for client.melamedlaw.co.il

# 3. If not verified, re-verify manually:
adb shell pm verify-app-links --re-verify com.melamedia.melamedlaw

# 4. Test deep link from command line:
adb shell am start -a android.intent.action.VIEW \
  -d "https://client.melamedlaw.co.il" \
  com.melamedia.melamedlaw

# Expected: App opens (not browser)

# 5. Test with a path:
adb shell am start -a android.intent.action.VIEW \
  -d "https://client.melamedlaw.co.il/case/123" \
  com.melamedia.melamedlaw

# Expected: App opens, WebView loads the case page
```

### 4C. iOS — Test on device

```bash
# 1. Install the test build via TestFlight or Xcode

# 2. In Safari, open https://client.melamedlaw.co.il
#    Long-press → should show "Open in MelamedLaw" banner

# 3. In Notes app, paste https://client.melamedlaw.co.il/case/123
#    Tap → should open MelamedLaw app

# 4. Validate AASA file:
#    https://app-site-association.cdn-apple.com/a/v1/client.melamedlaw.co.il
#    (Apple's CDN — may take 24-48h after deploying the file)
```

### 4D. SMS End-to-End Test
1. Trigger a case creation for a test user
2. User receives SMS with `https://client.melamedlaw.co.il` link
3. With app installed → tapping link opens the app
4. Without app installed → tapping link opens browser → website loads normally

---

## 5. Hosting Requirements

| Requirement | Status |
|---|---|
| `.well-known` files at root of `client.melamedlaw.co.il` | ✅ In `frontend/public/` — deployed with build |
| `Content-Type: application/json` | ✅ `.htaccess` updated |
| HTTPS (required by both Apple and Google) | ✅ Already HTTPS |
| No redirects on `.well-known` paths | ✅ `.htaccess` serves files directly before SPA fallback |
| No authentication on `.well-known` paths | ✅ Static files, no auth |

---

## 6. Placeholders to fill before deploy

| Placeholder | Where | How to get |
|---|---|---|
| `__REPLACE_WITH_PRODUCTION_SHA256_FINGERPRINT__` | `assetlinks.json` | `eas credentials --platform android` or Google Play Console |
| `__TEAMID__` | `apple-app-site-association` | Apple Developer Portal → Account → Membership → Team ID |

---

## 7. Caching Considerations

- `.well-known` files should **not** be aggressively cached by CDN/proxy.
  Recommended `Cache-Control: max-age=3600` (1 hour).
- If you change the fingerprint or Team ID, purge the CDN cache.
- Apple caches AASA files aggressively on their CDN (~24h). Changes take time to propagate.
- Android verifies `assetlinks.json` at install time. Users who already have the app
  installed may need to clear app defaults or reinstall for re-verification.
