const config = window.__LUMINA_CONFIG__ || {};
const authMessage = document.getElementById('auth-message');
const configWarning = document.getElementById('auth-config-warning');
const authAccountCard = document.getElementById('auth-account-card');
const authAccountEmail = document.getElementById('auth-account-email');
const authAccountName = document.getElementById('auth-account-name');
const signOutButton = document.getElementById('auth-sign-out');
const modeSignIn = document.getElementById('mode-sign-in');
const modeSignUp = document.getElementById('mode-sign-up');
const fullNameField = document.getElementById('full-name-field');
const fullNameInput = document.getElementById('auth-full-name');
const emailInput = document.getElementById('auth-email');
const passwordInput = document.getElementById('auth-password');
const submitButton = document.getElementById('auth-submit');
const forgotPasswordButton = document.getElementById('auth-forgot-password');
const authForm = document.getElementById('auth-form');
const authFields = Array.from(document.querySelectorAll('.auth-field'));
const newPasswordField = document.getElementById('new-password-field');
const newPasswordInput = document.getElementById('auth-new-password');
const authPageParams = new URLSearchParams(window.location.search);

let authMode = 'sign-in';
// Detect if we are in recovery mode (Supabase adds token to hash, but we check query for 'reset' too)
if (window.location.hash.includes('type=recovery') || authPageParams.get('auth') === 'reset-password') {
  authMode = 'update-password';
}

let supabase = null;
const memoryStorage = new Map();
let isSubmittingAuth = false;

const createSafeBrowserStorage = () => {
  const hasLocalStorage = (() => {
    try {
      const testKey = '__lumina_auth_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch (error) {
      return false;
    }
  })();

  if (hasLocalStorage) {
    return window.localStorage;
  }

  return {
    getItem(key) {
      return memoryStorage.has(key) ? memoryStorage.get(key) : null;
    },
    setItem(key, value) {
      memoryStorage.set(key, String(value));
    },
    removeItem(key) {
      memoryStorage.delete(key);
    },
  };
};

const showMessage = (message, tone = 'info') => {
  authMessage.hidden = false;
  authMessage.textContent = message;
  authMessage.className = `auth-message is-${tone}`;
};

const clearMessage = () => {
  authMessage.hidden = true;
  authMessage.textContent = '';
  authMessage.className = 'auth-message';
};

const clearFieldErrors = () => {
  authFields.forEach((field) => field.classList.remove('is-invalid'));
  const errorLabel = document.getElementById('credential-error-label');
  if (errorLabel) errorLabel.remove();
};

const flagCredentialError = (message = 'Password or email is Wrong') => {
  [emailInput?.closest('.auth-field')].forEach((field) => {
    if (!field) return;
    field.classList.remove('is-invalid');
    void field.offsetWidth;
    field.classList.add('is-invalid');
    
    let errorLabel = document.getElementById('credential-error-label');
    if (!errorLabel) {
      errorLabel = document.createElement('div');
      errorLabel.id = 'credential-error-label';
      errorLabel.style.color = '#b80438';
      errorLabel.style.fontSize = '12px';
      errorLabel.style.marginTop = '4px';
      errorLabel.style.fontWeight = '600';
      errorLabel.style.animation = 'authFieldFlicker 600ms ease-in-out';
      field.appendChild(errorLabel);
    }
    errorLabel.textContent = message;
    
    // Make the email ID input value flicker
    if (emailInput) {
      emailInput.style.animation = 'none';
      void emailInput.offsetWidth;
      emailInput.style.animation = 'authFieldFlicker 600ms ease-in-out';
    }
  });
};

