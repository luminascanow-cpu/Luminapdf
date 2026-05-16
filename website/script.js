const nav = document.querySelector('[data-nav]');
const toggle = document.querySelector('[data-menu-toggle]');
const year = document.querySelector('[data-year]');
const navSignInLink = document.getElementById('nav-sign-in-link');
const navUserContainer = document.getElementById('nav-user-container');
const navUserTrigger = document.getElementById('nav-user-trigger');
const navUserEmailDisplay = document.getElementById('nav-user-email-display');
const navUserDropdown = document.getElementById('nav-user-dropdown');
const navUserDropdownName = document.getElementById('nav-user-dropdown-name');
const navUserDropdownEmail = document.getElementById('nav-user-dropdown-email');
const navSignOut = document.getElementById('nav-sign-out');
const brandSecondary = document.querySelector('.brand-copy span');

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

if (year) {
  year.textContent = new Date().getFullYear();
}

const closeNavUserDropdown = () => {
  navUserDropdown?.setAttribute('hidden', '');
  navUserTrigger?.setAttribute('aria-expanded', 'false');
};

if (navUserTrigger && navUserDropdown) {
  navUserTrigger.addEventListener('click', (event) => {
    event.preventDefault();
    if (navUserContainer?.hidden) return;
    const shouldOpen = navUserDropdown.hasAttribute('hidden');
    if (shouldOpen) {
      navUserDropdown.removeAttribute('hidden');
    } else {
      navUserDropdown.setAttribute('hidden', '');
    }
    navUserTrigger.setAttribute('aria-expanded', String(shouldOpen));
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    const clickedInsideMenu =
      !!target &&
      ((navUserTrigger && navUserTrigger.contains(target)) ||
        (navUserDropdown && navUserDropdown.contains(target)));

    if (!clickedInsideMenu) {
      closeNavUserDropdown();
    }
  });
}

const syncWebsiteAuthState = async () => {
  if (!navSignInLink || !navUserContainer || !navUserEmailDisplay || !navSignOut) {
    return;
  }

  try {
    const response = await fetch('./api/auth-session', {
      headers: { Accept: 'application/json' },
    });
    const data = await response.json().catch(() => ({}));
    const user = data?.user || null;

    if (data?.authenticated && user?.email) {
      navSignInLink.hidden = true;
      navUserContainer.hidden = false;
      navUserEmailDisplay.textContent = user.fullName || user.email;
      if (navUserDropdownName) {
        navUserDropdownName.textContent = user.fullName || 'Lumina Scan account';
      }
      if (navUserDropdownEmail) {
        navUserDropdownEmail.textContent = user.email;
      }
      if (brandSecondary) {
        brandSecondary.textContent = 'Signed in on website';
      }
    } else {
      navSignInLink.hidden = false;
      navUserContainer.hidden = true;
      closeNavUserDropdown();
      if (brandSecondary) {
        const isLogin = window.location.pathname.includes('login') || window.location.pathname.includes('signup');
        brandSecondary.textContent = isLogin ? 'Website sign in' : 'Scan. Edit. Sign. Export.';
      }
    }
  } catch (error) {
    navSignInLink.hidden = false;
    navUserContainer.hidden = true;
    closeNavUserDropdown();
  }
};

navSignOut?.addEventListener('click', async () => {
  await fetch('./auth/sign-out', {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
  }).catch(() => {});
  closeNavUserDropdown();
  window.location.href = './index.html';
});

void syncWebsiteAuthState();

const websitePdfUpload = document.getElementById('website-pdf-upload');
const websitePdfDropzone = document.getElementById('website-pdf-dropzone');
const websitePdfChoose = document.getElementById('website-pdf-choose');
const websitePdfState = document.getElementById('website-pdf-state');
const websitePdfName = document.getElementById('website-pdf-name');
const websitePdfHint = document.getElementById('website-pdf-hint');
const WEBSITE_EDITOR_PDF_KEY = 'luminaWebsiteEditorPdf';
const WEBSITE_EDITOR_SESSION_PARAM = 'session';

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const buildWebsiteEditorUrl = (sessionId = '') => {
  if (!sessionId) return './pdf-editor.html';
  return `./pdf-editor.html?${WEBSITE_EDITOR_SESSION_PARAM}=${encodeURIComponent(sessionId)}`;
};

