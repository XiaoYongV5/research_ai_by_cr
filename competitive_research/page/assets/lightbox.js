(() => {
  const sidebarToggle = document.querySelector('.sidebar-toggle');
  function setSidebarCollapsed(value) {
    document.body.classList.toggle('sidebar-collapsed', value);
    sidebarToggle?.setAttribute('aria-expanded', String(!value));
    sidebarToggle?.setAttribute('aria-label', value ? '展开菜单' : '折叠菜单');
    try { localStorage.setItem('competitiveResearchSidebarCollapsed', value ? '1' : '0'); } catch {}
  }
  try {
    setSidebarCollapsed(localStorage.getItem('competitiveResearchSidebarCollapsed') === '1');
  } catch {
    setSidebarCollapsed(false);
  }
  sidebarToggle?.addEventListener('click', () => {
    setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
  });

  const box = document.getElementById('lightbox');
  const image = box?.querySelector('img');
  const caption = box?.querySelector('.lightbox-caption');
  const close = box?.querySelector('.lightbox-close');
  let lightboxImages = [];
  let lightboxIndex = -1;

  function getImageSource(target) {
    return target?.getAttribute('data-full') || target?.currentSrc || target?.getAttribute('src') || target?.src || '';
  }

  function getImageCaption(target, src) {
    return target?.closest('td, figure, p')?.innerText?.trim()?.replace(/\s+/g, ' ').slice(0, 220)
      || target?.alt
      || src;
  }

  function refreshLightboxImages() {
    lightboxImages = Array.from(document.querySelectorAll('.doc-content img')).filter(getImageSource);
  }

  function showLightboxImage(index) {
    if (!box || !image || !caption || !lightboxImages.length) return;
    const total = lightboxImages.length;
    lightboxIndex = ((index % total) + total) % total;
    const target = lightboxImages[lightboxIndex];
    const src = getImageSource(target);
    const text = getImageCaption(target, src);
    image.src = src;
    image.alt = target.alt || 'Image preview';
    caption.textContent = (lightboxIndex + 1) + ' / ' + total + (text ? ' - ' + text : '');
    box.querySelectorAll('.lightbox-nav').forEach((button) => {
      button.hidden = total < 2;
    });
  }

  function stepLightbox(delta) {
    if (!box?.classList.contains('is-open')) return;
    showLightboxImage(lightboxIndex + delta);
  }

  function openLightbox(target) {
    if (!box || !image || !caption) return;
    refreshLightboxImages();
    let index = lightboxImages.indexOf(target);
    if (index === -1) {
      lightboxImages.push(target);
      index = lightboxImages.length - 1;
    }
    showLightboxImage(index);
    box.classList.add('is-open');
    box.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    if (!box || !image) return;
    box.classList.remove('is-open');
    box.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    image.removeAttribute('src');
    lightboxIndex = -1;
  }

  if (box && image && caption && close) {
    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'lightbox-nav lightbox-prev';
    prev.setAttribute('aria-label', 'Previous image');
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'lightbox-nav lightbox-next';
    next.setAttribute('aria-label', 'Next image');
    box.append(prev, next);

    document.addEventListener('click', (event) => {
      const target = event.target.closest('.doc-content img');
      if (!target) return;
      event.preventDefault();
      openLightbox(target);
    });

    close.addEventListener('click', closeLightbox);
    box.addEventListener('click', (event) => {
      if (event.target === box) closeLightbox();
    });
    prev.addEventListener('click', () => stepLightbox(-1));
    next.addEventListener('click', () => stepLightbox(1));
    document.addEventListener('keydown', (event) => {
      if (!box.classList.contains('is-open')) return;
      if (event.key === 'Escape') {
        closeLightbox();
      } else if (event.key === 'ArrowLeft' || event.key === 'Left') {
        event.preventDefault();
        stepLightbox(-1);
      } else if (event.key === 'ArrowRight' || event.key === 'Right') {
        event.preventDefault();
        stepLightbox(1);
      }
    });
  }

  const docContent = document.querySelector('.doc-content');
  const pageFile = decodeURIComponent(location.pathname.split('/').pop() || '');
  if (docContent && /^0[1-7]_/.test(pageFile)) {
    const backTop = document.createElement('button');
    backTop.type = 'button';
    backTop.className = 'reading-top';
    backTop.setAttribute('aria-label', 'Back to top');
    backTop.innerHTML = '<span class="reading-top-arrow" aria-hidden="true"></span><span class="reading-top-value">0%</span>';
    document.body.append(backTop);

    const progressValue = backTop.querySelector('.reading-top-value');
    let readFrame = 0;
    let returningTop = false;

    function syncReadProgress() {
      readFrame = 0;
      const rect = docContent.getBoundingClientRect();
      const contentTop = window.scrollY + rect.top;
      const contentBottom = contentTop + docContent.offsetHeight;
      const start = Math.max(0, contentTop - 24);
      const end = Math.max(start + 1, contentBottom - window.innerHeight + 24);
      const progress = Math.min(1, Math.max(0, (window.scrollY - start) / (end - start)));
      const percent = Math.round(progress * 100);
      backTop.style.setProperty('--read-progress', (percent * 3.6) + 'deg');
      progressValue.textContent = percent + '%';
      backTop.setAttribute('aria-label', 'Back to top, ' + percent + '% read');
      if (returningTop && window.scrollY <= 2) returningTop = false;
      backTop.classList.toggle('is-visible', window.scrollY > 160 && !returningTop);
    }

    function scheduleReadProgress() {
      if (!readFrame) readFrame = requestAnimationFrame(syncReadProgress);
    }

    backTop.addEventListener('click', () => {
      returningTop = true;
      backTop.classList.remove('is-visible');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    syncReadProgress();
    document.addEventListener('scroll', scheduleReadProgress, { passive: true });
    window.addEventListener('resize', scheduleReadProgress);
  }

  const outline = document.getElementById('page-outline');
  if (!outline) return;
  const pin = outline.querySelector('.outline-pin');
  const collapse = outline.querySelector('.outline-collapse');
  const links = Array.from(outline.querySelectorAll('.outline-link[href^="#"]'));
  const headings = links
    .map((link) => {
      const id = decodeURIComponent(link.getAttribute('href').slice(1));
      const heading = document.getElementById(id);
      return heading ? { link, heading } : null;
    })
    .filter(Boolean);

  function setPinned(value) {
    outline.classList.toggle('is-pinned', value);
    outline.classList.remove('is-collapsed');
    pin?.setAttribute('aria-pressed', String(value));
    try { localStorage.setItem('competitiveResearchOutlinePinned', value ? '1' : '0'); } catch {}
  }

  function setCollapsed(value) {
    if (value) {
      setPinned(false);
      outline.classList.add('is-collapsed');
    } else {
      outline.classList.remove('is-collapsed');
    }
  }

  pin?.addEventListener('click', () => setPinned(!outline.classList.contains('is-pinned')));
  collapse?.addEventListener('click', () => setCollapsed(true));
  outline.querySelector('.outline-rail')?.addEventListener('mouseenter', () => {
    outline.classList.remove('is-collapsed');
    outline.classList.add('is-open');
  });
  outline.addEventListener('mouseleave', () => {
    outline.classList.remove('is-open');
  });
  links.forEach((link) => {
    link.addEventListener('click', () => {
      if (!outline.classList.contains('is-pinned')) setCollapsed(true);
    });
  });

  try {
    if (localStorage.getItem('competitiveResearchOutlinePinned') === '1') setPinned(true);
  } catch {}

  let activeId = '';
  function syncActive() {
    if (!headings.length) return;
    const anchor = window.scrollY + 140;
    let current = headings[0];
    for (const item of headings) {
      if (item.heading.offsetTop <= anchor) current = item;
      else break;
    }
    const id = current.heading.id;
    if (id === activeId) return;
    activeId = id;
    links.forEach((link) => link.classList.remove('is-active'));
    current.link.classList.add('is-active');
    const group = current.link.closest('.outline-group');
    if (group) group.open = true;
  }
  syncActive();
  document.addEventListener('scroll', () => requestAnimationFrame(syncActive), { passive: true });
})();
