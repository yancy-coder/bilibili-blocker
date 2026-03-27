/**
 * B站内容屏蔽助手 - 内容脚本
 */

// ========== 防闪烁 CSS ==========
(function preventFlash() {
  const style = document.createElement('style');
  style.id = 'bilibili-blocker-initial-hide';
  style.textContent = `
    .video-card, .bili-video-card, .feed-card,
    .search-item, .video-list-item, .small-item,
    .rank-item, .video-list-card, .bili-video-card__wrap,
    .bili-dyn-item, .bili-dyn-list__item, .reply-item,
    .comment-item, .live-card, .room-card {
      visibility: hidden !important;
    }
  `;
  const target = document.head || document.documentElement;
  if (target) target.appendChild(style);
})();

(function() {
  'use strict';

  // ============ 配置 ============
  let config = {
    keywords: [],
    blockMode: 'hide',
    showBlockReason: true,
    blockCount: 0,
    enabled: true,
    enableOCR: true,
    ocrConfidence: 30,
    enableHoverMenu: true,  // 悬停菜单开关
  };

  let processedElements = new WeakSet();
  let tesseractWorker = null;
  let isOCRReady = false;
  const ocrCache = new Map();
  let hoverMenuElement = null;
  let currentHoverElement = null;

  const selectors = {
    videoCard: [
      '.video-card', '.bili-video-card', '.feed-card', '.search-item',
      '.video-list-item', '[data-evtid]:not([data-evtid=""])', '.small-item',
      '.rank-item', '.video-list-card', '.bili-video-card__wrap',
    ],
    title: [
      '.bili-video-card__info--tit a', '.bili-video-card__info--tit',
      '.video-name', '.title-row a', '.title', '.search-title',
      '.video-title', 'h3.title', '.name a',
    ],
    upName: [
      '.bili-video-card__info--author', '.up-name', '.up-name__display',
      '.author', '.name', '.up-info .name a', '.owner-name',
    ],
    coverImage: [
      '.bili-video-card__image img', '.bili-video-card__cover img',
      '.video-card img', '.cover img', '.pic img',
    ],
  };

  const allSelectors = [...selectors.videoCard, ...selectors.title].join(', ');

  // ============ 悬停菜单功能 ============
  
  /**
   * 创建悬停菜单
   */
  function createHoverMenu() {
    if (hoverMenuElement) return;
    
    const menu = document.createElement('div');
    menu.id = 'bilibili-blocker-hover-menu';
    menu.innerHTML = `
      <div class="bb-hover-header">
        <span class="bb-hover-title">🛡️ 屏蔽助手</span>
        <button class="bb-hover-close">×</button>
      </div>
      <div class="bb-hover-content">
        <div class="bb-hover-section">
          <div class="bb-hover-label">视频标题</div>
          <div class="bb-hover-title-text" title=""></div>
        </div>
        <div class="bb-hover-section">
          <div class="bb-hover-label">UP主</div>
          <div class="bb-hover-up-text"></div>
        </div>
        <div class="bb-hover-actions">
          <button class="bb-hover-btn bb-hover-block-title" title="将视频标题加入屏蔽关键词">
            📝 屏蔽标题
          </button>
          <button class="bb-hover-btn bb-hover-block-up" title="将该UP主加入屏蔽关键词">
            👤 屏蔽UP主
          </button>
          <button class="bb-hover-btn bb-hover-block-now" title="立即屏蔽此视频（仅当前页面）">
            🚫 立即屏蔽
          </button>
        </div>
      </div>
    `;
    
    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      #bilibili-blocker-hover-menu {
        position: fixed;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.1);
        padding: 0;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        min-width: 220px;
        max-width: 280px;
        opacity: 0;
        transform: translateY(-10px) scale(0.95);
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: none;
        border: 1px solid rgba(0,0,0,0.08);
        overflow: hidden;
      }
      #bilibili-blocker-hover-menu.bb-show {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }
      .bb-hover-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 12px;
        background: linear-gradient(135deg, #FB7299 0%, #FC8BAB 100%);
        color: white;
      }
      .bb-hover-title {
        font-weight: 600;
        font-size: 14px;
      }
      .bb-hover-close {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: background 0.2s;
      }
      .bb-hover-close:hover {
        background: rgba(255,255,255,0.3);
      }
      .bb-hover-content {
        padding: 12px;
      }
      .bb-hover-section {
        margin-bottom: 10px;
      }
      .bb-hover-label {
        color: #9499a0;
        font-size: 11px;
        margin-bottom: 4px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .bb-hover-title-text, .bb-hover-up-text {
        color: #18191c;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.4;
      }
      .bb-hover-actions {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid #e3e5e7;
      }
      .bb-hover-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px 12px;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }
      .bb-hover-block-title {
        background: #f6f7f8;
        color: #18191c;
      }
      .bb-hover-block-title:hover {
        background: #e3e5e7;
      }
      .bb-hover-block-up {
        background: #f6f7f8;
        color: #18191c;
      }
      .bb-hover-block-up:hover {
        background: #e3e5e7;
      }
      .bb-hover-block-now {
        background: linear-gradient(135deg, #FB7299 0%, #FC8BAB 100%);
        color: white;
      }
      .bb-hover-block-now:hover {
        opacity: 0.9;
        transform: translateY(-1px);
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(menu);
    
    // 绑定关闭按钮
    menu.querySelector('.bb-hover-close').addEventListener('click', hideHoverMenu);
    
    // 绑定功能按钮
    menu.querySelector('.bb-hover-block-title').addEventListener('click', () => {
      if (currentHoverElement) {
        const title = extractVideoInfo(currentHoverElement).title;
        if (title) addKeywordAndBlock(title, '标题');
      }
    });
    
    menu.querySelector('.bb-hover-block-up').addEventListener('click', () => {
      if (currentHoverElement) {
        const upName = extractVideoInfo(currentHoverElement).upName;
        if (upName) addKeywordAndBlock(upName, 'UP主');
      }
    });
    
    menu.querySelector('.bb-hover-block-now').addEventListener('click', () => {
      if (currentHoverElement) {
        blockElement(currentHoverElement, '用户手动屏蔽');
        hideHoverMenu();
        showToast('已屏蔽此视频');
      }
    });
    
    hoverMenuElement = menu;
  }

  /**
   * 显示悬停菜单
   */
  function showHoverMenu(element, x, y) {
    if (!config.enableHoverMenu || !config.enabled) return;
    if (!hoverMenuElement) createHoverMenu();
    
    const info = extractVideoInfo(element);
    if (!info.title && !info.upName) return;
    
    currentHoverElement = element;
    
    // 更新内容
    const titleEl = hoverMenuElement.querySelector('.bb-hover-title-text');
    const upEl = hoverMenuElement.querySelector('.bb-hover-up-text');
    
    titleEl.textContent = info.title || '未知标题';
    titleEl.title = info.title || '';
    upEl.textContent = info.upName || '未知UP主';
    
    // 计算位置（避免超出屏幕）
    const rect = hoverMenuElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let left = x + 15;
    let top = y + 15;
    
    if (left + rect.width > viewportWidth) {
      left = x - rect.width - 10;
    }
    if (top + rect.height > viewportHeight) {
      top = y - rect.height - 10;
    }
    
    hoverMenuElement.style.left = left + 'px';
    hoverMenuElement.style.top = top + 'px';
    hoverMenuElement.classList.add('bb-show');
  }

  /**
   * 隐藏悬停菜单
   */
  function hideHoverMenu() {
    if (hoverMenuElement) {
      hoverMenuElement.classList.remove('bb-show');
      currentHoverElement = null;
    }
  }

  /**
   * 提取视频信息
   */
  function extractVideoInfo(element) {
    let title = '';
    let upName = '';
    
    for (const sel of selectors.title) {
      const el = element.querySelector(sel);
      if (el && el.textContent) {
        title = el.textContent.trim();
        break;
      }
    }
    
    for (const sel of selectors.upName) {
      const el = element.querySelector(sel);
      if (el && el.textContent) {
        upName = el.textContent.trim();
        break;
      }
    }
    
    return { title, upName };
  }

  /**
   * 添加关键词并重新屏蔽
   */
  async function addKeywordAndBlock(keyword, type) {
    if (!keyword || config.keywords.includes(keyword)) {
      showToast(type + '已在屏蔽列表中');
      return;
    }
    
    if (config.keywords.length >= 100) {
      showToast('关键词数量已达上限(100)');
      return;
    }
    
    config.keywords.push(keyword);
    await saveConfig();
    
    // 重新处理页面
    processedElements = new WeakSet();
    processAllElements();
    
    hideHoverMenu();
    showToast('已添加"' + keyword + '"到屏蔽列表');
    
    // 通知 popup
    try {
      chrome.runtime.sendMessage({ action: 'keywordAdded', keyword });
    } catch (e) {}
  }

  /**
   * 显示 Toast 提示
   */
  function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 2147483647;
      animation: bb-toast-in 0.3s ease;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
      @keyframes bb-toast-in {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  // ============ OCR 功能 ============
  async function initOCR() {
    if (!config.enableOCR || isOCRReady) return;
    try {
      if (typeof Tesseract === 'undefined') {
        console.warn('[B站屏蔽助手] Tesseract.js not loaded');
        return;
      }
      tesseractWorker = await Tesseract.createWorker('chi_sim');
      isOCRReady = true;
      console.log('[B站屏蔽助手] OCR ready');
    } catch (e) {
      console.error('[B站屏蔽助手] OCR init failed:', e.message);
    }
  }

  async function loadImage(imgSrc) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      img.onload = () => {
        const maxWidth = 320;
        const scale = Math.min(1, maxWidth / img.naturalWidth);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth * scale;
        canvas.height = img.naturalHeight * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = imgSrc;
    });
  }

  async function doOCR(imageBlob) {
    if (!isOCRReady || !tesseractWorker) return null;
    try {
      const { data: { text, confidence } } = await tesseractWorker.recognize(imageBlob);
      return { text: text.trim(), confidence };
    } catch (e) {
      console.warn('[B站屏蔽助手] OCR error:', e.message);
      return null;
    }
  }

  function getImageText(img) {
    const texts = [];
    if (img.alt) texts.push(img.alt);
    if (img.title) texts.push(img.title);
    const parentLink = img.closest('a');
    if (parentLink?.title) texts.push(parentLink.title);
    return texts.join(' ');
  }

  async function analyzeCover(element, videoId) {
    const results = [];
    for (const selector of selectors.coverImage) {
      const img = element.querySelector(selector);
      if (!img) continue;
      
      const altText = getImageText(img);
      if (altText) {
        results.push({ text: altText, confidence: 100, source: 'alt' });
      }
      
      if (img.src && !img.src.startsWith('data:')) {
        const cacheKey = 'ocr_' + img.src;
        if (ocrCache.has(cacheKey)) {
          results.push(ocrCache.get(cacheKey));
          break;
        }
        try {
          const blob = await loadImage(img.src);
          const ocrResult = await doOCR(blob);
          if (ocrResult?.text) {
            const result = { ...ocrResult, source: 'ocr' };
            ocrCache.set(cacheKey, result);
            results.push(result);
          }
        } catch (e) {
          console.warn('[B站屏蔽助手] OCR failed:', e.message);
        }
        break;
      }
    }
    return results;
  }

  // ============ 核心功能 ============
  async function loadConfig() {
    try {
      const result = await chrome.storage.sync.get(['bilibiliBlockerConfig']);
      if (result.bilibiliBlockerConfig) {
        config = { ...config, ...result.bilibiliBlockerConfig };
      }
    } catch (e) {
      console.warn('[B站屏蔽助手] Load config failed:', e.message);
    }
  }

  let saveTimer = null;
  function debouncedSaveConfig() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await chrome.storage.sync.set({ bilibiliBlockerConfig: config });
      } catch (e) {}
    }, 500);
  }
  
  async function saveConfig() {
    try {
      await chrome.storage.sync.set({ bilibiliBlockerConfig: config });
    } catch (e) {}
  }

  function containsKeyword(text, source = '') {
    if (!text || !config.keywords.length) return { matched: false };
    const lowerText = text.toLowerCase();
    for (const keyword of config.keywords) {
      if (!keyword.trim()) continue;
      if (lowerText.includes(keyword.toLowerCase())) {
        console.log('[B站屏蔽助手] Match:', keyword, 'in', source || 'text');
        return { matched: true, keyword };
      }
    }
    return { matched: false };
  }

  async function shouldBlockVideoCard(element) {
    for (const sel of selectors.title) {
      const titleEl = element.querySelector(sel);
      if (titleEl) {
        const match = containsKeyword(titleEl.textContent, 'title');
        if (match.matched) return { blocked: true, reason: '标题含"' + match.keyword + '"' };
      }
    }

    for (const sel of selectors.upName) {
      const upEl = element.querySelector(sel);
      if (upEl) {
        const match = containsKeyword(upEl.textContent, 'UP主');
        if (match.matched) return { blocked: true, reason: 'UP主含"' + match.keyword + '"' };
      }
    }

    const match = containsKeyword(element.textContent, 'content');
    if (match.matched) return { blocked: true, reason: '内容含"' + match.keyword + '"' };

    if (config.enableOCR && isOCRReady) {
      const videoId = element.dataset.bbId || Math.random().toString(36).substr(2, 9);
      const results = await analyzeCover(element, videoId);
      for (const result of results) {
        const minConf = result.source === 'alt' ? 0 : config.ocrConfidence;
        if (result.confidence >= minConf) {
          const match = containsKeyword(result.text, 'image(' + result.source + ')');
          if (match.matched) {
            return { blocked: true, reason: '图片含"' + match.keyword + '"(' + Math.round(result.confidence) + '%)' };
          }
        }
      }
    }

    return { blocked: false };
  }

  function blockElement(element, reason) {
    if (!element || processedElements.has(element)) return;
    processedElements.add(element);
    config.blockCount++;
    element.setAttribute('data-blocked-by', 'bilibili-blocker');
    element.setAttribute('data-block-reason', reason);
    
    switch (config.blockMode) {
      case 'hide':
        element.style.setProperty('display', 'none', 'important');
        break;
      case 'blur':
        element.style.setProperty('filter', 'blur(8px)', 'important');
        break;
      case 'transparent':
        element.style.setProperty('opacity', '0.1', 'important');
        break;
    }
    debouncedSaveConfig();
  }

  async function processElement(element) {
    if (!config.enabled || !config.keywords.length) return;
    if (processedElements.has(element)) return;
    if (element.hasAttribute('data-blocked-by')) return;

    const result = await shouldBlockVideoCard(element);
    if (result.blocked) {
      blockElement(element, result.reason);
    }
  }

  function processAllElements() {
    if (!config.enabled || !config.keywords.length) return;
    document.querySelectorAll(allSelectors).forEach(el => processElement(el));
  }

  let observer = null;

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(mutations => {
      if (!config.enabled) return;
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            processElement(node);
            if (node.querySelectorAll) {
              node.querySelectorAll(allSelectors).forEach(processElement);
            }
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function removeInitialHideStyle() {
    const el = document.getElementById('bilibili-blocker-initial-hide');
    if (el) el.remove();
  }

  // ============ 悬停事件监听 ============
  function setupHoverListeners() {
    let hoverTimeout = null;
    let isMenuVisible = false;
    
    document.addEventListener('mouseover', (e) => {
      if (!config.enabled || !config.enableHoverMenu) return;
      
      const target = e.target.closest(selectors.videoCard.join(', '));
      if (!target) {
        // 如果鼠标移出视频卡片，延迟隐藏菜单
        if (!isMenuVisible) {
          clearTimeout(hoverTimeout);
          hoverTimeout = setTimeout(() => {
            if (!hoverMenuElement?.matches(':hover')) {
              hideHoverMenu();
            }
          }, 300);
        }
        return;
      }
      
      // 忽略已屏蔽的视频
      if (target.hasAttribute('data-blocked-by')) return;
      
      clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        showHoverMenu(target, e.clientX, e.clientY);
        isMenuVisible = true;
      }, 800); // 800ms 延迟显示，避免误触
    });
    
    document.addEventListener('mouseout', (e) => {
      const target = e.target.closest(selectors.videoCard.join(', '));
      if (target && !e.relatedTarget?.closest('#bilibili-blocker-hover-menu')) {
        clearTimeout(hoverTimeout);
        hoverTimeout = setTimeout(() => {
          if (!hoverMenuElement?.matches(':hover')) {
            hideHoverMenu();
            isMenuVisible = false;
          }
        }, 300);
      }
    });
    
    // 点击其他地方隐藏菜单
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#bilibili-blocker-hover-menu')) {
        hideHoverMenu();
        isMenuVisible = false;
      }
    });
  }

  async function init() {
    await loadConfig();
    if (!config.enabled) {
      removeInitialHideStyle();
      return;
    }

    if (config.enableOCR) initOCR();
    console.log('[B站屏蔽助手] Started, keywords:', config.keywords);
    
    processAllElements();
    startObserver();
    setupHoverListeners();  // 初始化悬停监听
    setTimeout(removeInitialHideStyle, 300);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      switch (message.action) {
        case 'updateConfig':
          config = { ...config, ...message.config };
          if (config.enableOCR && !isOCRReady) initOCR();
          processedElements = new WeakSet();
          document.querySelectorAll('[data-blocked-by]').forEach(el => {
            el.style.cssText = '';
            el.removeAttribute('data-blocked-by');
            el.removeAttribute('data-block-reason');
          });
          if (config.enabled) processAllElements();
          sendResponse({ success: true });
          break;
        case 'getConfig':
          sendResponse({ config, currentUrl: location.href });
          break;
        case 'toggle':
          config.enabled = !config.enabled;
          if (config.enabled) {
            initOCR();
            processAllElements();
            startObserver();
          } else {
            if (observer) { observer.disconnect(); observer = null; }
            removeInitialHideStyle();
            hideHoverMenu();
          }
          sendResponse({ success: true, enabled: config.enabled });
          break;
        case 'getBlockCount':
          sendResponse({ blockCount: config.blockCount });
          break;
        case 'resetCount':
          config.blockCount = 0;
          sendResponse({ success: true });
          break;
        case 'getOCRStatus':
          sendResponse({ enabled: config.enableOCR, ready: isOCRReady, cacheSize: ocrCache.size });
          break;
      }
    })();
    return true;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  let lastUrl = location.href;
  function onUrlChange() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      processedElements = new WeakSet();
      ocrCache.clear();
      processAllElements();
      hideHoverMenu();
    }
  }

  const origPush = history.pushState;
  history.pushState = function(...args) { origPush.apply(this, args); onUrlChange(); };
  const origReplace = history.replaceState;
  history.replaceState = function(...args) { origReplace.apply(this, args); onUrlChange(); };
  window.addEventListener('popstate', onUrlChange);

})();