const createWebsitePdfSession = async (file, arrayBuffer) => {
  const response = await fetch('./api/pdf-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({
      fileName: file.name || 'document.pdf',
      bytesBase64: arrayBufferToBase64(arrayBuffer),
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || 'Could not prepare the PDF for the editor.');
  }

  const payload = await response.json().catch(() => ({}));
  if (!payload?.sessionId) {
    throw new Error('The editor session could not be created.');
  }

  return payload.sessionId;
};

const handleWebsitePdfFile = async (file) => {
  if (!file) {
    websitePdfState.hidden = true;
    websitePdfName.textContent = 'No file selected';
    if (websitePdfHint) websitePdfHint.textContent = 'Preparing your document for the editor...';
    sessionStorage.removeItem(WEBSITE_EDITOR_PDF_KEY);
    return;
  }

  const isPdf =
    file.type === 'application/pdf' || String(file.name || '').toLowerCase().endsWith('.pdf');

  if (!isPdf) {
    websitePdfState.hidden = false;
    websitePdfName.textContent = 'Only PDF files are supported';
    if (websitePdfHint) websitePdfHint.textContent = 'Choose a PDF file to continue into the editor.';
    return;
  }

  websitePdfState.hidden = false;
  websitePdfName.textContent = file.name;
  if (websitePdfHint) websitePdfHint.textContent = 'Opening the editor with your document...';

  try {
    const arrayBuffer = await file.arrayBuffer();
    const sessionId = await createWebsitePdfSession(file, arrayBuffer);
    window.location.href = buildWebsiteEditorUrl(sessionId);
    return;
  } catch (error) {
    console.warn('[Website Upload] Falling back to sessionStorage handoff:', error);
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    sessionStorage.setItem(
      WEBSITE_EDITOR_PDF_KEY,
      JSON.stringify({
        name: file.name,
        bytesBase64: base64,
      })
    );
    window.setTimeout(() => {
      window.location.href = './pdf-editor.html';
    }, 180);
  } catch (error) {
    console.error('[Website Upload] Could not prepare the PDF for the editor:', error);
    websitePdfName.textContent = 'Could not open this PDF';
    if (websitePdfHint) {
      websitePdfHint.textContent = 'Try a smaller file or open the PDF Editor and upload there directly.';
    }
  }
};

if (websitePdfUpload && websitePdfDropzone && websitePdfState && websitePdfName) {
  const openWebsitePdfEditor = () => {
    window.location.href = buildWebsiteEditorUrl();
  };

  websitePdfChoose?.addEventListener('click', (event) => {
    event.preventDefault();
    websitePdfUpload.click();
  });

  ['click', 'pointerup', 'touchend'].forEach((eventName) => {
    websitePdfDropzone.addEventListener(eventName, (event) => {
      if (event.target === websitePdfChoose || websitePdfChoose?.contains(event.target)) return;
      if (eventName !== 'click') event.preventDefault();
      openWebsitePdfEditor();
    });
  });

  websitePdfDropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openWebsitePdfEditor();
    }
  });

  websitePdfUpload.addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    await handleWebsitePdfFile(file);
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    websitePdfDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      websitePdfDropzone.classList.add('is-dragover');
    });
  });

  ['dragleave', 'dragend', 'drop'].forEach((eventName) => {
    websitePdfDropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      websitePdfDropzone.classList.remove('is-dragover');
    });
  });

  websitePdfDropzone.addEventListener('drop', async (event) => {
    const file = event.dataTransfer?.files?.[0];
    await handleWebsitePdfFile(file);
  });
}
