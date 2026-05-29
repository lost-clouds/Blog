/* ============================================================
   md-viewer.js —— Markdown 阅读器模块（全屏覆盖层）
   ────────────────────────────────────────────────────────────
   生命周期：
     [加载] 脚本加载时执行 IIFE，在 window 上挂载 MdViewer API
     [初始化] 外部调用 MdViewer.init() → 绑定关闭事件、进度条、TOC
     [运行] MdViewer.open(filename) → 加载 .md 文件并渲染
           MdViewer.close() → 关闭覆盖层
     [渲染] marked 解析 Markdown → KaTeX 渲染数学公式 → 生成 TOC
   ────────────────────────────────────────────────────────────
   数据源：GET /Markdown/<filename>
   依赖：marked (全局), Katex (懒加载), Utils.escapeHtml, Lightbox.open
   使用：MdViewer.init() / MdViewer.open(filename) / MdViewer.close()
   ============================================================ */

(function(global) {
    'use strict';

    let _currentFile = null;

    /* ---- DOM 引用 ---- */
    let $overlay, $mdContent, $mdTitle, $tocSidebar, $tocOverlay, $tocNav;
    let $mdLightbox, $mdLbImg, $mdLbName;
    let _tocVisible = false;

    /* ============================================================
       KaTeX 懒加载
       仅在检测到数学公式时才加载 katex.min.js + auto-render.min.js
       ============================================================ */
    let _katexReady = false;
    let _katexPromise = null;

    function ensureKatex() {
        if (_katexReady) return Promise.resolve();
        if (_katexPromise) return _katexPromise;
        if (typeof renderMathInElement !== 'undefined') { _katexReady = true; return Promise.resolve(); }

        _katexPromise = new Promise(function(resolve, reject) {
            var s1 = document.createElement('script');
            s1.src = 'lib/katex.min.js';
            s1.onload = function() {
                var s2 = document.createElement('script');
                s2.src = 'lib/auto-render.min.js';
                s2.onload  = function() { _katexReady = true; resolve(); };
                s2.onerror = function() { reject(new Error('KaTeX auto-render 加载失败')); };
                document.head.appendChild(s2);
            };
            s1.onerror = function() { reject(new Error('KaTeX 核心库加载失败')); };
            document.head.appendChild(s1);
        });
        return _katexPromise;
    }

    /* ============================================================
       阅读进度条
       ============================================================ */
    function updateProgress() {
        if (!$overlay || !$overlay.classList.contains('active')) return;
        const content = $overlay.querySelector('.md-content-scroll');
        if (!content) return;
        const scrollTop = content.scrollTop;
        const scrollHeight = content.scrollHeight - content.clientHeight;
        const pct = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
        const bar = document.getElementById('mdProgressBar');
        if (bar) bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
    }

    /* ============================================================
       TOC 目录生成
       ============================================================ */
    function buildToc(htmlContent) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');

        if (headings.length === 0) {
            return '<div class="toc-empty">无标题</div>';
        }

        var html = '<ul>';
        headings.forEach(function(h) {
            var level = parseInt(h.tagName[1]);
            var text  = h.textContent;
            if (text.length > 40) text = text.slice(0, 37) + '...';

            if (!h.id) {
                h.id = text.toLowerCase()
                    .replace(/[^\w一-龥]+/g, '-')
                    .replace(/^-|-$/g, '') + '-' + Date.now();
            }

            html += '<li class="toc-level-' + level + '">';
            html += '<a href="#' + h.id + '" onclick="MdViewer._scrollTo(\'' + h.id + '\')">';
            html += Utils.escapeHtml(text) + '</a></li>';
        });
        html += '</ul>';
        return html;
    }

    /* ---- 注入标题锚点 ---- */
    function injectAnchors() {
        if (!$mdContent) return;
        var headings = $mdContent.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headings.forEach(function(h) {
            if (!h.id) {
                var text = h.textContent;
                h.id = text.toLowerCase()
                    .replace(/[^\w一-龥]+/g, '-')
                    .replace(/^-|-$/g, '');
            }
            if (!h.querySelector('.anchor')) {
                var a = document.createElement('a');
                a.href = '#' + h.id;
                a.className = 'anchor';
                a.setAttribute('aria-label', '链接');
                a.innerHTML = '#';
                h.style.position = 'relative';
                h.insertBefore(a, h.firstChild);
            }
        });
    }

    function scrollToId(id) {
        var content = $overlay ? $overlay.querySelector('.md-content-scroll') : null;
        var el = document.getElementById(id);
        if (el && content) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    /* ============================================================
       Markdown 内图片处理
       ============================================================ */
    function fixImagePaths() {
        if (!$mdContent) return;
        var imgs = $mdContent.querySelectorAll('img');
        imgs.forEach(function(img) {
            var src = img.getAttribute('src') || '';
            if (!src || /^(https?:|\/\/|data:|\/api\/)/i.test(src)) return;
            var filename = src.split('/').pop();
            if (!filename || !/\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/i.test(filename)) return;
            img.src = '/api/images/' + encodeURIComponent(filename);
        });
    }

    /* ---- Markdown 图片灯箱 ---- */
    function onMdImageClick(e) {
        var img = e.target.closest('img');
        if (!img) return;
        var src = img.getAttribute('src');
        if (!src) return;

        if (!$mdLightbox) {
            $mdLightbox = document.getElementById('mdLightbox');
            $mdLbImg    = document.getElementById('mdLightboxImg');
            $mdLbName   = document.getElementById('mdLightboxName');
        }
        if (!$mdLightbox || !$mdLbImg) return;

        $mdLbImg.src = src;
        $mdLbImg.alt = img.alt || '';
        if ($mdLbName) $mdLbName.textContent = img.alt || '';
        $mdLightbox.classList.add('active');
    }

    function closeMdLightbox() {
        if ($mdLightbox) $mdLightbox.classList.remove('active');
    }

    /* ============================================================
       TOC 侧边栏控制
       ============================================================ */
    function toggleToc() {
        _tocVisible = !_tocVisible;
        if ($tocSidebar) $tocSidebar.classList.toggle('open', _tocVisible);
        if ($tocOverlay) $tocOverlay.classList.toggle('active', _tocVisible);
    }

    function closeToc() {
        _tocVisible = false;
        if ($tocSidebar) $tocSidebar.classList.remove('open');
        if ($tocOverlay) $tocOverlay.classList.remove('active');
    }

    /* ============================================================
       加载 & 渲染 Markdown 文件
       ============================================================ */
    async function loadMarkdown(filename) {
        if (!$mdContent || !$mdTitle) return;

        $mdTitle.textContent = filename;
        $mdContent.innerHTML = '<div class="md-loading">加载中...</div>';

        try {
            var resp = await fetch('/Markdown/' + encodeURIComponent(filename));
            if (!resp.ok) throw new Error('HTTP ' + resp.status);

            var raw = await resp.text();

            if (typeof marked === 'undefined') {
                throw new Error('Markdown 解析组件 (marked) 未加载，请确认 lib/marked.min.js 存在');
            }

            // marked 解析
            var html = marked.parse(raw);

            // KaTeX 兼容：\begin{split} → \begin{aligned}
            html = html.replace(/\\begin\{split\}/g, '\\begin{aligned}')
                       .replace(/\\end\{split\}/g, '\\end{aligned}');

            $mdContent.innerHTML = html;
            $mdTitle.textContent = filename;
            document.title = filename + ' - Blog';

            // 图片相关处理
            fixImagePaths();

            // 注入标题锚点
            injectAnchors();

            // 生成 TOC
            if ($tocNav) {
                $tocNav.innerHTML = buildToc(html);
            }

            // 数学公式检测 & KaTeX 按需加载
            if (/(?:\$\$|\\\[|\\\(|\\begin\{)/.test(html)) {
                try {
                    await ensureKatex();
                } catch(ke) {
                    console.warn('MdViewer: KaTeX 加载失败，公式将以原始文本显示');
                }
            }

            if (typeof renderMathInElement === 'function') {
                renderMathInElement($mdContent, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$',  right: '$',  display: false},
                        {left: '\\[', right: '\\]', display: true},
                        {left: '\\(', right: '\\)', display: false}
                    ],
                    throwOnError: false,
                    strict: false,
                    trust: true
                });
            }

            // 滚动到顶部
            var scrollEl = $overlay.querySelector('.md-content-scroll');
            if (scrollEl) scrollEl.scrollTop = 0;

            // URL hash 锚点
            if (window.location.hash) {
                setTimeout(function() {
                    var el = document.querySelector(window.location.hash);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 200);
            }

        } catch (err) {
            console.error('MdViewer: 加载失败', err);
            $mdContent.innerHTML = '<div class="md-error">加载失败: ' +
                Utils.escapeHtml(err.message) + '</div>';
        }
    }

    /* ---- 打开阅读器 ---- */
    function open(filename) {
        if (!$overlay) return;
        _currentFile = filename;
        $overlay.classList.add('active');
        document.body.style.overflow = 'hidden';

        if ($tocNav) $tocNav.innerHTML = '<div class="toc-empty">加载中...</div>';

        loadMarkdown(filename);
    }

    /* ---- 关闭阅读器 ---- */
    function close() {
        if (!$overlay) return;
        $overlay.classList.remove('active');
        document.body.style.overflow = '';
        _currentFile = null;
        closeToc();
        closeMdLightbox();
        document.title = '控制台';

        // 清除进度条
        var bar = document.getElementById('mdProgressBar');
        if (bar) bar.style.width = '0%';
    }

    /* ============================================================
       初始化：缓存 DOM 引用，绑定全局事件
       ============================================================ */
    function init() {
        $overlay    = document.getElementById('mdOverlay');
        $mdContent  = document.getElementById('mdContent');
        $mdTitle    = document.getElementById('mdTitle');
        $tocSidebar = document.getElementById('tocSidebar');
        $tocOverlay = document.getElementById('tocOverlay');
        $tocNav     = document.getElementById('tocNav');
        $mdLightbox = document.getElementById('mdLightbox');
        $mdLbImg    = document.getElementById('mdLightboxImg');
        $mdLbName   = document.getElementById('mdLightboxName');

        // 滚动进度监听
        document.addEventListener('scroll', updateProgress, true);
        // 关闭按钮
        var closeBtn = document.getElementById('mdCloseBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', close);
        }

        // 背景点击关闭（点击覆盖层边缘）
        if ($overlay) {
            $overlay.addEventListener('click', function(e) {
                if (e.target === $overlay) close();
            });
        }

        // ESC 关闭
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && $overlay && $overlay.classList.contains('active')) {
                // 先关灯箱（MD 内图片灯箱），再关阅读器
                if ($mdLightbox && $mdLightbox.classList.contains('active')) {
                    closeMdLightbox();
                } else {
                    close();
                }
            }
        });

        // TOC 切换按钮
        var tocBtn = document.getElementById('mdTocBtn');
        if (tocBtn) tocBtn.addEventListener('click', toggleToc);

        // TOC 侧边栏关闭按钮
        var tocCloseBtn = document.getElementById('tocCloseBtn');
        if (tocCloseBtn) tocCloseBtn.addEventListener('click', closeToc);

        // TOC 覆盖层点击关闭
        if ($tocOverlay) $tocOverlay.addEventListener('click', closeToc);

        // Markdown 内图片点击 → 灯箱
        if ($mdContent) {
            $mdContent.addEventListener('click', onMdImageClick);
        }

        // MD 灯箱关闭按钮
        var lbCloseBtn = document.querySelector('.md-lightbox-close');
        if (lbCloseBtn) {
            lbCloseBtn.addEventListener('click', closeMdLightbox);
        }
        // MD 灯箱背景点击关闭
        if ($mdLightbox) {
            $mdLightbox.addEventListener('click', function(e) {
                if (e.target === $mdLightbox) closeMdLightbox();
            });
        }

        // 进度条滚动监听（在 .md-content-scroll 上）
        var scrollEl = $overlay ? $overlay.querySelector('.md-content-scroll') : null;
        if (scrollEl) {
            scrollEl.addEventListener('scroll', updateProgress);
        }
    }

    // 暴露 API
    global.MdViewer = {
        init: init,
        open: open,
        close: close,
        loadMarkdown: loadMarkdown,
        _scrollTo: scrollToId,
        _closeToc: closeToc
    };

})(window);
