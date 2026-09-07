/* ============================================================
   sw.js —— Service Worker 离线缓存
   ────────────────────────────────────────────────────────────
   策略：
     /api/dashboard        → network-only（不缓存实时数据）
     /Markdown/* /api/md/* → SWR（先缓存后更新）
     /Image/* /api/images/* → SWR
     / /index.html /config.json → network-first（入口保证新鲜）
     其余静态资源            → cache-first
   ============================================================ */
const CACHE = 'blog-b1177d57';
const SHELL = [
    '/',
    '/index.html',
    '/css/style.css?v=b1177d57',
    '/config.json',
    '/js/theme.js',
    '/js/utils.js',
    '/js/lightbox.js',
    '/js/dashboard.js',
    '/js/navigation.js',
    '/js/blog.js',
    '/js/gallery.js',
    '/js/md-viewer.js',
    '/js/mermaid-renderer.js',
    '/js/tikz-renderer.js',
    '/js/tikz/constants.js',
    '/js/tikz/color.js',
    '/js/tikz/context.js',
    '/js/tikz/expr.js',
    '/js/tikz/math.js',
    '/js/tikz/node.js',
    '/js/tikz/options.js',
    '/js/tikz/path.js',
    '/js/tikz/path-tokenizer.js',
    '/js/tikz/render.js',
    '/js/tikz/script.js',
    '/js/tikz/shapes.js',
    '/js/tikz/shape-transform.js',
    '/js/tikz/styles.js',
    '/js/tikz/text.js',
    '/js/tikz/units.js',
    '/js/sanitizer.js',
    '/js/footnotes.js',
    '/js/constants.js',
    '/js/main.js?v=b1177d57',
    '/js/app.js',
    '/lib/marked.min.js?v=b1177d57',
    '/lib/github-markdown.min.css?v=b1177d57',
    '/lib/katex.min.css?v=b1177d57',
    // KaTeX JS 由 md-viewer 懒加载（LIBS.KATEX_JS 无 ?v=b1177d57），键须匹配运行时 URL
    '/lib/katex.min.js',
    '/lib/auto-render.min.js',
    '/lib/mermaid.min.js',
    '/favicon.ico'
];

const NETWORK_FIRST = ['/', '/index.html', '/config.json'];
const SWR_PREFIX = ['/Markdown/', '/api/md/', '/Html/', '/api/html/', '/Image/', '/api/images/', '/lib/fonts/'];

/* ---- 安装：预缓存 App Shell（逐项容错，超阈值失败则放弃激活）---- */
self.addEventListener('install', function(e) {
    e.waitUntil(
        caches.open(CACHE).then(function(cache) {
            return Promise.all(
                SHELL.map(function(url) {
                    return cache.add(url).then(function() { return null; }).catch(function(err) {
                        console.warn('SW: 预缓存失败 ' + url, err);
                        return url;
                    });
                })
            ).then(function(failed) {
                const failList = failed.filter(Boolean);
                // 关键 SHELL 大面积失败时放弃安装，避免新 SW 激活却缺核心资源导致离线首屏崩（audit A7）
                const threshold = Math.max(1, Math.floor(SHELL.length * 0.2));
                if (failList.length > threshold) {
                    throw new Error('SW: 预缓存失败过多 (' + failList.length + '/' + SHELL.length + ')');
                }
            });
        })
    ).then(function() {
        self.skipWaiting();
    }).catch(function(err) {
        console.warn('SW: 安装放弃（保留旧版本）', err.message);
    });
});

/* ---- 激活：清理旧缓存 ---- */
self.addEventListener('activate', function(e) {
    e.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(k) { return k !== CACHE; })
                    .map(function(k) { return caches.delete(k); })
            );
        })
    );
    self.clients.claim();
});

/* ---- 拦截请求 ---- */
self.addEventListener('fetch', function(e) {
    const url = new URL(e.request.url);

    if (e.request.method !== 'GET') return;
    if (url.origin !== self.location.origin) return;

    // /api/dashboard 不缓存
    if (url.pathname === '/api/dashboard') {
        e.respondWith(fetch(e.request));
        return;
    }

    // /api/summary 不缓存 (simple-daily-termux 集成)
    if (url.pathname === '/api/summary') {
        e.respondWith(fetch(e.request));
        return;
    }

    // Markdown / Image → SWR
    if (SWR_PREFIX.some(function(p) { return url.pathname.startsWith(p); })) {
        e.respondWith(swr(e.request));
        return;
    }

    // 入口/配置/API → network-first（精确匹配，避免 /index.html/foo 之类误命中，audit A6）
    if (NETWORK_FIRST.indexOf(url.pathname) !== -1) {
        e.respondWith(networkFirst(e.request));
        return;
    }

    // 其余 → cache-first
    e.respondWith(cacheFirst(e.request));
});

/* ---- Network-First 策略 ---- */
/**
 * Network-first 策略：先取网络，成功则缓存副本；网络失败回退缓存。
 * @param {Request} request - 原始请求
 * @returns {Promise<Response>}
 */
function networkFirst(request) {
    return fetch(request).then(function(response) {
        if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then(function(c) { c.put(request, clone); });
        }
        return response;
    }).catch(function() {
        return caches.match(request);
    });
}

/* ---- Cache-First 策略 ---- */
/**
 * Cache-first 策略：命中缓存直接返回，否则回源并缓存。
 * @param {Request} request - 原始请求
 * @returns {Promise<Response>}
 */
function cacheFirst(request) {
    return caches.match(request).then(function(cached) {
        if (cached) return cached;
        return fetch(request).then(function(response) {
            if (response.ok) {
                const clone = response.clone();
                caches.open(CACHE).then(function(c) { c.put(request, clone); });
            }
            return response;
        });
    });
}

/* ---- Stale-While-Revalidate 策略 ---- */
/**
 * Stale-While-Revalidate 策略：命中缓存立即返回，同时后台回源刷新缓存。
 * @param {Request} request - 原始请求
 * @returns {Promise<Response>}
 */
function swr(request) {
    return caches.open(CACHE).then(function(cache) {
        return cache.match(request).then(function(cached) {
            const fetchPromise = fetch(request).then(function(response) {
                if (response.ok) {
                    cache.put(request, response.clone());
                }
                return response;
            }).catch(function() {
                return cached || new Response('离线', { status: 503 });
            });
            return cached || fetchPromise;
        });
    });
}
