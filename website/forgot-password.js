const forgotForm = document.getElementById('forgot-password-form');
const forgotEmail = document.getElementById('reset-email');
const forgotSubmit = document.getElementById('forgot-password-submit');
const forgotMessage = document.getElementById('forgot-password-message');

const showForgotMessage = (message, tone = 'info') => {
  if (!forgotMessage) return;
  forgotMessage.hidden = false;
  forgotMessage.textContent = message;
  forgotMessage.className = `auth-message is-${tone}`;
};

forgotForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = forgotEmail?.value.trim().toLowerCase();
  if (!email) {
    showForgotMessage('Enter your email address to continue.', 'error');
    return;
  }

  forgotSubmit.disabled = true;
  showForgotMessage(`Sending password reset link to ${email}...`, 'info');

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

    showForgotMessage(
      data.message || `Password reset email sent to ${email}. Open the link to continue.`,
      'success'
    );
  } catch (error) {
    showForgotMessage(error.message || 'We could not send the password reset email.', 'error');
  } finally {
    forgotSubmit.disabled = false;
  }
});
