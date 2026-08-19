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
      // Fallback in case decode rejects or is interrupted
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

  // --- PAIR LOADER WITH CONCURRENCY MANAGEMENT ---
  async function loadPair(pairIdx, onProgress) {
    if (pairIdx < 0 || pairIdx >= TOTAL_PAIRS) return;
    const pair = pairs[pairIdx];

    if (pair.status === 'loaded') return pair.promise;
    if (pair.status === 'loading') return pair.promise;

    pair.status = 'loading';
    loadingPairsCount++;

    let loadedInPair = 0;

    pair.promise = (async () => {
      const promises = pair.paths.map(async (path) => {
        const img = await decodeAndCacheFrame(path);
        loadedInPair++;
        if (typeof onProgress === 'function') {
          onProgress(loadedInPair, pair.count);
        }
        return img;
      });

      await Promise.all(promises);
      pair.status = 'loaded';
      loadingPairsCount--;
      manageActiveMemory(activePairIndex);
      return pair;
    })();

    return pair.promise;
  }

  // --- MEMORY OPTIMIZATION & EVICTION ---
  // Retains only current pair and next pair in active memory.
  // Completed older pairs retain only their final frame for seamless transitions.
  function manageActiveMemory(currentPair) {
    const keepPairs = new Set([currentPair, currentPair + 1]);

    // If scrubbing backwards, keep previous pair if active
    if (currentPair > 0) {
      keepPairs.add(currentPair - 1);
    }

    pairs.forEach((pair) => {
      if (!keepPairs.has(pair.index)) {
        if (pair.status === 'loaded') {
          // Release intermediate frames
          pair.paths.forEach((path, idx) => {
            const isLastFrame = (idx === pair.paths.length - 1);
            // Keep final frame of completed section for seamless fallback
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

  // --- PROGRESSIVE QUEUE MANAGER ---
  // Enforces max 2 pairs loading simultaneously:
  // Pair 1 -> starts Pair 2 background
  // Pair 1 active -> queue Pair 3
  // Pair 2 active -> queue Pair 4, etc.
  function checkQueue(currentPair) {
    activePairIndex = currentPair;

    // Determine target pairs to have ready
    const neededPairs = [currentPair, currentPair + 1];
    if (currentPair + 2 < TOTAL_PAIRS) {
      neededPairs.push(currentPair + 2);
    }

    for (const pIdx of neededPairs) {
      if (pIdx < TOTAL_PAIRS && loadingPairsCount < 2) {
        const pair = pairs[pIdx];
        if (pair.status === 'idle') {
          loadPair(pIdx);
        }
      }
    }

    manageActiveMemory(currentPair);
  }

  // --- FIND CLOSEST LOADED FRAME (FALLBACK) ---
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

    return encodeURI(framePaths[0]);
  }

  // --- FRAME DISPLAY UPDATE ---
  function renderFrame(frameIdx) {
    const targetIdx = Math.max(0, Math.min(TOTAL_FRAMES - 1, Math.round(frameIdx)));

    if (targetIdx === lastRenderedIndex) return;

    const targetSrc = getClosestLoadedSrc(targetIdx);
    if (storyImage.src !== targetSrc) {
      storyImage.src = targetSrc;
    }

    lastRenderedIndex = targetIdx;

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
  }

  // --- SINGLE GLOBAL RENDER LOOP ---
  function renderLoop() {
    if (!isStageVisible) {
      rafId = null;
      return;
    }

    // Smooth Lerp Interpolation
    const delta = (targetFrame - currentFrame) * 0.18;
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
