const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const Razorpay = require('razorpay');

const root = __dirname;
const envCandidates = [
  path.join(root, '..', '.env'),
  path.join(root, '..', '.env.local'),
  path.join(root, '.env'),
];

try {
  const dotenv = require('dotenv');
  envCandidates.forEach((envPath) => {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath, override: false });
    }
  });
} catch (error) {
  console.warn('[env] dotenv could not be loaded:', error?.message || error);
}

const port = Number(process.env.PORT || 4173);
const pythonExec =
  process.env.LUMINA_PYTHON ||
  '/Users/dipanudas/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const pdfSelectionScript = path.join(root, 'pdf_selection.py');
const pdfSessions = new Map();
const authSessions = new Map();
// ---------------------------------------------------------------------------
// Supabase subscription helpers (persistent, survives server restarts)
// ---------------------------------------------------------------------------
const getSupabaseServiceKey = () =>
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  '';

/**
 * Write a lifetime subscription record to Supabase.
 * Uses the service-role key (or anon key as fallback) so RLS is bypassed.
 */
const saveSubscriptionToSupabase = async ({ userId, paymentId, orderId }) => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const serviceKey = getSupabaseServiceKey();
  if (!supabaseUrl || !serviceKey) {
    console.warn('[Subscription] Supabase credentials missing – cannot persist subscription.');
    return;
  }
  const body = JSON.stringify({
    user_id: userId,
    razorpay_payment_id: paymentId,
    razorpay_order_id: orderId || null,
    plan: 'lifetime',
    status: 'active',
  });
  const response = await fetch(
    `${supabaseUrl}/rest/v1/lumina_subscriptions`,
    {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body,
    }
  );
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Supabase subscription insert failed (${response.status}): ${text}`);
  }
  console.log(`[Subscription] Saved lifetime subscription for user ${userId}`);
};

/**
 * Check if a user has an active lifetime subscription in Supabase.
 * Returns true/false.
 */
const checkSubscriptionInSupabase = async (userId) => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const serviceKey = getSupabaseServiceKey();
  if (!supabaseUrl || !serviceKey || !userId) return false;
  const response = await fetch(
    `${supabaseUrl}/rest/v1/lumina_subscriptions?user_id=eq.${encodeURIComponent(userId)}&plan=eq.lifetime&status=eq.active&select=id&limit=1`,
    {
      method: 'GET',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
    }
  );
  if (!response.ok) return false;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
};

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

const sendJson = (res, status, payload, extraHeaders = {}) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
};

const sendHtml = (res, status, html, extraHeaders = {}) => {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    ...extraHeaders,
  });
  res.end(html);
};

const isAjaxRequest = (req) =>
  (req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest' ||
  String(req.headers.accept || '').includes('application/json');

const parseCookies = (req) => {
  const raw = String(req.headers.cookie || '');
  return raw.split(';').reduce((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('=') || '');
    return acc;
  }, {});
};

const buildCookie = (name, value, options = {}) => {
  const segments = [`${name}=${encodeURIComponent(value)}`];
  segments.push(`Path=${options.path || '/'}`);
  if (options.httpOnly !== false) segments.push('HttpOnly');
  if (options.sameSite) segments.push(`SameSite=${options.sameSite}`);
  if (options.maxAge !== undefined) segments.push(`Max-Age=${options.maxAge}`);
  if (options.secure) segments.push('Secure');
  return segments.join('; ');
};

const getRequestOrigin = (req) => {
  const protocolHeader = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = protocolHeader || (req.socket.encrypted ? 'https' : 'http');
  const host = req.headers.host || `localhost:${port}`;
  return `${protocol}://${host}`;
};

const getPublicWebsiteOrigin = (req) => {
  const requestOrigin = getRequestOrigin(req);
  const requestHost = String(req.headers.host || '').toLowerCase();
  const isLocalRequest =
    requestHost.includes('localhost') ||
    requestHost.startsWith('127.0.0.1') ||
    requestHost.startsWith('[::1]');

  if (isLocalRequest) {
    return requestOrigin;
  }

  const configuredOrigin =
    process.env.WEBSITE_PUBLIC_URL ||
    process.env.LUMINA_WEBSITE_URL ||
    process.env.PUBLIC_SITE_URL ||
    '';

  if (configuredOrigin) {
    return configuredOrigin.replace(/\/+$/, '');
  }

  return requestOrigin;
};

