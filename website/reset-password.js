const resetConfig = window.__LUMINA_CONFIG__ || {};
const resetEmailValue = document.getElementById('reset-email-value');
const resetForm = document.getElementById('reset-password-form');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const resetSubmit = document.getElementById('reset-password-submit');
const resetMessage = document.getElementById('reset-password-message');

const showResetMessage = (message, tone = 'info') => {
  if (!resetMessage) return;
  resetMessage.hidden = false;
  resetMessage.textContent = message;
  resetMessage.className = `auth-message is-${tone}`;
};

const getParamsFromUrl = (url) => {
  try {
    const parsed = new URL(url);
    const queryParams = new URLSearchParams(parsed.search);
    const hashParams = new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash);

    return {
      accessToken: queryParams.get('access_token') ?? hashParams.get('access_token'),
      refreshToken: queryParams.get('refresh_token') ?? hashParams.get('refresh_token'),
      tokenHash: queryParams.get('token_hash') ?? hashParams.get('token_hash'),
      type: queryParams.get('type') ?? hashParams.get('type'),
      errorCode: queryParams.get('error_code') ?? hashParams.get('error_code'),
      errorDescription: queryParams.get('error_description') ?? hashParams.get('error_description'),
    };
  } catch {
    return {
      accessToken: null,
      refreshToken: null,
      tokenHash: null,
      type: null,
      errorCode: null,
      errorDescription: null,
    };
  }
};

let resetSupabase = null;

const initializeResetSession = async () => {
  if (!resetConfig.supabaseUrl || !resetConfig.supabaseAnonKey || !window.supabase?.createClient) {
    showResetMessage('Reset page could not initialize. Please request a new reset link.', 'error');
    return false;
  }

  resetSupabase = window.supabase.createClient(resetConfig.supabaseUrl, resetConfig.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  const { accessToken, refreshToken, tokenHash, type, errorCode, errorDescription } =
    getParamsFromUrl(window.location.href);

  if (errorCode) {
    showResetMessage(errorDescription || 'This reset link is invalid or expired.', 'error');
    return false;
  }

  try {
    if (accessToken && refreshToken) {
      const { error } = await resetSupabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;
    } else if (tokenHash && type === 'recovery') {
      const { error } = await resetSupabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'recovery',
      });
      if (error) throw error;
    }

    const { data } = await resetSupabase.auth.getUser();
    const email = data?.user?.email || 'Recovered account';
    resetEmailValue.textContent = email;
    showResetMessage('Recovery link confirmed. Set your new password below.', 'success');
    return true;
  } catch (error) {
    showResetMessage(error.message || 'This reset link is invalid or expired.', 'error');
    resetEmailValue.textContent = 'Recovery link required';
    return false;
  }
};

resetForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!resetSupabase) {
    showResetMessage('Reset page is not ready. Please request a new reset link.', 'error');
    return;
  }

  const newPassword = newPasswordInput.value.trim();
  const confirmPassword = confirmPasswordInput.value.trim();

  if (newPassword.length < 8) {
    showResetMessage('Your new password must be at least 8 characters long.', 'error');
    return;
  }

  if (newPassword !== confirmPassword) {
    showResetMessage('Your new password and confirmation do not match.', 'error');
    return;
  }

  resetSubmit.disabled = true;
  showResetMessage('Updating your password...', 'info');

  try {
    const { error } = await resetSupabase.auth.updateUser({ password: newPassword });
    if (error) throw error;

    showResetMessage('Password updated successfully. Redirecting to sign in...', 'success');
    window.setTimeout(() => {
      window.location.href = './login.html?auth=reset-success';
    }, 900);
  } catch (error) {
    showResetMessage(error.message || 'We could not update your password.', 'error');
  } finally {
    resetSubmit.disabled = false;
  }
});

void initializeResetSession();
