/**
 * Nature's Treasure — Pure Oud & Agarwood Journey
 * High-Performance Progressive Frame Scrubbing & Memory Management Engine
 */

(function () {
  'use strict';

  // --- CONFIGURATION & FOLDER DEFINITIONS ---
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

  // Build frame metadata and pair ranges
  const framePaths = [];
  const pairs = [];
  let globalIndex = 0;

  FOLDER_CONFIG.forEach((item, pIdx) => {
    const pairStart = globalIndex;
    const pairPaths = [];

    for (let i = 1; i <= item.count; i++) {
      const paddedIndex = String(i).padStart(3, '0');
      const path = `${item.folder}/ezgif-frame-${paddedIndex}.jpg`;
      framePaths.push(path);
      pairPaths.push(path);
      globalIndex++;
    }

    const pairEnd = globalIndex - 1;
    pairs.push({
      index: pIdx,
      folder: item.folder,
      count: item.count,
      startIndex: pairStart,
      endIndex: pairEnd,
      paths: pairPaths,
      status: 'idle', // 'idle' | 'loading' | 'loaded'
      promise: null
    });
  });

  const TOTAL_FRAMES = framePaths.length;
  const TOTAL_PAIRS = pairs.length;

  // --- FRAME CACHE (MAP) ---
  const frameCache = new Map();

  // --- DOM ELEMENTS ---
  const body = document.body;
  const loader = document.getElementById('loader');
  const loaderBarFill = document.getElementById('loader-bar-fill');
  const loaderPercent = document.getElementById('loader-percent');
  const loaderCount = document.getElementById('loader-count');

  const viewportStage = document.getElementById('viewportStage');
  const storyImage = document.getElementById('storyImage');
  const scrollPrompt = document.getElementById('scrollPrompt');
  const replayBtn = document.getElementById('btn-replay');
  const storyBeats = document.querySelectorAll('.story-beat');
  const timelineProgress = document.getElementById('timelineProgress');
  const timelineSteps = document.querySelectorAll('.timeline-step');

  // --- STATE ---
  let targetFrame = 0;
  let currentFrame = 0;
  let lastRenderedIndex = -1;
  let scrollProgress = 0;
  let isReady = false;
  let isStageVisible = true;
  let rafId = null;
  let activePairIndex = 0;
  let loadingPairsCount = 0;

  // Lock scroll during initial load of Pair 1
  body.classList.add('is-loading');

  // --- ASYNC DECODE & CACHE FUNCTION ---
  async function decodeAndCacheFrame(path) {
    if (frameCache.has(path)) {
      return frameCache.get(path);
    }

    const img = new Image();
    img.loading = "eager";
    img.decoding = "async";
    img.src = encodeURI(path);

    try {
      await img.decode();
    } catch (e) {
      if (!img.complete) {
        await new Promise((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });
      }
    }

    frameCache.set(path, img);
    return img;
  }

  // --- PAIR LOADER WITH MICRO-CONCURRENCY (Prevents CPU/Decode Stutter) ---
  async function loadPair(pairIdx, onProgress) {
    if (pairIdx < 0 || pairIdx >= TOTAL_PAIRS) return;
    const pair = pairs[pairIdx];

    if (pair.status === 'loaded') return pair.promise;
    if (pair.status === 'loading') return pair.promise;

    pair.status = 'loading';
    loadingPairsCount++;

    let loadedInPair = 0;

    pair.promise = (async () => {
      // Decode in smooth micro-batches (concurrency 4) to prevent thread locks
      const concurrency = 4;
      let pathIdx = 0;

      async function worker() {
        while (pathIdx < pair.paths.length) {
          const currentIdx = pathIdx++;
          const path = pair.paths[currentIdx];
          await decodeAndCacheFrame(path);
          loadedInPair++;
          if (typeof onProgress === 'function') {
            onProgress(loadedInPair, pair.count);
          }
        }
      }

      const workers = [];
      const numWorkers = Math.min(concurrency, pair.paths.length);
      for (let w = 0; w < numWorkers; w++) {
        workers.push(worker());
      }
      await Promise.all(workers);

      pair.status = 'loaded';
      loadingPairsCount--;

      // Continue queue chain until all pairs are ready
      processQueue();
      return pair;
    })();

    return pair.promise;
  }

  // --- MEMORY OPTIMIZATION & EVICTION ---
  // Retains current pair, next pair, and previous pair for ultra-fast scrubbing.
  // Releases intermediate frames for completed distant pairs.
  function manageActiveMemory(currentPair) {
    const keepPairs = new Set([
      currentPair,
      currentPair + 1,
      Math.max(0, currentPair - 1)
    ]);

    pairs.forEach((pair) => {
      if (!keepPairs.has(pair.index)) {
        if (pair.status === 'loaded') {
          pair.paths.forEach((path, idx) => {
            const isLastFrame = (idx === pair.paths.length - 1);
            if (!isLastFrame && frameCache.has(path)) {
              frameCache.delete(path);
            }
          });
          pair.status = 'idle';
          pair.promise = null;
        }
      }
    });
  }

  // --- PROGRESSIVE QUEUE PROCESSOR ---
  // Enforces max 2 pairs loading simultaneously while proactively preloading ahead:
  function processQueue() {
    if (loadingPairsCount >= 2) return;

    // 1. High Priority: Ensure current pair and next pair are loading/loaded
    const priorityList = [activePairIndex, activePairIndex + 1];
    if (activePairIndex > 0) {
      priorityList.push(activePairIndex - 1);
    }

    // 2. Proactive queue: Lookahead pairs until all are loaded
    for (let i = 0; i < TOTAL_PAIRS; i++) {
      const idx = (activePairIndex + i) % TOTAL_PAIRS;
      if (!priorityList.includes(idx)) {
        priorityList.push(idx);
      }
    }

    for (const pIdx of priorityList) {
      if (loadingPairsCount >= 2) break;
      if (pIdx >= 0 && pIdx < TOTAL_PAIRS) {
        const pair = pairs[pIdx];
        if (pair.status === 'idle') {
          loadPair(pIdx);
        }
      }
    }

    manageActiveMemory(activePairIndex);
  }

  function checkQueue(currentPair) {
    if (activePairIndex !== currentPair) {
      activePairIndex = currentPair;
      processQueue();
    }
  }

  // --- FIND CLOSEST LOADED FRAME (FAILSAFE) ---
  function getClosestLoadedSrc(targetIdx) {
    const directPath = framePaths[targetIdx];
    if (frameCache.has(directPath)) {
      return frameCache.get(directPath).src;
    }

    // Search closest forward and backward in cached frames
    for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
      const prev = targetIdx - offset;
      const next = targetIdx + offset;

      if (prev >= 0 && frameCache.has(framePaths[prev])) {
        return frameCache.get(framePaths[prev]).src;
      }
      if (next < TOTAL_FRAMES && frameCache.has(framePaths[next])) {
        return frameCache.get(framePaths[next]).src;
      }
    }

    const firstImg = frameCache.get(framePaths[0]);
    return firstImg ? firstImg.src : encodeURI(framePaths[0]);
  }

  // --- FRAME DISPLAY UPDATE ---
  function renderFrame(frameIdx) {
    const targetIdx = Math.max(0, Math.min(TOTAL_FRAMES - 1, Math.round(frameIdx)));

    if (targetIdx !== lastRenderedIndex) {
      const targetSrc = getClosestLoadedSrc(targetIdx);
      if (storyImage.src !== targetSrc) {
        storyImage.src = targetSrc;
      }
      lastRenderedIndex = targetIdx;
    }

    // Determine which pair this frame belongs to
    const pair = pairs.find(p => targetIdx >= p.startIndex && targetIdx <= p.endIndex);
    if (pair && pair.index !== activePairIndex) {
      checkQueue(pair.index);
    }
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
    // 1. Scroll Prompt Fade Out
    if (scrollPrompt) {
      if (progress > 0.08) {
        scrollPrompt.classList.add('fade-out');
      } else {
        scrollPrompt.classList.remove('fade-out');
      }
    }

    // 2. Story Beats Synchronized Transitions
    storyBeats.forEach((beat) => {
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

    // 3. Chapter Timeline Sync
    if (timelineProgress) {
      timelineProgress.style.height = `${Math.min(100, Math.max(0, progress * 100))}%`;
    }

    if (timelineSteps && timelineSteps.length > 0) {
      let activeIdx = 0;
      timelineSteps.forEach((step, idx) => {
        const target = parseFloat(step.getAttribute('data-target') || '0');
        if (progress >= target - 0.06) {
          activeIdx = idx;
        }
      });

      timelineSteps.forEach((step, idx) => {
        if (idx === activeIdx) {
          step.classList.add('is-active');
        } else {
          step.classList.remove('is-active');
        }
      });
    }
  }

  // --- SINGLE GLOBAL RENDER LOOP ---
  function renderLoop() {
    if (!isStageVisible) {
      rafId = null;
      return;
    }

    // Responsive Lerp Interpolation
    const delta = (targetFrame - currentFrame) * 0.28;
    currentFrame += delta;

    if (Math.abs(targetFrame - currentFrame) < 0.001) {
      currentFrame = targetFrame;
    }

    renderFrame(currentFrame);
    updateUI(scrollProgress);

    rafId = requestAnimationFrame(renderLoop);
  }

  function startRenderLoop() {
    if (!rafId && isStageVisible && isReady) {
      rafId = requestAnimationFrame(renderLoop);
    }
  }

  function stopRenderLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // --- SCROLL / VIEWPORT OPTIMIZATION (INTERSECTION OBSERVER) ---
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        isStageVisible = entry.isIntersecting;
        if (isStageVisible) {
          startRenderLoop();
        } else {
          stopRenderLoop();
        }
      });
    },
    { threshold: 0.01 }
  );

  if (viewportStage) {
    observer.observe(viewportStage);
  }

  // --- TIMELINE STEP CLICK NAVIGATION ---
  if (timelineSteps && timelineSteps.length > 0) {
    timelineSteps.forEach((step) => {
      step.addEventListener('click', () => {
        const targetProgress = parseFloat(step.getAttribute('data-target') || '0');
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const targetScrollY = targetProgress * maxScroll;

        window.scrollTo({
          top: targetScrollY,
          behavior: 'smooth'
        });
      });
    });
  }

  // --- ACCESSIBILITY: KEYBOARD NAVIGATION ---
  window.addEventListener('keydown', (e) => {
    // Only intercept if user is not in an input or modal
    if (['ArrowDown', 'PageDown'].includes(e.key)) {
      e.preventDefault();
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const stepSize = Math.max(120, maxScroll * 0.12);
      window.scrollBy({ top: stepSize, behavior: 'smooth' });
    } else if (['ArrowUp', 'PageUp'].includes(e.key)) {
      e.preventDefault();
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const stepSize = Math.max(120, maxScroll * 0.12);
      window.scrollBy({ top: -stepSize, behavior: 'smooth' });
    } else if (e.key === 'Home') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (e.key === 'End') {
      e.preventDefault();
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
    }
  });

  // --- REPLAY ACTION ---
  if (replayBtn) {
    replayBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }

  // --- INITIALIZATION ---
  async function init() {
    const pair1Count = pairs[0].count;

    // 1. Immediately preload only Pair 1
    await loadPair(0, (loadedCount, total) => {
      const progress = Math.min(100, Math.round((loadedCount / total) * 100));
      if (loaderBarFill) loaderBarFill.style.width = `${progress}%`;
      if (loaderPercent) loaderPercent.textContent = `${progress}%`;
      if (loaderCount) loaderCount.textContent = `Loading experience ${loadedCount} / ${pair1Count}...`;
    });

    // 2. Pair 1 is ready: Dismiss loader & begin experience immediately
    const initialImg = frameCache.get(framePaths[0]);
    if (initialImg && storyImage) {
      storyImage.src = initialImg.src;
    }

    setTimeout(() => {
      isReady = true;
      body.classList.remove('is-loading');
      if (loader) loader.classList.add('loaded');

      calculateScroll();
      renderFrame(0);
      startRenderLoop();

      // 3. Preload Pair 2 in background immediately
      loadPair(1).then(() => {
        // When Pair 1 starts / finishes background prep, queue Pair 3
        checkQueue(0);
      });
    }, 200);
  }

  // Launch initial loading sequence
  init();
})();