const setMode = (mode) => {
  authMode = mode;
  const signInActive = mode === 'sign-in';
  const signUpActive = mode === 'sign-up';
  const updateActive = mode === 'update-password';

  modeSignIn?.classList.toggle('active', signInActive);
  modeSignUp?.classList.toggle('active', signUpActive);
  
  if (fullNameField) fullNameField.hidden = !signUpActive;
  if (newPasswordField) newPasswordField.hidden = !updateActive;
  
  // Hide normal email/password fields if updating password
  if (emailInput?.closest('.auth-field')) emailInput.closest('.auth-field').hidden = updateActive;
  if (passwordInput?.closest('.auth-field')) passwordInput.closest('.auth-field').hidden = updateActive;
  if (forgotPasswordButton?.parentElement) forgotPasswordButton.parentElement.hidden = updateActive;

  if (submitButton) {
    if (signInActive) submitButton.textContent = 'Sign In';
    else if (signUpActive) submitButton.textContent = 'Create Account';
    else if (updateActive) submitButton.textContent = 'Update Password';
  }

};

const brandSecondary = document.querySelector('.brand-copy span');

const setAccountCard = (user, profile) => {
  if (!user) {
    authAccountCard.hidden = true;
    authForm.hidden = false;
    authAccountEmail.textContent = 'No account';
    authAccountName.textContent = 'Profile not loaded yet.';
    if (brandSecondary) brandSecondary.textContent = 'Website sign in';
    return;
  }

  authAccountCard.hidden = false;
  authForm.hidden = true;
  authAccountEmail.textContent = user.email || 'Signed in user';
  authAccountName.textContent =
    profile?.full_name ||
    user.user_metadata?.full_name ||
    'Profile available on shared backend.';
    
  if (brandSecondary) {
    brandSecondary.innerHTML = `<span style="color:var(--brand);">${user.email}</span> <button id="auth-top-left-sign-out" style="background:none; border:none; padding:0; margin-left:8px; font-size:12px; cursor:pointer; color:var(--text-soft); text-decoration:underline;">Sign Out</button>`;
    const topSignOut = document.getElementById('auth-top-left-sign-out');
    if (topSignOut) {
      topSignOut.addEventListener('click', () => {
        signOutButton.click();
      });
    }
  }
};

const loadProfile = async (user) => {
  if (!supabase || !user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();
  return data || null;
};

const refreshSessionUi = async () => {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user || null;
  const profile = user ? await loadProfile(user) : null;
  setAccountCard(user, profile);
};

const handleForgotPassword = async () => {
  console.log('[AUTH] handleForgotPassword triggered');
  const email = emailInput?.value?.trim().toLowerCase();
  console.log('[AUTH] Email input value:', email);

  if (!email) {
    showMessage('Enter your email address first, then try Forgot Password again.', 'error');
    flagCredentialError('Please enter your email first.');
    return;
  }

  clearMessage();
  forgotPasswordButton.disabled = true;
  forgotPasswordButton.textContent = 'Sending...';
  showMessage(`Sending password reset email to ${email}...`, 'info');
  console.log('[AUTH] Fetching /auth/forgot-password...');
  try {
    const response = await fetch('./auth/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
      },
      body: new URLSearchParams({ email }).toString(),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.success) {
      throw new Error(data?.message || 'We could not send the password reset email.');
    }
    showMessage(data.message || `Password reset email sent to ${email}.`, 'success');
  } catch (error) {
    showMessage(error.message || 'We could not send the password reset email.', 'error');
  } finally {
    forgotPasswordButton.disabled = false;
    forgotPasswordButton.textContent = 'Forgot Password?';
  }
};

