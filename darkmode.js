/**
 * 白菜聊天室 - 暗黑模式独立模块
 * 完全独立，不影响原有 baicai.js
 */

(function() {
    'use strict';

    // ============================================================
    // 配置
    // ============================================================
    const CONFIG = {
        STORAGE_KEY: 'baicai_dark_mode',
        BUTTON_ID: 'themeToggleBtn',
        CHAT_PANEL_ID: 'chatPanel',
        DARK_CLASS: 'dark-mode'
    };

    // ============================================================
    // 核心功能
    // ============================================================

    /**
     * 获取当前主题状态
     */
    function getCurrentTheme() {
        return localStorage.getItem(CONFIG.STORAGE_KEY) === 'true';
    }

    /**
     * 应用主题
     * @param {boolean} isDark - 是否启用暗黑模式
     */
    function applyTheme(isDark) {
        const btn = document.getElementById(CONFIG.BUTTON_ID);
        
        if (isDark) {
            document.documentElement.classList.add(CONFIG.DARK_CLASS);
            if (btn) btn.textContent = '☀️';
        } else {
            document.documentElement.classList.remove(CONFIG.DARK_CLASS);
            if (btn) btn.textContent = '🌙';
        }
        
        localStorage.setItem(CONFIG.STORAGE_KEY, String(isDark));
    }

    /**
     * 切换主题
     */
    function toggleTheme() {
        applyTheme(!getCurrentTheme());
    }

    /**
     * 绑定按钮事件
     */
    function bindButton() {
        const btn = document.getElementById(CONFIG.BUTTON_ID);
        if (btn && !btn._darkModeBound) {
            btn.addEventListener('click', toggleTheme);
            btn._darkModeBound = true;
            return true;
        }
        return false;
    }

    /**
     * 初始化主题（恢复保存的状态）
     */
    function initTheme() {
        // 尝试绑定按钮
        bindButton();
        // 应用已保存的主题
        applyTheme(getCurrentTheme());
    }

    // ============================================================
    // 自动检测登录状态（当 chatPanel 显示时重新绑定）
    // ============================================================

    /**
     * 检查登录面板是否可见
     */
    function isChatPanelVisible() {
        const panel = document.getElementById(CONFIG.CHAT_PANEL_ID);
        return panel && panel.style.display !== 'none';
    }

    /**
     * 启动监听器
     */
    function startObserver() {
        // 监听 chatPanel 的 style 属性变化
        const target = document.getElementById(CONFIG.CHAT_PANEL_ID) || document.body;
        
        const observer = new MutationObserver(function() {
            if (isChatPanelVisible()) {
                // 登录成功，绑定按钮并确保主题正确
                if (bindButton()) {
                    // 新绑定了按钮，重新应用主题以更新按钮图标
                    applyTheme(getCurrentTheme());
                }
            }
        });

        observer.observe(target, {
            attributes: true,
            attributeFilter: ['style']
        });

        // 也监听 DOM 变化（以防按钮动态创建）
        const domObserver = new MutationObserver(function() {
            const btn = document.getElementById(CONFIG.BUTTON_ID);
            if (btn && !btn._darkModeBound) {
                bindButton();
                applyTheme(getCurrentTheme());
            }
        });

        domObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        // 保存 observer 以便调试
        window.__darkModeObservers = [observer, domObserver];
    }

    // ============================================================
    // 启动
    // ============================================================

    function main() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                initTheme();
                startObserver();
            });
        } else {
            initTheme();
            startObserver();
        }

        // 额外：如果登录后按钮还没出现，用定时器兜底（每3秒检查一次，最多10次）
        let retryCount = 0;
        const retryInterval = setInterval(function() {
            retryCount++;
            if (isChatPanelVisible()) {
                if (bindButton()) {
                    applyTheme(getCurrentTheme());
                }
            }
            if (retryCount >= 10) {
                clearInterval(retryInterval);
            }
        }, 3000);

        // 暴露 API 到全局，方便调试
        window.__darkMode = {
            toggle: toggleTheme,
            enable: function() { applyTheme(true); },
            disable: function() { applyTheme(false); },
            getState: getCurrentTheme,
            apply: applyTheme
        };
    }

    // ============================================================
    // 执行
    // ============================================================

    // 标记已加载，避免重复执行
    if (!window.__darkModeLoaded) {
        window.__darkModeLoaded = true;
        main();
    }

})();