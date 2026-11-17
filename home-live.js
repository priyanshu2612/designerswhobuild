/* ───────────────────────────────────────────────────────────────
   home-live.js — fills every homepage section from the posts table.

   How posts are distributed (all deterministic, no hand-picking):
   • Quality gate ...... title ≥ 15 chars (drops "Test test", "Yes").
   • Score ............. reactions×3 + comments×4 + media(4) + live(2)
                         + live link(1) + recency boost (10·e^(-age/30d)).
   • Builds of the day . top 6 scored VIDEO posts, one per author.
   • Thoughtfully built  by helpful_tags; gaps are filled by keyword match
                         (self-care) and then by best remaining posts.
   • What's your vibe? . Freshly baked = newest · Surprise me = daily
                         seeded shuffle · Weird only = games / interactive /
                         fun / emoji titles.
   • Spotlight ......... EVERY post, best first; chips filter by category.
   • Top contributors .. profiles ranked by number of builds, then score.
   • Trending .......... top 10 by score (24h / week / month windows, falling
                         back to all-time when a window is nearly empty).
   • New from community  the 4 newest posts as full cards.
   Icons: uploaded thumbnail → else placeholder by build type
   (Game / iOS / Android / macOS & Windows / Web / Extension).
   ─────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const DAY = 864e5;

  // ── Normalise a raw row ─────────────────────────────
  function norm(p) {
    const pr = p.profiles || {};
    const rx = (p.reactions || []);
    const cm = (p.comments || []);
    const mediaImg = (p.media_urls || [])[0] || null;
    const age = (Date.now() - new Date(p.created_at).getTime()) / DAY;
    const hasMedia = !!(p.media_video_url || mediaImg || p.thumbnail_url);
    const parts = String(p.title || '').split(/\s[—–]\s/);
    const name = p.app_name || parts[0] || p.title || 'Untitled';
    const tagline = parts.length > 1 ? parts.slice(1).join(' — ') : (p.title || '');
    const n = {
      raw: p, id: p.id, profile: pr,
      name, tagline, title: p.title || name,
      status: p.status === 'live' ? 'live' : 'wip',
      category: p.category || 'Build',
      postCats: Array.isArray(p.post_categories) ? p.post_categories : [],
      tags: Array.isArray(p.helpful_tags) ? p.helpful_tags : [],
      video: p.media_video_url || null,
      image: mediaImg || p.thumbnail_url || null,
      hasMedia, age,
      rx: rx.length, cm: cm.length,
      created: p.created_at,
    };
    n.score = n.rx * 3 + n.cm * 4 + (hasMedia ? 4 : 0) + (n.status === 'live' ? 2 : 0) +
      (p.live_url ? 1 : 0) + 10 * Math.exp(-age / 30);
    n.hot = (n.rx + n.cm) > 0 ? '+' + (n.rx + n.cm) : 'New';
    n.meta = p.source ? n.category : n.category + ' · ' + getTimeAgo(p.created_at);   // LinkedIn-sourced posts carry no "x days ago"
    n.author = pr.name || 'Unknown';
    n.role = [pr.role, pr.company].filter(Boolean).join(' · ');
    n.avatar = pr.avatar_url || null;
    return n;
  }

  // Placeholder icon by build type (user's rule: uploaded icon, else per-type placeholder)
  function iconFor(n) {
    if (n.raw.thumbnail_url) return n.raw.thumbnail_url;
    const cats = n.postCats.map(c => c.toLowerCase());
    if (cats.includes('game')) return _categoryIcon('game');
    let c = (n.category || '').toLowerCase();
    if (c.includes('windows')) c = 'macos';
    else if (c.includes('figma') || c.includes('dashboard')) c = 'web';
    return _categoryIcon(c);
  }
  const hasRealIcon = n => !!n.raw.thumbnail_url;

  const avatarImg = n => `<img src="${esc(n.avatar || _AVATAR_FB)}" onerror="_onAvatarErr(this)" alt="">`;
  const GRADS = [
    'linear-gradient(135deg,#2D1B4E 0%,#1a1030 100%)',
    'linear-gradient(135deg,#12324A 0%,#0b1c2b 100%)',
    'linear-gradient(135deg,#4A1B2D 0%,#2b0b17 100%)',
    'linear-gradient(135deg,#1B4A3A 0%,#0b2b20 100%)',
  ];

  // ── Hero-style card (Builds of the day + Spotlight) ──
  function heroCard(n, cls, i) {
    const style = n.hasMedia ? 'cursor:pointer;' : `background:${GRADS[i % GRADS.length]};cursor:pointer;`;
    const media = n.video
      ? `<video class="hmiss-video" src="${esc(n.video)}" preload="${i < 2 ? 'auto' : 'metadata'}" loop muted playsinline></video>`
      : (n.image ? `<img class="hmiss-video" src="${esc(n.image)}" alt="" loading="lazy">` : '');
    const blurs = n.hasMedia
      ? '<div class="hmiss-blur-1"></div><div class="hmiss-blur-2"></div><div class="hmiss-blur-3"></div><div class="hmiss-blur-4"></div>' : '';
    const ov = n.hasMedia ? '' : ' style="background:linear-gradient(to top,rgba(0,0,0,0.88) 0%,rgba(0,0,0,0.55) 40%,rgba(0,0,0,0.1) 100%);"';
    return `<div class="${cls}" onclick="openPostDetail('${n.id}')" style="${style}">
      ${media}${blurs}
      <div class="hmiss-overlay"${ov}>
        <div class="hmiss-meta-label"><span>${esc(n.meta)}</span><span class="hmiss-meta-fire">${n.hot === 'New' ? '' : '🔥 ' + n.hot}</span></div>
        <div class="hmiss-title">${esc(n.title)}</div>
        <div class="hmiss-author-row" onclick="event.stopPropagation();viewProfile('${n.profile.id}')">
          <div class="hmiss-author-avatar">${avatarImg(n)}</div>
          <div class="hmiss-author-info">
            <div class="hmiss-author-name">${esc(n.author)}</div>
            <div class="hmiss-author-role">${esc(n.role)}</div>
          </div>
        </div>
      </div>
    </div>`;
  }

  // ── List-style card (Trending / Thoughtfully built / vibe pages) ──
  function listCard(n, rank, rankColor) {
    const badge = n.status === 'live'
      ? '<span class="badge-live">Live</span>'
      : '<span class="badge-platform" style="background:#FFF4E6;color:#FF8C00">WIP</span>';
    const icon = iconFor(n);
    return `<div class="project-card" onclick="openPostDetail('${n.id}')" style="cursor:pointer;">
      <div class="card-top-row">
        <div class="card-thumb-wrap">
          ${rank ? `<span class="rank-badge" style="color:${rankColor}">#${rank}</span>` : ''}
          ${_postThumb(n.raw)}
        </div>
        <div class="card-info">
          <div class="card-name-row"><span class="card-app-name">${esc(n.name)}</span>${badge}</div>
          <div class="card-desc">${esc(n.tagline)}</div>
          <div class="card-meta-row">
            <span class="card-platform">${esc(n.meta)}</span>
            <span class="card-time">🔥 <span class="hot-count">${n.hot === 'New' ? '' : n.hot}</span></span>
          </div>
        </div>
      </div>
      <div class="card-divider"></div>
      <div class="card-author-row"><span class="card-author">${esc(n.author)}</span><span class="card-author-role">&middot; ${esc(n.role)}</span></div>
    </div>`;
  }

  // Object shape used by the existing renderHelpfulCards / trending / vibe renderers
  function legacyObj(n, rank) {
    return {
      key: n.id, rank, rankColor: rank === 1 ? '#FF8140' : rank === 2 ? '#EFB351' : rank === 3 ? '#596378' : '#293142',
      img: hasRealIcon(n) ? n.raw.thumbnail_url : iconFor(n),
      name: n.name, status: n.status, desc: n.tagline, meta: n.meta, hot: n.hot === 'New' ? '' : n.hot,
      author: n.author, role: n.role, previewImg: n.image, liveUrl: n.raw.live_url || '#', thumbHtml: _postThumb(n.raw),
    };
  }

  // ── Make openPostDetail() work for DB posts ──
  function registerDetail(n) {
    const p = n.raw, pr = n.profile;
    const cnt = t => (p.reactions || []).filter(r => r.type === t).length;
    let tools = [];
    try { tools = Array.isArray(p.tools_used) ? p.tools_used : JSON.parse(p.tools_used || '[]'); } catch (e) {}
    tools = tools.map(t => {
      const name = typeof t === 'string' ? t : (t.name || '');
      const icon = typeof t === 'string' ? (typeof _getToolIcon === 'function' ? _getToolIcon(t) : null) : (t.icon_url || t.img);
      return { name, img: icon || _AVATAR_FB };
    });
    const imgs = (p.media_urls || []).filter(Boolean);
    _postDetailData[n.id] = {
      key: n.id, raw: p, title: n.name, desc: p.description || n.title,
      status: n.status, category: p.category || '',
      video: n.video, images: imgs, hasMedia: n.hasMedia,
      img: imgs[0] || p.thumbnail_url || iconFor(n),
      liveUrl: p.live_url || null,
      rxn: { tm: cnt('teach_me'), tb: cnt('buy_this'), tu: cnt('use_this'), comments: n.cm },
      tools, roles: Array.isArray(p.roles) ? p.roles : [], categories: n.postCats,
      builtInDays: p.built_in_days || null,
      author: { name: pr.name || '', role: pr.role || '', company: pr.company || '', avatar: pr.avatar_url || null, id: pr.id || null },
    };
  }

  // ── Seeded shuffle (changes daily, stable within a day) ──
  function seeded(seedStr) {
    let h = 2166136261;
    for (const ch of seedStr) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return function () { h += 0x6D2B79F5; let t = Math.imul(h ^ (h >>> 15), 1 | h); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function shuffle(arr, seed) {
    const r = seeded(seed), a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // Owner's rule: this author's posts always rank last, in every section
  const LAST_AUTHOR = 'James Chughh';
  const demote = (list, nameOf) => {
    const f = nameOf || (n => n.author);
    return [...list.filter(n => f(n) !== LAST_AUTHOR), ...list.filter(n => f(n) === LAST_AUTHOR)];
  };

  // ───────────────────────── sections ─────────────────────────
  function buildBotd(all) {
    const el = document.querySelector('.botd-scroll');
    if (!el) return;
    const seen = new Set(), pick = [];
    for (const n of all.filter(x => x.video)) {
      if (seen.has(n.profile.id)) continue;
      seen.add(n.profile.id); pick.push(n);
      if (pick.length === 6) break;
    }
    // Ashley Green second-last, James Chughh last (owner's requests)
    const slot = n => n.author === LAST_AUTHOR ? 2 : n.author === 'Ashley Green' ? 1 : 0;
    pick.sort((a, b) => slot(a) - slot(b));
    el.innerHTML = pick.map((n, i) => heroCard(n, 'botd-card', i)).join('');
    el.querySelectorAll('video.hmiss-video').forEach(v => { try { hmissObserver.observe(v); } catch (e) {} });
    if (typeof _updateBotdHero === 'function') _updateBotdHero();
  }

  const SELFCARE = /mood|journal|calm|breath|mindful|meditat|wellness|habit|self[- ]?track|pomodoro|sleep|health|remind|focus|timer/i;
  let _helpN = {};
  function buildHelpful(all) {
    const used = new Set();
    const tabs = ['utility', 'fun', 'productivity', 'self-care'];
    tabs.forEach(t => { _helpN[t] = []; });
    const by = t => all.filter(n => t === 'self-care'
      ? (n.tags.includes(t) || SELFCARE.test(n.title + ' ' + (n.raw.description || '').slice(0, 300)))
      : n.tags.includes(t));
    tabs.forEach(t => { by(t).slice(0, 6).forEach(n => { _helpN[t].push(n); used.add(n.id); }); });
    // top up every tab to 3 with best posts not yet shown anywhere, then any
    tabs.forEach(t => {
      const pool = [...all.filter(n => !used.has(n.id)), ...all.filter(n => used.has(n.id))];
      for (const n of pool) {
        if (_helpN[t].length >= 3) break;
        if (!_helpN[t].includes(n)) { _helpN[t].push(n); used.add(n.id); }
      }
    });
    const active = document.querySelector('.helpful-tab.active');
    const m = active && /setHelpfulTab\('([^']+)'/.exec(active.getAttribute('onclick') || '');
    renderHelpfulCards(m ? m[1] : 'utility');
  }

  // Carousel hero scaling (same behaviour as Builds of the day)
  function updateHero(s) {
    const cx = s.scrollLeft + s.clientWidth / 2;
    let hero = null, min = Infinity;
    const cards = s.querySelectorAll('.botd-card');
    cards.forEach(c => { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - cx); if (d < min) { min = d; hero = c; } });
    cards.forEach(c => {
      const h = c === hero; c.classList.toggle('botd-hero', h);
      const v = c.querySelector('video.hmiss-video');
      if (v) { h ? v.play().catch(() => {}) : v.pause(); }
    });
  }
  // Replaces the old vertical list: Thoughtfully built is now a card carousel
  window.renderHelpfulCards = function (tab) {
    const el = document.getElementById('helpfulCards');
    if (!el) return;
    const list = _helpN[tab] || [];
    el.className = 'botd-scroll helpful-carousel';
    el.style.cssText = '';   // inherit .botd-scroll padding (10% inset) like Must checkout builds
    el.scrollLeft = 0;
    el.innerHTML = list.map((n, i) => heroCard(n, 'botd-card', i)).join('');
    el.querySelectorAll('video.hmiss-video').forEach(v => { try { hmissObserver.observe(v); } catch (e) {} });
    if (!el._heroBound) { el.addEventListener('scroll', () => updateHero(el), { passive: true }); el._heroBound = true; }
    updateHero(el);
  };

  function buildVibes(all) {
    const day = new Date().toISOString().slice(0, 10);
    const fresh = [...all].sort((a, b) => new Date(b.created) - new Date(a.created)).slice(0, 12);
    const surprise = shuffle(all, day).slice(0, 10);
    let weird = all.filter(n => n.tags.includes('fun') || n.postCats.includes('Game') ||
      /game|interactive|figma plugin/i.test(n.category) || /\p{Extended_Pictographic}/u.test(n.title));
    if (weird.length < 3) weird = weird.concat(all.filter(n => !weird.includes(n)).slice(-(3 - weird.length)));
    const sets = { 'Freshly baked': demote(fresh), 'Surprise me': demote(surprise), 'Weird only': demote(weird) };
    Object.keys(sets).forEach(k => { _vibeData[k] = sets[k].map((n, i) => legacyObj(n, i + 1)); });
    document.querySelectorAll('.vibe-card').forEach(card => {
      const label = (card.querySelector('.vibe-title') || {}).textContent;
      const set = sets[label];
      if (!set) return;
      const imgs = card.querySelectorAll('.vibe-img');
      imgs.forEach((img, i) => {
        const n = set[i] || set[0];
        img.src = n.image && !n.video && n.raw.media_layout !== 'video' ? n.image : (n.raw.thumbnail_url || iconFor(n));
      });
      const c = card.querySelector('.vibe-count');
      if (c) c.textContent = set.length + (set.length === 1 ? ' build' : ' builds');
    });
  }

  const COMMUNITY = {
    all: () => true,
    mobile: n => /ios|android|mobile/i.test(n.category),
    macos: n => /mac|windows|desktop/i.test(n.category) || n.postCats.includes('Desktop app'),
    interactive: n => /interactive|game|figma/i.test(n.category) || n.postCats.includes('Game') || n.tags.includes('fun'),
    web: n => /web|extension/i.test(n.category),
  };
  let _spotAll = [];
  function renderSpotlight(tab) {
    const row = document.querySelector('.hmiss-row');
    if (!row) return;
    // Spotlight shows ONE card: the top-scoring post in the chosen category
    const list = _spotAll.filter(COMMUNITY[tab] || COMMUNITY.all).slice(0, 1);
    row.innerHTML = list.length
      ? list.map((n, i) => heroCard(n, 'hmiss-card', i)).join('')
      : '<div style="padding:24px 16px;color:#8492A6;font-family:Outfit,sans-serif;">No builds here yet.</div>';
    row.querySelectorAll('video.hmiss-video').forEach(v => { try { hmissObserver.observe(v); } catch (e) {} });
  }
  window.setCommunityTab = function (tab, btn) {
    document.querySelectorAll('.community-tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderSpotlight(tab);
  };

  function buildContributors(all) {
    const row = document.querySelector('.contributors-row');
    if (!row) return;
    const g = new Map();
    all.forEach(n => {
      const k = n.profile.id; if (!k) return;
      if (!g.has(k)) g.set(k, { profile: n.profile, posts: [], score: 0 });
      const e = g.get(k); e.posts.push(n); e.score += n.score;
    });
    const ranked = demote([...g.values()].sort((a, b) => b.posts.length - a.posts.length || b.score - a.score), e => e.profile.name).slice(0, 8);
    const bg = ['#F0E9E0', '#F5E7EE', '#E8EDF7', '#EBF0E8', '#E8F2ED', '#EFE8F5', '#F5EDE3', '#E8EBF5'];
    const rc = ['#FF8140', '#EFB351', '#596378'];
    row.innerHTML = ranked.map((e, i) => {
      const pr = e.profile, cats = {};
      e.posts.forEach(p => { cats[p.category] = (cats[p.category] || 0) + 1; });
      const tags = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 2)
        .map(([c, k]) => `<span class="ctag">${k} ${esc(c)}</span>`).join('');
      return `<div class="contributor-card" onclick="viewProfile('${pr.id}')" style="cursor:pointer;background:${bg[i % bg.length]};">
        <div class="contrib-av-wrap">
          <span class="rank-badge" style="color:${rc[i] || '#293142'}">#${i + 1}</span>
          <img class="contrib-avatar" src="${esc(pr.avatar_url || _AVATAR_FB)}" onerror="_onAvatarErr(this)" alt="">
          <div class="contrib-sticker">
            <img src="https://ik.imagekit.io/424h6me27c/Frame%202147207780.png" alt="">
            <div class="sticker-count"><span class="sticker-num">${String(e.posts.length).padStart(2, '0')}</span><span class="sticker-lbl">${e.posts.length === 1 ? 'BUILD' : 'BUILDS'}</span></div>
          </div>
        </div>
        <div class="contrib-name">${esc(pr.name)}</div>
        <div class="contrib-role">${esc([pr.role, pr.company].filter(Boolean).join(' · '))}</div>
        <div class="contrib-exp">${pr.experience_years ? pr.experience_years + ' yrs exp' : ''}</div>
        <div class="contrib-tags">${tags}</div>
      </div>`;
    }).join('');
  }

  // ── Trending page: one ranked list of video-first cards ──
  function renderTrendPage() {
    const el = document.getElementById('trendingCards');
    if (!el) return;
    const rc = ['#FF8140', '#EFB351', '#596378'];
    const list = window._trendList || [];
    el.innerHTML = list.map((n, i) => {
      const card = heroCard(n, 'hmiss-card trend-card', i);
      return card.replace('<div class="hmiss-overlay"', `<div class="trend-rank" style="color:${rc[i] || '#293142'}">#${i + 1}</div><div class="hmiss-overlay"`);
    }).join('');
    el.querySelectorAll('video.hmiss-video').forEach(v => { try { hmissObserver.observe(v); } catch (e) {} });
  }
  window.renderTrendingCards = renderTrendPage;

  function buildTrending(all) {
    const windows = { '24h': 1, 'week': 7, 'month': 30 };
    Object.entries(windows).forEach(([k, d]) => {
      let list = all.filter(n => n.age <= d);
      if (list.length < 3) list = all;
      trendingData[k] = list.slice(0, 10).map((n, i) => legacyObj(n, i + 1));
    });
    const grid = document.querySelector('.trending-grid');
    if (grid) {
      const rc = ['#FF8140', '#EFB351', '#596378'];
      grid.innerHTML = all.slice(0, 6).map((n, i) => listCard(n, i + 1, rc[i] || '#293142')).join('');
    }
    window._trendList = all.slice(0, 10);
    renderTrendPage();
  }

  function buildCommunityFeed(posts) {
    const sec = document.querySelector('.nebuild-section');
    if (!sec) return;
    const h = sec.querySelector('.h-black');
    if (h) h.textContent = 'All builds from the community';
    const old = sec.querySelectorAll('.post-card');
    if (!old.length) return;
    const holder = document.createElement('div');
    holder.id = 'homeLiveFeed';
    old[0].parentNode.insertBefore(holder, old[0]);
    old.forEach(c => c.remove());
    const list = demote([...posts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)), p => (p.profiles && p.profiles.name) || '');
    const STEP = 5;
    let shown = 0;
    const more = document.createElement('div');
    more.style.cssText = 'padding:8px 16px 24px;text-align:center;';
    more.innerHTML = '<button type="button" style="width:100%;height:44px;border:1.5px solid #3169ED;border-radius:10px;background:#fff;color:#3169ED;font-family:Outfit,sans-serif;font-size:15px;font-weight:600;cursor:pointer;">Show more posts</button>';
    holder.after(more);
    function renderMore() {
      const chunk = list.slice(shown, shown + STEP);
      const box = document.createElement('div');
      box.innerHTML = chunk.map(renderFullPostCard).join('');
      holder.append(...box.childNodes);
      _hydratePosts(holder);          // after insertion, so "read more" can measure the text
      shown += chunk.length;
      if (shown >= list.length) more.remove();
    }
    more.querySelector('button').addEventListener('click', renderMore);
    renderMore();
  }

  // ── Tag pills: one scrollable row; wrap to a 2nd row only if 2+ pills are cut off ──
  function flowTags() {
    document.querySelectorAll('.tag-flow:not([data-flowed])').forEach(f => {
      const row = f.querySelector('.tag-flow-row');
      if (!row || !row.clientWidth) return;       // hidden tab — try again later
      f.setAttribute('data-flowed', '1');
      const inner = row.firstElementChild;
      const left = row.getBoundingClientRect().left, W = row.clientWidth;
      const pills = [...inner.children];
      const idx = pills.findIndex(p => p.getBoundingClientRect().right - left > W + 1);
      const over = idx === -1 ? [] : pills.slice(idx);
      if (over.length < 2) return;                // 0–1 clipped → keep single row
      const row2 = row.cloneNode(false), inner2 = inner.cloneNode(false);
      row2.style.marginTop = '8px';
      row2.appendChild(inner2); over.forEach(p => inner2.appendChild(p));
      row.after(row2);
    });
  }
  function resetFlow() {
    document.querySelectorAll('.tag-flow[data-flowed]').forEach(f => {
      const rows = f.querySelectorAll('.tag-flow-row');
      if (rows.length > 1) { for (let i = 1; i < rows.length; i++) { [...rows[i].firstElementChild.children].forEach(p => rows[0].firstElementChild.appendChild(p)); rows[i].remove(); } }
      f.removeAttribute('data-flowed');
    });
    flowTags();
  }
  let _raf = 0;
  const schedule = () => { cancelAnimationFrame(_raf); _raf = requestAnimationFrame(flowTags); };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', () => { clearTimeout(window._flowT); window._flowT = setTimeout(resetFlow, 150); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resetFlow);

  // ── Small style additions ──
  const st = document.createElement('style');
  st.textContent = `
    .post-source { color:#A9B0BE; display:inline-flex; align-items:center; gap:4px; font-size:13px; vertical-align:baseline; }
    .post-source svg { flex-shrink:0; position:relative; top:1px; }
    .card-time:has(.hot-count:empty) { display:none; }
    .helpful-carousel { margin-top:4px; }
    /* Spotlight: centred chips + a single centred card */
    .community-tab-row .community-tab:first-child { margin-left:auto; }
    .community-tab-row .community-tab:last-child { margin-right:auto; }
    /* Full-width video-first cards: Trending page + Spotlight */
    .inner-page-cards .trend-card { width:100%; }
    .hmiss-scroll .hmiss-row { width:100%; }
    .hmiss-scroll .hmiss-card { width:100%; }
    .trend-rank { position:absolute; left:14px; top:12px; z-index:3; font:900 38px/1 'Outfit',sans-serif; transform:rotate(-8deg);
      -webkit-text-stroke:7px #fff; paint-order:stroke fill; text-shadow:0 2px 8px rgba(0,0,0,.18); pointer-events:none; }
    .trend-note { margin:4px 16px 14px; padding:10px 12px; border-radius:12px; background:#F3F6FC; color:#6B7790; font:500 13px/1.4 'Outfit',sans-serif; display:flex; flex-direction:column; gap:6px; align-items:center; text-align:center; }
    .trend-note b { color:#293142; font-weight:600; }
    .trend-note-ic { color:#3169ED; flex-shrink:0; }
    /* long names no longer spill out of list cards */
    .project-card .card-info { min-width:0; flex:1; }
    .project-card .card-name-row { min-width:0; }
    .project-card .card-app-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
    .project-card .badge-live, .project-card .badge-platform { flex-shrink:0; }
    .project-card .card-desc { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }`;
  document.head.appendChild(st);

  // ── Desktop heads-up banner (this site is designed phone-first) ──
  function desktopBanner() {
    const isDesktop = window.matchMedia('(min-width: 820px)').matches && !window.matchMedia('(pointer: coarse)').matches;
    let dismissed = false; try { dismissed = sessionStorage.getItem('dwb_desktop_banner') === '1'; } catch (e) {}
    if (!isDesktop || dismissed) return;
    const bar = document.createElement('div');
    bar.id = 'desktopBanner';
    bar.innerHTML = '<span>🚧 This website isn’t optimised for desktop yet — it’s still a work in progress. Please open it on your phone for the best experience.</span><button type="button" aria-label="Dismiss">✕</button>';
    document.body.prepend(bar);
    document.body.classList.add('has-desktop-banner');
    bar.querySelector('button').addEventListener('click', () => {
      bar.remove(); document.body.classList.remove('has-desktop-banner');
      try { sessionStorage.setItem('dwb_desktop_banner', '1'); } catch (e) {}
    });
  }

  // ── First-visit note: honest disclaimer about LinkedIn-sourced data ──
  function firstVisitSheet() {
    let seen = false; try { seen = localStorage.getItem('dwb_disclaimer_seen') === '1'; } catch (e) {}
    if (seen) return;
    const wrap = document.createElement('div');
    wrap.id = 'disclaimerSheet';
    wrap.innerHTML = `
      <div class="dsc-backdrop"></div>
      <div class="dsc-sheet" role="dialog" aria-modal="true" aria-labelledby="dscTitle">
        <div class="dsc-grab"></div>
        <h3 id="dscTitle">A quick, honest note 👋</h3>
        <ul>
          <li>This is <b>mostly gathered from LinkedIn</b>, by hand.</li>
          <li>A few <b>mistakes may have slipped in</b>. They’re honest ones, never intentional.</li>
          <li>It’s a sincere attempt to bring everything designers build <b>onto one platform</b>.</li>
          <li>Want something <b>removed or corrected</b>? Tell me via <b>Menu (☰) → Share feedback</b>.</li>
        </ul>
        <p>Thank you for being kind. 💙</p>
        <button type="button" class="dsc-btn">Got it, let’s explore</button>
      </div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
    const close = () => {
      wrap.classList.remove('open');
      try { localStorage.setItem('dwb_disclaimer_seen', '1'); } catch (e) {}
      setTimeout(() => wrap.remove(), 350);
    };
    wrap.querySelector('.dsc-btn').addEventListener('click', close);
    wrap.querySelector('.dsc-backdrop').addEventListener('click', close);
  }

  const st2 = document.createElement('style');
  st2.textContent = `
    #desktopBanner { position:sticky; top:0; z-index:400; display:flex; align-items:center; justify-content:center; gap:12px;
      padding:9px 16px; background:#FFF4D6; color:#6B4E00; font:500 13px/1.35 'Outfit',sans-serif; text-align:center; border-bottom:1px solid #F1DFA6; }
    #desktopBanner button { flex-shrink:0; border:none; background:transparent; color:#6B4E00; font-size:14px; cursor:pointer; padding:2px 6px; }
    body.has-desktop-banner .sticky-nav { top:40px; }
    #disclaimerSheet { position:fixed; inset:0; z-index:1000; pointer-events:none; }
    #disclaimerSheet.open { pointer-events:all; }
    #disclaimerSheet .dsc-backdrop { position:absolute; inset:0; background:rgba(16,25,45,0.5); opacity:0; transition:opacity .3s; }
    #disclaimerSheet.open .dsc-backdrop { opacity:1; }
    #disclaimerSheet .dsc-sheet { position:absolute; left:50%; bottom:0; width:100%; max-width:560px; transform:translate(-50%,100%);
      transition:transform .35s cubic-bezier(.22,1,.36,1); background:#fff; border-radius:24px 24px 0 0; padding:12px 22px 26px;
      font-family:'Outfit',sans-serif; color:#10192D; max-height:88vh; overflow-y:auto; }
    #disclaimerSheet.open .dsc-sheet { transform:translate(-50%,0); }
    #disclaimerSheet .dsc-grab { width:40px; height:4px; border-radius:2px; background:#E0E5EF; margin:0 auto 16px; }
    #disclaimerSheet h3 { font-size:20px; font-weight:800; line-height:1.25; margin-bottom:12px; }
    #disclaimerSheet ul { list-style:none; display:flex; flex-direction:column; gap:10px; margin-bottom:14px; }
    #disclaimerSheet li { position:relative; padding-left:20px; font-size:14.5px; line-height:1.5; color:#454C5F; }
    #disclaimerSheet li::before { content:''; position:absolute; left:2px; top:8px; width:7px; height:7px; border-radius:50%; background:#3169ED; }
    #disclaimerSheet li b { color:#10192D; font-weight:600; }
    #disclaimerSheet p { font-size:14px; color:#596378; margin-bottom:18px; }
    #disclaimerSheet .dsc-btn { width:100%; height:48px; border:none; border-radius:12px; background:#3169ED; color:#fff; font:600 16px 'Outfit',sans-serif; cursor:pointer; }`;
  document.head.appendChild(st2);
  desktopBanner();
  setTimeout(firstVisitSheet, 900);

  // ───────────────────────── boot ─────────────────────────
  async function run() {
    try {
      const { data, error } = await sb.from('posts')
        .select('*, profiles(*), reactions(type), comments(id)')
        .order('created_at', { ascending: false });
      if (error || !data || !data.length) return; // keep static fallback
      const usable = data.filter(p => String(p.title || '').trim().length >= 15 && p.profiles);
      const ranked = usable.map(norm).sort((a, b) => b.score - a.score);
      const all = demote(ranked);
      all.forEach(registerDetail);
      _spotAll = all;
      buildBotd(ranked);
      buildHelpful(all);
      buildVibes(all);
      renderSpotlight('mobile');
      buildContributors(all);
      buildTrending(all);
      buildCommunityFeed(usable);
    } catch (e) {
      console.warn('home-live: falling back to static homepage', e);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();

  // ── Mobile autoplay safety net ──
  // Some phones (iOS Low Power Mode, Data Saver, strict autoplay) refuse silent autoplay until the
  // user touches the page. Force muted, and retry on the first touch / tap, plus when metadata loads.
  function _kickVideos() {
    const vh = window.innerHeight || 800;
    document.querySelectorAll('video.hmiss-video, video.post-video').forEach(v => {
      if (!v.paused) return;
      const card = v.closest('.botd-card');
      if (card && !card.classList.contains('botd-hero')) return;
      const r = v.getBoundingClientRect();
      if (!r.width || r.bottom < vh * 0.1 || r.top > vh * 0.9) return;
      const rx = r.left + r.width / 2;
      if (rx < 0 || rx > window.innerWidth) return;
      try { v.defaultMuted = true; v.muted = !document.body.classList.contains('sound-on'); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); } catch (e) {}
      const p = v.play();
      if (p && p.catch) p.catch(() => { try { v.muted = true; v.play().catch(() => {}); } catch (e) {} });
    });
  }
  ['touchstart', 'touchend', 'pointerdown', 'click', 'keydown'].forEach(ev =>
    document.addEventListener(ev, () => setTimeout(_kickVideos, 0), { passive: true }));
  window.addEventListener('scroll', (() => { let t; return () => { clearTimeout(t); t = setTimeout(_kickVideos, 250); }; })(), { passive: true });
  setTimeout(_kickVideos, 1200); setTimeout(_kickVideos, 3000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) _kickVideos(); });

  // ── Preload the centred card's video and its neighbours so they start instantly ──
  function _warmCarousel(sc) {
    const cards = [...sc.querySelectorAll('.botd-card, .hmiss-card')];
    if (!cards.length) return;
    const cx = sc.scrollLeft + sc.clientWidth / 2;
    let best = 0, bd = Infinity;
    cards.forEach((c, k) => { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - cx); if (d < bd) { bd = d; best = k; } });
    [best - 1, best, best + 1, best + 2].forEach(k => {
      const v = cards[k] && cards[k].querySelector('video');
      if (v && v.preload !== 'auto') { v.preload = 'auto'; try { v.load(); } catch (e) {} }
    });
  }
  function _warmAll() { document.querySelectorAll('.botd-scroll, .hmiss-scroll').forEach(_warmCarousel); }
  document.addEventListener('scroll', e => { const t = e.target; if (t && t.classList && (t.classList.contains('botd-scroll') || t.classList.contains('hmiss-scroll'))) _warmCarousel(t); }, { passive: true, capture: true });
  setTimeout(_warmAll, 800); setTimeout(_warmAll, 2500);
})();
