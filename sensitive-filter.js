(function() {
    'use strict';

    var CONFIG = {
        API_URL: 'https://v.api.aa1.cn/api/api-mgc/index.php',
        AI_API_URL: 'https://api.auth.top/api/aidetect',
        AI_API_KEY: 'cd8b7b5bac0e1e4a',
        TIMEOUT: 5000,
        AI_TIMEOUT: 30000,

        // ⭐ 本地敏感词库 Raw 链接
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

    // ==================== 核心改动：智能检测本地词库 ====================
    function checkLocalWordSet(text) {
        if (!localWordSet) {
            return null;
        }
        var words = localWordSet.values();
        for (var word of words) {
            // 1. 单字永远不拦截（避免"一、了、的"误报）
            if (word.length <= 1) continue;
            // 2. 纯数字/纯字母短词不拦截
            if (/^[0-9]+$/.test(word) && word.length < 3) continue;
            if (/^[a-zA-Z]+$/.test(word) && word.length < 3) continue;

            // 3. 双字词智能匹配：必须完整匹配，不能是其他词的一部分
            if (word.length === 2) {
                if (text.indexOf(word) !== -1) {
                    var index = text.indexOf(word);
                    var before = text[index - 1] || '';
                    var after = text[index + 2] || '';
                    // 前后不是汉字（或不存在）才算独立词
                    if (!/[\u4e00-\u9fff]/.test(before) && !/[\u4e00-\u9fff]/.test(after)) {
                        return {
                            safe: false,
                            keyword: word,
                            desc: '本地敏感词库命中',
                            source: 'local_wordset'
                        };
                    }
                }
                continue;
            }

            // 4. 3个字及以上直接检测
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

    // ==================== 本地12项检测 ====================

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
        if (!text || typeof text !== 'string' || text.length < 5) return null;
        try {
            var entropy = 0;
            var freq = {};
            for (var i = 0; i < text.length; i++) {
                var char = text[i];
                freq[char] = (freq[char] || 0) + 1;
            }
            var length = text.length;
            var keys = Object.keys(freq);
            for (var j = 0; j < keys.length; j++) {
                var count = freq[keys[j]];
                var p = count / length;
                entropy -= p * Math.log2(p);
            }
            var hasBase64 = /[A-Za-z0-9+/=]{20,}/.test(text);
            var hasHex = /[0-9A-Fa-f]{16,}/.test(text);
            var score = 0;
            if (entropy > 4.5) score += 25;
            if (hasBase64) score += 20;
            if (hasHex) score += 15;
            if (score >= 40) {
                return {
                    safe: false,
                    keyword: '信息熵异常',
                    desc: '熵值 ' + entropy.toFixed(2) + '，疑似编码内容',
                    source: 'entropy'
                };
            }
        } catch (e) {}
        return null;
    }

    function wordFrequencyCheck(text) {
        if (!text || typeof text !== 'string' || text.length < 10) return null;
        try {
            var freq = {};
            for (var i = 0; i < text.length; i++) {
                var char = text[i];
                freq[char] = (freq[char] || 0) + 1;
            }
            var values = [];
            var keys = Object.keys(freq);
            for (var j = 0; j < keys.length; j++) {
                values.push(freq[keys[j]]);
            }
            if (values.length === 0) return null;
            var maxFreq = Math.max.apply(null, values);
            var sum = 0;
            for (var k = 0; k < values.length; k++) {
                sum += values[k];
            }
            var avgFreq = sum / values.length;
            if (maxFreq > avgFreq * 8 && text.length > 15) {
                return {
                    safe: false,
                    keyword: '词频异常',
                    desc: '某字符出现频率异常高 (' + maxFreq + '次)',
                    source: 'word_frequency'
                };
            }
        } catch (e) {}
        return null;
    }

    function pinyinHomophoneCheck(text) {
        if (!text || typeof text !== 'string' || text.length < 4) return null;
        try {
            var letterCount = (text.match(/[a-zA-Z]/g) || []).length;
            var spaceCount = (text.match(/\s/g) || []).length;
            if (letterCount > 4 && spaceCount > 0 && letterCount / text.length > 0.4) {
                return {
                    safe: false,
                    keyword: '拼音替代',
                    desc: '包含拼音内容，疑似绕过检测',
                    source: 'pinyin_homophone'
                };
            }
            var digitCount = (text.match(/\d/g) || []).length;
            if (digitCount > 2 && digitCount / text.length > 0.3) {
                return {
                    safe: false,
                    keyword: '数字谐音',
                    desc: '包含数字组合，疑似谐音绕过',
                    source: 'pinyin_homophone'
                };
            }
            if (/^[bcdfghjklmnpqrstvwxyz]{2,4}$/i.test(text.trim())) {
                return {
                    safe: false,
                    keyword: '拼音首字母',
                    desc: '拼音首字母缩写，疑似绕过检测',
                    source: 'pinyin_homophone'
                };
            }
        } catch (e) {}
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
            wordFrequencyCheck,
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

    // ==================== AI 检测 ====================

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

                // ===== 第2层：本地12项行为检测 =====
                var localResult = localFastCheck(text);
                if (localResult && localResult.safe === false) {
                    showWarning('您的内容触发了安全检测，消息已被拦截');
                    newBtn.disabled = false;
                    return;
                }

                // ===== 第3层：本地敏感词库 =====
                var wordsetResult = checkLocalWordSet(text);
                if (wordsetResult && wordsetResult.safe === false) {
                    showWarning('您的内容包含敏感词，消息已被本地库识别拦截。');
                    newBtn.disabled = false;
                    return;
                }

                // ===== 第4层：云端API检测（同步） =====
                var apiResult = await apiCheck(text);

                // API 未命中 → 直接发送
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

                // ===== API 命中 → 调用AI二次确认 =====
                console.log('⚠️ API检测到敏感词，调用AI二次确认（30秒）...');
                var aiResult = await aiConfirmCheck(text);

                // AI超时或不可用 → 采用API结果，直接拦截
                if (aiResult && aiResult.fallback === true) {
                    console.log('⏱️ AI超时/不可用，采用API判定结果，拦截');
                    showWarning('您的内容包含敏感词: "' + apiResult.keyword + '"，消息已被云端库识别拦截');
                    newBtn.disabled = false;
                    return;
                }

                // AI确认违规 → 拦截
                if (aiResult && aiResult.safe === false) {
                    showWarning('您的内容包含敏感词: "' + aiResult.keyword + '"，消息已被云端AI识别拦截');
                    newBtn.disabled = false;
                    return;
                }

                // AI不确认 → 放行
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
                // AI调用异常，采用API结果拦截
                if (apiResult && apiResult.safe === false) {
                    console.warn('⚠️ AI调用异常，采用API判定结果，拦截');
                    showWarning('您的内容包含敏感词: "' + apiResult.keyword + '"，消息已被云端库识别拦截 ');
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
        console.log('✅ API命中→AI确认模式（AI超时/不可用时API兜底拦截）已启用');
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
        }
    };

    // ==================== 初始化 ====================

    function init() {
        preloadLocalWordSet();

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