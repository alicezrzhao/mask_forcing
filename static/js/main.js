/* ==========================================================================
   Mask Forcing -- project page interactions
   - one section per baseline method, rendered in order, each with a heading
   - IntersectionObserver lazy loading: sources attach on approach,
     playback pauses when a clip scrolls out of view (saves bandwidth/CPU)
   - global playback-rate control, play/pause all, lightbox, scroll spy
   ========================================================================== */
(function () {
  'use strict';

  var GROUPS = window.VIDEO_GROUPS || [];
  var LONG_VIDEOS = window.LONG_VIDEOS || [];

  /* ------------------------------------------------------------ helpers -- */
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  /* ================================ THEME =============================== */
  // Placed before everything else: the gallery block below can return early,
  // and the toggle must work even on a page with no clips.
  (function () {
    var toggle = document.getElementById('themeToggle');
    if (!toggle) return;

    var root = document.documentElement;
    var KEY = 'mf-theme';

    function stored() {
      try { return localStorage.getItem(KEY); } catch (e) { return null; }
    }

    // No explicit choice yet -> fall back to whatever the OS asks for.
    function active() {
      var t = root.getAttribute('data-theme');
      if (t === 'dark' || t === 'light') return t;
      return window.matchMedia &&
             window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function label() {
      var next = active() === 'dark' ? 'light' : 'dark';
      toggle.title = 'Switch to ' + next + ' theme';
      toggle.setAttribute('aria-pressed', String(active() === 'dark'));
    }

    toggle.addEventListener('click', function () {
      var next = active() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem(KEY, next); } catch (e) {}
      label();
    });

    // Track the OS setting only while the visitor has no preference of their own.
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () { if (!stored()) label(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }

    label();
  })();

  /* ============================== NAVIGATION ============================= */
  var nav = document.getElementById('nav');
  var navLinks = document.getElementById('navLinks');
  var navToggle = document.getElementById('navToggle');
  var navProgress = document.getElementById('navProgress');
  var toTop = document.getElementById('toTop');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      navLinks.classList.toggle('is-open');
    });
    navLinks.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') navLinks.classList.remove('is-open');
    });
  }

  // scroll spy + progress bar + back-to-top visibility
  var spyTargets = [];
  if (navLinks) {
    Array.prototype.forEach.call(navLinks.querySelectorAll('a'), function (a) {
      var id = a.getAttribute('href');
      if (id && id.charAt(0) === '#' && id.length > 1) {
        var sec = document.querySelector(id);
        if (sec) spyTargets.push({ link: a, sec: sec });
      }
    });
  }

  var rafPending = false;
  function onScroll() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () {
      rafPending = false;

      var doc = document.documentElement;
      var scrolled = doc.scrollTop || document.body.scrollTop;
      var height = doc.scrollHeight - doc.clientHeight;
      if (navProgress) {
        navProgress.style.width = (height > 0 ? (scrolled / height) * 100 : 0) + '%';
      }
      if (toTop) toTop.classList.toggle('is-visible', scrolled > 700);

      var probe = scrolled + (nav ? nav.offsetHeight : 0) + 90;
      var active = null;
      spyTargets.forEach(function (t) {
        if (t.sec.offsetTop <= probe) active = t;
      });
      spyTargets.forEach(function (t) {
        t.link.classList.toggle('is-active', t === active);
      });
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* =============================== LIGHTBOX ============================= */
  var lightbox = document.getElementById('lightbox');
  var lightboxVideo = document.getElementById('lightboxVideo');
  var lightboxCaption = document.getElementById('lightboxCaption');
  var lightboxClose = document.getElementById('lightboxClose');

  function openLightbox(src, caption) {
    if (!lightbox) return;
    lightboxVideo.src = src;
    lightboxVideo.playbackRate = state.speed;
    lightboxCaption.textContent = caption || '';
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
    lightboxVideo.play().catch(function () {});
  }

  function closeLightbox() {
    if (!lightbox || lightbox.hidden) return;
    lightboxVideo.pause();
    lightboxVideo.removeAttribute('src');
    lightboxVideo.load();
    lightbox.hidden = true;
    document.body.style.overflow = '';
  }

  if (lightbox) {
    lightboxClose.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) closeLightbox();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeLightbox();
    });
  }

  /* ================================ GALLERY ============================= */
  var sectionsHost = document.getElementById('videoSections');
  var emptyMsg = document.getElementById('galleryEmpty');
  var longGrid = document.getElementById('longVideoGrid');
  var longEmpty = document.getElementById('longVideoEmpty');
  var tabsJump = document.getElementById('tabsJump');
  var tabsSpeed = document.getElementById('tabsSpeed');
  var btnToggleAll = document.getElementById('btnToggleAll');

  var state = { speed: 1, paused: false };

  var hasGallery = !!(sectionsHost && GROUPS.length);
  var hasLong = !!(longGrid && LONG_VIDEOS.length);
  if (emptyMsg) emptyMsg.hidden = hasGallery;
  if (longEmpty) longEmpty.hidden = hasLong;
  if (!hasGallery && !hasLong) return;

  /* --------------------------------------------------- lazy observers --- */
  // Attach <source> only when a card gets close to the viewport.
  var loadObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var video = entry.target;
      if (!video.dataset.loaded) {
        video.src = video.dataset.src;
        video.dataset.loaded = '1';
        video.load();
      }
      loadObserver.unobserve(video);
    });
  }, { rootMargin: '600px 0px' });

  // Only play what is actually on screen.
  var playObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var video = entry.target;
      if (entry.isIntersecting) {
        video.dataset.onscreen = '1';
        if (!state.paused && !video.dataset.userPaused) {
          video.play().catch(function () {});
        }
      } else {
        delete video.dataset.onscreen;
        video.pause();
      }
    });
  }, { threshold: 0.2 });

  /* --------------------------------------------------------- rendering --- */
  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // Draggable progress bar bound to a single <video>.
  function makeScrubber(video) {
    var bar = el('div', 'video-scrub');
    var track = el('div', 'scrub-track');
    var buffered = el('div', 'scrub-buffered');
    var played = el('div', 'scrub-played');
    var knob = el('div', 'scrub-knob');
    var time = el('span', 'scrub-time', '0:00 / 0:00');

    track.appendChild(buffered);
    track.appendChild(played);
    track.appendChild(knob);
    bar.appendChild(track);
    bar.appendChild(time);

    var dragging = false;
    var resumeAfterDrag = false;

    function ratioFromEvent(e) {
      var box = track.getBoundingClientRect();
      var x = (e.touches ? e.touches[0].clientX : e.clientX) - box.left;
      return Math.min(1, Math.max(0, box.width ? x / box.width : 0));
    }

    function paint(ratio) {
      var pct = (ratio * 100).toFixed(3) + '%';
      played.style.width = pct;
      knob.style.left = pct;
    }

    function sync() {
      var dur = video.duration;
      if (!isFinite(dur) || dur <= 0) return;
      if (!dragging) paint(video.currentTime / dur);
      time.textContent = fmtTime(video.currentTime) + ' / ' + fmtTime(dur);
      if (video.buffered.length) {
        buffered.style.width =
          ((video.buffered.end(video.buffered.length - 1) / dur) * 100).toFixed(2) + '%';
      }
    }

    function seek(e) {
      var dur = video.duration;
      if (!isFinite(dur) || dur <= 0) return;
      var ratio = ratioFromEvent(e);
      paint(ratio);
      video.currentTime = ratio * dur;
      time.textContent = fmtTime(video.currentTime) + ' / ' + fmtTime(dur);
    }

    function onMove(e) {
      if (!dragging) return;
      e.preventDefault();
      seek(e);
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;
      bar.classList.remove('is-dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      if (resumeAfterDrag) {
        delete video.dataset.userPaused;
        video.play().catch(function () {});
      }
    }

    function onDown(e) {
      e.stopPropagation();
      if (!video.dataset.loaded) {
        video.src = video.dataset.src;
        video.dataset.loaded = '1';
        video.load();
      }
      dragging = true;
      resumeAfterDrag = !video.paused;
      bar.classList.add('is-dragging');
      video.pause();
      seek(e);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
    }

    track.addEventListener('mousedown', onDown);
    track.addEventListener('touchstart', onDown, { passive: false });
    // swallow clicks so the frame's play/pause handler stays out of the way
    bar.addEventListener('click', function (e) { e.stopPropagation(); });

    video.addEventListener('timeupdate', sync);
    video.addEventListener('loadedmetadata', sync);
    video.addEventListener('progress', sync);
    video.addEventListener('seeked', sync);

    return bar;
  }

  function makeCard(item) {
    var card = el('div', 'video-card');

    var shell = el('div', 'video-shell');
    var skeleton = el('div', 'video-skeleton', 'loading clip');

    var video = el('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'none';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.dataset.src = item.src;

    video.addEventListener('loadeddata', function () {
      skeleton.classList.add('is-hidden');
      video.playbackRate = state.speed;
    });
    video.addEventListener('error', function () {
      skeleton.classList.remove('is-hidden');
      skeleton.textContent = 'clip unavailable';
    });

    shell.appendChild(video);
    shell.appendChild(skeleton);

    function togglePlay() {
      if (video.paused) {
        delete video.dataset.userPaused;
        video.play().catch(function () {});
      } else {
        video.dataset.userPaused = '1';
        video.pause();
      }
    }

    // click anywhere on the frame toggles this clip
    shell.addEventListener('click', function (e) {
      if (e.target.closest('.video-actions') || e.target.closest('.video-scrub')) return;
      togglePlay();
    });

    var actions = el('div', 'video-actions');

    var playBtn = el('button', 'icon-btn', '<i class="fas fa-pause"></i>');
    playBtn.title = 'Pause clip';
    playBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      togglePlay();
    });

    var expandBtn = el('button', 'icon-btn', '<i class="fas fa-expand"></i>');
    expandBtn.title = 'Open full size';
    expandBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openLightbox(item.src, item.prompt);
    });

    var restartBtn = el('button', 'icon-btn', '<i class="fas fa-rotate-left"></i>');
    restartBtn.title = 'Restart clip';
    restartBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      video.currentTime = 0;
      delete video.dataset.userPaused;
      video.play().catch(function () {});
    });

    actions.appendChild(playBtn);
    actions.appendChild(restartBtn);
    actions.appendChild(expandBtn);

    // big center badge, only visible while this clip is paused
    var pausedBadge = el('div', 'video-paused', '<i class="fas fa-play"></i>');
    shell.appendChild(pausedBadge);

    // keep the button icon and the badge in sync with the real element state
    function syncPlayState() {
      var paused = video.paused;
      playBtn.innerHTML = paused
        ? '<i class="fas fa-play"></i>'
        : '<i class="fas fa-pause"></i>';
      playBtn.title = paused ? 'Play clip' : 'Pause clip';
      // before the clip streams in it is technically "paused" -- don't flash the
      // badge on every card while the page is still loading
      card.classList.toggle('is-paused', paused && video.readyState > 0);
    }
    video.addEventListener('play', syncPlayState);
    video.addEventListener('pause', syncPlayState);
    video.addEventListener('loadeddata', syncPlayState);
    syncPlayState();

    shell.appendChild(makeScrubber(video));

    card.appendChild(shell);

    // prompt: overlays the frame on hover (pointer devices), or flows below the
    // clip as plain text on touch devices -- it lives outside .video-shell so the
    // static layout is not clipped by the shell's fixed aspect-ratio box
    var caption = el('div', 'video-caption');
    caption.appendChild(el('p', 'video-caption-text'));
    caption.querySelector('.video-caption-text').textContent = item.prompt;
    card.appendChild(caption);

    // same trick for the button row: floated over the frame on hover, but moved
    // out into the strip below the clip where there is no hover to reveal it
    card.appendChild(actions);

    loadObserver.observe(video);
    playObserver.observe(video);
    return card;
  }

  function currentVideos() {
    return Array.prototype.slice.call(document.querySelectorAll('.video-grid video'));
  }

  function render() {
    if (!hasGallery) return;

    var frag = document.createDocumentFragment();
    GROUPS.forEach(function (group) {
      var block = el('section', 'method-block');
      block.id = 'cmp-' + group.method;

      var head = el('div', 'method-head');
      head.appendChild(el('h3', 'method-title', group.methodLabel));
      block.appendChild(head);

      var grid = el('div', 'video-grid');
      group.items.forEach(function (item) {
        grid.appendChild(makeCard(item));
      });
      block.appendChild(grid);
      frag.appendChild(block);
    });
    sectionsHost.appendChild(frag);

    state.paused = false;
    syncToggleAllButton();
  }

  function renderLongVideos() {
    if (!hasLong) return;
    var frag = document.createDocumentFragment();
    LONG_VIDEOS.forEach(function (item) {
      frag.appendChild(makeCard(item));
    });
    longGrid.appendChild(frag);
  }

  /* -------------------------------------------------------- jump tabs --- */
  function buildJumpTabs() {
    if (!tabsJump) return;
    tabsJump.innerHTML = '';
    GROUPS.forEach(function (group, i) {
      var btn = el('button', 'tab' + (i === 0 ? ' is-active' : ''));
      btn.dataset.target = 'cmp-' + group.method;
      btn.innerHTML = group.methodLabel;
      btn.addEventListener('click', function () {
        var target = document.getElementById(btn.dataset.target);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      tabsJump.appendChild(btn);
    });

    var blocks = GROUPS.map(function (group) {
      return document.getElementById('cmp-' + group.method);
    });
    var pending = false;
    window.addEventListener('scroll', function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        var probe = (document.documentElement.scrollTop || document.body.scrollTop) +
          (nav ? nav.offsetHeight : 0) + 140;
        var active = 0;
        blocks.forEach(function (b, i) {
          if (b && b.offsetTop <= probe) active = i;
        });
        Array.prototype.forEach.call(tabsJump.querySelectorAll('.tab'), function (b, i) {
          b.classList.toggle('is-active', i === active);
        });
      });
    }, { passive: true });
  }

  /* ------------------------------------------------------------ speed --- */
  if (tabsSpeed) {
    Array.prototype.forEach.call(tabsSpeed.querySelectorAll('.tab'), function (btn) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(tabsSpeed.querySelectorAll('.tab'), function (b) {
          b.classList.remove('is-active');
        });
        btn.classList.add('is-active');
        state.speed = parseFloat(btn.dataset.speed) || 1;
        currentVideos().forEach(function (v) { v.playbackRate = state.speed; });
        if (lightboxVideo && !lightbox.hidden) lightboxVideo.playbackRate = state.speed;
      });
    });
  }

  /* ------------------------------------------------------- play/pause --- */
  function syncToggleAllButton() {
    if (!btnToggleAll) return;
    btnToggleAll.innerHTML = state.paused
      ? '<i class="fas fa-play"></i><span>Play all</span>'
      : '<i class="fas fa-pause"></i><span>Pause all</span>';
  }

  if (btnToggleAll) {
    btnToggleAll.addEventListener('click', function () {
      state.paused = !state.paused;
      currentVideos().forEach(function (v) {
        if (state.paused) {
          v.pause();
          v.dataset.userPaused = '1';
        } else {
          delete v.dataset.userPaused;
          if (v.dataset.onscreen) v.play().catch(function () {});
        }
      });
      syncToggleAllButton();
    });
  }

  // Pause everything while the tab is hidden.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      currentVideos().forEach(function (v) { v.pause(); });
    } else if (!state.paused) {
      currentVideos().forEach(function (v) {
        if (v.dataset.onscreen && !v.dataset.userPaused) v.play().catch(function () {});
      });
    }
  });

  render();
  renderLongVideos();
  buildJumpTabs();
})();