const createAuthSession = (authData = {}) => {
  const sessionId = crypto.randomUUID();
  const user = authData.user || {};
  authSessions.set(sessionId, {
    accessToken: authData.access_token || '',
    refreshToken: authData.refresh_token || '',
    expiresAt: authData.expires_at || null,
    email: user.email || '',
    userId: user.id || '',
    fullName: user.user_metadata?.full_name || '',
    createdAt: Date.now(),
  });
  return sessionId;
};

const getAuthSession = (req) => {
  const cookies = parseCookies(req);
  const sessionId = cookies.lumina_auth_session;
  if (!sessionId) return null;
  return authSessions.get(sessionId) || null;
};

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });

const readTextBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

const readFormBody = async (req) => {
  const body = await readTextBody(req);
  const params = new URLSearchParams(body);
  return Object.fromEntries(params.entries());
};

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderAuthResultPage = ({ title, message, success, actionHref, actionLabel }) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)} | Lumina Scan</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body class="auth-body">
    <header class="site-header">
      <div class="shell">
        <nav class="nav">
          <a class="brand" href="./index.html">
            <img class="brand-mark" src="./app-logo.png" alt="Lumina Scan logo" />
            <div class="brand-copy">
              <strong>Lumina Scan</strong>
              <span>${success ? 'Authentication complete' : 'Authentication issue'}</span>
            </div>
          </a>
          <div class="nav-links">
            <a href="./index.html">Home</a>
            <a href="./login.html">Sign In</a>
            <a href="./pdf-editor.html">PDF Editor</a>
          </div>
        </nav>
      </div>
    </header>

    <main class="shell auth-page">
      <section class="auth-grid" style="grid-template-columns: 1fr; max-width: 840px; margin: 0 auto;">
        <article class="auth-form-card" style="padding: 34px;">
          <div class="eyebrow">${success ? 'Website Connected' : 'Authentication Error'}</div>
          <h1 style="margin: 18px 0 12px;">${escapeHtml(title)}</h1>
          <p style="margin: 0 0 18px; color: var(--muted); line-height: 1.8;">
            ${success ? 'Your website authentication request completed successfully.' : 'The website could not complete that sign-in request. You can go back and try again right away.'}
          </p>
          <div class="auth-message ${success ? 'is-success' : 'is-error'}" style="display:block; margin-top: 0;">
            ${escapeHtml(message)}
          </div>
          <div class="editor-inline-actions" style="margin-top: 24px; flex-wrap: wrap;">
            <a class="button button-primary" href="${escapeHtml(actionHref)}">${escapeHtml(actionLabel)}</a>
            <a class="button button-secondary" href="./login.html">Back To Login</a>
            <a class="button button-ghost" href="./index.html">Back Home</a>
          </div>
        </article>
      </section>
    </main>
  </body>
</html>`;

const requestSupabaseAuth = async (pathname, payload) => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Authentication credentials are missing on the website server.');
  }

  const response = await fetch(`${supabaseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.msg || data?.error_description || data?.error || 'Authentication failed.');
  }

  return data;
};

const requestSupabaseJson = async (pathname, payload) => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Authentication credentials are missing on the website server.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let response;

  try {
    response = await fetch(`${supabaseUrl}${pathname}`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Password reset timed out. Please try again.');
    }
    throw new Error('Could not complete the password reset request. Please try again.');
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.msg || data?.error_description || data?.error || 'Authentication request failed.');
  }

  return data;
};

