(function() {
    'use strict';

    var CONFIG = {

        API_URL: 'https://v.api.aa1.cn/api/api-mgc/index.php',

        AI_API_URL: 'https://api.auth.top/api/aidetect',
        AI_API_KEY: 'cd8b7b5bac0e1e4a',
        TIMEOUT: 5000,
        AI_TIMEOUT: 30000,
        RISK_THRESHOLD: 55,

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
        } catch (e) {

        }
    }

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
        } catch (e) {

        }
        return null;
    }

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
        } catch (e) {

        }
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
        } catch (e) {

        }
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
        } catch (e) {

        }
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
        } catch (e) {

        }
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
        } catch (e) {

        }
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
        } catch (e) {

        }
        return null;
    }

    function adversarialCharCheck(text) {
        if (!text || typeof text !== 'string') return null;
        try {
            var reversedPunctuation = ['「', '」', '『', '』', '【', '】'];
            var count = 0;
            for (var i = 0; i < reversedPunctuation.length; i++) {
                if (text.indexOf(reversedPunctuation[i]) !== -1) count++;
            }
            if (count > 2) {
                return {
                    safe: false,
                    keyword: '对抗性字符',
                    desc: '包含大量特殊标点，疑似绕过检测',
                    source: 'adversarial_char'
                };
            }
        } catch (e) {

        }
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
        } catch (e) {

        }
        return null;
    }

    // ============ 新增检测 1: Unicode规范化攻击检测 ============
    function unicodeNormalizationCheck(text) {
        if (!text || typeof text !== 'string' || text.length < 3) return null;
        try {
            // 检测 Unicode 兼容性分解字符（如 ﬁ → fi 组合）
            var compatibilityChars = /[\uFB00-\uFB06\uFB13-\uFB17\uFDFA\uFDFB]/;
            if (compatibilityChars.test(text)) {
                return {
                    safe: false,
                    keyword: 'Unicode伪装',
                    desc: '使用Unicode兼容字符，疑似绕过检测',
                    source: 'unicode_norm'
                };
            }
            // 检测混杂的 Unicode 同形字符（如 Cyrillic 'а' 代替 Latin 'a'）
            var homoglyphCount = 0;
            var homoglyphs = [
                /[\u0400-\u04FF]/, // Cyrillic
                /[\u0370-\u03FF]/, // Greek
                /[\u0100-\u017F]/  // Latin Extended
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

    // ============ 新增检测 2: 分隔符注入检测 ============
    function separatorInjectionCheck(text) {
        if (!text || typeof text !== 'string' || text.length < 5) return null;
        try {
            var separators = [' ', '\t', '\n', '\r', ',', '.', ';', ':', '|', '/', '\\', '_', '-', '*', '#', '@', '~', '`', '^', '&', '%', '$', '+', '=', '?', '!'];
            var sepCount = 0;
            var alphaCount = 0;
            for (var i = 0; i < text.length; i++) {
                var char = text[i];
                if (separators.indexOf(char) !== -1) {
                    sepCount++;
                } else if (/[\u4e00-\u9fff]/.test(char)) {
                    alphaCount++;
                }
            }
            // 中文文本中分隔符占比 > 25% 且长度 > 10
            if (text.length > 10 && sepCount / text.length > 0.25 && alphaCount > 3) {
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

    // ============ 新增检测 3: 拼音/谐音检测 ============
    function pinyinHomophoneCheck(text) {
        if (!text || typeof text !== 'string' || text.length < 4) return null;
        try {
            // 检测拼音模式：连续字母 + 空格 + 连续字母（如 "ni hao"）
            var pinyinPattern = /[a-zA-Z]{2,}\s+[a-zA-Z]{2,}/;
            if (pinyinPattern.test(text)) {
                var letterCount = (text.match(/[a-zA-Z]/g) || []).length;
                var spaceCount = (text.match(/\s/g) || []).length;
                if (letterCount > 6 && spaceCount > 0 && letterCount / text.length > 0.4) {
                    return {
                        safe: false,
                        keyword: '拼音谐音',
                        desc: '包含拼音/谐音内容，疑似绕过检测',
                        source: 'pinyin_homophone'
                    };
                }
            }
            // 检测数字谐音（如 "520" = "我爱你", "748" = "去死吧"）
            var numberSequence = text.match(/\d{3,}/g);
            if (numberSequence) {
                for (var i = 0; i < numberSequence.length; i++) {
                    var num = numberSequence[i];
                    // 检测含 4、7、8、9 等敏感数字组合
                    if (/[4-9]/.test(num) && num.length >= 3) {
                        // 检查数字占比
                        var digitCount = (text.match(/\d/g) || []).length;
                        if (digitCount / text.length > 0.3) {
                            return {
                                safe: false,
                                keyword: '数字谐音',
                                desc: '包含数字谐音组合，疑似绕过检测',
                                source: 'pinyin_homophone'
                            };
                        }
                    }
                }
            }
            // 检测拼音首字母缩写（如 "sb"、"cnm"）
            var acronymPattern = /[bcdfghjklmnpqrstvwxyz]{2,}/i;
            var matches = text.match(acronymPattern);
            if (matches) {
                for (var j = 0; j < matches.length; j++) {
                    if (matches[j].length >= 2 && matches[j].length <= 5) {
                        var letterRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
                        if (letterRatio > 0.5 && text.length < 20) {
                            return {
                                safe: false,
                                keyword: '拼音首字母',
                                desc: '包含拼音首字母缩写，疑似绕过检测',
                                source: 'pinyin_homophone'
                            };
                        }
                    }
                }
            }
        } catch (e) {}
        return null;
    }

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
                        desc: 'AI确认违规' + (category ? ' (' + category + ')' : ''),
                        source: 'ai_confirm',
                        rawData: data
                    };
                } else {
                    return { safe: true, source: 'ai_confirm' };
                }
            }
            console.warn('⚠️ AI API返回异常，回退到第一个API结果');

            return { safe: true, source: 'ai_confirm', fallback: true };
        } catch (error) {

            console.warn('⚠️ AI API不可用或超时，回退到第一个API结果');

            return { safe: true, source: 'ai_confirm', fallback: true };
        }
    }

    async function checkSensitiveWords(text) {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return { safe: true };
        }

        var whitelistResult = whitelistCheck(text);
        if (whitelistResult) return whitelistResult;

        var fastDetectors = [
            { name: '零宽字符', fn: zeroWidthCharCheck },
            { name: '全角字符', fn: fullwidthCharCheck },
            { name: 'HTML实体', fn: htmlEntityCheck },
            { name: '文本反转', fn: reversedTextCheck },
            { name: '对抗字符', fn: adversarialCharCheck },
            { name: '混合文字', fn: mixedScriptCheck },
            // 新增3项检测
            { name: 'Unicode规范化', fn: unicodeNormalizationCheck },
            { name: '分隔符注入', fn: separatorInjectionCheck },
            { name: '拼音谐音', fn: pinyinHomophoneCheck }
        ];

        for (var i = 0; i < fastDetectors.length; i++) {
            try {
                var result = fastDetectors[i].fn(text);
                if (result && result.safe === false) {
                    console.log('❌ ' + fastDetectors[i].name + ' 检测命中');
                    return result;
                }
            } catch (error) {

            }
        }

        var mediumDetectors = [
            { name: '信息熵', fn: entropyCheck },
            { name: '词频异常', fn: wordFrequencyCheck },
            { name: '行为画像', fn: behaviorCheck }
        ];

        for (var j = 0; j < mediumDetectors.length; j++) {
            try {
                var result2 = mediumDetectors[j].fn(text);
                if (result2 && result2.safe === false) {
                    console.log('❌ ' + mediumDetectors[j].name + ' 检测命中');
                    return result2;
                }
            } catch (error) {

            }
        }

        var apiResult = await apiCheck(text);

        if (apiResult && apiResult.safe === false) {
            console.log('🔍 第一个API检测到敏感词，调用AI二次确认 (超时30秒)...');
            var aiResult = await aiConfirmCheck(text);

            if (aiResult && aiResult.fallback === true) {
                console.log('⏱️ AI超时/不可用，采用第一个API结果');
                return apiResult;
            }

            if (aiResult && aiResult.safe === false) {
                console.log('❌ AI确认违规，拦截');
                return aiResult;
            } else {
                console.log('✅ AI认为不违规，放行');
                return { safe: true, source: 'ai_confirm' };
            }
        }

        if (apiResult) return apiResult;

        return { safe: true };
    }

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
                var result = await checkSensitiveWords(text);

                if (result && result.safe === false) {
                    // 本地检测使用通用提示
                    var localSources = [
                        'zero_width', 'fullwidth', 'html_entity', 
                        'reversed', 'adversarial_char', 'mixed_script',
                        'entropy', 'word_frequency', 'behavior',
                        'unicode_norm', 'separator_inject', 'pinyin_homophone'
                    ];
                    var isLocalDetection = localSources.indexOf(result.source) !== -1;

                    var warningMsg;
                    if (isLocalDetection) {
                        warningMsg = '您的内容触发了安全检测，消息已被拦截。如有疑问请联系管理员。';
                    } else {
                        var sourceMap = {
                            'whitelist': '',
                            'entropy': '信息熵',
                            'zero_width': '零宽字符',
                            'reversed': '文本反转',
                            'mixed_script': '混合文字',
                            'behavior': '行为异常',
                            'fullwidth': '全角伪装',
                            'html_entity': 'HTML编码',
                            'adversarial_char': '对抗字符',
                            'word_frequency': '词频异常',
                            'unicode_norm': 'Unicode伪装',
                            'separator_inject': '分隔符注入',
                            'pinyin_homophone': '拼音谐音',
                            'api': '云端识别',
                            'ai_confirm': '云端AI识别'
                        };
                        var sourceText = sourceMap[result.source] || '';
                        warningMsg = '您的内容包含敏感词: "' + result.keyword + '"，消息已被拦截';
                        if (sourceText) {
                            warningMsg += ' (' + sourceText + ')';
                        }
                    }
                    showWarning(warningMsg);
                    newBtn.disabled = false;
                    return;
                }

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
                console.error('检测出错:', error);
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
        console.log('智能敏感词检测模块已启用 (15种检测方式，含AI二次确认，超时30秒回退)');
        return true;
    }

    window.__sensitiveFilter = {
        check: checkSensitiveWords,
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
        }
    };

    function init() {
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
                } catch (e) {

                }
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
            } catch (e) {

            }

            var observer = new MutationObserver(function() {
                try {
                    var panel = document.getElementById('chatPanel');
                    if (panel && panel.style.display !== 'none') {
                        observer.disconnect();
                        tryInit();
                    }
                } catch (e) {

                }
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