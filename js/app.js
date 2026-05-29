/* ============================================================
   app.js —— 主控制器模块
   ────────────────────────────────────────────────────────────
   生命周期：
     [加载] DOMContentLoaded 后初始化所有子模块
     [初始化] 按依赖序启动 Theme → Lightbox → MdViewer →
              Dashboard → 标签页路由
     [运行] 管理 4 个标签页切换，响应窗口变化
   ────────────────────────────────────────────────────────────
   依赖：Theme, Utils, Lightbox, Dashboard, Navigation, Blog,
         Gallery, MdViewer（均由前置 <script> 保证加载）
   ============================================================ */

(function() {
    'use strict';

    var TABS = ['dashboard', 'nav', 'blog', 'gallery'];
    var _currentTab = 'dashboard';

    var $tabBar, $sections, $bottomNav;

    /* ---- 标签页切换 ---- */
    function switchTab(tabId) {
        if (tabId === _currentTab) return;

        // 顶部标签栏
        if ($tabBar) {
            $tabBar.querySelectorAll('.tab-btn').forEach(function(btn) {
                btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
            });
        }
        // 底部导航栏（移动端）
        if ($bottomNav) {
            $bottomNav.querySelectorAll('.tab-btn').forEach(function(btn) {
                btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
            });
        }
        // 内容区
        if ($sections) {
            $sections.forEach(function(sec) {
                sec.classList.toggle('active', sec.id === 'sec-' + tabId);
            });
        }

        _currentTab = tabId;

        // 切到博客/图库时刷新数据
        if (tabId === 'blog' && typeof Blog !== 'undefined') {
            if (!Blog._articles || !Blog._articles.length) Blog.fetchArticles();
        } else if (tabId === 'gallery' && typeof Gallery !== 'undefined') {
            if (!Gallery._images || !Gallery._images.length) Gallery.fetchImages();
        }

        window.location.hash = tabId;
    }

    /* ---- 标签栏点击 ---- */
    function onTabClick(e) {
        var btn = e.target.closest('.tab-btn');
        if (!btn) return;
        var tabId = btn.getAttribute('data-tab');
        if (tabId) switchTab(tabId);
    }

    /* ---- 主题切换 ---- */
    function onThemeToggle() {
        if (typeof Theme !== 'undefined') Theme.toggleTheme();
    }

    /* ---- 响应式 ---- */
    function handleResize() {
        var isMobile = window.innerWidth < 640;
        document.body.classList.toggle('is-mobile', isMobile);
        if ($bottomNav) $bottomNav.style.display = isMobile ? 'flex' : 'none';
    }

    /* ---- 初始化 ---- */
    function init() {
        $tabBar  = document.getElementById('tabBar');
        $sections = document.querySelectorAll('.content-section');
        $bottomNav = document.getElementById('bottomNav');

        // 1. 主题
        if (typeof Theme !== 'undefined') Theme.initTheme();

        // 2. 灯箱
        if (typeof Lightbox !== 'undefined') Lightbox.init();

        // 3. Markdown 阅读器（预绑定事件）
        if (typeof MdViewer !== 'undefined') MdViewer.init();

        // 4. 仪表盘（开始轮询）
        if (typeof Dashboard !== 'undefined') Dashboard.init();

        // 5. 服务导航、博客、图库（预绑定 DOM 和事件）
        if (typeof Navigation !== 'undefined') Navigation.init();
        if (typeof Blog !== 'undefined') Blog.init();
        if (typeof Gallery !== 'undefined') Gallery.init();

        // 6. 标签栏事件
        if ($tabBar) $tabBar.addEventListener('click', onTabClick);
        if ($bottomNav) $bottomNav.addEventListener('click', onTabClick);

        // 7. 主题按钮
        var themeBtn = document.getElementById('themeToggleBtn');
        if (themeBtn) themeBtn.addEventListener('click', onThemeToggle);

        // 8. URL hash 恢复
        var hash = window.location.hash.replace('#', '');
        if (hash && TABS.indexOf(hash) !== -1) switchTab(hash);

        // 9. 响应式
        handleResize();
        window.addEventListener('resize', handleResize);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
