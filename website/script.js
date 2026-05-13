const nav = document.querySelector('[data-nav]');
const toggle = document.querySelector('[data-menu-toggle]');
const year = document.querySelector('[data-year]');
const navSignInLink = document.getElementById('nav-sign-in-link');
const navUserContainer = document.getElementById('nav-user-container');
const navUserEmailDisplay = document.getElementById('nav-user-email-display');
const navSignOut = document.getElementById('nav-sign-out');
const brandSecondary = document.querySelector('.brand-copy span');

if (toggle && nav) {
  toggle.addEventListener('click', () => {
    nav.classList.toggle('open');
  });
}

if (year) {
  year.textContent = new Date().getFullYear();
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
      navUserContainer.hidden = true; // We'll put it on top left instead!
      navUserEmailDisplay.textContent = user.email;
      if (brandSecondary) {
        brandSecondary.innerHTML = `<span style="color:var(--brand);">${user.email}</span> <button id="top-left-sign-out" style="background:none; border:none; padding:0; margin-left:8px; font-size:12px; cursor:pointer; color:var(--text-soft); text-decoration:underline;">Sign Out</button>`;
        document.getElementById('top-left-sign-out')?.addEventListener('click', async (e) => {
          e.preventDefault();
          await fetch('./auth/sign-out', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
          window.location.href = './index.html';
        });
      }
    } else {
      navSignInLink.hidden = false;
      navUserContainer.hidden = true;
      if (brandSecondary) {
        // If on login.html, keep 'Website sign in'. Otherwise 'Scan. Edit. Sign. Export.'
        const isLogin = window.location.pathname.includes('login') || window.location.pathname.includes('signup');
        brandSecondary.textContent = isLogin ? 'Website sign in' : 'Scan. Edit. Sign. Export.';
      }
    }
  } catch (error) {
    navSignInLink.hidden = false;
    navUserContainer.hidden = true;
  }
};



navSignOut?.addEventListener('click', async () => {
  await fetch('./auth/sign-out', {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
  }).catch(() => {});
  window.location.href = './index.html';
});

void syncWebsiteAuthState();

const websitePdfUpload = document.getElementById('website-pdf-upload');
const websitePdfState = document.getElementById('website-pdf-state');
const websitePdfName = document.getElementById('website-pdf-name');
const websitePdfPreviewCard = document.getElementById('website-pdf-preview-card');
const websitePdfLoading = document.getElementById('website-pdf-loading');
const websitePdfPreview = document.getElementById('website-pdf-preview');
const WEBSITE_EDITOR_PDF_KEY = 'luminaWebsiteEditorPdf';

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js';
}

if (
  websitePdfUpload &&
  websitePdfState &&
  websitePdfName &&
  websitePdfPreviewCard &&
  websitePdfPreview &&
  websitePdfLoading
) {
  websitePdfUpload.addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];

    if (!file) {
      websitePdfState.hidden = true;
      websitePdfPreviewCard.hidden = true;
      websitePdfName.textContent = 'No file selected';
      websitePdfLoading.hidden = true;
      const context = websitePdfPreview.getContext('2d');
      context.clearRect(0, 0, websitePdfPreview.width, websitePdfPreview.height);
      sessionStorage.removeItem(WEBSITE_EDITOR_PDF_KEY);
      return;
    }

    websitePdfState.hidden = false;
    websitePdfPreviewCard.hidden = false;
    websitePdfLoading.hidden = false;
    websitePdfName.textContent = file.name;

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

      if (!window.pdfjsLib) {
        throw new Error('PDF preview library is not available.');
      }

      const loadingTask = window.pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer),
        disableWorker: true,
      });
      const pdf = await loadingTask.promise;
      const firstPage = await pdf.getPage(1);
      const viewport = firstPage.getViewport({ scale: 1.15 });
      websitePdfPreview.width = viewport.width;
      websitePdfPreview.height = viewport.height;
      await firstPage.render({
        canvasContext: websitePdfPreview.getContext('2d'),
        viewport,
      }).promise;
    } catch (error) {
      const context = websitePdfPreview.getContext('2d');
      context.clearRect(0, 0, websitePdfPreview.width, websitePdfPreview.height);
      websitePdfName.textContent = 'Preview failed to load';
      websitePdfLoading.querySelector('strong').textContent = 'Preview could not be loaded';
      websitePdfLoading.querySelector('small').textContent = 'Try a smaller PDF or open the full editor directly.';
    } finally {
      websitePdfLoading.hidden = false;
      window.setTimeout(() => {
        websitePdfLoading.hidden = true;
      }, 450);
    }
  });
}