const ensureSessionDir = () => {
  const dir = path.join(os.tmpdir(), 'lumina-scan-pdf-sessions');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const runPdfSelection = (pdfPath, pageIndex, rect) =>
  new Promise((resolve, reject) => {
    const child = spawn(pythonExec, [pdfSelectionScript, pdfPath, String(pageIndex), JSON.stringify(rect)]);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `PyMuPDF selection exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout || '{}'));
      } catch (error) {
        reject(error);
      }
    });
  });

const resolveFile = (requestUrl) => {
  const cleanUrl = decodeURIComponent(requestUrl.split('?')[0]);
  const requested = cleanUrl === '/' ? '/index.html' : cleanUrl;
  const normalized = path.normalize(path.join(root, requested));

  if (!normalized.startsWith(root)) {
    return null;
  }

  if (fs.existsSync(normalized) && fs.statSync(normalized).isFile()) {
    return normalized;
  }

  return null;
};

const server = http.createServer((req, res) => {
  const cleanUrl = decodeURIComponent((req.url || '/').split('?')[0]);
  const noCacheHeaders = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store',
  };

  if (cleanUrl === '/app-config.js') {
    const config = {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || '',
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
    };

    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      ...noCacheHeaders,
    });
    res.end(`window.__LUMINA_CONFIG__ = ${JSON.stringify(config)};`);
    return;
  }

  if (req.method === 'POST' && cleanUrl === '/api/pdf-session') {
    readJsonBody(req)
      .then((body) => {
        const bytesBase64 = body?.bytesBase64;
        if (!bytesBase64) {
          sendJson(res, 400, { error: 'Missing PDF bytes.' }, noCacheHeaders);
          return;
        }

        const sessionId = crypto.randomUUID();
        const sessionDir = ensureSessionDir();
        const filePath = path.join(sessionDir, `${sessionId}.pdf`);
        fs.writeFileSync(filePath, Buffer.from(bytesBase64, 'base64'));
        pdfSessions.set(sessionId, {
          path: filePath,
          fileName: body?.fileName || 'document.pdf',
          createdAt: Date.now(),
        });
        sendJson(res, 200, { sessionId }, noCacheHeaders);
      })
      .catch((error) => {
        sendJson(res, 500, { error: error.message || 'Could not create PDF session.' }, noCacheHeaders);
      });
    return;
  }

  if (req.method === 'GET' && cleanUrl.startsWith('/api/pdf-session/')) {
    const sessionId = cleanUrl.slice('/api/pdf-session/'.length);
    const session = pdfSessions.get(sessionId);

    if (!session) {
      sendJson(res, 404, { error: 'PDF session not found.' }, noCacheHeaders);
      return;
    }

    try {
      const bytes = fs.readFileSync(session.path);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': bytes.length,
        'X-Lumina-File-Name': encodeURIComponent(session.fileName || 'document.pdf'),
        ...noCacheHeaders,
      });
      res.end(bytes);
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Could not read PDF session.' }, noCacheHeaders);
    }
    return;
  }

  if (req.method === 'POST' && cleanUrl === '/api/pdf-selection') {
    readJsonBody(req)
      .then(async (body) => {
        const session = pdfSessions.get(body?.sessionId);
        if (!session) {
          sendJson(res, 404, { error: 'PDF session not found.' }, noCacheHeaders);
          return;
        }
        const pageIndex = Number(body?.pageIndex);
        const rect = body?.rect;
        if (!Number.isFinite(pageIndex) || !rect) {
          sendJson(res, 400, { error: 'Missing page index or selection rectangle.' }, noCacheHeaders);
          return;
        }
        const result = await runPdfSelection(session.path, pageIndex, rect);
        sendJson(res, 200, result, noCacheHeaders);
      })
      .catch((error) => {
        sendJson(res, 500, { error: error.message || 'Could not analyze PDF selection.' }, noCacheHeaders);
      });
    return;
  }

  if (req.method === 'POST' && cleanUrl === '/auth/sign-in') {
    readFormBody(req)
      .then(async (body) => {
        const email = String(body?.email || '').trim().toLowerCase();
        const password = String(body?.password || '').trim();

        if (!email || !password) {
          if (isAjaxRequest(req)) {
            sendJson(res, 400, { success: false, message: 'Enter your email and password to continue.' }, noCacheHeaders);
            return;
          }
          sendHtml(
            res,
            400,
            renderAuthResultPage({
              title: 'Missing Details',
              message: 'Enter your email and password to continue.',
              success: false,
              actionHref: './login.html',
              actionLabel: 'Back to Sign In',
            }),
            noCacheHeaders
          );
          return;
        }

        const authData = await requestSupabaseAuth('/auth/v1/token?grant_type=password', { email, password });
        const sessionId = createAuthSession(authData);
        const cookie = buildCookie('lumina_auth_session', sessionId, {
          path: '/',
          httpOnly: true,
          sameSite: 'Lax',
          maxAge: 60 * 60 * 24 * 7,
          secure: getRequestOrigin(req).startsWith('https://'),
        });
        if (isAjaxRequest(req)) {
          sendJson(
            res,
            200,
            {
              success: true,
              message: `Signed in successfully as ${email}.`,
              redirect: './my-account.html',
            },
            { ...noCacheHeaders, 'Set-Cookie': cookie }
          );
          return;
        }
        res.writeHead(302, {
          Location: './my-account.html?auth=signin-success',
          'Set-Cookie': cookie,
          ...noCacheHeaders,
        });
        res.end();
      })
      .catch((error) => {
        if (isAjaxRequest(req)) {
          sendJson(
            res,
            400,
            {
              success: false,
              message: error.message || 'We could not sign you in.',
            },
            noCacheHeaders
          );
          return;
        }
        sendHtml(
          res,
          400,
          renderAuthResultPage({
            title: 'Sign In Failed',
            message: error.message || 'We could not sign you in.',
            success: false,
            actionHref: './login.html',
            actionLabel: 'Try Again',
          }),
          noCacheHeaders
        );
      });
    return;
  }

  if (req.method === 'POST' && cleanUrl === '/auth/sign-up') {
    readFormBody(req)
      .then(async (body) => {
        const fullName = String(body?.full_name || '').trim();
        const email = String(body?.email || '').trim().toLowerCase();
        const password = String(body?.password || '').trim();

        if (!fullName || !email || !password) {
          if (isAjaxRequest(req)) {
            sendJson(
              res,
              400,
              { success: false, message: 'Enter your full name, email, and password to create your account.' },
              noCacheHeaders
            );
            return;
          }
          sendHtml(
            res,
            400,
            renderAuthResultPage({
              title: 'Missing Details',
              message: 'Enter your full name, email, and password to create your account.',
              success: false,
              actionHref: './signup.html',
              actionLabel: 'Back to Sign Up',
            }),
            noCacheHeaders
          );
          return;
        }

        const signUpData = await requestSupabaseAuth('/auth/v1/signup', {
          email,
          password,
          data: {
            full_name: fullName,
          },
        });

        if (isAjaxRequest(req)) {
          if (signUpData?.access_token && signUpData?.user) {
            const sessionId = createAuthSession(signUpData);
            const cookie = buildCookie('lumina_auth_session', sessionId, {
              path: '/',
              httpOnly: true,
              sameSite: 'Lax',
              maxAge: 60 * 60 * 24 * 7,
              secure: getRequestOrigin(req).startsWith('https://'),
            });
            sendJson(
              res,
              200,
              {
                success: true,
                message: `Account created successfully for ${email}.`,
                redirect: './index.html',
              },
              { ...noCacheHeaders, 'Set-Cookie': cookie }
            );
            return;
          }
          sendJson(
            res,
            200,
            {
              success: true,
              message: `Account created successfully for ${email}.`,
              redirect: './login.html',
            },
            noCacheHeaders
          );
          return;
        }

        res.writeHead(302, {
          Location: './login.html?auth=signup-success',
          ...noCacheHeaders,
        });
        res.end();
      })
      .catch((error) => {
        if (isAjaxRequest(req)) {
          sendJson(
            res,
            400,
            {
              success: false,
              message: error.message || 'We could not create your account.',
            },
            noCacheHeaders
          );
          return;
        }
        sendHtml(
          res,
          400,
          renderAuthResultPage({
            title: 'Sign Up Failed',
            message: error.message || 'We could not create your account.',
            success: false,
            actionHref: './signup.html',
            actionLabel: 'Try Again',
          }),
          noCacheHeaders
        );
      });
    return;
  }

  if (req.method === 'POST' && cleanUrl === '/auth/forgot-password') {
    readFormBody(req)
      .then(async (body) => {
        const email = String(body?.email || '').trim().toLowerCase();
        if (!email) {
          sendJson(res, 400, { success: false, message: 'Enter your email address first.' }, noCacheHeaders);
          return;
        }

        console.log(`[AUTH] Forgot password request for: ${email}`);
        try {
          const redirectOrigin = getPublicWebsiteOrigin(req);
          const redirectUrl = `${redirectOrigin}/reset-password.html`;
          console.log(`[AUTH] Contacting Supabase recover for ${email}...`);
          const result = await requestSupabaseJson('/auth/v1/recover', {
            email,
            redirect_to: redirectUrl,
          });
          console.log(`[AUTH] Supabase recover success for ${email}, redirecting to ${redirectUrl}`);
          console.log(`[AUTH] Supabase recover success:`, JSON.stringify(result));

          sendJson(
            res,
            200,
            { success: true, message: `Password reset email sent to ${email}.` },
            noCacheHeaders
          );
        } catch (error) {
          console.error(`[AUTH] Supabase recover error:`, error.message);
          sendJson(
            res,
            400,
            { success: false, message: error.message || 'We could not send the password reset email.' },
            noCacheHeaders
          );
        }
      })
      .catch((error) => {
        sendJson(
          res,
          400,
          { success: false, message: error.message || 'We could not send the password reset email.' },
          noCacheHeaders
        );
      });
    return;
  }

  if (req.method === 'POST' && cleanUrl === '/auth/sign-out') {
    const cookies = parseCookies(req);
    if (cookies.lumina_auth_session) {
      authSessions.delete(cookies.lumina_auth_session);
    }
    sendJson(
      res,
      200,
      { success: true, message: 'Signed out successfully.' },
      {
        ...noCacheHeaders,
        'Set-Cookie': buildCookie('lumina_auth_session', '', {
          path: '/',
          httpOnly: true,
          sameSite: 'Lax',
          maxAge: 0,
          secure: getRequestOrigin(req).startsWith('https://'),
        }),
      }
    );
    return;
  }

  if (req.method === 'POST' && cleanUrl === '/api/create-payment-order') {
    readJsonBody(req)
      .then(async (body) => {
        const key_id = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID;
        const key_secret = process.env.RAZORPAY_KEY_SECRET;

        if (!key_id || !key_secret) {
           sendJson(res, 500, { error: 'Razorpay credentials not configured.' }, noCacheHeaders);
           return;
        }

        const razorpay = new Razorpay({
          key_id: key_id,
          key_secret: key_secret,
        });

        // INR 99 = 9900 paise (one-time lifetime payment)
        const options = {
          amount: 9900,
          currency: 'INR',
          receipt: `receipt_${crypto.randomUUID().split('-')[0]}`
        };

        const order = await razorpay.orders.create(options);
        
        sendJson(res, 200, {
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          key: key_id
        }, noCacheHeaders);
      })
      .catch((error) => {
        console.error('[Razorpay] Order creation error:', error);
        sendJson(res, 500, { error: error.message || 'Could not create payment order.' }, noCacheHeaders);
      });
    return;
  }

  if (req.method === 'POST' && cleanUrl === '/api/confirm-payment') {
    readJsonBody(req)
      .then(async (body) => {
        const { paymentId, orderId, signature, userId } = body;
        if (!paymentId || !signature) {
          sendJson(res, 400, { error: 'Missing payment information.' }, noCacheHeaders);
          return;
        }

        // Verify Razorpay signature
        const key_secret = process.env.RAZORPAY_KEY_SECRET;
        if (key_secret) {
          const hmac = crypto.createHmac('sha256', key_secret);
          hmac.update(orderId + "|" + paymentId);
          const generated_signature = hmac.digest('hex');
          if (generated_signature !== signature) {
            console.error('[Payment] Signature verification failed');
            sendJson(res, 400, { error: 'Invalid payment signature.' }, noCacheHeaders);
            return;
          }
        } else {
          console.warn('[Payment] RAZORPAY_KEY_SECRET missing; skipping signature verification.');
        }

        // Resolve the user ID from session or request body
        const session = getAuthSession(req);
        const resolvedUserId = session?.userId || userId;
        if (!resolvedUserId) {
          sendJson(res, 400, { error: 'User must be logged in to activate lifetime access.' }, noCacheHeaders);
          return;
        }
        // Persist to Supabase (durable across server restarts)
        await saveSubscriptionToSupabase({ userId: resolvedUserId, paymentId, orderId });
        console.log(`[Payment] Lifetime access granted to user: ${resolvedUserId}`);
        sendJson(res, 200, { success: true, lifetimeAccess: true }, noCacheHeaders);
      })
      .catch((error) => {
        console.error('[Payment] confirm-payment error:', error.message);
        sendJson(res, 500, { error: error.message }, noCacheHeaders);
      });
    return;
  }

  if (req.method === 'GET' && cleanUrl === '/api/check-payment-status') {
    const session = getAuthSession(req);
    const userId = session?.userId || null;
    // Query Supabase for a persisted subscription record
    checkSubscriptionInSupabase(userId)
      .then((hasPaid) => {
        sendJson(res, 200, { hasPaid }, noCacheHeaders);
      })
      .catch(() => {
        // On error, default to not paid so user is asked to pay again
        sendJson(res, 200, { hasPaid: false }, noCacheHeaders);
      });
    return;
  }

  if (req.method === 'GET' && cleanUrl === '/api/auth-session') {
    const session = getAuthSession(req);
    sendJson(
      res,
      200,
      {
        authenticated: !!session,
        user: session
          ? {
              email: session.email,
              fullName: session.fullName,
              userId: session.userId,
            }
          : null,
      },
      noCacheHeaders
    );
    return;
  }

  const filePath = resolveFile(req.url || '/');
  if (filePath === 'REDIRECT:./login.html') {
    res.writeHead(302, { Location: './login.html' });
    res.end();
    return;
  }
  if (!filePath) {
    sendHtml(res, 404, '<h1>404 Not Found</h1>');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = contentTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Server error');
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      ...noCacheHeaders,
    });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`Lumina Scan website running at http://localhost:${port}`);
});
