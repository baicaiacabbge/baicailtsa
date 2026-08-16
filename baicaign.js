/* ============================================
   白菜聊天室 - 新增功能（完全独立版）
   图片上传（20MB）、语音消息（60秒）、相对时间
   不依赖 baicai.js 暴露任何变量
   ============================================ */

(function() {
    'use strict';

    // ============================================
    // 获取当前用户（完全独立，不依赖 baicai.js）
    // ============================================
    function getCurrentUser() {
        // 方法1：从 userInfo DOM 元素解析
        var userInfo = document.getElementById('userInfo');
        if (userInfo && userInfo.textContent && userInfo.textContent !== '加载中...') {
            var text = userInfo.textContent;
            var match = text.match(/^(.+?)\s*\((.+?)\)/);
            if (match) {
                return {
                    username: match[1],
                    ip: match[2] || '0.0.0.0',
                    id: localStorage.getItem('chat_user_id') || null
                };
            }
        }

        // 方法2：从 localStorage 获取
        var savedId = localStorage.getItem('chat_user_id');
        var savedName = localStorage.getItem('chat_username');
        if (savedId && savedName) {
            return {
                id: savedId,
                username: savedName
            };
        }

        // 方法3：从登录面板的输入框获取（用户已输入但未登录时）
        var usernameInput = document.getElementById('username');
        if (usernameInput && usernameInput.value && usernameInput.value.trim()) {
            // 只是临时获取，不视为已登录
        }

        return null;
    }

    // ============================================
    // 获取 Supabase 实例
    // ============================================
    function getSupabase() {
        // 从 window 获取
        if (window._supabase) return window._supabase;
        // 从全局变量获取
        if (typeof _supabase !== 'undefined') return _supabase;
        return null;
    }

    // ============================================
    // 通过用户名查询用户ID（缓存到 localStorage）
    // ============================================
    async function fetchUserIdByUsername(username) {
        if (!username) return null;

        // 先检查缓存
        var cachedId = localStorage.getItem('chat_user_id');
        var cachedName = localStorage.getItem('chat_username');
        if (cachedId && cachedName === username) {
            return cachedId;
        }

        var supabase = getSupabase();
        if (!supabase) return null;

        try {
            var { data, error } = await supabase
                .from('users')
                .select('id')
                .eq('username', username)
                .maybeSingle();

            if (error || !data) return null;

            // 缓存到 localStorage
            localStorage.setItem('chat_user_id', data.id);
            localStorage.setItem('chat_username', username);
            return data.id;
        } catch (err) {
            console.warn('获取用户ID失败:', err);
            return null;
        }
    }

    // ============================================
    // 获取当前用户ID（自动从DOM解析并查询）
    // ============================================
    async function getCurrentUserId() {
        // 先从缓存获取
        var cachedId = localStorage.getItem('chat_user_id');
        if (cachedId) return cachedId;

        // 从DOM解析用户名
        var user = getCurrentUser();
        if (user && user.username) {
            var id = await fetchUserIdByUsername(user.username);
            if (id) return id;
        }

        // 如果 userInfo 显示的是 "用户名 (IP)" 格式
        var userInfo = document.getElementById('userInfo');
        if (userInfo && userInfo.textContent && userInfo.textContent !== '加载中...') {
            var match = userInfo.textContent.match(/^(.+?)\s*\(/);
            if (match) {
                var id = await fetchUserIdByUsername(match[1]);
                if (id) return id;
            }
        }

        return null;
    }

    // ============================================
    // 等待用户登录完成
    // ============================================
    function waitForLogin(callback) {
        var count = 0;
        var maxAttempts = 60; // 30秒超时

        var checkInterval = setInterval(function() {
            count++;
            var userInfo = document.getElementById('userInfo');
            var isLoggedIn = userInfo && 
                            userInfo.textContent && 
                            userInfo.textContent !== '加载中...' &&
                            userInfo.style.display !== 'none';

            var panel = document.getElementById('chatPanel');
            var isPanelVisible = panel && panel.style.display === 'flex';

            if (isLoggedIn || isPanelVisible || count > maxAttempts) {
                clearInterval(checkInterval);
                callback(isLoggedIn || isPanelVisible);
            }
        }, 500);
    }

    // ============================================
    // 相对时间显示
    // ============================================
    function getRelativeTime(dateString) {
        var now = new Date();
        var date = new Date(dateString);
        var diffSec = Math.floor((now - date) / 1000);
        var diffMin = Math.floor(diffSec / 60);
        var diffHour = Math.floor(diffMin / 60);
        var diffDay = Math.floor(diffHour / 24);
        var diffMonth = Math.floor(diffDay / 30);
        var diffYear = Math.floor(diffDay / 365);

        if (diffSec < 60) return '刚刚';
        if (diffMin < 60) return diffMin + '分钟前';
        if (diffHour < 24 && date.getDate() === now.getDate()) return diffHour + '小时前';
        if (diffDay === 1 || (diffDay < 2 && date.getDate() === now.getDate() - 1)) {
            return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }
        if (diffDay < 7) return diffDay + '天前';
        if (diffDay < 30) return diffDay + '天前';
        if (diffYear < 1) return diffMonth + '个月前';
        return diffYear + '年前';
    }

    // ---------- 安全HTML转义 ----------
    function escapeHtml(text) {
        if (!text) return '';
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ---------- 显示警告 ----------
    function showWarning(msg) {
        var warning = document.getElementById('warningMessage');
        if (warning) {
            warning.textContent = msg;
            warning.style.display = 'block';
            clearTimeout(warning._timer);
            warning._timer = setTimeout(function() { warning.style.display = 'none'; }, 3000);
        } else {
            alert(msg);
        }
    }

    // ============================================
    // 图片上传（20MB限制）
    // ============================================
    function initImageUpload() {
        var uploadBtn = document.getElementById('imageUploadBtn');
        var fileInput = document.getElementById('imageInput');

        if (!uploadBtn || !fileInput) return;

        uploadBtn.addEventListener('click', function() {
            var user = getCurrentUser();
            if (!user || !user.username) {
                showWarning('请先登录');
                return;
            }
            fileInput.click();
        });

        fileInput.addEventListener('change', async function(e) {
            var file = e.target.files[0];
            if (!file) return;

            var validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
            if (!validTypes.includes(file.type)) {
                showWarning('请上传 JPG/PNG/GIF/WEBP/BMP 格式的图片');
                fileInput.value = '';
                return;
            }

            if (file.size > 20 * 1024 * 1024) {
                showWarning('图片不能超过20MB');
                fileInput.value = '';
                return;
            }

            var fileToUpload = file;
            if (file.size > 1024 * 1024) {
                try {
                    fileToUpload = await compressImage(file);
                } catch (err) {
                    fileToUpload = file;
                }
            }

            await uploadImage(fileToUpload);
            fileInput.value = '';
        });
    }

    // ---------- 图片压缩 ----------
    function compressImage(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e) {
                var img = new Image();
                img.onload = function() {
                    var canvas = document.createElement('canvas');
                    var width = img.width;
                    var height = img.height;
                    var MAX_SIZE = 1200;

                    if (width > MAX_SIZE || height > MAX_SIZE) {
                        if (width > height) {
                            height = Math.round(height * MAX_SIZE / width);
                            width = MAX_SIZE;
                        } else {
                            width = Math.round(width * MAX_SIZE / height);
                            height = MAX_SIZE;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    var ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob(function(blob) {
                        if (!blob) { reject(new Error('压缩失败')); return; }
                        var compressed = new File(
                            [blob],
                            file.name.replace(/\.[^.]+$/, '.jpg'),
                            { type: 'image/jpeg', lastModified: Date.now() }
                        );
                        resolve(compressed);
                    }, 'image/jpeg', 0.85);
                };
                img.onerror = function() { reject(new Error('图片加载失败')); };
                img.src = e.target.result;
            };
            reader.onerror = function() { reject(new Error('文件读取失败')); };
            reader.readAsDataURL(file);
        });
    }

    // ---------- 上传图片 ----------
    async function uploadImage(file) {
        var supabase = getSupabase();
        if (!supabase) {
            showWarning('数据库连接失败');
            return;
        }

        // 获取用户ID
        var userId = await getCurrentUserId();
        if (!userId) {
            showWarning('请先登录');
            return;
        }

        var uploadBtn = document.getElementById('imageUploadBtn');
        var ext = file.name.split('.').pop() || 'jpg';
        var fileName = userId + '/' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.' + ext;

        try {
            uploadBtn.disabled = true;
            showWarning('图片上传中...');

            var { error } = await supabase.storage
                .from('chat-images')
                .upload(fileName, file, {
                    cacheControl: '3600',
                    contentType: file.type
                });

            if (error) throw error;

            var { data } = supabase.storage.from('chat-images').getPublicUrl(fileName);
            await sendImageMessage(data.publicUrl);
            showWarning('图片发送成功');

        } catch (err) {
            console.error('上传失败:', err);
            showWarning('上传失败：' + err.message);
        } finally {
            uploadBtn.disabled = false;
        }
    }

    // ---------- 发送图片消息 ----------
    async function sendImageMessage(url) {
        var supabase = getSupabase();
        if (!supabase) return;

        var userId = await getCurrentUserId();
        if (!userId) return;

        var { error } = await supabase.from('messages').insert({
            user_id: userId,
            content: '![图片](' + url + ')'
        });

        if (!error) {
            // 触发消息刷新
            if (window.loadMessages) {
                await window.loadMessages();
            } else {
                // 如果 loadMessages 不可用，尝试通过点击事件触发
                var sendBtn = document.getElementById('sendBtn');
                if (sendBtn) {
                    // 发送一条空消息触发刷新？不行，用另一种方式
                    refreshMessages();
                }
            }
            var list = document.getElementById('messageList');
            if (list) list.scrollTop = list.scrollHeight;
        }
    }

    // ---------- 刷新消息（备用方案） ----------
    function refreshMessages() {
        var supabase = getSupabase();
        if (!supabase) return;

        supabase
            .from('messages')
            .select('id, content, created_at, user:users ( id, username )')
            .order('created_at', { ascending: true })
            .then(function(result) {
                if (result.data && window.renderMessages) {
                    window.renderMessages(result.data);
                }
            })
            .catch(function() {});
    }

    // ============================================
    // 语音消息（60秒限制）
    // ============================================
    var mediaRecorder = null;
    var audioChunks = [];
    var timer = null;
    var seconds = 0;
    var recording = false;
    var stream = null;

    function initVoiceMessage() {
        var btn = document.getElementById('voiceBtn');
        var status = document.getElementById('voiceStatus');

        if (!btn) return;

        btn.addEventListener('mousedown', start);
        btn.addEventListener('mouseup', stop);
        btn.addEventListener('mouseleave', stop);
        btn.addEventListener('touchstart', function(e) { e.preventDefault(); start(); });
        btn.addEventListener('touchend', function(e) { e.preventDefault(); stop(); });

        async function start() {
            if (recording) return;

            var user = getCurrentUser();
            if (!user || !user.username) {
                showWarning('请先登录');
                return;
            }

            try {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
                audioChunks = [];

                mediaRecorder.ondataavailable = function(e) {
                    if (e.data.size > 0) audioChunks.push(e.data);
                };

                mediaRecorder.onstop = async function() {
                    if (stream) {
                        stream.getTracks().forEach(function(t) { t.stop(); });
                        stream = null;
                    }

                    var blob = new Blob(audioChunks, { type: 'audio/webm' });
                    if (blob.size > 0 && seconds >= 1) {
                        await uploadVoice(blob);
                    } else if (seconds < 1 && blob.size > 0) {
                        showWarning('录音时间太短');
                    }

                    if (status) status.style.display = 'none';
                    btn.classList.remove('recording');
                    btn.textContent = '🎤';
                    recording = false;
                    if (timer) { clearInterval(timer); timer = null; }
                    seconds = 0;
                };

                mediaRecorder.start(100);
                recording = true;
                seconds = 0;

                if (status) {
                    status.style.display = 'block';
                    status.textContent = '录音中 0s... 松开发送';
                }
                btn.classList.add('recording');
                btn.textContent = '⏹️';

                if (timer) clearInterval(timer);
                timer = setInterval(function() {
                    seconds++;
                    var remain = 60 - seconds;
                    if (status) {
                        status.textContent = '录音中 ' + seconds + 's... 松开发送 (剩余' + remain + 's)';
                    }
                    if (seconds >= 60) {
                        stop();
                        showWarning('已达60秒上限');
                    }
                }, 1000);

            } catch (err) {
                console.error('麦克风错误:', err);
                showWarning('无法访问麦克风');
                recording = false;
                btn.classList.remove('recording');
                btn.textContent = '🎤';
                if (status) status.style.display = 'none';
            }
        }

        function stop() {
            if (!recording || !mediaRecorder) return;
            if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
            }
        }
    }

    // ---------- 上传语音 ----------
    async function uploadVoice(blob) {
        var supabase = getSupabase();
        if (!supabase) {
            showWarning('数据库连接失败');
            return;
        }

        var userId = await getCurrentUserId();
        if (!userId) {
            showWarning('请先登录');
            return;
        }

        if (blob.size > 2 * 1024 * 1024) {
            showWarning('语音文件过大，请缩短录音时间');
            return;
        }

        var btn = document.getElementById('voiceBtn');
        var fileName = userId + '/' + Date.now() + '_voice.webm';

        try {
            showWarning('语音上传中...');
            if (btn) btn.disabled = true;

            var { error } = await supabase.storage
                .from('chat-voices')
                .upload(fileName, blob, {
                    cacheControl: '3600',
                    contentType: 'audio/webm'
                });

            if (error) throw error;

            var { data } = supabase.storage.from('chat-voices').getPublicUrl(fileName);
            await sendVoiceMessage(data.publicUrl);
            showWarning('语音发送成功');

        } catch (err) {
            console.error('语音上传失败:', err);
            showWarning('语音上传失败：' + err.message);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // ---------- 发送语音消息 ----------
    async function sendVoiceMessage(url) {
        var supabase = getSupabase();
        if (!supabase) return;

        var userId = await getCurrentUserId();
        if (!userId) return;

        var { error } = await supabase.from('messages').insert({
            user_id: userId,
            content: '[语音](' + url + ')'
        });

        if (!error) {
            if (window.loadMessages) {
                await window.loadMessages();
            } else {
                refreshMessages();
            }
            var list = document.getElementById('messageList');
            if (list) list.scrollTop = list.scrollHeight;
        }
    }

    // ============================================
    // 语音播放
    // ============================================
    function initVoicePlayback() {
        document.addEventListener('click', function(e) {
            var el = e.target.closest('.voice-message');
            if (el) toggleVoicePlay(el);
        });
    }

    function toggleVoicePlay(el) {
        var audio = el.querySelector('audio');
        var playBtn = el.querySelector('.voice-play-btn');
        var bar = el.querySelector('.voice-progress-bar');
        var durationEl = el.querySelector('.voice-duration');

        if (!audio) {
            var url = el.dataset.url;
            if (!url) return;
            audio = new Audio(url);
            el.appendChild(audio);
            playAudio(el, audio);
            return;
        }

        if (audio.readyState >= 2) {
            document.querySelectorAll('.voice-message').forEach(function(e) {
                var a = e.querySelector('audio');
                if (a && !a.paused && a !== audio) {
                    a.pause();
                    var b = e.querySelector('.voice-play-btn');
                    if (b) b.textContent = '▶';
                    var p = e.querySelector('.voice-progress-bar');
                    if (p) p.style.width = '0%';
                }
            });

            if (audio.paused) {
                audio.play();
                if (playBtn) playBtn.textContent = '⏸️';
                updateProgress(audio, el);
            } else {
                audio.pause();
                if (playBtn) playBtn.textContent = '▶';
            }
        } else {
            audio.load();
            audio.oncanplay = function() {
                audio.play();
                if (playBtn) playBtn.textContent = '⏸️';
                updateProgress(audio, el);
            };
        }
    }

    function updateProgress(audio, el) {
        var bar = el.querySelector('.voice-progress-bar');
        var durationEl = el.querySelector('.voice-duration');
        var playBtn = el.querySelector('.voice-play-btn');

        audio.onloadedmetadata = function() {
            if (durationEl && audio.duration) {
                var m = Math.floor(audio.duration / 60);
                var s = Math.floor(audio.duration % 60);
                durationEl.textContent = m + ':' + String(s).padStart(2, '0');
            }
        };

        audio.ontimeupdate = function() {
            if (bar && audio.duration) {
                bar.style.width = Math.min((audio.currentTime / audio.duration) * 100, 100) + '%';
            }
            if (durationEl && audio.duration) {
                var m = Math.floor(audio.currentTime / 60);
                var s = Math.floor(audio.currentTime % 60);
                durationEl.textContent = m + ':' + String(s).padStart(2, '0');
            }
        };

        audio.onended = function() {
            if (playBtn) playBtn.textContent = '▶';
            if (bar) bar.style.width = '0%';
            if (durationEl && audio.duration) {
                var m = Math.floor(audio.duration / 60);
                var s = Math.floor(audio.duration % 60);
                durationEl.textContent = m + ':' + String(s).padStart(2, '0');
            }
        };
    }

    function playAudio(el, audio) {
        var playBtn = el.querySelector('.voice-play-btn');
        var bar = el.querySelector('.voice-progress-bar');
        var durationEl = el.querySelector('.voice-duration');

        audio.play();
        if (playBtn) playBtn.textContent = '⏸️';

        audio.ontimeupdate = function() {
            if (bar && audio.duration) {
                bar.style.width = Math.min((audio.currentTime / audio.duration) * 100, 100) + '%';
            }
            if (durationEl && audio.duration) {
                var m = Math.floor(audio.currentTime / 60);
                var s = Math.floor(audio.currentTime % 60);
                durationEl.textContent = m + ':' + String(s).padStart(2, '0');
            }
        };

        audio.onended = function() {
            if (playBtn) playBtn.textContent = '▶';
            if (bar) bar.style.width = '0%';
            if (durationEl && audio.duration) {
                var m = Math.floor(audio.duration / 60);
                var s = Math.floor(audio.duration % 60);
                durationEl.textContent = m + ':' + String(s).padStart(2, '0');
            }
        };
    }

    // ============================================
    // 扩展消息渲染
    // ============================================
    function extendRenderMessages() {
        // 保存原有函数，但完全替换
        window.renderMessages = function(messages) {
            renderMessagesWithFeatures(messages);
        };
    }

    function renderMessagesWithFeatures(messages) {
        var list = document.getElementById('messageList');
        if (!list) return;

        if (!messages || !messages.length) {
            list.innerHTML = '<div style="text-align:center;color:#b0b8c5;padding:30px 0;font-size:0.85rem;">暂无消息</div>';
            return;
        }

        // 获取当前用户ID（同步方式，从缓存或DOM）
        var userId = localStorage.getItem('chat_user_id');

        var html = messages.map(function(msg) {
            var timeStr = getRelativeTime(msg.created_at);
            var fullTime = new Date(msg.created_at).toLocaleString('zh-CN', { hour12: false });

            var isMine = userId && msg.user && msg.user.id === userId;
            var delBtn = isMine ?
                '<button class="delete-btn" onclick="window.deleteMessageById && window.deleteMessageById(\'' + msg.id + '\')">删除</button>' :
                '';

            var contentHtml = escapeHtml(msg.content);

            // 检测图片
            var imgMatch = msg.content.match(/!\[.*?\]\((.*?)\)/);
            if (imgMatch) {
                var url = imgMatch[1];
                var text = msg.content.replace(/!\[.*?\]\(.*?\)/, '').trim();
                contentHtml = '';
                if (text) contentHtml += '<div>' + escapeHtml(text) + '</div>';
                contentHtml += '<img src="' + url + '" class="message-image" onclick="window.open(\'' + url + '\',\'_blank\')" onerror="this.style.display=\'none\'" loading="lazy">';
            }

            // 检测语音
            var voiceMatch = msg.content.match(/\[语音\]\((.*?)\)/);
            if (voiceMatch) {
                var url = voiceMatch[1];
                contentHtml = '<div class="voice-message" data-url="' + url + '">' +
                    '<span class="voice-play-btn">▶</span>' +
                    '<div class="voice-progress"><div class="voice-progress-bar"></div></div>' +
                    '<span class="voice-duration">0:00</span>' +
                    '</div>' +
                    '<audio style="display:none;" src="' + url + '" preload="metadata"></audio>';
            }

            return '<div class="message" data-id="' + msg.id + '">' +
                '<div class="message-header">' +
                '<span class="message-author">' + escapeHtml(msg.user && msg.user.username ? msg.user.username : '未知') + '</span>' +
                '<span class="message-meta">' +
                '<span class="message-time" title="' + fullTime + '">' + timeStr + '</span>' +
                delBtn +
                '</span>' +
                '</div>' +
                '<div class="message-content">' + contentHtml + '</div>' +
                '</div>';
        }).join('');

        list.innerHTML = html;
        list.scrollTop = list.scrollHeight;
    }

    // ============================================
    // 监听用户登录（通过观察 DOM 变化）
    // ============================================
    function observeLogin() {
        var userInfo = document.getElementById('userInfo');
        if (!userInfo) return;

        var observer = new MutationObserver(function() {
            var text = userInfo.textContent;
            if (text && text !== '加载中...' && !text.includes('加载中')) {
                var match = text.match(/^(.+?)\s*\(/);
                if (match) {
                    var username = match[1];
                    // 检查是否已有缓存
                    if (!localStorage.getItem('chat_user_id')) {
                        fetchUserIdByUsername(username);
                    }
                }
            }
        });

        observer.observe(userInfo, {
            childList: true,
            characterData: true,
            subtree: true
        });
    }

    // ============================================
    // 初始化
    // ============================================
    function init() {
        // 先观察登录状态
        observeLogin();

        // 等待登录完成
        waitForLogin(function(isLoggedIn) {
            if (isLoggedIn) {
                // 获取用户ID
                var userInfo = document.getElementById('userInfo');
                if (userInfo && userInfo.textContent) {
                    var match = userInfo.textContent.match(/^(.+?)\s*\(/);
                    if (match && !localStorage.getItem('chat_user_id')) {
                        fetchUserIdByUsername(match[1]);
                    }
                }
            }

            // 初始化所有功能
            initImageUpload();
            initVoiceMessage();
            initVoicePlayback();
            extendRenderMessages();

            console.log('✅ 新增功能已加载：图片上传、语音消息、相对时间');
        });

        // 超时保护（10秒后无论如何都初始化）
        setTimeout(function() {
            initImageUpload();
            initVoiceMessage();
            initVoicePlayback();
            extendRenderMessages();
        }, 10000);
    }

    // 页面完全加载后初始化
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

    // 导出到全局
    window.getRelativeTime = getRelativeTime;
    window.toggleVoicePlay = toggleVoicePlay;

})();