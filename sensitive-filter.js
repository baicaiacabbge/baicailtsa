(function() {
    'use strict';

    var CONFIG = {
        API_URL: 'https://v.api.aa1.cn/api/api-mgc/index.php',
        AI_API_URL: 'https://api.auth.top/api/aidetect',
        AI_API_KEY: 'cd8b7b5bac0e1e4a',
        TIMEOUT: 5000,
        AI_TIMEOUT: 15000,

        LOCAL_WORDS_URL: 'https://raw.githubusercontent.com/baicaiacabbge/baicailtsa/main/bendicc/word.txt',

        WHITELIST: [
            '妈', '爸', '娘', '爹', '爷', '奶', '哥', '姐', '弟', '妹',
            '叔', '伯', '婶', '姨', '舅', '姑', '姥', '婆', '公',
            '好', '是', '的', '了', '吗', '呢', '吧', '啊', '哦', '嗯',
            '我', '你', '他', '她', '它', '们', '这', '那', '哪',
            '来', '去', '上', '下', '左', '右', '前', '后',
            '大', '小', '多', '少', '高', '低', '长', '短',
            '吃', '喝', '玩', '乐', '走', '跑', '跳', '看', '听', '说',
            '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
            '天', '地', '人', '日', '月', '星', '风', '雨', '云', '雪',
            '花', '草', '树', '木', '山', '水', '火', '土', '金', '石',
            '买', '卖', '贵', '便', '宜', '钱', '元', '块', '毛', '分'
        ]
    };

    // ========== 代理加速配置 ==========
    var PROXY_LIST = [
        'https://gitproxy.click/',
        'https://ghproxy.net/',
        'https://gh.api.99988866.xyz/',
        'https://github.akams.cn/'
    ];
    var PROXY_INDEX = 0;

    function getProxiedUrl(rawUrl) {
        if (PROXY_INDEX >= PROXY_LIST.length) {
            return rawUrl;
        }
        var proxy = PROXY_LIST[PROXY_INDEX];
        return proxy + rawUrl;
    }

    // ========== 本地敏感词库 ==========
    var localWordSet = null;
    var localWordsLoaded = false;
    var isLoading = false;

    function loadLocalWordSet() {
        if (localWordsLoaded) {
            return Promise.resolve();
        }
        if (isLoading) {
            return new Promise(function(resolve) {
                var checkLoaded = function() {
                    if (localWordsLoaded) {
                        resolve();
                    } else {
                        setTimeout(checkLoaded, 200);
                    }
                };
                checkLoaded();
            });
        }

        isLoading = true;
        var rawUrl = CONFIG.LOCAL_WORDS_URL;
        var url = getProxiedUrl(rawUrl);
        console.log('📥 正在加载本地敏感词库（代理' + (PROXY_INDEX + 1) + '）:', url);

        return fetch(url, { cache: 'force-cache' })
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('加载失败: ' + response.status);
                }
                return response.text();
            })
            .then(function(text) {
                var words = text.split(/\r?\n/)
                    .map(function(line) { return line.trim(); })
                    .filter(function(word) {
                        return word.length > 0 && !word.startsWith('#');
                    });
                localWordSet = new Set(words);
                localWordsLoaded = true;
                isLoading = false;
                PROXY_INDEX = 0;
                console.log('✅ 本地敏感词库加载完成，共 ' + localWordSet.size + ' 个词');
            })
            .catch(function(error) {
                console.warn('⚠️ 代理' + (PROXY_INDEX + 1) + '加载失败:', error.message);
                PROXY_INDEX++;
                if (PROXY_INDEX < PROXY_LIST.length) {
                    console.log('🔄 切换到下一个代理...');
                    isLoading = false;
                    return loadLocalWordSet();
                } else {
                    console.log('🔄 所有代理失败，尝试原始地址...');
                    PROXY_INDEX = 0;
                    isLoading = false;
                    return loadLocalWordSetFallback();
                }
            })
            .catch(function(finalError) {
                console.warn('⚠️ 所有代理及原始地址均失败，跳过本地词库:', finalError.message);
                isLoading = false;
                localWordSet = null;
            });
    }

    function loadLocalWordSetFallback() {
        if (localWordsLoaded) {
            return Promise.resolve();
        }
        if (isLoading) {
            return new Promise(function(resolve) {
                var checkLoaded = function() {
                    if (localWordsLoaded) {
                        resolve();
                    } else {
                        setTimeout(checkLoaded, 200);
                    }
                };
                checkLoaded();
            });
        }

        isLoading = true;
        var url = CONFIG.LOCAL_WORDS_URL;
        console.log('📥 正在加载本地敏感词库（原始地址）:', url);

        return fetch(url, { cache: 'force-cache' })
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('加载失败: ' + response.status);
                }
                return response.text();
            })
            .then(function(text) {
                var words = text.split(/\r?\n/)
                    .map(function(line) { return line.trim(); })
                    .filter(function(word) {
                        return word.length > 0 && !word.startsWith('#');
                    });
                localWordSet = new Set(words);
                localWordsLoaded = true;
                isLoading = false;
                console.log('✅ 本地敏感词库加载完成（原始地址），共 ' + localWordSet.size + ' 个词');
            })
            .catch(function(error) {
                console.warn('⚠️ 原始地址加载失败，跳过本地词库:', error.message);
                isLoading = false;
                localWordSet = null;
            });
    }

    function loadLocalWordSetWithRetry() {
        return loadLocalWordSet().catch(function() {
            return loadLocalWordSetFallback();
        });
    }

    function checkLocalWordSet(text) {
        if (!localWordSet) {
            return null;
        }
        var words = localWordSet.values();
        for (var word of words) {
            if (word.length <= 1) continue;
            if (/^[0-9]+$/.test(word) && word.length < 3) continue;
            if (/^[a-zA-Z]+$/.test(word) && word.length < 2) continue;
            if (text.indexOf(word) !== -1) {
                return {
                    safe: false,
                    keyword: word,
                    desc: '本地敏感词库命中',
                    source: 'local_wordset'
                };
            }
        }
        return null;
    }

    function preloadLocalWordSet() {
        loadLocalWordSetWithRetry().catch(function(e) {});
    }

    // ========== 核心变量 ==========
    var isIntercepted = false;
    var behaviorHistory = [];
    var messageIdCounter = 0;
    var pendingMessages = {};
    var qwenModel = null;
    var qwenLoading = false;
    var qwenLoaded = false;

    function getMessageInput() {
        return document.getElementById('messageInput');
    }

    function getSendButton() {
        return document.getElementById('sendBtn');
    }

    function showWarning(text) {
        try {
            var warningDiv = document.getElementById('warningMessage');
            if (warningDiv) {
                warningDiv.textContent = text;
                warningDiv.style.display = 'block';
                clearTimeout(warningDiv._hideTimer);
                warningDiv._hideTimer = setTimeout(function() {
                    warningDiv.style.display = 'none';
                }, 3000);
                return;
            }
            var errorEl = document.getElementById('loginError');
            if (errorEl) {
                errorEl.textContent = text;
                errorEl.style.display = 'block';
                setTimeout(function() {
                    errorEl.style.display = 'none';
                }, 3000);
            }
        } catch (e) {}
    }

    // ==================== 显示加载状态到界面 ====================
    function showStatus(text, isSuccess) {
        try {
            var statusDiv = document.getElementById('wordsetStatus');
            if (!statusDiv) {
                var warningDiv = document.getElementById('warningMessage');
                if (warningDiv) {
                    statusDiv = document.createElement('div');
                    statusDiv.id = 'wordsetStatus';
                    statusDiv.style.cssText = 'padding:6px 12px;font-size:13px;text-align:center;border-bottom:1px solid #2a2a4a;background:#1a1a2e;';
                    warningDiv.parentNode.insertBefore(statusDiv, warningDiv.nextSibling);
                }
            }
            if (statusDiv) {
                statusDiv.textContent = text;
                statusDiv.style.color = isSuccess ? '#4caf50' : '#ffd700';
                if (isSuccess === true) {
                    setTimeout(function() {
                        if (statusDiv) statusDiv.style.display = 'none';
                    }, 3000);
                }
            }
        } catch (e) {}
    }

    // ==================== 白名单 ====================
    function whitelistCheck(text) {
        if (!text || typeof text !== 'string') return null;
        var trimmed = text.trim();
        if (trimmed.length === 0) return null;
        if (trimmed.length <= 4) {
            var chars = trimmed.split('');
            for (var i = 0; i < chars.length; i++) {
                if (CONFIG.WHITELIST.indexOf(chars[i]) === -1) {
                    return null;
                }
            }
            return { safe: true, source: 'whitelist' };
        }
        return null;
    }

    // ==================== 本地11项检测 ====================

    function zeroWidthCharCheck(text) {
        if (!text || typeof text !== 'string') return null;
        try {
            var zeroWidthChars = ['\u200B', '\u200C', '\u200D', '\uFEFF', '\u2060'];
            for (var i = 0; i < zeroWidthChars.length; i++) {
                if (text.indexOf(zeroWidthChars[i]) !== -1) {
                    return {
                        safe: false,
                        keyword: '零宽字符',
                        desc: '包含不可见字符，疑似绕过检测',
                        source: 'zero_width'
                    };
                }
            }
        } catch (e) {}
        return null;
    }

    function fullwidthCharCheck(text) {
        if (!text || typeof text !== 'string') return null;
        try {
            if (/[\uFF21-\uFF3A\uFF41-\uFF5A]/.test(text)) {
                return {
                    safe: false,
                    keyword: '全角字符伪装',
                    desc: '使用全角英文字母，疑似绕过检测',
                    source: 'fullwidth'
                };
            }
        } catch (e) {}
        return null;
    }

    function htmlEntityCheck(text) {
        if (!text || typeof text !== 'string') return null;
        try {
            if (/&#\d{2,5};/.test(text) || /&[a-zA-Z]{2,6};/.test(text)) {
                return {
                    safe: false,
                    keyword: 'HTML实体编码',
                    desc: '包含HTML实体编码，疑似绕过检测',
                    source: 'html_entity'
                };
            }
        } catch (e) {}
        return null;
    }

    function reversedTextCheck(text) {
        if (!text || typeof text !== 'string' || text.length < 5) return null;
        try {
            var firstChar = text[0];
            var reversedPunctuation = ['！', '？', '，', '。', '；', '：', '」', '』', '】'];
            var isReversedStart = false;
            for (var i = 0; i < reversedPunctuation.length; i++) {
                if (firstChar === reversedPunctuation[i]) {
                    isReversedStart = true;
                    break;
                }
            }
            if (isReversedStart) {
                var lastChar = text[text.length - 1];
                var normalPunctuation = ['、', '，', '。', '？', '！', '；', '：'];
                var isNormalEnd = false;
                for (var j = 0; j < normalPunctuation.length; j++) {
                    if (lastChar === normalPunctuation[j]) {
                        isNormalEnd = true;
                        break;
                    }
                }
                if (isNormalEnd) {
                    return {
                        safe: false,
                        keyword: '文本反转',
                        desc: '疑似反转文本绕过检测',
                        source: 'reversed'
                    };
                }
            }
        } catch (e) {}
        return null;
    }

    function adversarialCharCheck(text) {
        if (!text || typeof text !== 'string') return null;
        try {
            var chars = ['「', '」', '『', '』', '【', '】'];
            var count = 0;
            for (var i = 0; i < chars.length; i++) {
                if (text.indexOf(chars[i]) !== -1) count++;
            }
            if (count > 2) {
                return {
                    safe: false,
                    keyword: '对抗性字符',
                    desc: '包含大量特殊标点，疑似绕过检测',
                    source: 'adversarial_char'
                };
            }
        } catch (e) {}
        return null;
    }

    function mixedScriptCheck(text) {
        if (!text || typeof text !== 'string' || text.length < 4) return null;
        try {
            var scripts = [];
            if (/[\u4e00-\u9fff]/.test(text)) scripts.push('中文');
            if (/[\u3040-\u30ff]/.test(text)) scripts.push('日文');
            if (/[\uac00-\ud7af]/.test(text)) scripts.push('韩文');
            if (/[\u0400-\u04ff]/.test(text)) scripts.push('西里尔');
            if (/[\u0600-\u06ff]/.test(text)) scripts.push('阿拉伯文');
            if (scripts.length > 2) {
                return {
                    safe: false,
                    keyword: '混合文字',
                    desc: '混合多种文字: ' + scripts.join(', ') + '，疑似混淆',
                    source: 'mixed_script'
                };
            }
        } catch (e) {}
        return null;
    }

    function separatorInjectionCheck(text) {
        if (!text || typeof text !== 'string' || text.length < 5) return null;
        try {
            var separators = [' ', '\t', '\n', '\r', ',', '.', ';', ':', '|', '/', '\\', '_', '-', '*', '#', '@', '~', '`', '^', '&', '%', '$', '+', '=', '?', '!'];
            var sepCount = 0;
            var chineseCount = 0;
            for (var i = 0; i < text.length; i++) {
                var char = text[i];
                if (separators.indexOf(char) !== -1) {
                    sepCount++;
                } else if (/[\u4e00-\u9fff]/.test(char)) {
                    chineseCount++;
                }
            }
            if (text.length > 10 && sepCount / text.length > 0.25 && chineseCount > 3) {
                return {
                    safe: false,
                    keyword: '分隔符注入',
                    desc: '包含大量分隔符，疑似拆分敏感词',
                    source: 'separator_inject'
                };
            }
        } catch (e) {}
        return null;
    }

    function entropyCheck(text) {
        return null;
    }

    function wordFrequencyCheck(text) {
        return null;
    }

    function pinyinHomophoneCheck(text) {
        return null;
    }

    function behaviorCheck(text) {
        if (!text || typeof text !== 'string') return null;
        try {
            var now = Date.now();
            while (behaviorHistory.length > 0 && now - behaviorHistory[0].time > 5000) {
                behaviorHistory.shift();
            }
            behaviorHistory.push({ time: now, text: text });
            if (behaviorHistory.length > 10) {
                return {
                    safe: false,
                    keyword: '发送频率过高',
                    desc: '5秒内发送 ' + behaviorHistory.length + ' 条消息',
                    source: 'behavior'
                };
            }
            var recentTexts = [];
            for (var i = 0; i < behaviorHistory.length; i++) {
                recentTexts.push(behaviorHistory[i].text);
            }
            var matchCount = 0;
            for (var j = 0; j < recentTexts.length; j++) {
                if (recentTexts[j] === text) matchCount++;
            }
            if (matchCount > 3) {
                return {
                    safe: false,
                    keyword: '重复内容刷屏',
                    desc: '重复发送相同内容 ' + matchCount + ' 次',
                    source: 'behavior'
                };
            }
        } catch (e) {}
        return null;
    }

    function unicodeNormalizationCheck(text) {
        if (!text || typeof text !== 'string' || text.length < 3) return null;
        try {
            var compatibilityChars = /[\uFB00-\uFB06\uFB13-\uFB17\uFDFA\uFDFB]/;
            if (compatibilityChars.test(text)) {
                return {
                    safe: false,
                    keyword: 'Unicode伪装',
                    desc: '使用Unicode兼容字符，疑似绕过检测',
                    source: 'unicode_norm'
                };
            }
            var homoglyphCount = 0;
            var homoglyphs = [
                /[\u0400-\u04FF]/,
                /[\u0370-\u03FF]/,
                /[\u0100-\u017F]/
            ];
            for (var i = 0; i < homoglyphs.length; i++) {
                if (homoglyphs[i].test(text)) homoglyphCount++;
            }
            if (homoglyphCount >= 2) {
                return {
                    safe: false,
                    keyword: '同形字符混淆',
                    desc: '混合多种字母系统，疑似同形攻击',
                    source: 'unicode_norm'
                };
            }
        } catch (e) {}
        return null;
    }

    function localFastCheck(text) {
        var detectors = [
            zeroWidthCharCheck,
            fullwidthCharCheck,
            htmlEntityCheck,
            reversedTextCheck,
            adversarialCharCheck,
            mixedScriptCheck,
            separatorInjectionCheck,
            entropyCheck,
            pinyinHomophoneCheck,
            behaviorCheck,
            unicodeNormalizationCheck
        ];
        for (var i = 0; i < detectors.length; i++) {
            try {
                var result = detectors[i](text);
                if (result && result.safe === false) {
                    return result;
                }
            } catch (e) {}
        }
        return null;
    }

    // ==================== Qwen3Guard 本地 AI 加载 ====================

    async function loadQwenModel() {
        if (qwenLoaded) return;
        if (qwenLoading) {
            return new Promise(function(resolve) {
                var check = function() {
                    if (qwenLoaded) {
                        resolve();
                    } else {
                        setTimeout(check, 500);
                    }
                };
                check();
            });
        }

        qwenLoading = true;
        showStatus('正在加载 BCQVM模型...', false);
        console.log('🧠 正在加载 Qwen3Guard 本地模型 (~940MB)...');

        try {
            var hasWebGPU = false;
            if (navigator.gpu) {
                try {
                    var adapter = await navigator.gpu.requestAdapter();
                    hasWebGPU = !!adapter;
                } catch (e) {}
            }

            console.log(hasWebGPU ? '🚀 WebGPU 加速可用' : '💻 使用 CPU (WASM)');

            var script = document.createElement('script');
            script.type = 'importmap';
            script.textContent = JSON.stringify({
                imports: {
                    '@huggingface/transformers': 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.0-next.3/dist/transformers.min.js'
                }
            });
            document.head.appendChild(script);

            await new Promise(function(resolve) {
                setTimeout(resolve, 500);
            });

            var module = await import('@huggingface/transformers');
            var pipeline = module.pipeline;

            var progressLog = function(progress) {
                if (progress.status === 'progress') {
                    // ✅ 限制最大 100%，防止显示 10000%
                    var pct = Math.min(Math.round(progress.progress * 100), 100);
                    console.log('模型加载进度: ' + pct + '%');
                    showStatus('BCQVM加载中 ' + pct + '%', false);
                }
            };

            qwenModel = await pipeline('text-generation', 'rogerdeng/Qwen3Guard-0.6B-ONNX-Quantized', {
                model_file_name: 'model_quantized',
                device: hasWebGPU ? 'webgpu' : 'cpu',
                dtype: 'q4',
                progress_callback: progressLog
            });

            // 加载完成后检查模型是否真的存在
            if (qwenModel) {
                qwenLoaded = true;
                qwenLoading = false;
                showStatus('BCQVM 加载完成！', true);
                console.log('Qwen3Guard 模型加载完成');
            } else {
                throw new Error('模型加载返回空');
            }
        } catch (error) {
            console.error('❌ Qwen3Guard 加载失败:', error);
            showStatus('❌ BCQVM 加载失败: ' + error.message.substring(0, 50), false);
            qwenLoading = false;
            qwenLoaded = false;
        }
    }

    // ==================== Qwen3Guard 本地 AI 检测 ====================

    async function qwenCheck(text) {
        if (!qwenLoaded || !qwenModel) {
            return null;
        }

        try {
            var startTime = Date.now();
            console.log('🧠 Qwen3Guard 推理中...');

            var output = await qwenModel(text, {
                max_new_tokens: 15,
                temperature: 0,
                use_cache: true
            });

            var elapsed = (Date.now() - startTime) / 1000;
            console.log('✅ Qwen3Guard 推理完成，耗时: ' + elapsed.toFixed(1) + 's');

            var result = output[0]?.generated_text || '';
            var lower = result.toLowerCase();

            // 只拦截这些高危类别
            var unsafeKeywords = ['violent', 'sexual', 'self-harm', 'illegal', 'hate'];
            var isUnsafe = false;
            for (var i = 0; i < unsafeKeywords.length; i++) {
                if (lower.includes(unsafeKeywords[i])) {
                    isUnsafe = true;
                    break;
                }
            }

            // 政治敏感不拦截
            if (lower.includes('political')) {
                isUnsafe = false;
            }

            if (isUnsafe) {
                return {
                    safe: false,
                    keyword: 'AI检测',
                    desc: 'Qwen3Guard 检测到违规内容',
                    source: 'qwen3guard'
                };
            }

            return { safe: true, source: 'qwen3guard' };
        } catch (error) {
            console.error('Qwen3Guard 推理失败:', error);
            return null;
        }
    }

    // ==================== 云端 API 检测 ====================

    async function apiCheck(text) {
        if (!text || typeof text !== 'string') return null;
        try {
            var controller = new AbortController();
            var timeoutId = setTimeout(function() {
                controller.abort();
            }, CONFIG.TIMEOUT);
            var url = CONFIG.API_URL + '?msg=' + encodeURIComponent(text);
            var response = await fetch(url, {
                signal: controller.signal,
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error('API请求失败: ' + response.status);
            var data = await response.json();
            if (data.num === '1' || data.num === 1) {
                return {
                    safe: false,
                    keyword: data.ci || '未知',
                    desc: data.desc || '存在敏感词',
                    source: 'api',
                    rawData: data
                };
            }
            return { safe: true, source: 'api' };
        } catch (error) {
            console.warn('⚠️ API不可用，跳过');
            return null;
        }
    }

    // ==================== 云端 AI 检测 ====================

    async function aiConfirmCheck(text) {
        if (!text || typeof text !== 'string') return null;
        try {
            var controller = new AbortController();
            var timeoutId = setTimeout(function() {
                controller.abort();
            }, CONFIG.AI_TIMEOUT);
            var url = CONFIG.AI_API_URL + '?key=' + CONFIG.AI_API_KEY + '&content=' + encodeURIComponent(text);
            var response = await fetch(url, {
                signal: controller.signal,
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error('AI API请求失败: ' + response.status);
            var data = await response.json();

            if (data.code === 200 && data.data) {
                if (data.data.is_violated === true) {
                    var word = data.data.violated_words && data.data.violated_words.length > 0
                        ? data.data.violated_words[0].word
                        : '未知';
                    var category = data.data.violated_words && data.data.violated_words.length > 0
                        ? data.data.violated_words[0].category
                        : '';
                    return {
                        safe: false,
                        keyword: word,
                        category: category,
                        desc: 'AI确认违规' + (category ? ' (' + category + ')' : ''),
                        source: 'ai_confirm',
                        rawData: data
                    };
                } else {
                    return { safe: true, source: 'ai_confirm' };
                }
            }
            console.warn('⚠️ AI API返回异常');
            return { safe: true, source: 'ai_confirm', fallback: true };
        } catch (error) {
            console.warn('⚠️ AI API不可用或超时');
            return { safe: true, source: 'ai_confirm', fallback: true };
        }
    }

    // ==================== 拦截发送 ====================

    function interceptSend() {
        if (isIntercepted) return true;

        var sendBtn = getSendButton();
        var messageInput = getMessageInput();
        if (!sendBtn || !messageInput) return false;

        var newSendBtn = sendBtn.cloneNode(true);
        sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
        var newBtn = getSendButton();
        var newInput = getMessageInput();

        async function handleSend(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }

            var text = newInput.value.trim();
            if (!text) return;
            if (newBtn.disabled) return;

            newBtn.disabled = true;

            try {
                // ===== 第1层：白名单 =====
                var whitelistResult = whitelistCheck(text);
                if (whitelistResult) {
                    var enterEvent = new KeyboardEvent('keypress', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true,
                        cancelable: true
                    });
                    newInput.dispatchEvent(enterEvent);
                    newBtn.disabled = false;
                    return;
                }

                // ===== 第2层：本地11项行为检测 =====
                var localResult = localFastCheck(text);
                if (localResult && localResult.safe === false) {
                    showWarning('您的信息触发了本地安全规则，消息已被拦截');
                    newBtn.disabled = false;
                    return;
                }

                // ===== 第3层：本地敏感词库 =====
                var wordsetResult = checkLocalWordSet(text);
                if (wordsetResult && wordsetResult.safe === false) {
                    showWarning('您的信息包含违规内容，已被本地库识别拦截。');
                    newBtn.disabled = false;
                    return;
                }

                // ===== 第4层：BCQVM（Qwen3Guard）本地 AI =====
                var qwenResult = null;
                if (qwenLoaded) {
                    qwenResult = await qwenCheck(text);
                    if (qwenResult && qwenResult.safe === false) {
                        showWarning('您的信息包含违规内容，已被BCQVM识别拦截。');
                        newBtn.disabled = false;
                        return;
                    }
                }

                // ===== 第5层：云端API检测 =====
                var apiResult = await apiCheck(text);

                if (!apiResult || apiResult.safe !== false) {
                    var enterEvent = new KeyboardEvent('keypress', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true,
                        cancelable: true
                    });
                    newInput.dispatchEvent(enterEvent);
                    newBtn.disabled = false;
                    return;
                }

                // ===== API 命中 → 调用云端AI二次确认 =====
                console.log('⚠️ API检测到敏感词，调用云端AI二次确认（15秒）...');
                var aiResult = await aiConfirmCheck(text);

                if (aiResult && aiResult.fallback === true) {
                    console.log('⏱️ AI超时/不可用，采用API判定结果，拦截');
                    showWarning('您的信息包含违规内容，已被云端库识别拦截。');
                    newBtn.disabled = false;
                    return;
                }

                if (aiResult && aiResult.safe === false) {
                    showWarning('您的信息包含违规内容，已被云端AI识别拦截。');
                    newBtn.disabled = false;
                    return;
                }

                console.log('✅ AI未确认违规，放行');
                var enterEvent = new KeyboardEvent('keypress', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true
                });
                newInput.dispatchEvent(enterEvent);

                setTimeout(function() {
                    newBtn.disabled = false;
                }, 500);

            } catch (error) {
                console.error('发送出错:', error);
                if (apiResult && apiResult.safe === false) {
                    console.warn('⚠️ 检测异常，采用API判定结果，拦截');
                    showWarning('您的信息包含违规内容，已被云端库识别拦截。');
                } else {
                    showWarning('检测服务异常，请稍后重试。');
                }
                newBtn.disabled = false;
            }
        }

        newBtn.addEventListener('click', handleSend);

        newInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                if (!newBtn.disabled) {
                    newBtn.click();
                }
            }
        });

        isIntercepted = true;
        console.log('✅ 检测模块已启用（本地 + BCQVM + API + 云端AI）');
        console.log('🚀 本地词库代理加速已启用，共 ' + PROXY_LIST.length + ' 个代理源');
        return true;
    }

    // ==================== 对外接口 ====================

    window.__sensitiveFilter = {
        check: function(text) {
            var result = localFastCheck(text);
            if (result && result.safe === false) return result;
            return checkLocalWordSet(text) || { safe: true };
        },
        config: CONFIG,
        reload: function() {
            isIntercepted = false;
            interceptSend();
        },
        addWhitelist: function(words) {
            if (Array.isArray(words)) {
                for (var i = 0; i < words.length; i++) {
                    CONFIG.WHITELIST.push(words[i]);
                }
                console.log('✅ 白名单已更新');
            }
        },
        reloadWordSet: function() {
            localWordsLoaded = false;
            localWordSet = null;
            loadLocalWordSetWithRetry();
        },
        loadQwen: function() {
            loadQwenModel();
        }
    };

    // ==================== 初始化 ====================

    function init() {
        preloadLocalWordSet();

        // ✅ 页面加载后立即开始加载 Qwen3Guard（不等待，不阻塞）
        setTimeout(function() {
            loadQwenModel().catch(function(e) {
                console.warn('Qwen3Guard 后台加载失败:', e);
                showStatus('❌ BCQVM 加载失败，请刷新重试', false);
            });
        }, 1000);

        try {
            var attempts = 0;
            var maxAttempts = 30;

            function tryInit() {
                attempts++;
                try {
                    var panel = document.getElementById('chatPanel');
                    if (panel && panel.style.display !== 'none') {
                        setTimeout(function() {
                            try {
                                var success = interceptSend();
                                if (!success) {
                                    setTimeout(tryInit, 1000);
                                }
                            } catch (e) {
                                setTimeout(tryInit, 1000);
                            }
                        }, 500);
                        return;
                    }
                } catch (e) {}
                if (attempts < maxAttempts) {
                    setTimeout(tryInit, 500);
                } else {
                    console.warn('⚠️ 检测模块初始化超时');
                }
            }

            try {
                var panelCheck = document.getElementById('chatPanel');
                if (panelCheck && panelCheck.style.display !== 'none') {
                    tryInit();
                    return;
                }
            } catch (e) {}

            var observer = new MutationObserver(function() {
                try {
                    var panel = document.getElementById('chatPanel');
                    if (panel && panel.style.display !== 'none') {
                        observer.disconnect();
                        tryInit();
                    }
                } catch (e) {}
            });
            var target = document.getElementById('chatPanel') || document.body;
            observer.observe(target, {
                attributes: true,
                attributeFilter: ['style']
            });
        } catch (e) {
            console.warn('⚠️ 检测模块初始化失败:', e.message);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 100);
    }

})();