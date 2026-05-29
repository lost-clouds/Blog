我经常在手机上用termux倒腾一点东西嘛,这几年来来去去玩的东西不少,不过留下来的不多
下面给大家汇总介绍一些
在这里提醒一下,手机本身散热就不大行,加上供电需要改;如果纯软件上也要root,说实话软件控制效果不好,要长期玩还是得改硬件供电、散热,这里介绍的不涉及root,只要你手机能装termux就能用;

我这套配置在局域网下是可以正常运行的,当然不是全开,日常就couchdb开着同步obsidian,nginx开着做导航,vaultwarden+MySQL开着;llamacpp开着Bge-m4-Q8.gguf
设备是一加8T(12+256)日常30℃左右,不会太烫,有新文件向量处理的时候会烫一会,但是日常小文件完全没问题,如果有大量文件还是别折磨手机了,~~真的会炸~~


1. 通过couchdb做obsidian的同步方案
2. 使用llamacpp来部署个`Bge-m3`向量模型来给obsidian的笔记用
3. vaultwarden密码管理器
4. 局域网下假域名
5. 使用comfyui部署Z-Image-Turbo来绘图
6. NextCloud自部署网盘
7. MySQL数据库

介绍从termux原始环境中部署的开始
# termux初始化
termux从GitHub直接下
[termux-GitHub](https://github.com/termux/termux-app/releases)
## 1. 需要用到的软件
我刚接触是跟着国光大佬的教程学的,但是我对终端美化没什么需求,就没改动,可以搜搜大佬的教程,可以下`zsh`之类的把终端改的很好看
```bash
# 选一个China或者Asian的源,方便
termux-change-repo
# 更新一下先
pkg update && pkg upgrade -y
# 加一些可能用到的源
pkg install tur-repo root-repo -y

# 安装一些需要的软件
pkg install vim wget nginx tmux git git-lfs proot-distro uv unzip curl cmake npm -y
```

## 2. 安装Debian容器
termux的proot-distro更新后好像改了很多东西,[# Version 5.0 release notes](https://github.com/termux/proot-distro/issues/666#issuecomment-4544973338)
用法上没什么改变,但是好像有些东西会报错
```bash
## 下载Debian:12
# 这里可以开代理,会快很多
proot-distro install debian:12

# 进入
proot-distro login debian

# 可以直接写个 bash脚本,能少敲几个词语
touch login_debian.sh
echo 'proot-distro login debian' > login_debian.sh
chmod +x login_debian.sh
./login_debian.sh
```

## 3. proot-distro容器与termux文件互传
因为proot-distro是个容器嘛,与termux原始环境是隔离的;
通过ln 建个链接可以把个目录在termux与proot-distro间联通
```bash
## 这里是termux的~/目录,可以随便取名字
mkdir TheFiles
cd TheFiles && pwd
# >>得到地址,一般是
/data/data/com.termux/files/home/TheFiles

## 进入到了proot-distro容器的环境
# 目录是 /root/ 
# 当然如果你习惯用其他的目录位置也都可以
ln -s /data/data/com.termux/files/home/TheFiles ./

# 然后就可以在/root/目录下看到该目录了,这个目录是termux环境和proot-distro容器之间互通的,文件的更改也是同步的
# 在这里提醒一句,最好不要su获取root之后再进入proot-distro环境,这会导致很多文件的归属问题,不知道会有什么奇奇怪怪的bug
```

# 假域名
有这个需求是因为如果你的设备需要移动,接入不同的WiFi时自动分配的IP肯定会变,IP一变化很多东西都要重新绑定很麻烦
可以用python的工具
## 1. 用uv创建个python环境
```bash
# 先创建个目录,比如mdns啥的
# 然后再该目录下创建环境
uv venv

# 进入python环境
source .venv/bin/activate
```
### 1.1 安装一下几个包
```
uv pip install ifaddr netifaces zeroconf
```
## 2. 创建文件
这里分成了两个, python文件是运行的,配置文件是config.json
文件你可以让AI给你改,很方便
### 2.1 mdns_auto.py
```
import json
import socket
import netifaces
from time import sleep

from zeroconf import Zeroconf, ServiceInfo


def get_interface_ip(interface_name="wlan2"):

    try:

        iface = netifaces.ifaddresses(interface_name)

        ipv4_info = iface[netifaces.AF_INET][0]

        return ipv4_info["addr"]

    except Exception as e:

        raise RuntimeError(
            f"Cannot get IP for interface: {interface_name}"
        ) from e

# ============================================
# 加载配置文件
# ============================================
with open("config.json", "r") as f:
    config = json.load(f)


# ============================================
# 获取 hostname
# ============================================
hostname = config["hostname"]


# ============================================
# 获取本机 IP
# ============================================
#local_ip = get_local_ip()
local_ip = get_interface_ip("wlan2")

print(f"[INFO] Local IP: {local_ip}")


# ============================================
# 启动 Zeroconf
# ============================================
#zeroconf = Zeroconf()
zeroconf = Zeroconf(
    interfaces=[local_ip]
)


# ============================================
# 已注册服务列表
# ============================================
registered_services = []


# ============================================
# 遍历所有服务
# ============================================
for svc in config["services"]:

    name = svc["name"]
    service_type = svc["type"]
    port = svc["port"]
    path = svc["path"]
    description = svc["description"]

    full_service_name = f"{name}.{service_type}"

    print(f"[REGISTER] {name}:{port}")

    info = ServiceInfo(

        service_type,

        full_service_name,

        addresses=[socket.inet_aton(local_ip)],

        port=port,

        properties={

            "path": path,

            "description": description,

            "server": hostname,

            "port": str(port)
        },

        server=hostname,
    )

    zeroconf.register_service(info)

    registered_services.append(info)


print("[INFO] All services registered.")


# ============================================
# 保持运行
# ============================================
try:

    while True:
        sleep(1)

except KeyboardInterrupt:

    print("\n[INFO] Stopping services...")


finally:

    # ========================================
    # 注销所有服务
    # ========================================
    for svc in registered_services:

        zeroconf.unregister_service(svc)

    zeroconf.close()

    print("[INFO] Zeroconf stopped.")
~/AIFiles/mdns $ cat config.json
```
### 2.2 config.json示例如下
```
{
  "hostname": "your_self_doim.local.",
  "services": [
    {
      "name": "WebPortal",
      "type": "_http._tcp.local.",
      "port": 8077,
      "path": "/",
      "description": "Web Navigation Portal"
    },

    {
      "name": "CouchDB",
      "type": "_http._tcp.local.",
      "port": 5984,
      "path": "/",
      "description": "CouchDB Database"
    },

    {
      "name": "LlamaCPP",
      "type": "_http._tcp.local.",
      "port": 8888,
      "path": "/v1/models",
      "description": "llama.cpp OpenAI API"
    },

    {
      "name": "ComfyUI",
      "type": "_http._tcp.local.",
      "port": 7777,
      "path": "/",
      "description": "ComfyUI WebUI"
    },

    {
      "name": "VSCodeServer",
      "type": "_http._tcp.local.",
      "port": 8080,
      "path": "/",
      "description": "VSCode Server"
    },

    {
      "name": "ZeroClaw",
      "type": "_http._tcp.local.",
      "port": 8833,
      "path": "/",
      "description": "ZeroClaw WebUI"
    },

    {
      "name": "SillyTavern",
      "type": "_http._tcp.local.",
      "port": 9988,
      "path": "/",
      "description": "SillyTavern UI"
    }
  ]
}
```
## 运行
只需要开个tmux窗口然后在后台挂着就可以了
```bash
uv run python mdns_auto.py
```
这里的配置是假定你用该设备共享热点

# llama.cpp部署并运行本地模型
## 1 编译安装
### 1.1 克隆项目
```bash
# 这里目录随意
git clone https://github.com/ggml-org/llama.cpp.git
```
### 1.2 编译
```bash
# 这里在llama.cpp项目目录下
cmake -B build 

cmake --build build/ --config Release -j4
```
### 1.3 llama-server等添加到环境变量
把这两行添加到环境变量
```bash
## llama.cpp环境变量
export LD_LIBRARY_PATH=/data/data/com.termux/files/home/<your Path>/llama.cpp/build/bin:$LD_LIBRARY_PATH
export PATH=/data/data/com.termux/files/home/<your-Path>/llama.cpp/build/bin:$PATH
```

刷新一下,然后就可以在termux随地使用`llama-cli | llama-server`等命令了

这里补充一下,`llama-cli/llama-server`在运行时,可以用`-t1` `-t2` `-tn (n取小于你soc核心数的正整数)` 等参数来选择调用的核心数量,手机的核心大小不一,只用大核心比全弄效果好很多。


# nginx配置
nginx安装后,相关的配置文件在`$PREFIX/usr/etc/nginx/`目录下;
配置和正常Linux一样,只是`include xxx.conf` 引用配置的时候尽量用绝对目录,有时候容易出毛病,或者建个`conf.d`目录,直接用`include xxxxx/conf.d/*.conf`引用目录下文件,方便一点
可以用su获取root之后再运行,这样可以用1000以下的端口,如果不用root也能正常用,注意不要用1000以下的端口,因为没有权限


# **下面开始进入proot-distro容器部分**
最好不要su获取root后进入proot-distro,会因为文件归属问题有时候会有奇奇怪怪的bug
# CouchDB数据库
## 1. couchdb数据库的安装
参照couchdb官方的示例[官方文档](https://docs.couchdb.org/en/latest/install/unix.html)
### 1.1 添加官方的库

```bash
## 其实我不太懂,不过官方文档是这么写的
# 1
apt update && apt install -y curl apt-transport-https gnupg
# 2
curl https://couchdb.apache.org/repo/keys.asc | gpg --dearmor |  tee /usr/share/keyrings/couchdb-archive-keyring.gpg >/dev/null 2>&1
# 3
source /etc/os-release
# 4
echo "deb [signed-by=/usr/share/keyrings/couchdb-archive-keyring.gpg] https://apache.jfrog.io/artifactory/couchdb-deb/ ${VERSION_CODENAME} main" \      |  tee /etc/apt/sources.list.d/couchdb.list >/dev/null
```
### 1.2 安装
```bash
# 先搜索一下确认库添加上了
apt search couchdb
# 应该会新增这仨
couchdb/bookworm 3.5.2~bookworm arm64
  RESTful document oriented database

couchdb-dbgsym/bookworm 3.5.0~bookworm arm64
  debug symbols for couchdb

couchdb-nouveau/bookworm 3.5.2~bookworm arm64
  Nouveau adds Lucene capabilities to CouchDB

## 用apt安装
apt install couchdb
```
### 1.3 couchdb初始化
这是紧接着安装之后,他会引导你初始化一些配置,安装好后在web界面都可以图形化配置

```bash
Configuring couchdb
-------------------

Please select the CouchDB server configuration type that best meets your needs.

For single-server configurations, select standalone mode. This will set up CouchDB to run as a single server.

For clustered configuration, select clustered mode. This will prompt for additional parameters required to
configure CouchDB in a clustered configuration.

If you prefer to configure CouchDB yourself, select none. You will then need to edit /opt/couchdb/etc/vm.args
and /opt/couchdb/etc/local.d/*.ini yourself. Be aware that this will bypass *all* configuration steps,
including setup of a CouchDB admin user. You'll have to create one manually.

  1. standalone  2. clustered  3. none

## 这里是问你1.单机运行 2.多机集群配置 3.等等再说 ,我是单机所以就直接1了

General type of CouchDB configuration: 1

A CouchDB node has an Erlang magic cookie value set at startup.

This value must match for all nodes in the cluster. If they do not match, attempts to connect the node to the
cluster will be rejected.

## 配置神奇曲奇(bushi)我理解是密码一类的东西,是不显示的,输入完成之后回车就可以


CouchDB Erlang magic cookie: [your password]

A CouchDB node must bind to a specific network interface. This is done via IP address. Only a single address is
supported at this time.

The special value '0.0.0.0' binds CouchDB to all network interfaces.

The default is 127.0.0.1 (loopback) for standalone nodes, and 0.0.0.0 (all interfaces) for clustered nodes. In
clustered mode, it is not allowed to bind to 127.0.0.1.

## 这里问你是只允许127.0.0.1访问还是都允许,虽然说单个人的数据没什么太大的盗取价值,不过还是建议用127.0.0.1然后加个nginx反代

CouchDB interface bind address: 127.0.0.1

It is highly recommended that you create a CouchDB admin user, which takes CouchDB out of the insecure "admin
party" mode. Entering a password here will take care of this step for you.

If this field is left blank, an admin user will not be created.

A pre-existing admin user will not be overwritten by this package.

## 这才是真正的账号-密码,当然初始化是管理员的账号密码,同样是隐藏的,直接输入完成后回车就可以,这里要多确认一次


Password for the CouchDB "admin" user:

Repeat password for the CouchDB "admin" user:

invoke-rc.d: could not determine current runlevel
invoke-rc.d: policy-rc.d denied execution of start.
WARNING: Unable to create standalone system databases.
CouchDB may not have started correctly (no init?)
Once CouchDB has started correctly, run the following:

  curl -X PUT --user '<admin-user>:<admin-pass>' http://127.0.0.1:5984/_users
  curl -X PUT --user '<admin-user>:<admin-pass>' http://127.0.0.1:5984/_replicator

Processing triggers for libc-bin (2.36-9+deb12u14) ...

```

到这里就部署完成了,可以在 http://127.0.0.1:5984/_utls 页面查看后台管理页面

obsidian的设置可以在电脑端配置完后直接用二维码导入到手机,这样可以方便一点,毕竟手机的UI比较小,适配也不一定很合适,但是同步方面我在局域网下使用完全没有问题.
顺带说一下,我Obsidian使用的AI插件是站内大佬的YOLO,挺好用的;
同步使用的是self-host live sync插件

# MySQL数据库
这个好装,在proot-distro里叫`mariadb`
## 1. 安装
```bash
# 默认的源就带着,直接装就行
apt update && apt install mariadb-server -y
```
## 2. 使用
```bash
# 启动服务
service mariadb start

# 然后就可以直接进入了
mysql
```
进入MySQL数据库环境之后的具体使用,小弟在这里就不班门弄斧了,只贴一下简单的常用命令
```sql
# 登录 MySQL
# 登录指定name的账户，<CR>后输入密码
mysql -u name -p
# 登录默认账户root
mysql

# 查看正在运行的数据库
SHOW DATABASES;
# 查看特定数据库的信息
USE 数据库名；
SHOW TABLES;

# 确认当前使用的数据库
SELECT DATABASE();

# 查看正在使用的端口
SHOW VARIABLES LIKE 'port';
# 这个端口在`/etc/mysql/`下的 `my.cnf`中，默认是3306，可以改
# 改完之后重启运行就行

# 刷新MySQL权限相关的表
flush privileges; 

# 查看所有数据库用户要查看所有数据库用户，可以查询`mysql`数据库中的`user`表。
# 首先切换到`mysql`数据库：
USE mysql;
# 然后执行以下查询：
SELECT User, Host FROM user;

# 要查看用户`user`在数据库`nextcloud`上的权限
SHOW GRANTS FOR 'user'@'localhost' ON `nextcloud`.*;

# 查询特定用户在特定主机上的权限
SHOW GRANTS FOR 'AIPING'@'localhost:7777';

# 更改指定用户的密码为
ALTER USER 'AIPING'@'localhost' IDENTIFIED BY 'new_password';
FLUSH PRIVILEGES;

```
# vaultwarden部署
## 1. 安装
### 下载地址
>[vaultwarden项目地址](https://github.com/dani-garcia/vaultwarden)
>[web-vault项目地址](https://github.com/dani-garcia/bw_web_builds/releases)

首先，`vaultwarden`想要正常工作需要六个部分，`vaultwarden` `web-vault` `nginx` `MySQL` `rustup`
1. **`vaultwarden`** 是bitwarden项目的社区版
`Vaultwarden 是一个用于本地搭建 Bitwarden 服务器的第三方 Docker 项目。仅在部署的时候使用 Vaultwarden 镜像，桌面端、移动端、浏览器扩展等客户端均使用官方 Bitwarden 客户端。`
2. **`web-vault`** 是web页面
3. **`nginx`** 提供代理服务
在局域网内还用`nginx`代理是因为不开https访问的话，网页只能在127.0.0.1上访问，在局域网内其他设备上使用的话会一直在首页转圈圈，当然，还是因为我只会用`nginx`搭建自签证书的https访问，所以就只介绍这个了;
4. **`MySQL`** 用来提供数据库
当然官方也支持`Sqlite` 等其他的类型，但是我之所以用`MySQL`只是因为我只会用这个，欸嘿,所以就介绍这一个了;
5. **`rustup`** 是vaultwarden安装教程推荐的 `rust table`,没怎么接触过，是按教程来的
### 1.1 安装依赖
```bash
apt install build-essential git pkg-config libssl-dev libmariadb-dev-compat libmariadb-dev -y

# termux
pkg install clang make pkg-config git openssl tur-repo -y
```

更新包列表并安装构建工具、Git、SSL 开发库 和 Certbot。  
对于 MySQL，还需额外安装 MySQL 和开发库。


### 1.2 安装 Rust
使用官方 rustup 安装稳定版 Rust 和 Cargo。

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source $HOME/.cargo/env
rustc --version  # 验证安装，应显示 rustc 1.x.x
```

---

## 2. 构建 Vaultwarden

### 2.1 克隆源代码
创建一个源代码目录并克隆仓库。

```bash
mkdir ~/source && cd ~/source
git clone https://github.com/dani-garcia/vaultwarden.git
cd vaultwarden
```

### 2.2 构建二进制文件
根据数据库选择构建特性。  
- **SQLite（默认，简单）**：`cargo build --features sqlite --release`  
- **MySQL（推荐生产环境）**：`cargo build --features mysql --release`

```bash
# 示例：MySQL 构建（替换为你的选择）
cargo build --features mysql --release
```

- **提示**：如果内存不足，添加 `--jobs 1` 限制并行任务。构建后，二进制文件在 `~/source/vaultwarden/target/release/vaultwarden`。

---

## 3. 配置 Vaultwarden

### 3.1 创建数据目录
创建专用目录并设置权限。

```bash
sudo mkdir -p /var/lib/vaultwarden
cd /var/lib/vaultwarden
sudo mkdir -p data
sudo useradd -m -d /var/lib/vaultwarden vaultwarden  # 创建专用用户
sudo chown -R vaultwarden:vaultwarden /var/lib/vaultwarden
```

### 3.2 下载环境模板和 Web Vault
下载配置文件模板和 Web 界面（推荐最新版本，检查 [GitHub Releases](https://github.com/dani-garcia/bw_web_builds/releases) 获取当前版本，例如 v2026.4.1）。

```bash
## 目录/var/lib/vaultwarden

# 下载环境模板
wget https://raw.githubusercontent.com/dani-garcia/vaultwarden/main/.env.template

mv .env.template .env

# 下载 Web Vault（示例版本，替换为最新）
wget https://github.com/dani-garcia/bw_web_builds/releases/download/v2026.4.1/bw_web_v2026.4.1.tar.gz

tar -xvf bw_web_v2026.4.1.tar.gz --strip-components=1 -C data/

# 其实删不删都行,不删留着也没多大,还能方便看是安装的哪个版本
rm bw_web_v2026.4.1.tar.gz

```

### 3.3 配置数据库
#### 3.3.1 SQLite（默认）
无需额外步骤，直接在 `.env` 中使用默认路径。

#### 3.3.2 MySQL（新增）
1. 登录 MySQL 并创建数据库和用户：
   ```bash
    mysql -u root -p  # 输入 root 密码
   ```
   在 MySQL 提示符下运行：
   ```sql
   CREATE DATABASE vaultwarden CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'vaultwarden'@'localhost' IDENTIFIED BY 'your_strong_password';
   GRANT ALL PRIVILEGES ON vaultwarden.* TO 'vaultwarden'@'localhost';
   FLUSH PRIVILEGES;
   EXIT;
   ```
   - 替换 `your_strong_password` 为强密码。

2. 在 `.env` 中配置 MySQL 连接（见下文 3.4）。

### 3.4 编辑 .env 文件
使用编辑器配置环境变量。关键设置包括域名、数据库、日志和通知。

```bash
vim /var/lib/vaultwarden/.env
```

**示例配置（SQLite 版）**：
不用复制这个示例,直接在官方的example示例里寻找需要改的部分,需要改的示例如下,其他配置我没有用到,不懂(哥们不是IT出身,主打一个能用就像)
```sql
DATA_FOLDER=data
DATABASE_URL=DATABASE_URL=sqlite://data/db.sqlite3  # SQLite 默认路径
LOG_FILE=data/vaultwarden.log
LOG_LEVEL=info  # 生产环境用 error
DOMAIN=https://your-domain.com  # 你的域名
ROCKET_ADDRESS=127.0.0.1
ROCKET_PORT=8000
```

**示例配置（MySQL 版）**：仅替换 DATABASE_URL 行：
```sql
DATA_FOLDER=data
DATABASE_URL=mysql://vaultwarden:your_strong_password@localhost/vaultwarden  # MySQL 连接字符串
# 其余配置同上
```

- **提示**：完整模板见 [Vaultwarden 文档](https://github.com/dani-garcia/vaultwarden/wiki/Using-Vaultwarden-with-MySQL)。测试配置：保存后，重启服务验证。

---

## 4. 部署和运行

### 4.1 复制二进制文件
```bash
cp ~/source/vaultwarden/target/release/vaultwarden /usr/local/bin/vaultwarden
chmod +x /usr/local/bin/vaultwarden
```

### 4.2 运行
```bash
# 目录为/var/lib/vaultwarden

vaultwarden

# 长时间运行可以用nohup或者tmux,我喜欢用tmux
# nohup
nohup vaultwarden &
# tmux就是直接开个新tmux窗口运行
vaultwarden
```

# NextCloud
## 1.安装一些用到的软件
官方教程里用到的软件(这里我把`sudo`去掉了，因为本来就是root用户而且termux好像取得root有点费劲儿)
```bash
apt update && apt upgrade
	apt install apache2 mariadb-server libapache2-mod-php php-gd php-mysql \
php-curl php-mbstring php-intl php-gmp php-bcmath php-xml php-imagick php-zip
```
### 2. Mysql创建用户

这块在Next cloud的官网上有教程，可以按照自己需要去修改，不过localhost那个因为我自己不太会就没去改；

```mysql
# 启动MySQL客户端
root@localhost:~# mysql
Welcome to the MariaDB monitor.  Commands end with ; or \g.
Your MariaDB connection id is 52
Server version: 10.6.18-MariaDB-0ubuntu0.22.04.1 Ubuntu 22.04

Copyright (c) 2000, 2018, Oracle, MariaDB Corporation Ab and others.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

# 创建一个名为'username'的用户，该用户只能从'localhost'访问数据库，并设置密码为'password'

MariaDB [(none)]> CREATE USER 'username'@'localhost' IDENTIFIED BY 'password';
Query OK, 0 rows affected (0.002 sec)

# 创建一个名为'nextcloud2'的数据库，如果不存在，使用'utf8mb4'字符集和'utf8mb4_general_ci'排序规则

MariaDB [(none)]> CREATE DATABASE IF NOT EXISTS nextcloud2 CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
Query OK, 1 row affected (0.002 sec)

# 授予用户'username'在'nextcloud2'数据库上的所有权限

MariaDB [(none)]> GRANT ALL PRIVILEGES ON nextcloud2.* TO 'username'@'localhost';
Query OK, 0 rows affected (0.002 sec)

# 刷新权限，使更改生效

MariaDB [(none)]> FLUSH PRIVILEGES;
Query OK, 0 rows affected (0.002 sec)

# 退出MySQL

MariaDB [(none)]> \q
Bye
```

## 3. 获取Next cloud

可以从这里找[Index of / (nextcloud.com)](https://download.nextcloud.com/)需要的版本  
如果是Linux服务端可以从这里找[Index of /server/releases (nextcloud.com)](https://download.nextcloud.com/server/releases/)

```bash
# 目前我用到的版本是30.0.0
wget https://download.nextcloud.com/server/releases/nextcloud-30.0.0.zip

# 可以先解压再cp到指定位置
unzip nextcloud-30.0.0.zip

# 会得到一个nextcloud文件夹，就是将这个文件夹cp到/var/wwww/目录下
cp -r nextcloud /var/wwww/

# 然后将 Nextcloud 目录的所有权更改为 HTTP 用户
# 但是其实哥们好像没有执行这个操作，目前倒是没遇到什么问题
sudo chown -R www-data:www-data /var/www/nextcloud
```

## 4. 配置Apache2
### 4.1 安装apache2
```bash
apt update && apt install apache2 -y
```

### 4.2 开启Apache2服务
```bash
service apache2 start
```

这个时候应该可以在内网环境的http服务上看到apache2的默认配置界面了
```bash
root@localhost:~# ifconfig
Warning: cannot open /proc/net/dev (Permission denied). Limited output.
lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536
        inet 127.0.0.1  netmask 255.0.0.0
        unspec 00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00  txqueuelen 1000  (UNSPEC)

rmnet_data2: flags=65<UP,RUNNING>  mtu 1460
        inet 这段个人ip哥们就暂时不展示了嗷  netmask 255.255.255.248
        unspec 00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00  txqueuelen 1000  (UNSPEC)

rndis0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet 192.168.143.215  netmask 255.255.255.0  broadcast 192.168.143.255
        unspec 00-00-00-00-00-00-00-00-00-00-00-00-00-00-00-00  txqueuelen 1000  (UNSPEC)

# 这里这个192.168.143.215就是设备在内网的IP了，将他输入到浏览器应该就可以看到默认界面了

http://192.168.143.215

```

### 4.3 创建配置文件
到`/etc/apache2/sites-available/`目录下，创建一个nextcloud.conf文件
```bash
cd /etc/apache2/sites-available/

vim nextcloud.conf
```

参考大佬的教程[ubuntu 22.04安装部署nextcloud最新版-笔记_netiii](https://www.netiii.com/4102/)  
将下列内容复制进去
```bash
<VirtualHost *:8080> # 这里我另一个机器用80端口会报错，所以就改成8080了 
  DocumentRoot /var/www/nextcloud/
  ServerName  192.168.143.215   #修改自己的服务器IP或者域名

  <Directory /var/www/nextcloud/>
    Require all granted
    AllowOverride All
    Options FollowSymLinks MultiViews

    <IfModule mod_dav.c>
      Dav off
    </IfModule>
  </Directory>
</VirtualHost>
```

跟着教程走一遍，因为在termux中，和正常的Linux系统略有不同

```bash
a2ensite nextcloud.conf

reload apache2

a2enmod rewrite headers env dir mime


service apache2 restart

# 如果有什么报错，我没管它，没看到有什么明显的影响
```
### 5. 网页配置

然后就可以访问(http://yourip:yourport)设定管理员账户和密码，配置MySQL数据库接口
这里IP就是`ifconfig`返回的那个内网地址；
port就是在nextcloud.conf中配置的接口；
我的配置是http://192.168.143.215:8080

如果完全和我的教程来,一字不改的话

MySQL用户名是`username`
数据库名是`nextcloud2`
数据库密钥是`password`
数据库地址就是默认的`localhost`

# ComfyUI运行Z-Image-Turbo
当然,这是在proot-distro容器环境中
### 1. 从GitHub拉取项目
```shell
git clone https://github.com/comfyanonymous/ComfyUI.git
```
### 2. 准备python环境
```shell
uv venv --python 3.11.9
source .venv/bin/activate
```

> ps:这里之所以用python3.11.9是因为我之前用3.12会在依赖安装那部分大量报错；这个版本是当前(2025.11)可用的最新版本了

### 3. 安装依赖
```shell
UV_LINK_MODE=copy uv pip install -r requirements.txt --no-cache-dir --force-reinstall
```

### 4. 添加一些插件，比如`comfy-gguf`来支持gguf格式的模型(不然可能炸)
```shell
# 到custom目录下，用git clone拉取
git clone https://github.com/city96/ComfyUI-GGUF.git
# cd到ComfyUI-GGUF目录下安装依赖
UV_LINK_MODE=copy uv pip install -r requirements.txt --no-cache-dir --force-reinstall
```
> uv简直是termux运行comfyui的神奇喵喵工具 `UV_LINK_MODE=copy uv pip install -r requirements.txt --no-cache-dir --force-reinstall`,之前没接触过的时候用python3自带的venv，依赖完全用不了大片的error

### 5. 回到ComfyUI目录下，写个运行小脚本就可以部署了
```shell
touch run.sh \
chmod +x run.sh \
echo "python main.py --cpu --use-split-cross-attention --listen 0.0.0.0 --port 8888" >> run.sh \
./run.sh
```
> ps:上边这个8888纯粹是顺手，而且没root的话，数字小于4000的端口基本用不来


# IPv6
这里提一嘴IPv6,我用的是电信的流量卡,查了一下有IPv6
查询方式很多,这里写一下一种termux命令行里的方法
```bash
curl -6 ifconfig.me
```

实测可以远程访问网页,(导航页是让AI写的)，ssh链接使用Termius也可以直连;
[[AttachmentsLab/18417fdb92cb1b26cce3be987c74c8d0_MD5.jpg|Open: Pasted image 20260527003701.png]]
![[AttachmentsLab/18417fdb92cb1b26cce3be987c74c8d0_MD5.jpg]]

但是就像我白天发帖问的,Obsidian的self-hosted live sync插件不能正常使用,会报错说找不到;
在这里请教各位佬,不知道有没有办法解决这个问题。
# END

