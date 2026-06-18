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

  function openLightbox(target) {
    if (!box || !image || !caption) return;
    const src = target.getAttribute('data-full') || target.currentSrc || target.src;
    image.src = src;
    image.alt = target.alt || '放大预览';
    caption.textContent = target.closest('td, figure, p')?.innerText?.trim()?.slice(0, 220) || src;
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
  }

  if (box && image && caption && close) {
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
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && box.classList.contains('is-open')) closeLightbox();
    });
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
