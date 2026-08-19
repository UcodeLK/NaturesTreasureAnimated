/**
 * Nature's Treasure — Pure Oud & Agarwood Continuous Experience
 * Vanilla JavaScript • High-Performance Canvas Scrubbing Engine
 */

(function () {
  'use strict';

  // --- CONFIGURATION & FOLDER DEFINITION ---
  const FOLDER_CONFIG = [
    { folder: '1st pair', count: 25 },
    { folder: '2nd pair', count: 30 },
    { folder: '3rd pair', count: 30 },
    { folder: '4th pair', count: 31 },
    { folder: '5th pair', count: 32 },
    { folder: '6th pair', count: 32 },
    { folder: '7th pair', count: 33 },
    { folder: '8th pair', count: 31 }
  ];

  // Build the global continuous frame sequence in strict numerical order
  const framePaths = [];
  FOLDER_CONFIG.forEach(item => {
    for (let i = 1; i <= item.count; i++) {
      const paddedIndex = String(i).padStart(3, '0');
      framePaths.push(`${item.folder}/ezgif-frame-${paddedIndex}.jpg`);
    }
  });

  const TOTAL_FRAMES = framePaths.length;
  const loadedImages = new Array(TOTAL_FRAMES);

  // --- DOM ELEMENTS ---
  const body = document.body;
  const loader = document.getElementById('loader');
  const loaderBarFill = document.getElementById('loader-bar-fill');
  const loaderPercent = document.getElementById('loader-percent');
  const loaderCount = document.getElementById('loader-count');

  const canvas = document.getElementById('sequenceCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });

  const scrollPrompt = document.getElementById('scrollPrompt');
  const replayBtn = document.getElementById('btn-replay');
  const storyBeats = document.querySelectorAll('.story-beat');

  // --- STATE ---
  let targetFrame = 0;
  let currentFrame = 0;
  let lastDrawnIndex = -1;
  let scrollProgress = 0;
  let isReady = false;
  let needsResize = true;

  // Lock scroll during preloading
  body.classList.add('is-loading');

  // --- CANVAS RESIZE & COVER SCALING ---
  function resizeCanvas() {
    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    lastDrawnIndex = -1; // Force redraw on next frame
    needsResize = false;
  }

  window.addEventListener('resize', () => {
    needsResize = true;
  }, { passive: true });

  // --- PRELOADER SYSTEM ---
  let loadedCount = 0;

  function handleImageLoad(index, img) {
    loadedImages[index] = img;
    loadedCount++;

    const progress = Math.min(100, Math.round((loadedCount / TOTAL_FRAMES) * 100));
    if (loaderBarFill) loaderBarFill.style.width = `${progress}%`;
    if (loaderPercent) loaderPercent.textContent = `${progress}%`;
    if (loaderCount) loaderCount.textContent = `Loading ${loadedCount} / ${TOTAL_FRAMES} frames`;

    if (loadedCount === TOTAL_FRAMES) {
      onAllFramesLoaded();
    }
  }

  function startPreloading() {
    framePaths.forEach((path, index) => {
      const img = new Image();
      img.onload = () => handleImageLoad(index, img);
      img.onerror = () => {
        console.warn(`Frame failed to load: ${path}`);
        handleImageLoad(index, img);
      };
      img.src = encodeURI(path);
    });
  }

  function onAllFramesLoaded() {
    setTimeout(() => {
      resizeCanvas();
      isReady = true;
      body.classList.remove('is-loading');
      loader.classList.add('loaded');

      calculateScroll();
      drawFrame(0);
      requestAnimationFrame(renderLoop);
    }, 300);
  }

  // --- DRAWING WITH COVER SCALING & FAILSAFE ---
  function drawFrame(frameIdx) {
    const targetIdx = Math.max(0, Math.min(TOTAL_FRAMES - 1, Math.round(frameIdx)));

    // Retrieve image or fallback to closest loaded frame to prevent pitch black screen
    let img = loadedImages[targetIdx];
    if (!img || !img.complete || img.naturalWidth === 0) {
      for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
        const prev = targetIdx - offset;
        const next = targetIdx + offset;
        if (prev >= 0 && loadedImages[prev] && loadedImages[prev].complete && loadedImages[prev].naturalWidth > 0) {
          img = loadedImages[prev];
          break;
        }
        if (next < TOTAL_FRAMES && loadedImages[next] && loadedImages[next].complete && loadedImages[next].naturalWidth > 0) {
          img = loadedImages[next];
          break;
        }
      }
    }

    if (!img || !img.complete || img.naturalWidth === 0) return;

    // Ensure high quality smoothing is maintained
    if (!ctx.imageSmoothingEnabled || ctx.imageSmoothingQuality !== 'high') {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    }

    const cWidth = canvas.width;
    const cHeight = canvas.height;
    const iWidth = img.naturalWidth;
    const iHeight = img.naturalHeight;

    const cAspect = cWidth / cHeight;
    const iAspect = iWidth / iHeight;

    let drawWidth, drawHeight, dx, dy;

    if (cAspect > iAspect) {
      drawWidth = cWidth;
      drawHeight = cWidth / iAspect;
      dx = 0;
      dy = (cHeight - drawHeight) * 0.5;
    } else {
      drawWidth = cHeight * iAspect;
      drawHeight = cHeight;
      dx = (cWidth - drawWidth) * 0.5;
      dy = 0;
    }

    ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
    lastDrawnIndex = targetIdx;
  }

  // --- SCROLL POSITION CALCULATION ---
  function calculateScroll() {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if (maxScroll <= 0) {
      scrollProgress = 0;
    } else {
      scrollProgress = Math.max(0, Math.min(1, window.scrollY / maxScroll));
    }

    targetFrame = scrollProgress * (TOTAL_FRAMES - 1);
  }

  window.addEventListener('scroll', calculateScroll, { passive: true });

  // --- STORYTELLING & UI UPDATES ---
  function updateUI(progress) {
    // 1. Scroll Prompt (Fade out during first 8% of scroll)
    if (scrollPrompt) {
      if (progress > 0.08) {
        scrollPrompt.classList.add('fade-out');
      } else {
        scrollPrompt.classList.remove('fade-out');
      }
    }

    // 3. Story Beats Synchronized Transitions
    storyBeats.forEach(beat => {
      const start = parseFloat(beat.getAttribute('data-start') || '0');
      const end = parseFloat(beat.getAttribute('data-end') || '1');

      if (progress >= start && progress <= end) {
        beat.classList.add('is-active');
        beat.classList.remove('is-exiting');
      } else if (progress > end) {
        beat.classList.remove('is-active');
        beat.classList.add('is-exiting');
      } else {
        beat.classList.remove('is-active');
        beat.classList.remove('is-exiting');
      }
    });
  }

  // --- MAIN RENDER LOOP ---
  function renderLoop() {
    if (needsResize) {
      resizeCanvas();
    }

    // Smooth Lerp Interpolation
    const delta = (targetFrame - currentFrame) * 0.15;
    currentFrame += delta;

    if (Math.abs(targetFrame - currentFrame) < 0.001) {
      currentFrame = targetFrame;
    }

    const roundedFrame = Math.round(currentFrame);

    if (roundedFrame !== lastDrawnIndex || needsResize) {
      drawFrame(roundedFrame);
    }

    updateUI(scrollProgress);

    requestAnimationFrame(renderLoop);
  }

  // --- REPLAY ACTION ---
  if (replayBtn) {
    replayBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }

  // Start preloading
  startPreloading();
})();