const handleSubmit = async (event) => {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  if (isSubmittingAuth) {
    return;
  }

  if (!supabase) {
    showMessage('Authentication is not ready yet. Refresh the page and try again.', 'error');
    return;
  }

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value.trim();
  const fullName = fullNameInput.value.trim();

  if (!email || !password) {
    showMessage('Enter your email and password to continue.', 'error');
    return;
  }

  if (authMode === 'sign-up' && !fullName) {
    showMessage('Enter your full name to create your account.', 'error');
    return;
  }

  isSubmittingAuth = true;
  submitButton.disabled = true;
  clearMessage();
  clearFieldErrors();
  showMessage(
    authMode === 'sign-in'
      ? 'Signing in...'
      : authMode === 'sign-up'
        ? 'Creating your account...'
        : 'Updating password...',
    'info'
  );

  try {
    if (authMode === 'update-password') {
      const newPassword = newPasswordInput.value.trim();
      if (!newPassword || newPassword.length < 6) {
        throw new Error('Please enter a new password (at least 6 characters).');
      }
      
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      
      showMessage('Password updated successfully! Redirecting to login...', 'success');
      window.setTimeout(() => {
        window.location.href = './login.html?auth=reset-success';
      }, 2000);
      return;
    }

    const endpoint = authMode === 'sign-up' ? './auth/sign-up' : './auth/sign-in';
    const payload = new URLSearchParams();
    if (authMode === 'sign-up') {
      payload.set('full_name', fullName);
    }
    payload.set('email', email);
    payload.set('password', password);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
      },
      body: payload.toString(),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.success) {
      throw new Error(data?.message || 'Authentication failed. Please try again.');
    }

    showMessage(
      data?.message || 'Signed in successfully.',
      'success'
    );

    if (authMode === 'sign-in' && supabase) {
      try {
        await supabase.auth.signInWithPassword({ email, password });
        await refreshSessionUi();
      } catch (error) {
        // The server-side auth already succeeded; inline success should still be shown.
      }
      window.setTimeout(() => {
        window.location.href = data?.redirect || './index.html';
      }, 500);
    } else if (authMode === 'sign-up') {
      if (data?.redirect) {
        window.setTimeout(() => {
          window.location.href = data.redirect;
        }, 700);
      } else {
        setMode('sign-in');
      }
    } else if (data?.redirect) {
      window.setTimeout(() => {
        window.location.href = data.redirect;
      }, 900);
    }
  } catch (error) {
    const message = error.message || 'Authentication failed. Please try again.';
    showMessage(message, 'error');
    if (/invalid login credentials|password|email/i.test(message)) {
      flagCredentialError();
    }
  } finally {
    isSubmittingAuth = false;
    submitButton.disabled = false;
  }
};

const initAuth = async () => {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    configWarning.hidden = false;
    showMessage('Website authentication config is missing.', 'error');
    return;
  }

  if (!window.supabase?.createClient) {
    showMessage('Website authentication could not load. Check your internet connection and refresh.', 'error');
    return;
  }

  try {
    supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        storage: createSafeBrowserStorage(),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (error) {
    showMessage(error?.message || 'Could not initialize authentication on this browser.', 'error');
    return;
  }

  signOutButton.addEventListener('click', async () => {
    clearMessage();
    await fetch('./auth/sign-out', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' } }).catch(() => {});
    await supabase.auth.signOut();
    await refreshSessionUi();
    showMessage('Signed out successfully.', 'success');
  });

  supabase.auth.onAuthStateChange(async () => {
    await refreshSessionUi();
  });

  await refreshSessionUi();
};

setMode(authMode);
if (authPageParams.get('auth') === 'signup-success') {
  showMessage('Account created successfully. Sign in with your new credentials.', 'success');
}
if (authPageParams.get('auth') === 'reset') {
  showMessage('Reset link detected. Please enter your new password below.', 'info');
  setMode('update-password');
}
if (authPageParams.get('auth') === 'reset-success') {
  showMessage('Password updated successfully. You can now sign in.', 'success');
}
if (window.location.hash.includes('type=recovery')) {
  showMessage('Recovery link confirmed. Set your new password.', 'info');
  setMode('update-password');
}
authForm.addEventListener('submit', handleSubmit);
submitButton?.addEventListener('click', handleSubmit);
submitButton?.addEventListener('pointerup', handleSubmit);
submitButton?.addEventListener(
  'touchend',
  (event) => {
    event.preventDefault();
    handleSubmit(event);
  },
  { passive: false }
);

if (forgotPasswordButton) {
  forgotPasswordButton.addEventListener('click', (event) => {
    event.preventDefault();
    handleForgotPassword();
  });
}

if (modeSignIn) {
  modeSignIn.addEventListener('click', () => {
    clearMessage();
    clearFieldErrors();
    setMode('sign-in');
  });
}

initAuth();

[emailInput, passwordInput, fullNameInput].forEach((input) => {
  input?.addEventListener('input', clearFieldErrors);
});
