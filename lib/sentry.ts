import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const environment =
  process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? (__DEV__ ? 'development' : 'production');
const release = `luminascanapp@${process.env.npm_package_version ?? '1.0.6'}`;

let initialized = false;

export const initSentry = () => {
  if (initialized || !dsn) {
    return;
  }

  Sentry.init({
    dsn,
    enabled: !__DEV__,
    environment,
    release,
    tracesSampleRate: 0.2,
    attachStacktrace: true,
    sendDefaultPii: false,
  });

  initialized = true;
};

export const setSentryUser = (user: { id: string; email?: string | null } | null) => {
  if (!initialized) {
    return;
  }

  if (!user) {
    Sentry.setUser(null);
    return;
  }

  Sentry.setUser({
    id: user.id,
    email: user.email ?? undefined,
  });
};

export const captureSentryException = (error: unknown, context?: string) => {
  if (!initialized) {
    return;
  }

  Sentry.captureException(error, {
    tags: context ? { area: context } : undefined,
  });
};
