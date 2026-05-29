# Blog — 个人导航 + 博客控制台

纯静态单页面应用，基于 Nginx 运行，无需 PHP / Node / Python 等后端。集成 **系统仪表盘**、**服务导航**、**博客阅读器**、**图片画廊** 四大模块，自适应 PC / 平板 / 手机。

---

## 目录

- [快速开始](#快速开始)
- [目录结构](#目录结构)
- [架构设计](#架构设计)
- [模块详解](#模块详解)
- [部署教程](#部署教程)
  - [1. 环境要求](#1-环境要求)
  - [2. 下载依赖库](#2-下载依赖库)
  - [3. 配置 Nginx](#3-配置-nginx)
  - [4. 配置服务导航](#4-配置服务导航)
  - [5. 配置仪表盘定时更新](#5-配置仪表盘定时更新)
  - [6. 添加内容](#6-添加内容)
  - [7. 启动](#7-启动)
- [使用指南](#使用指南)
- [常见问题](#常见问题)

---

## 快速开始

```bash
# 1. 克隆项目到你的服务器
git clone https://github.com/example/Blog.git ~/Blog

# 2. 下载前端依赖库（一次性）
cd ~/Blog/lib
curl -sSLO https://cdn.jsdelivr.net/npm/marked/marked.min.js
curl -sSLO https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js
curl -sSLO https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css
curl -sSLO https://cdn.jsdelivr.net/npm/katex/dist/contrib/auto-render.min.js
curl -sSLO https://cdn.jsdelivr.net/npm/github-markdown-css/github-markdown.min.css

# 3. 将 example/Blog.conf 复制到 nginx 配置目录，修改路径
cp example/Blog.conf $PREFIX/etc/nginx/conf.d/Blog.conf
# 编辑：将所有 /path/to/Blog 替换为 ~/Blog 的绝对路径

# 4. 启动仪表盘定时采集（每 30 秒）
# 编辑 corn.sh：将 OUTPUT 路径改为实际 dashboard.json 路径
# 然后添加 crontab：
#   crontab -e
#   * * * * * ~/Blog/corn.sh
#   * * * * * sleep 30; ~/Blog/corn.sh

# 5. 重载 nginx 并访问
nginx -s reload
# 浏览器打开 https://127.0.0.1:7443
```

---

## 目录结构

```
Blog/
├── index.html                       # 唯一入口 — 标签页切换所有功能
├── config.json                      # 服务导航配置
├── dashboard.json                   # 仪表盘 JSON（corn.sh 定时写入）
├── corn.sh                          # 系统资源采集脚本
├── favicon.ico
│
├── css/
│   └── style.css                    # 全站样式（浅色/深色变量 + 响应式）
│
├── js/
│   ├── theme.js                     # 主题管理（localStorage 持久化）
│   ├── utils.js                     # 工具函数（HTML 转义、下载）
│   ├── lightbox.js                  # 图片灯箱组件
│   ├── dashboard.js                 # 系统仪表盘模块
│   ├── navigation.js                # 服务导航模块
│   ├── blog.js                      # 博客文章列表模块
│   ├── gallery.js                   # 图片画廊模块
│   ├── md-viewer.js                 # Markdown 阅读器模块
│   └── app.js                       # 主控制器（引导、路由、协调）
│
├── lib/                             # 第三方库（全部本地，零 CDN 依赖）
│   ├── marked.min.js                #   Markdown 解析
│   ├── katex.min.js                 #   LaTeX 数学公式核心
│   ├── katex.min.css                #   KaTeX 样式
│   ├── auto-render.min.js           #   KaTeX 自动渲染
│   └── github-markdown.min.css      #   GitHub 风格 Markdown 样式
│
├── Markdown/                        # 放 .md 文章（nginx autoindex 自动列出）
├── Html/                            # 放 .html 文章
├── Image/                           # 放图片
│
└── example/
    ├── Blog.conf                    # Nginx 配置示例
    ├── homer_config.yml             # 原 Homer 配置（参考用）
    └── homer_index.html             # 原 Homer 入口（已废弃）
```

---

## 架构设计

### 整体架构

```
index.html (单页面)
  │
  ├─ header ─── 品牌标题 + 主题切换按钮 (☀️/🌙)
  │
  ├─ tab-bar ── [📊仪表盘] [🧭导航] [📝博客] [🖼️图库]
  │              PC/平板顶部 | 手机底部固定
  │
  ├─ 内容区 (4 个 section，同时只显示 1 个)
  │   ├── #sec-dashboard    6 张卡片：设备/CPU/内存/储存/运行时间/电池
  │   ├── #sec-nav          服务分组卡片，搜索过滤，点击跳转
  │   ├── #sec-blog         文章列表，搜索 + Markdown/HTML 过滤
  │   └── #sec-gallery      图片网格，搜索，点击灯箱放大
  │
  ├─ md-overlay (全屏覆盖) ── Markdown 阅读器
  │   ├── TOC 侧边栏 (左侧滑入)
  │   ├── 顶部进度条
  │   ├── 内容渲染区 (marked + KaTeX)
  │   └── 图片灯箱
  │
  └─ lightbox (全屏覆盖) ──── 图片灯箱
```

### 脚本加载链

```
 theme.js          → 无依赖
 utils.js          → 无依赖
 lightbox.js       → 无依赖
 dashboard.js      → 无依赖
 navigation.js     → 依赖 utils.js
 blog.js           → 依赖 utils.js，运行时引用 MdViewer
 gallery.js        → 依赖 utils.js + lightbox.js
 marked.min.js     → Markdown 引擎
 md-viewer.js      → 依赖 marked + utils.js + lightbox.js
 app.js            → 依赖全部，最后加载，引导入口
```

所有模块通过 `<script>` 标签顺序保证依赖关系，不依赖打包工具或 ES modules，浏览器直接执行。

### 数据流

```
系统资源           corn.sh (cron 每30s)      dashboard.json
(top/free/df      ──────────────────────→    磁盘上的 JSON 文件
 /proc/stat)                                        │
                                                    │ GET /api/dashboard (nginx alias)
                                                    ↓
                                              dashboard.js (每10s 轮询)
                                              → 更新 6 张仪表盘卡片

Markdown/          nginx autoindex          /api/md/ (HTML 目录列表)
Image/             ─────────────────→       /api/images/
Html/                                       /api/html/
                                                    │
                                                    │ JS DOMParser 解析 HTML
                                                    ↓
                                              blog.js / gallery.js
                                              → 渲染文章列表 / 图片网格
```

核心思路：**用 nginx autoindex 作为"无后端 API"**。前端通过 `DOMParser` 解析 nginx 生成的目录列表 HTML，提取文件名、大小、修改时间，实现零后端的文件发现。

---

## 模块详解

### theme.js — 主题管理

| | |
|---|---|
| 全局名 | `window.Theme` |
| 存储键 | `localStorage["app-theme"]` |
| 对外方法 | `initTheme()` `toggleTheme()` `applyTheme(theme)` `getStoredTheme()` |

切换逻辑：`document.body.classList.toggle('dark')` 触发 CSS 变量全局切换 + 更新 `<meta name="theme-color">` 改变浏览器地址栏颜色 + 更新按钮图标。

---

### utils.js — 工具函数

| | |
|---|---|
| 全局名 | `window.Utils` / `window.downloadFile` |
| 对外方法 | `escapeHtml(str)` `formatSize(bytes)` `downloadFile(url, name)` |

`escapeHtml`：所有用户可控的文件名插入 DOM 前都经过转义，防止 XSS。
`downloadFile`：通过 `fetch → Blob → ObjectURL` 下载，解决跨域 `<a download>` 失效。

---

### lightbox.js — 图片灯箱

| | |
|---|---|
| 全局名 | `window.Lightbox` |
| 对外方法 | `init()` `open(src, name)` `close()` |

点击背景 / 关闭按钮 / ESC 三种方式关闭。画廊和 Markdown 内图片共享同一个灯箱实例。

---

### dashboard.js — 系统仪表盘

| | |
|---|---|
| 全局名 | `window.Dashboard` |
| 数据源 | `GET /api/dashboard` (每 10 秒轮询) |
| 对外方法 | `init()` `update(data)` `fetchData()` |

渲染 6 张卡片：

| 卡片 | 内容 | 进度条 |
|------|------|--------|
| 📱 设备 | 品牌+型号 · Android 版本 · 内核版本 | — |
| 🧠 CPU | 使用率% · 核心数 · 处理器型号 | 蓝色 |
| 💾 内存 | used / total (GB/MB) | 蓝色 |
| 🗄️ 储存 | used / total (GB) | 蓝色 |
| ⏱️ 运行时间 | 如 "3d 12h 30m" | — |
| 🔋 电池 | 电量% · 充电状态 · 温度 | 绿色 (仅 termux-api 装好后显示) |

---

### navigation.js — 服务导航

| | |
|---|---|
| 全局名 | `window.Navigation` |
| 数据源 | `GET /config.json` |
| 对外方法 | `init()` `render()` `search()` |

读取 `config.json`，按分组渲染服务卡片。搜索框支持按名称、描述、标签过滤。卡片点击 `target="_blank"` 打开服务 URL。

---

### blog.js — 博客列表

| | |
|---|---|
| 全局名 | `window.Blog` |
| 数据源 | `GET /api/md/` + `GET /api/html/` |
| 对外方法 | `init()` `render()` `fetchArticles()` |

Markdown 文章点击 → `MdViewer.open(filename)` 打开全屏阅读器。
HTML 文章点击 → `window.open('/Html/<name>', '_blank')` 新标签页打开。
搜索 + 类型过滤 (全部 / Markdown / HTML)。

---

### gallery.js — 图片画廊

| | |
|---|---|
| 全局名 | `window.Gallery` |
| 数据源 | `GET /api/images/` |
| 对外方法 | `init()` `render()` `fetchImages()` |

网格缩略图展示，搜索过滤，点击 → `Lightbox.open(src, name)` 灯箱放大。图片加载失败时自动隐藏不显示破损图标。

---

### md-viewer.js — Markdown 阅读器

| | |
|---|---|
| 全局名 | `window.MdViewer` |
| 数据源 | `GET /Markdown/<filename>` |
| 对外方法 | `init()` `open(filename)` `close()` |

全屏覆盖层，功能集：

| 功能 | 实现 |
|------|------|
| Markdown 解析 | marked 引擎 |
| 数学公式 | KaTeX 按需懒加载（仅检测到 `$$`/`$`/`\[` 时加载） |
| TOC 目录 | 解析 h1-h6 标题，层级缩进，侧边栏滑入 |
| 阅读进度 | 顶部 3px 蓝色进度条 |
| 标题锚点 | 每个标题注入 `#` 链接 |
| 图片处理 | 相对路径 → `/api/images/<name>`，点击独立灯箱放大 |
| 快捷键 | ESC 关闭灯箱（优先）→ 关闭阅读器 |

---

### app.js — 主控制器

| | |
|---|---|
| 全局名 | 无 (IIFE，不挂载全局) |
| 职责 | 引导初始化、标签页路由、响应式适配 |

初始化序列：
```
1. Theme.initTheme()        → 应用存储的主题
2. Lightbox.init()          → 绑定全局灯箱事件
3. MdViewer.init()          → 预绑定阅读器事件
4. Dashboard.init()         → 开始仪表盘轮询
5. Navigation.init()        → 加载导航配置 + 渲染
6. Blog.init()              → 缓存 DOM + 拉取文章列表
7. Gallery.init()           → 缓存 DOM + 拉取图片列表
8. 标签栏 + 主题按钮事件绑定
9. URL hash 恢复上次标签状态
10. 移动端响应式适配
```

---

## 部署教程

### 1. 环境要求

| 组件 | 用途 | 备注 |
|------|------|------|
| Nginx | Web 服务器 | Termux: `pkg install nginx` |
| cron / crond | 定时执行 corn.sh | Termux: `pkg install cronie termux-services` |
| curl | 下载依赖库 | 一次性使用 |
| termux-api (可选) | 电池信息 | `pkg install termux-api` |

> **无需**：PHP、Node.js、Python、MySQL、Docker。

### 2. 下载依赖库

以下 5 个文件必须放入 `lib/` 目录。**下载一次即可，后续完全离线运行。**

```bash
mkdir -p ~/Blog/lib
cd ~/Blog/lib

# marked — Markdown 解析器
curl -sSLO https://cdn.jsdelivr.net/npm/marked/marked.min.js

# KaTeX — 数学公式渲染（核心 + 自动渲染 + 样式）
curl -sSLO https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js
curl -sSLO https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css
curl -sSLO https://cdn.jsdelivr.net/npm/katex/dist/contrib/auto-render.min.js

# GitHub 风格 Markdown 样式
curl -sSLO https://cdn.jsdelivr.net/npm/github-markdown-css/github-markdown.min.css

# 验证
ls -lh lib/
# 应显示 5 个文件，总计约 370KB
```

### 3. 配置 Nginx

**Step 1 — 复制配置模板**

```bash
cp ~/Blog/example/Blog.conf $PREFIX/etc/nginx/conf.d/Blog.conf
```

**Step 2 — 修改路径**

编辑 `$PREFIX/etc/nginx/conf.d/Blog.conf`，将所有 `/path/to/Blog` 替换为实际路径：

```nginx
# 假设项目在 /path/to/Blog
# 用 sed 一键替换：
sed -i 's|/path/to/Blog|/path/to/Blog|g' \
    $PREFIX/etc/nginx/conf.d/Blog.conf
```

**Step 3 — 确认 nginx 主配置引入站点配置**

编辑 `$PREFIX/etc/nginx/nginx.conf`，确保 `http` 块中包含：

```nginx
http {
    include conf.d/*.conf;   # 这一行引入 Blog.conf
    # ... 其他配置 ...
}
```

**Step 4 — 检查配置并重载**

```bash
nginx -t                    # 测试配置语法
nginx -s reload             # 重载
```

### 4. 配置服务导航

编辑 `config.json`，将示例服务替换为自己的服务列表。

```json
{
  "title": "我的控制台",
  "services": [
    {
      "name": "Server",
      "icon": "🖥️",
      "items": [
        {
          "name": "显示名称",
          "icon": "🤖",
          "subtitle": "简短描述",
          "tag": "标签",
          "url": "https://your-server.local:8443/path/"
        }
      ]
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `name` | 服务显示名称 |
| `icon` | emoji 图标（不需要 Font Awesome） |
| `subtitle` | 卡片副标题（描述） |
| `tag` | 右上角小标签 |
| `url` | 点击跳转的目标地址 |

修改后刷新页面即可生效。

### 5. 配置仪表盘定时更新

**Step 1 — 修改 corn.sh 输出路径**

```bash
sed -i 's|/path/to/Blog|/path/to/Blog|g' \
    ~/Blog/corn.sh
```

**Step 2 — 手动测试**

```bash
bash ~/Blog/corn.sh
cat ~/Blog/dashboard.json
# 应看到类似 {"device":{"model":"Xiaomi 14",...},...} 的 JSON
```

**Step 3 — 配置 crontab**

```bash
crontab -e
# 添加以下两行（每 30 秒执行一次）：
# * * * * * /path/to/Blog/corn.sh
# * * * * * sleep 30; /path/to/Blog/corn.sh
```

> **Termux 注意**：需要先启动 cron 服务。`sv-enable crond` (termux-services) 或手动 `crond`。

### 6. 添加内容

| 内容类型 | 放入目录 | 发现方式 |
|----------|----------|----------|
| Markdown 文章 | `Markdown/` | nginx autoindex → `GET /api/md/` |
| HTML 文章 | `Html/` | nginx autoindex → `GET /api/html/` |
| 图片 | `Image/` | nginx autoindex → `GET /api/images/` |

文件增删后**刷新页面即可**看到变化，无需重启 nginx。

### 7. 启动

```bash
nginx -s reload
# 浏览器访问 https://127.0.0.1:7443
```

---

## 使用指南

| 操作 | 步骤 |
|------|------|
| **切换标签** | PC/平板：点击顶部标签栏。手机：点击底部导航栏 |
| **深色模式** | 点击右上角 ☀️/🌙 按钮，偏好自动保存 |
| **搜索服务** | 切到"导航"标签 → 搜索框输入关键词（匹配名称/描述/标签） |
| **搜索文章** | 切到"博客"标签 → 搜索框输入 → 可选过滤 Markdown/HTML |
| **阅读文章** | 点击文章卡片 → 全屏阅读器打开 → 左侧可展开目录导航 |
| **浏览图片** | 切到"图库"标签 → 搜索或滚动浏览 → 点击图片灯箱放大 |
| **Markdown 快捷键** | 阅读器内 ESC 关闭灯箱（再按 ESC 关闭阅读器） |

---

## 常见问题

### Q: 博客 / 图库 / 导航显示"加载中"，没有数据？

检查三点：

```bash
# 1. nginx autoindex 是否正常
curl http://127.0.0.1:7443/api/md/

# 2. 目录是否为空
ls ~/Blog/Markdown/
ls ~/Blog/Image/

# 3. 浏览器控制台 (F12) 有无 fetch 错误 —— 通常是 nginx 配置路径不对
```

### Q: 仪表盘卡片显示 "--"？

```bash
# 检查 dashboard.json 是否存在且格式正确
cat ~/Blog/dashboard.json

# 手动执行一次采集脚本
bash ~/Blog/corn.sh

# 确认 crond 在运行
ps aux | grep crond
```

### Q: 电池卡片不显示？

需要安装 `termux-api` 包（Android 上还需安装 Termux:API 应用并授予权限）：

```bash
pkg install termux-api
```

未安装时电池卡片自动隐藏，不影响其他功能。

### Q: 如何修改端口？

编辑 nginx 配置中的 `listen 7443;`，改为你需要的端口号，然后 `nginx -s reload`。

### Q: Markdown 中的图片不显示？

两种方式：

1. 将图片放入 `Image/` 目录，文章中引用文件名即可（阅读器会自动重写路径为 `/api/images/<文件名>`）
2. 在 Markdown 中使用绝对路径 `/api/images/<文件名>`

### Q: 数学公式显示为原始文本？

确认 `lib/` 目录中存在 `katex.min.js` 和 `auto-render.min.js`。KaTeX 仅在检测到数学分隔符时加载，如果确认有公式但不渲染，检查浏览器控制台是否有 404 错误。

---

## 技术要点

| 特性 | 实现方式 |
|------|----------|
| 零后端 | nginx autoindex 生成目录列表，`DOMParser` 解析 |
| 零外部依赖 | 所有库本地化在 `lib/` |
| 无 root | `corn.sh` 全部使用 `/proc` 和 `getprop` |
| 安全 | 文件名 `escapeHtml` 转义防 XSS |
| 主题 | CSS 变量 + `body.dark` 切换 |
| 响应式 | 3 个断点 (1200/640/400px) |
| 懒加载 | 非当前标签不请求数据，KaTeX 按需加载 |
| 兼容性 | `backdrop-filter` 回退纯色，`-webkit-` 前缀 |

---
## 友链

[linux.do](https://linux.do)
