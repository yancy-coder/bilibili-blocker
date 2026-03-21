/**
 * B站屏蔽助手 - 弹窗脚本
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 状态
  let config = {
    keywords: [],
    blockMode: 'hide',
    showBlockReason: true,
    blockCount: 0,
    enabled: true
  };

  // DOM 元素
  const elements = {
    enableToggle: document.getElementById('enableToggle'),
    blockCount: document.getElementById('blockCount'),
    keywordCount: document.getElementById('keywordCount'),
    keywordInput: document.getElementById('keywordInput'),
    addBtn: document.getElementById('addBtn'),
    keywordsList: document.getElementById('keywordsList'),
    clearAllBtn: document.getElementById('clearAllBtn'),
    blockModeRadios: document.querySelectorAll('input[name="blockMode"]'),
    showReason: document.getElementById('showReason'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile'),
    resetBtn: document.getElementById('resetBtn'),
    toast: document.getElementById('toast'),
    sections: document.querySelectorAll('.section, .stats, .actions')
  };

  // 加载配置
  async function loadConfig() {
    try {
      const result = await chrome.storage.sync.get(['bilibiliBlockerConfig']);
      if (result.bilibiliBlockerConfig) {
        config = { ...config, ...result.bilibiliBlockerConfig };
      }
    } catch (e) {
      console.error('加载配置失败:', e);
    }
    updateUI();
  }

  // 保存配置
  async function saveConfig() {
    try {
      await chrome.storage.sync.set({ bilibiliBlockerConfig: config });
      // 通知内容脚本更新
      await notifyContentScript({ action: 'updateConfig', config });
    } catch (e) {
      console.error('保存配置失败:', e);
    }
  }

  // 通知内容脚本
  async function notifyContentScript(message) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && tab.url.includes('bilibili.com')) {
        await chrome.tabs.sendMessage(tab.id, message);
      }
    } catch (e) {
      // 忽略错误，可能页面没有加载脚本
    }
  }

  // 更新UI
  function updateUI() {
    // 开关状态
    elements.enableToggle.checked = config.enabled;
    
    // 统计
    elements.blockCount.textContent = config.blockCount.toLocaleString();
    elements.keywordCount.textContent = config.keywords.length;
    
    // 屏蔽模式
    elements.blockModeRadios.forEach(radio => {
      radio.checked = radio.value === config.blockMode;
    });
    
    // 显示原因
    elements.showReason.checked = config.showBlockReason;
    
    // 关键词列表
    renderKeywords();
    
    // 更新禁用状态
    updateDisabledState();
  }

  // 更新禁用状态
  function updateDisabledState() {
    const disabled = !config.enabled;
    elements.sections.forEach(section => {
      if (disabled) {
        section.classList.add('disabled');
      } else {
        section.classList.remove('disabled');
      }
    });
  }

  // 渲染关键词列表
  function renderKeywords() {
    elements.keywordsList.innerHTML = '';
    
    if (config.keywords.length === 0) {
      const emptyHint = document.createElement('div');
      emptyHint.className = 'empty-hint';
      emptyHint.textContent = '暂无关键词，请在上方添加';
      elements.keywordsList.appendChild(emptyHint);
      return;
    }

    config.keywords.forEach((keyword, index) => {
      const tag = document.createElement('div');
      tag.className = 'keyword-tag';
      tag.innerHTML = `
        <span>${escapeHtml(keyword)}</span>
        <span class="remove" data-index="${index}"></span>
      `;
      elements.keywordsList.appendChild(tag);
    });

    // 绑定删除事件
    elements.keywordsList.querySelectorAll('.remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        removeKeyword(index);
      });
    });
  }

  // 添加关键词
  function addKeyword() {
    const value = elements.keywordInput.value.trim();
    if (!value) {
      showToast('请输入关键词');
      return;
    }

    if (config.keywords.includes(value)) {
      showToast('该关键词已存在');
      return;
    }

    if (config.keywords.length >= 100) {
      showToast('最多只能添加100个关键词');
      return;
    }

    config.keywords.push(value);
    elements.keywordInput.value = '';
    elements.keywordCount.textContent = config.keywords.length;
    renderKeywords();
    saveConfig();
    showToast('添加成功');
  }

  // 删除关键词
  function removeKeyword(index) {
    config.keywords.splice(index, 1);
    elements.keywordCount.textContent = config.keywords.length;
    renderKeywords();
    saveConfig();
  }

  // 清空所有关键词
  function clearAllKeywords() {
    if (config.keywords.length === 0) return;
    
    if (confirm(`确定要清空所有 ${config.keywords.length} 个关键词吗？`)) {
      config.keywords = [];
      elements.keywordCount.textContent = '0';
      renderKeywords();
      saveConfig();
      showToast('已清空所有关键词');
    }
  }

  // 显示Toast
  function showToast(message, duration = 2000) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    setTimeout(() => {
      elements.toast.classList.remove('show');
    }, duration);
  }

  // HTML转义
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 导出配置
  function exportConfig() {
    const data = {
      name: 'B站屏蔽助手配置',
      version: '1.0.0',
      exportTime: new Date().toISOString(),
      config: config
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bilibili-blocker-config-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('配置已导出');
  }

  // 导入配置
  function importConfig(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.config) {
          // 只接受已知字段，防止注入未知属性
          const validKeys = ['keywords', 'blockMode', 'showBlockReason', 'blockCount', 'enabled'];
          const imported = {};
          for (const key of validKeys) {
            if (key in data.config) {
              imported[key] = data.config[key];
            }
          }
          // 校验关键字段类型
          if (imported.keywords && !Array.isArray(imported.keywords)) {
            showToast('配置文件格式错误：关键词必须是数组');
            return;
          }
          if (imported.keywords) {
            imported.keywords = imported.keywords.filter(k => typeof k === 'string');
          }
          if (imported.blockMode && !['hide', 'blur', 'transparent'].includes(imported.blockMode)) {
            imported.blockMode = 'hide';
          }
          config = { ...config, ...imported };
          saveConfig();
          updateUI();
          showToast('配置已导入');
        } else {
          showToast('配置文件格式错误');
        }
      } catch (err) {
        showToast('导入失败：' + err.message);
      }
    };
    reader.readAsText(file);
  }

  // ============ 事件绑定 ============

  // 启用/禁用切换
  elements.enableToggle.addEventListener('change', async () => {
    const newEnabled = elements.enableToggle.checked;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && tab.url.includes('bilibili.com')) {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
        // 以 content script 返回的状态为准
        config.enabled = response?.enabled ?? newEnabled;
      } else {
        config.enabled = newEnabled;
        await saveConfig();
      }
    } catch (e) {
      config.enabled = newEnabled;
      await saveConfig();
    }

    elements.enableToggle.checked = config.enabled;
    updateDisabledState();
    showToast(config.enabled ? '屏蔽已开启' : '屏蔽已关闭');
  });

  // 添加关键词
  elements.addBtn.addEventListener('click', addKeyword);
  elements.keywordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addKeyword();
    }
  });

  // 清空所有
  elements.clearAllBtn.addEventListener('click', clearAllKeywords);

  // 屏蔽模式切换
  elements.blockModeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      config.blockMode = radio.value;
      saveConfig();
    });
  });

  // 显示原因切换
  elements.showReason.addEventListener('change', () => {
    config.showBlockReason = elements.showReason.checked;
    saveConfig();
  });

  // 导出
  elements.exportBtn.addEventListener('click', exportConfig);

  // 导入
  elements.importBtn.addEventListener('click', () => {
    elements.importFile.click();
  });
  elements.importFile.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      importConfig(e.target.files[0]);
      e.target.value = '';
    }
  });

  // 重置统计
  elements.resetBtn.addEventListener('click', async () => {
    if (config.blockCount === 0) return;

    if (confirm('确定要重置屏蔽统计吗？')) {
      config.blockCount = 0;
      elements.blockCount.textContent = '0';

      try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (tab.url && tab.url.includes('bilibili.com')) {
            chrome.tabs.sendMessage(tab.id, { action: 'resetCount' }).catch(() => {});
          }
        }
      } catch (e) {}

      await saveConfig();
      showToast('统计已重置');
    }
  });

  // 定时更新统计
  setInterval(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && tab.url.includes('bilibili.com')) {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getBlockCount' });
        if (response && response.blockCount !== undefined) {
          config.blockCount = response.blockCount;
          elements.blockCount.textContent = config.blockCount.toLocaleString();
        }
      }
    } catch (e) {}
  }, 2000);

  // 初始化
  loadConfig();
});
