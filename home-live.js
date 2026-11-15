/* ───────────────────────────────────────────────────────────────
   home-live.js — fills every homepage section from the posts table.

   How posts are distributed (all deterministic, no hand-picking):
   • Quality gate ...... title ≥ 15 chars (drops "Test test", "Yes").
   • Score ............. reactions×3 + comments×4 + media(4) + live(2)
                         + live link(1) + recency boost (10·e^(-age/30d)).
   • Builds of the day . top 3 scored posts that have media, one per author.
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
    n.meta = n.category + ' · ' + getTimeAgo(p.created_at);
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
      ? `<video class="hmiss-video" src="${esc(n.video)}" preload="metadata" loop muted playsinline></video>`
      : (n.image ? `<img class="hmiss-video" src="${esc(n.image)}" alt="" loading="lazy">` : '');
    const blurs = n.hasMedia
      ? '<div class="hmiss-blur-1"></div><div class="hmiss-blur-2"></div><div class="hmiss-blur-3"></div><div class="hmiss-blur-4"></div>' : '';
    const ov = n.hasMedia ? '' : ' style="background:linear-gradient(to top,rgba(0,0,0,0.88) 0%,rgba(0,0,0,0.55) 40%,rgba(0,0,0,0.1) 100%);"';
    return `<div class="${cls}" onclick="openPostDetail('${n.id}')" style="${style}">
      ${media}${blurs}
      <div class="hmiss-overlay"${ov}>
        <div class="hmiss-meta-label"><span>${esc(n.meta)}</span><span class="hmiss-meta-fire">${n.hot === 'New' ? '✨ New' : '🔥 ' + n.hot}</span></div>
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
          <img src="${esc(icon)}" style="width:64px;height:64px;border-radius:14px;object-fit:cover;display:block;${hasRealIcon(n) ? '' : 'border:1px solid #E0E5EF;'}" alt="">
        </div>
        <div class="card-info">
          <div class="card-name-row"><span class="card-app-name">${esc(n.name)}</span>${badge}</div>
          <div class="card-desc">${esc(n.tagline)}</div>
          <div class="card-meta-row">
            <span class="card-platform">${esc(n.meta)}</span>
            <span class="card-time">🔥 <span class="hot-count">${n.hot}</span></span>
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
      name: n.name, status: n.status, desc: n.tagline, meta: n.meta, hot: n.hot === 'New' ? 'New' : n.hot,
      author: n.author, role: n.role, previewImg: n.image, liveUrl: n.raw.live_url || '#',
    };
  }

  // ── Make openPostDetail() work for DB posts ──
  function registerDetail(n) {
    const p = n.raw, pr = n.profile;
    const cnt = t => (p.reactions || []).filter(r => r.type === t).length;
    let tools = [];
    try { tools = Array.isArray(p.tools_used) ? p.tools_used : JSON.parse(p.tools_used || '[]'); } catch (e) {}
    tools = tools.map(t => typeof t === 'string' ? { name: t, icon_url: (typeof _getToolIcon === 'function' ? _getToolIcon(t) : null) } : t);
    _postDetailData[n.id] = {
      key: n.id, title: n.name, desc: p.description || n.title,
      status: n.status, category: p.category || '', img: n.image || iconFor(n),
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

  // ───────────────────────── sections ─────────────────────────
  function buildBotd(all) {
    const el = document.querySelector('.botd-scroll');
    if (!el) return;
    const seen = new Set(), pick = [];
    for (const n of all.filter(x => x.hasMedia)) {
      if (seen.has(n.profile.id)) continue;
      seen.add(n.profile.id); pick.push(n);
      if (pick.length === 3) break;
    }
    el.innerHTML = pick.map((n, i) => heroCard(n, 'botd-card', i)).join('');
    el.querySelectorAll('video.hmiss-video').forEach(v => { try { hmissObserver.observe(v); } catch (e) {} });
    if (typeof _updateBotdHero === 'function') _updateBotdHero();
  }

  const SELFCARE = /mood|journal|calm|breath|mindful|meditat|wellness|habit|self[- ]?track|pomodoro|sleep|health|remind|focus|timer/i;
  function buildHelpful(all) {
    const used = new Set();
    const tabs = ['utility', 'fun', 'productivity', 'self-care'];
    tabs.forEach(t => { helpfulData[t] = []; });
    const by = t => all.filter(n => t === 'self-care'
      ? (n.tags.includes(t) || SELFCARE.test(n.title + ' ' + (n.raw.description || '').slice(0, 300)))
      : n.tags.includes(t));
    tabs.forEach(t => { by(t).slice(0, 4).forEach(n => { helpfulData[t].push(n); used.add(n.id); }); });
    // top up every tab to 3 with best posts not yet shown anywhere, then any
    tabs.forEach(t => {
      const pool = [...all.filter(n => !used.has(n.id)), ...all.filter(n => used.has(n.id))];
      for (const n of pool) {
        if (helpfulData[t].length >= 3) break;
        if (!helpfulData[t].includes(n)) { helpfulData[t].push(n); used.add(n.id); }
      }
    });
    tabs.forEach(t => { helpfulData[t] = helpfulData[t].map(n => legacyObj(n, 0)); });
    const active = document.querySelector('.helpful-tab.active');
    const m = active && /setHelpfulTab\('([^']+)'/.exec(active.getAttribute('onclick') || '');
    renderHelpfulCards(m ? m[1] : 'utility');
  }

  function buildVibes(all) {
    const day = new Date().toISOString().slice(0, 10);
    const fresh = [...all].sort((a, b) => new Date(b.created) - new Date(a.created)).slice(0, 12);
    const surprise = shuffle(all, day).slice(0, 10);
    let weird = all.filter(n => n.tags.includes('fun') || n.postCats.includes('Game') ||
      /game|interactive|figma plugin/i.test(n.category) || /\p{Extended_Pictographic}/u.test(n.title));
    if (weird.length < 3) weird = weird.concat(all.filter(n => !weird.includes(n)).slice(-(3 - weird.length)));
    const sets = { 'Freshly baked': fresh, 'Surprise me': surprise, 'Weird only': weird };
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
      if (c) c.textContent = set.length + ' builds';
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
    const list = _spotAll.filter(COMMUNITY[tab] || COMMUNITY.all);
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
    const ranked = [...g.values()].sort((a, b) => b.posts.length - a.posts.length || b.score - a.score).slice(0, 8);
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
            <div class="sticker-count"><span class="sticker-num">${String(e.posts.length).padStart(2, '0')}</span><span class="sticker-lbl">BUILDS</span></div>
          </div>
        </div>
        <div class="contrib-name">${esc(pr.name)}</div>
        <div class="contrib-role">${esc([pr.role, pr.company].filter(Boolean).join(' · '))}</div>
        <div class="contrib-exp">${pr.experience_years ? pr.experience_years + ' yrs exp' : ''}</div>
        <div class="contrib-tags">${tags}</div>
      </div>`;
    }).join('');
  }

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
      grid.innerHTML = all.slice(0, 8).map((n, i) => listCard(n, i + 1, rc[i] || '#293142')).join('');
    }
    if (typeof renderTrendingCards === 'function' && document.getElementById('trendingCards')) {
      renderTrendingCards(typeof _currentTrendingTab !== 'undefined' ? _currentTrendingTab : '24h');
    }
  }

  function buildCommunityFeed(posts) {
    const sec = document.querySelector('.nebuild-section');
    if (!sec) return;
    const old = sec.querySelectorAll('.post-card');
    if (!old.length) return;
    const holder = document.createElement('div');
    holder.id = 'homeLiveFeed';
    old[0].parentNode.insertBefore(holder, old[0]);
    old.forEach(c => c.remove());
    const newest = [...posts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 4);
    holder.innerHTML = newest.map(renderFullPostCard).join('');
    holder.querySelectorAll('.post-video').forEach(v => { try { _observeVideo(v); } catch (e) {} });
    holder.querySelectorAll('.post-desc-container').forEach(c => { try { _initReadMore(c); } catch (e) {} });
  }

  // ───────────────────────── boot ─────────────────────────
  async function run() {
    try {
      const { data, error } = await sb.from('posts')
        .select('*, profiles(*), reactions(type), comments(id)')
        .order('created_at', { ascending: false });
      if (error || !data || !data.length) return; // keep static fallback
      const usable = data.filter(p => String(p.title || '').trim().length >= 15 && p.profiles);
      const all = usable.map(norm).sort((a, b) => b.score - a.score);
      all.forEach(registerDetail);
      _spotAll = all;
      buildBotd(all);
      buildHelpful(all);
      buildVibes(all);
      renderSpotlight('all');
      buildContributors(all);
      buildTrending(all);
      buildCommunityFeed(usable);
    } catch (e) {
      console.warn('home-live: falling back to static homepage', e);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
