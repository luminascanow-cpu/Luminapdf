# Sentry Setup

This app now includes the Sentry SDK and Expo integration hooks.

## 1. Create your Sentry project

Collect these values from Sentry and store them in EAS secrets:

- `EXPO_PUBLIC_SENTRY_DSN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_AUTH_TOKEN`

Official guides:

- https://docs.expo.dev/guides/using-sentry/
- https://docs.sentry.io/platforms/react-native/

## 2. Store values in EAS secrets

Do not commit these values to the repo.

Create these secrets instead:

```bash
eas secret:create --scope project --name EXPO_PUBLIC_SENTRY_DSN --value "your_dsn"
eas secret:create --scope project --name SENTRY_ORG --value "your_org_slug"
eas secret:create --scope project --name SENTRY_PROJECT --value "your_project_slug"
eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value "your_auth_token"
```

The tracked [eas.json](./eas.json) keeps only non-secret defaults:

- `EXPO_PUBLIC_SENTRY_ENVIRONMENT`
- `SENTRY_DISABLE_AUTO_UPLOAD`

## 3. Rebuild native code

Because this uses the Expo config plugin, rebuild after configuration changes:

```bash
npx expo prebuild
```

Then create a new Android build.

## 4. Verify crash reporting

Add a temporary test button or trigger:

```ts
throw new Error('Hello, again, Sentry!');
```

Expo recommends verifying on a release build so source maps are uploaded correctly.

## 5. Enable source map upload later

After DSN-based crash capture is confirmed, you can turn source map upload on by
changing `SENTRY_DISABLE_AUTO_UPLOAD` in [eas.json](./eas.json) from `"true"` to `"false"`
and rebuilding with your EAS secrets present.
