const accountName = document.getElementById('account-name');
const accountEmail = document.getElementById('account-email');
const accountAvatar = document.getElementById('account-avatar');
const accountStatusBadge = document.getElementById('account-status-badge');
const accountPlanPill = document.getElementById('account-plan-pill');
const accountPlanCopy = document.getElementById('account-plan-copy');
const nav = document.querySelector('[data-nav]');
const toggle = document.querySelector('[data-menu-toggle]');
const signOutButtons = [
  document.getElementById('account-sign-out'),
  document.getElementById('account-sign-out-secondary'),
].filter(Boolean);

if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      if (!nav.classList.contains('open')) return;
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

const setAccountStatus = (text, tone = 'neutral') => {
  accountStatusBadge.textContent = text;
  accountStatusBadge.dataset.tone = tone;
};

const setPlanStatus = (text, copy, tone = 'neutral') => {
  accountPlanPill.textContent = text;
  accountPlanPill.dataset.tone = tone;
  accountPlanCopy.textContent = copy;
};

const deriveInitials = (name, email) => {
  const source = (name || email || 'Lumina Scan').trim();
  const words = source.split(/\s+/).filter(Boolean).slice(0, 2);
  if (words.length === 0) return 'LS';
  return words.map((word) => word[0]?.toUpperCase() || '').join('').slice(0, 2);
};

const signOut = async () => {
  await fetch('./auth/sign-out', {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
  }).catch(() => {});
  window.location.href = './login.html';
};

signOutButtons.forEach((button) => {
  button.addEventListener('click', signOut);
});

const loadAccount = async () => {
  try {
    const sessionResponse = await fetch('./api/auth-session', {
      headers: { Accept: 'application/json' },
    });
    const sessionData = await sessionResponse.json().catch(() => ({}));

    if (!sessionData?.authenticated || !sessionData?.user) {
      window.location.href = './login.html';
      return;
    }

    const user = sessionData.user;
    accountName.textContent = user.fullName || 'Lumina Scan member';
    accountEmail.textContent = user.email || 'Unknown email';
    accountAvatar.textContent = deriveInitials(user.fullName, user.email);
    setAccountStatus('Signed in', 'success');

    try {
      const paymentResponse = await fetch('./api/check-payment-status', {
        headers: { Accept: 'application/json' },
      });
      const paymentData = await paymentResponse.json().catch(() => ({}));
      if (paymentData?.hasPaid) {
        setPlanStatus(
          'Lifetime access active',
          'This account already has active lifetime website access for premium editing features.',
          'success'
        );
      } else {
        setPlanStatus(
          'Free access',
          'Your account is signed in successfully. Purchase flow can be completed later if premium tools need activation.',
          'neutral'
        );
      }
    } catch {
      setPlanStatus(
        'Status unavailable',
        'We could not verify the payment status just now, but your account session is active.',
        'warning'
      );
    }
  } catch {
    setAccountStatus('Session unavailable', 'warning');
    setPlanStatus(
      'Could not load account',
      'Please refresh this page or sign in again to reload your website session.',
      'warning'
    );
  }
};

void loadAccount();
