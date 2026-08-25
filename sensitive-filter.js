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
    var messageIdCounter = 0;

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

    function separatorInjectionCheck(text) {
        if (!text || typeof text !== 'string' || text.length < 4) return null;
        try {
            var separators = [' ', '\t', ',', '.', ';', ':', '|', '/', '_', '-', '*', '#', '@', '~', '`', '^', '&', '%', '$', '+', '='];
            var sepCount = 0;
            var chineseCount = 0;
            for (var i = 0; i < text.length; i++) {
                var char = text[i];
                if (separators.indexOf(char) !== -1) sepCount++;
                else if (/[\u4e00-\u9fff]/.test(char)) chineseCount++;
            }
            if (chineseCount > 3 && text.length > 8 && sepCount / text.length > 0.25) {
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

    function zeroWidthCharCheck(text) {
        if (!text || typeof text !== 'string') return null;
        try {
            var zeroWidthChars = [
                '\u200B', '\u200C', '\u200D', '\uFEFF', '\u2060',
                '\u200E', '\u200F', '\u202A', '\u202B', '\u202C', '\u202D', '\u202E'
            ];
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

    function pinyinHomophoneCheck(text) {
        if (!text || typeof text !== 'string' || text.length < 3) return null;
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

    function charObfuscationCheck(text) {
        if (!text || typeof text !== 'string' || text.length < 3) return null;
        try {
            if (/[\uFF21-\uFF3A\uFF41-\uFF5A]/.test(text)) {
                return {
                    safe: false,
                    keyword: '全角伪装',
                    desc: '使用全角字母，疑似绕过检测',
                    source: 'char_obfuscation'
                };
            }
            if (/[\uFF10-\uFF19]/.test(text)) {
                return {
                    safe: false,
                    keyword: '全角数字',
                    desc: '使用全角数字，疑似绕过检测',
                    source: 'char_obfuscation'
                };
            }
            if (/&#\d{2,5};/.test(text) || /&[a-zA-Z]{2,6};/.test(text)) {
                return {
                    safe: false,
                    keyword: 'HTML实体',
                    desc: '使用HTML实体编码，疑似绕过检测',
                    source: 'char_obfuscation'
                };
            }
            if (/&#x[0-9A-Fa-f]{2,4};/.test(text)) {
                return {
                    safe: false,
                    keyword: '十六进制实体',
                    desc: '使用十六进制HTML实体，疑似绕过检测',
                    source: 'char_obfuscation'
                };
            }
        } catch (e) {}
        return null;
    }

    function homoglyphCheck(text) {
        if (!text || typeof text !== 'string' || text.length < 3) return null;
        try {
            if (/[\u0400-\u04FF]/.test(text) && /[a-zA-Z]/.test(text)) {
                return {
                    safe: false,
                    keyword: '同形字符',
                    desc: '混合西里尔字母，疑似同形攻击',
                    source: 'homoglyph'
                };
            }
            if (/[\u0370-\u03FF]/.test(text) && /[a-zA-Z]/.test(text)) {
                return {
                    safe: false,
                    keyword: '同形字符',
                    desc: '混合希腊字母，疑似同形攻击',
                    source: 'homoglyph'
                };
            }
            if (/[\uFB00-\uFB06]/.test(text)) {
                return {
                    safe: false,
                    keyword: 'Unicode伪装',
                    desc: '使用Unicode兼容字符，疑似绕过检测',
                    source: 'homoglyph'
                };
            }
        } catch (e) {}
        return null;
    }

    function reversedTextCheck(text) {
        if (!text || typeof text !== 'string' || text.length < 4) return null;
        try {
            var reversed = text.split('').reverse().join('');
            var commonWords = ['敏感', '政治', '色情', '暴力', '赌博', '毒品', '恐怖', '分裂', '攻击', '反动', '法轮', '邪教'];
            for (var i = 0; i < commonWords.length; i++) {
                if (reversed.indexOf(commonWords[i]) !== -1) {
                    return {
                        safe: false,
                        keyword: '文本反转',
                        desc: '包含反转文本，疑似绕过检测',
                        source: 'reversed'
                    };
                }
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
            if (/[\u0370-\u03FF]/.test(text)) scripts.push('希腊文');
            var nonChinese = scripts.filter(function(s) { return s !== '中文'; });
            if (nonChinese.length >= 2) {
                return {
                    safe: false,
                    keyword: '混合文字',
                    desc: '混合多种罕见文字，疑似绕过检测',
                    source: 'mixed_script'
                };
            }
        } catch (e) {}
        return null;
    }

    function repetitiveCharCheck(text) {
        if (!text || typeof text !== 'string' || text.length < 4) return null;
        try {
            if (/(.)\1{7,}/.test(text)) {
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
        } catch (e) {}
        return null;
    }

    function repetitivePunctuationCheck(text) {
        if (!text || typeof text !== 'string' || text.length < 4) return null;
        try {
            if (/([!?.,;:！？。，；：、])\1{6,}/.test(text)) {
                return {
                    safe: false,
                    keyword: '重复标点',
                    desc: '包含大量重复标点，疑似刷屏',
                    source: 'repetitive_punct'
                };
            }
            var emojiCount = (text.match(/[\u{1F000}-\u{1FFFF}]/gu) || []).length;
            if (emojiCount > 5) {
                return {
                    safe: false,
                    keyword: 'Emoji刷屏',
                    desc: '包含大量Emoji，疑似刷屏',
                    source: 'repetitive_punct'
                };
            }
        } catch (e) {}
        return null;
    }

    function excessiveWhitespaceCheck(text) {
        if (!text || typeof text !== 'string' || text.length < 10) return null;
        try {
            var newlineCount = (text.match(/\n/g) || []).length;
            if (newlineCount > 3) {
                return {
                    safe: false,
                    keyword: '换行刷屏',
                    desc: '包含大量换行符，疑似刷屏',
                    source: 'excessive_whitespace'
                };
            }
            if (/ {10,}/.test(text)) {
                return {
                    safe: false,
                    keyword: '空格填充',
                    desc: '包含大量连续空格，疑似绕过检测',
                    source: 'excessive_whitespace'
                };
            }
            var whitespaceCount = (text.match(/\s/g) || []).length;
            if (whitespaceCount / text.length > 0.3 && text.length > 20) {
                return {
                    safe: false,
                    keyword: '空白字符过多',
                    desc: '空白字符占比过高，疑似绕过检测',
                    source: 'excessive_whitespace'
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

    function excessiveLengthCheck(text) {
        if (!text || typeof text !== 'string') return null;
        try {
            if (text.length > 1000) {
                var chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
                var chineseRatio = chineseCount / text.length;
                if (chineseRatio < 0.2) {
                    return {
                        safe: false,
                        keyword: '超长文本',
                        desc: '文本长度异常（' + text.length + '字符），疑似攻击',
                        source: 'excessive_length'
                    };
                }
            }
        } catch (e) {}
        return null;
    }

    function repetitivePatternCheck(text) {
        if (!text || typeof text !== 'string' || text.length < 12) return null;
        try {
            for (var len = 2; len <= Math.min(6, Math.floor(text.length / 3)); len++) {
                var sub = text.substring(0, len);
                var pattern = sub;
                var count = 1;
                for (var i = len; i + len <= text.length; i += len) {
                    if (text.substring(i, i + len) === sub) {
                        count++;
                        pattern += sub;
                    } else {
                        break;
                    }
                }
                if (count >= 4 && pattern.length >= 12) {
                    var isNormalRepeat = /^([\u4e00-\u9fff])\1+$/.test(pattern);
                    if (!isNormalRepeat) {
                        return {
                            safe: false,
                            keyword: '重复模式',
                            desc: '包含循环重复内容，疑似自动生成',
                            source: 'repetitive_pattern'
                        };
                    }
                }
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
            if (maxFreq > avgFreq * 6 && text.length > 15) {
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

    function adversarialCharCheck(text) {
        if (!text || typeof text !== 'string') return null;
        try {
            var chars = ['「', '」', '『', '』', '【', '】', '〈', '〉', '《', '》', '〔', '〕'];
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

    function localFastCheck(text) {
        var detectors = [
            separatorInjectionCheck,
            zeroWidthCharCheck,
            pinyinHomophoneCheck,
            charObfuscationCheck,
            homoglyphCheck,
            reversedTextCheck,
            mixedScriptCheck,
            repetitiveCharCheck,
            repetitivePunctuationCheck,
            excessiveWhitespaceCheck,
            behaviorCheck,
            excessiveLengthCheck,
            repetitivePatternCheck,
            entropyCheck,
            wordFrequencyCheck,
            adversarialCharCheck
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
                var isViolated = data.data.is_violated === true;
                var words = data.data.violated_words || [];
                var category = words.length > 0 ? words[0].category : '';
                var word = words.length > 0 ? words[0].word : '未知';

                if (isViolated) {
                    console.log('AI违规分类:', category || '未分类', '| 关键词:', word);
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

    function backgroundCheck(text, messageId) {
        console.log('🔍 后台检测开始:', text);

        var apiPromise = apiCheck(text);
        var aiPromise = aiConfirmCheck(text);

        Promise.all([apiPromise, aiPromise])
            .then(function(results) {
                var apiResult = results[0];
                var aiResult = results[1];

                if (aiResult && aiResult.safe === false) {
                    var category = aiResult.category || '敏感';
                    console.log('AI确认违规（' + category + '），撤回消息');
                    recallMessage(messageId, text, 'AI检测');
                    return;
                }

                if (apiResult && apiResult.safe === false) {
                    console.log('API检测到敏感词，但AI未确认，记录日志，不撤回');
                    return;
                }

                console.log('后台检测通过');
            })
            .catch(function(e) {
                console.warn('⚠️ 后台检测出错:', e);
            });
    }

    function recallMessage(messageId, text, source) {
        try {
            var msgElement = document.getElementById(messageId);
            if (msgElement) {
                msgElement.style.opacity = '0.3';
                msgElement.style.textDecoration = 'line-through';
                msgElement.style.color = '#999';

                var recallBadge = document.createElement('span');
                recallBadge.textContent = ' [已撤回]';
                recallBadge.style.color = '#ff4444';
                recallBadge.style.fontSize = '12px';
                msgElement.appendChild(recallBadge);
            }

            showWarning('审查系统检测到你发的内容违反法律法规，现已自动撤回');
            console.log('已撤回消息:', text);
        } catch (e) {
            console.warn('撤回消息失败:', e);
        }
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

                var localResult = localFastCheck(text);
                if (localResult && localResult.safe === false) {
                    var sourceMap = {
                        'separator_inject': '分隔符注入',
                        'zero_width': '零宽字符',
                        'pinyin_homophone': '拼音谐音',
                        'char_obfuscation': '字符替换',
                        'homoglyph': '同形字符',
                        'reversed': '文本反转',
                        'mixed_script': '混合文字',
                        'repetitive': '重复内容',
                        'repetitive_punct': '重复标点',
                        'excessive_whitespace': '空白字符',
                        'behavior': '行为异常',
                        'excessive_length': '超长文本',
                        'repetitive_pattern': '重复模式',
                        'entropy': '信息熵',
                        'word_frequency': '词频异常',
                        'adversarial_char': '对抗字符'
                    };
                    var sourceText = sourceMap[localResult.source] || '';
                    showWarning('您的内容触发了安全检测（' + sourceText + '），消息已被拦截。');
                    newBtn.disabled = false;
                    return;
                }

                var messageId = 'msg-' + (++messageIdCounter);

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
                    try {
                        var messages = document.querySelectorAll('.message-item, .chat-message, [class*="message"]');
                        if (messages.length > 0) {
                            var lastMsg = messages[messages.length - 1];
                            lastMsg.id = messageId;
                        }
                    } catch (e) {}
                }, 50);

                backgroundCheck(text, messageId);

                setTimeout(function() {
                    newBtn.disabled = false;
                }, 500);

            } catch (error) {
                console.error('发送出错:', error);
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
        console.log('先发后审模式已启用');
        console.log('重复字符阈值: 连续8次 | 重复标点阈值: 连续7次');
        console.log('AI超时: 30秒');
        return true;
    }

    window.__sensitiveFilter = {
        check: function(text) { return localFastCheck(text); },
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