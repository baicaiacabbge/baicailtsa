(function() {
    'use strict';

    var CONFIG = {

        API_URL: 'https://v.api.aa1.cn/api/api-mgc/index.php',

        AI_API_URL: 'https://api.auth.top/api/aidetect',
        AI_API_KEY: 'cd8b7b5bac0e1e4a',
        TIMEOUT: 2000,
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

    function repetitiveCharCheck(text) {
        if (!text || typeof text !== 'string' || text.length < 4) return null;
        try {
            if (/(.)\1{5,}/.test(text)) {
                return {
                    safe: false,
                    keyword: '重复字符',
                    desc: '包含大量重复字符，疑似刷屏',
                    source: 'repetitive'
                };
            }
            if (/(\w+)\1{3,}/.test(text)) {
                return {
                    safe: false,
                    keyword: '重复单词',
                    desc: '包含大量重复单词，疑似刷屏',
                    source: 'repetitive'
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

    function fluencyCheck(text) {
        if (!text || typeof text !== 'string' || text.length < 5) return null;
        try {
            var commonBigrams = [
                '我们', '你们', '他们', '大家', '今天', '明天', '昨天',
                '现在', '已经', '可以', '没有', '很好', '美丽', '幸福',
                '吃饭', '喝水', '看书', '说话', '工作', '学习', '生活',
                '天气', '心情', '朋友', '家人', '孩子', '妈妈', '爸爸',
                '你好', '谢谢', '对不起', '没关系', '再见'
            ];
            var bigrams = [];
            for (var i = 0; i < text.length - 1; i++) {
                bigrams.push(text.substring(i, i + 2));
            }
            if (bigrams.length === 0) return null;
            var matched = 0;
            for (var j = 0; j < bigrams.length; j++) {
                var isCommon = false;
                for (var k = 0; k < commonBigrams.length; k++) {
                    if (bigrams[j] === commonBigrams[k]) {
                        isCommon = true;
                        break;
                    }
                }
                if (isCommon) matched++;
            }
            var fluency = matched / bigrams.length;
            if (fluency < 0.1 && text.length > 10) {
                return {
                    safe: false,
                    keyword: '句子不通顺',
                    desc: '通顺度仅 ' + Math.round(fluency * 100) + '%，疑似乱序/混淆文本',
                    source: 'fluency'
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
            }, CONFIG.TIMEOUT);
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

            console.warn('⚠️ AI API返回异常，默认放行');
            return { safe: true, source: 'ai_confirm' };
        } catch (error) {

            console.warn('⚠️ AI API不可用，默认放行');
            return { safe: true, source: 'ai_confirm' };
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
            { name: '重复字符', fn: repetitiveCharCheck },
            { name: '文本反转', fn: reversedTextCheck },
            { name: '对抗字符', fn: adversarialCharCheck },
            { name: '混合文字', fn: mixedScriptCheck }
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

        try {
            var fluencyResult = fluencyCheck(text);
            if (fluencyResult && fluencyResult.safe === false) {
                console.log('❌ 句子通顺度 检测命中');
                return fluencyResult;
            }
        } catch (error) {

        }

        var apiResult = await apiCheck(text);
        if (apiResult && apiResult.safe === false) {

            console.log('🔍 第一个API检测到敏感词，调用AI二次确认...');
            var aiResult = await aiConfirmCheck(text);
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
                    var sourceMap = {
                        'whitelist': '',
                        'entropy': '信息熵',
                        'zero_width': '零宽字符',
                        'reversed': '文本反转',
                        'mixed_script': '混合文字',
                        'repetitive': '重复内容',
                        'behavior': '行为异常',
                        'fullwidth': '全角伪装',
                        'html_entity': 'HTML编码',
                        'fluency': '通顺度',
                        'adversarial_char': '对抗字符',
                        'word_frequency': '词频异常',
                        'api': '云端检测',
                        'ai_confirm': 'AI复核'
                    };
                    var sourceText = sourceMap[result.source] || '';
                    var warningMsg = '⚠️ 包含敏感词: "' + result.keyword + '"，消息已被拦截';
                    if (sourceText) {
                        warningMsg += ' (' + sourceText + ')';
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
        console.log('✅ 智能敏感词检测模块已启用 (14种检测方式，含AI二次确认)');
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