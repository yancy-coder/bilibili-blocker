/**
 * B站内容屏蔽助手 - 内容脚本
 * 自动屏蔽包含关键词的内容
 */

(function() {
  'use strict';

  // 配置
  let config = {
    keywords: [],
    blockMode: 'hide', // 'hide' | 'blur' | 'transparent'
    showBlockReason: true,
    blockCount: 0,
    enabled: true
  };

  // 存储已处理的元素，避免重复处理
  let processedElements = new WeakSet();

  // 选择器配置 - 针对不同页面类型的元素
  const selectors = {
    // 视频卡片（首页推荐、搜索结果、分区等）
    videoCard: [
      '.video-card',                    // 通用视频卡片
      '.bili-video-card',              // 新版视频卡片
      '.feed-card',                    // 动态视频卡片
      '.search-item',                  // 搜索结果
      '.video-list-item',              // 视频列表项
      '[data-evtid]:not([data-evtid=""])', // 通用视频项
      '.small-item',                   // 小卡片
      '.rank-item',                    // 排行榜
      '.card-box .video-card',         // 综合区
      '.recommend-list .video-card',   // 推荐列表
      '.popular-video-list .video-card', // 热门视频
      '.video-list-card',              // 列表卡片
      '.bili-video-card__wrap',        // 新版卡片包装
    ],
    // 标题相关
    title: [
      '.bili-video-card__info--tit a', // 视频标题链接
      '.bili-video-card__info--tit',   // 视频标题
      '.video-name',                   // 视频名称
      '.title-row a',                  // 标题行链接
      '.title',                        // 通用标题
      '.search-title',                 // 搜索标题
      '.video-title',                  // 视频标题
      'h3.title',                      // 标题h3
      '.name a',                       // 名称链接
      '.card-box .title',              // 卡片标题
    ],
    // UP主名称
    upName: [
      '.bili-video-card__info--author', // UP主名
      '.up-name',                       // UP主名
      '.up-name__display',             // 显示名
      '.author',                        // 作者
      '.name',                          // 名称
      '.up-info .name a',              // UP信息名
      '.owner-name',                   // 拥有者名
      '.card-box .author',             // 卡片作者
      '.up-info--tag a',               // UP标签
    ],
    // 动态内容
    dynamic: [
      '.bili-dyn-item',                // 动态项
      '.bili-dyn-list__item',          // 动态列表项
      '.bili-dyn-content',             // 动态内容
      '.bili-dyn-title',               // 动态标题
      '.bili-dyn-card',                // 动态卡片
    ],
    // 评论
    comment: [
      '.reply-item',                   // 回复项
      '.comment-item',                 // 评论项
      '.reply-content',                // 回复内容
      '.comment-content',              // 评论内容
      '.text-con',                     // 文本内容
    ],
    // 直播
    live: [
      '.live-card',                    // 直播卡片
      '.room-card',                    // 房间卡片
      '.living-room-item',             // 直播间项
      '.live-item',                    // 直播项
    ],
    // 番剧/影视
    bangumi: [
      '.bangumi-card',                 // 番剧卡片
      '.bangumi-item',                 // 番剧项
      '.follow-item',                  // 追番项
    ],
    // 广告/推广
    ad: [
      '.ad-report',                    // 广告报告
      '.ad-floor',                     // 广告楼层
      '.ad-swiper',                    // 广告轮播
      '[class*="ad-"]',                // 广告类
      '[class*="advert"]',             // 广告类
    ]
  };

  // 合并所有选择器
  const allSelectors = Object.values(selectors).flat().join(', ');

  // ============ 核心功能 ============

  // 获取配置
  async function loadConfig() {
    try {
      const result = await chrome.storage.sync.get(['bilibiliBlockerConfig']);
      if (result.bilibiliBlockerConfig) {
        config = { ...config, ...result.bilibiliBlockerConfig };
      }
    } catch (e) {
      console.log('[B站屏蔽助手] 使用默认配置');
    }
  }

  // 保存配置（带防抖，避免频繁写入存储）
  let saveTimer = null;
  async function saveConfig() {
    try {
      await chrome.storage.sync.set({ bilibiliBlockerConfig: config });
    } catch (e) {
      console.error('[B站屏蔽助手] 保存配置失败:', e);
    }
  }

  function debouncedSaveConfig() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveConfig, 500);
  }

  // 检查文本是否包含关键词
  function containsKeyword(text) {
    if (!text || !config.keywords.length) return false;
    const lowerText = text.toLowerCase();
    return config.keywords.some(keyword => {
      if (!keyword.trim()) return false;
      return lowerText.includes(keyword.toLowerCase());
    });
  }

  // 获取元素的文本内容（包括子元素）
  function getElementText(element) {
    if (!element) return '';
    return element.textContent || '';
  }

  // 检查视频卡片是否应该被屏蔽
  function shouldBlockVideoCard(element) {
    // 获取标题
    const titleSelectors = [
      '.bili-video-card__info--tit a',
      '.bili-video-card__info--tit',
      '.video-name',
      '.title-row a',
      '.title',
      'h3 a',
      'a[title]',
      '.search-title',
    ];
    
    for (const sel of titleSelectors) {
      const titleEl = element.querySelector(sel);
      if (titleEl) {
        const title = getElementText(titleEl);
        if (containsKeyword(title)) {
          return { blocked: true, reason: `标题: "${title.substring(0, 50)}..."` };
        }
      }
    }

    // 检查UP主名
    const upSelectors = [
      '.bili-video-card__info--author',
      '.up-name',
      '.up-name__display',
      '.author',
      '.owner-name',
      '.up-info .name',
    ];
    
    for (const sel of upSelectors) {
      const upEl = element.querySelector(sel);
      if (upEl) {
        const upName = getElementText(upEl);
        if (containsKeyword(upName)) {
          return { blocked: true, reason: `UP主: ${upName}` };
        }
      }
    }

    // 检查整个卡片的文本
    const fullText = getElementText(element);
    if (containsKeyword(fullText)) {
      return { blocked: true, reason: '内容匹配' };
    }

    return { blocked: false };
  }

  // 检查动态是否应该被屏蔽
  function shouldBlockDynamic(element) {
    const text = getElementText(element);
    if (containsKeyword(text)) {
      return { blocked: true, reason: '动态内容匹配' };
    }
    return { blocked: false };
  }

  // 检查评论是否应该被屏蔽
  function shouldBlockComment(element) {
    const text = getElementText(element);
    if (containsKeyword(text)) {
      return { blocked: true, reason: '评论内容匹配' };
    }
    return { blocked: false };
  }

  // 屏蔽元素
  function blockElement(element, reason) {
    if (!element || processedElements.has(element)) return;

    processedElements.add(element);
    config.blockCount++;

    // 添加屏蔽标记
    element.setAttribute('data-blocked-by', 'bilibili-blocker');
    element.setAttribute('data-block-reason', reason);
    element.setAttribute('data-block-mode', config.blockMode);

    switch (config.blockMode) {
      case 'hide':
        element.style.setProperty('display', 'none', 'important');
        break;
      case 'blur':
        element.style.setProperty('filter', 'blur(8px)', 'important');
        element.style.setProperty('pointer-events', 'none', 'important');
        element.style.setProperty('user-select', 'none', 'important');
        break;
      case 'transparent':
        element.style.setProperty('opacity', '0.1', 'important');
        element.style.setProperty('pointer-events', 'none', 'important');
        break;
    }

    // 添加屏蔽标记（可选显示）
    if (config.showBlockReason && config.blockMode !== 'hide') {
      addBlockBadge(element, reason);
    }

    // 防抖保存统计
    debouncedSaveConfig();
  }

  // 添加屏蔽标记
  function addBlockBadge(element, reason) {
    const badge = document.createElement('div');
    badge.className = 'bilibili-blocker-badge';
    badge.textContent = `已屏蔽: ${reason}`;
    badge.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(251, 114, 153, 0.9);
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 999999;
      pointer-events: auto;
      cursor: pointer;
      white-space: nowrap;
    `;
    badge.onclick = (e) => {
      e.stopPropagation();
      element.style.filter = 'none';
      element.style.opacity = '1';
      element.style.pointerEvents = 'auto';
      badge.remove();
    };
    
    if (getComputedStyle(element).position === 'static') {
      element.style.position = 'relative';
    }
    element.appendChild(badge);
  }

  // ============ 处理函数 ============

  // 处理单个元素
  function processElement(element) {
    if (!config.enabled || !config.keywords.length) return;
    if (processedElements.has(element)) return;
    if (element.hasAttribute('data-blocked-by')) return;

    const className = typeof element.className === 'string' ? element.className : '';

    // 根据元素类型选择检查方式
    let result = { blocked: false };

    // 视频卡片
    if (className.includes('video-card') || 
        className.includes('card') || 
        className.includes('item') ||
        element.matches(selectors.videoCard.join(','))) {
      result = shouldBlockVideoCard(element);
    }
    // 动态
    else if (className.includes('dyn') || 
             element.matches(selectors.dynamic.join(','))) {
      result = shouldBlockDynamic(element);
    }
    // 评论
    else if (className.includes('reply') || 
             className.includes('comment') ||
             element.matches(selectors.comment.join(','))) {
      result = shouldBlockComment(element);
    }
    // 通用检查
    else {
      const text = getElementText(element);
      if (containsKeyword(text)) {
        result = { blocked: true, reason: '内容匹配' };
      }
    }

    if (result.blocked) {
      blockElement(element, result.reason);
    }
  }

  // 处理页面上的所有元素
  function processAllElements() {
    if (!config.enabled || !config.keywords.length) return;

    const elements = document.querySelectorAll(allSelectors);
    elements.forEach(processElement);
  }

  // ============ 监听和初始化 ============

  // 创建 MutationObserver 监听 DOM 变化
  let observer = null;

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver((mutations) => {
      if (!config.enabled || !config.keywords.length) return;

      const elementsToProcess = new Set();

      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 检查元素本身
            elementsToProcess.add(node);
            
            // 检查子元素
            if (node.matches) {
              const children = node.querySelectorAll(allSelectors);
              children.forEach(child => elementsToProcess.add(child));
            }
          }
        });
      });

      // 批量处理
      if (elementsToProcess.size > 0) {
        requestAnimationFrame(() => {
          elementsToProcess.forEach(processElement);
        });
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // 停止监听
  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  // 初始化
  async function init() {
    await loadConfig();
    
    if (!config.enabled) {
      console.log('[B站屏蔽助手] 已禁用');
      return;
    }

    console.log('[B站屏蔽助手] 已启动，关键词:', config.keywords);
    console.log('[B站屏蔽助手] 屏蔽模式:', config.blockMode);

    // 处理当前页面内容
    processAllElements();

    // 开始监听变化
    startObserver();
  }

  // 监听来自 popup 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'updateConfig':
        config = { ...config, ...message.config };
        saveConfig();
        // 重置已处理元素集合，以便重新扫描
        processedElements = new WeakSet();
        // 移除已有的屏蔽标记
        document.querySelectorAll('[data-blocked-by]').forEach(el => {
          el.style.display = '';
          el.style.filter = '';
          el.style.opacity = '';
          el.style.pointerEvents = '';
          el.style.userSelect = '';
          el.removeAttribute('data-blocked-by');
          el.removeAttribute('data-block-reason');
          el.removeAttribute('data-block-mode');
          const badge = el.querySelector('.bilibili-blocker-badge');
          if (badge) badge.remove();
        });
        // 如果启用，重新处理
        if (config.enabled) {
          processAllElements();
        }
        sendResponse({ success: true, blockCount: config.blockCount });
        break;
      
      case 'getConfig':
        sendResponse({ 
          config: config,
          currentUrl: window.location.href 
        });
        break;
      
      case 'toggle':
        config.enabled = !config.enabled;
        saveConfig();
        if (config.enabled) {
          processedElements = new WeakSet();
          processAllElements();
          startObserver();
        } else {
          stopObserver();
          // 恢复已屏蔽的内容
          document.querySelectorAll('[data-blocked-by]').forEach(el => {
            el.style.display = '';
            el.style.filter = '';
            el.style.opacity = '';
            el.style.pointerEvents = '';
            el.style.userSelect = '';
            el.removeAttribute('data-blocked-by');
            el.removeAttribute('data-block-reason');
            el.removeAttribute('data-block-mode');
            const badge = el.querySelector('.bilibili-blocker-badge');
            if (badge) badge.remove();
          });
          processedElements = new WeakSet();
        }
        sendResponse({ success: true, enabled: config.enabled });
        break;

      case 'getBlockCount':
        sendResponse({ blockCount: config.blockCount });
        break;

      case 'resetCount':
        config.blockCount = 0;
        saveConfig();
        sendResponse({ success: true });
        break;
    }
    return true;
  });

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 监听 SPA 路由变化（B 站是单页应用）
  function onUrlChange() {
    setTimeout(() => {
      if (config.enabled) {
        processedElements = new WeakSet();
        processAllElements();
      }
    }, 1000);
  }

  const origPushState = history.pushState;
  history.pushState = function() {
    origPushState.apply(this, arguments);
    onUrlChange();
  };
  const origReplaceState = history.replaceState;
  history.replaceState = function() {
    origReplaceState.apply(this, arguments);
    onUrlChange();
  };
  window.addEventListener('popstate', onUrlChange);

})();
