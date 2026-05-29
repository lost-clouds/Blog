#!/bin/bash
# ============================================================
# 系统资源采集脚本（Termux 零 root 版）
# 所有数据采集均通过标准命令，不读取 /proc
# 用法: bash corn.sh
# crontab: 每 30 秒执行一次
# ============================================================
# 不启用 -u（脚本大量使用条件赋值和 fallback，-u 会误杀）

OUTPUT="${1:-/path/to/Blog/dashboard.json}"

# ============================================================
# 辅助函数：安全取值，失败返回默认值
# ============================================================
sval() { echo "${1:-$2}"; }
fval() { awk "BEGIN { printf \"%.1f\", $1 }" 2>/dev/null || echo "$2"; }

# ============================================================
# 1. 设备信息
# ============================================================
DEV_MODEL=$(getprop ro.product.model 2>/dev/null || echo "Unknown")
DEV_BRAND=$(getprop ro.product.brand 2>/dev/null || echo "")
ANDROID_VER=$(getprop ro.build.version.release 2>/dev/null || echo "?")
KERNEL_VER=$(sval "$(uname -r)" "?")

# 品牌 + 型号
if [ -n "$DEV_BRAND" ] && [ "$DEV_BRAND" != "Unknown" ]; then
    DEV_FULL="${DEV_BRAND} ${DEV_MODEL}"
else
    DEV_FULL="$DEV_MODEL"
fi

# ============================================================
# 2. 网络信息（无需 root）
# ============================================================
LOCAL_IP=""
IPV6_ADDR=""
IFACE_NAME=""

# 获取活跃网络接口（优先 wlan0，其次 eth0，再其他）
if command -v ifconfig &>/dev/null; then
    # 尝试 wlan0
    LOCAL_IP=$(ifconfig wlan0 2>/dev/null | grep 'inet ' | awk '{print $2}' | head -1)
    [ -n "$LOCAL_IP" ] && IFACE_NAME="wlan0"
    # 尝试 eth0
    if [ -z "$LOCAL_IP" ]; then
        LOCAL_IP=$(ifconfig eth0 2>/dev/null | grep 'inet ' | awk '{print $2}' | head -1)
        [ -n "$LOCAL_IP" ] && IFACE_NAME="eth0"
    fi
    # 尝试 rmnet (蜂窝网络)
    if [ -z "$LOCAL_IP" ]; then
        LOCAL_IP=$(ifconfig rmnet_data0 2>/dev/null | grep 'inet ' | awk '{print $2}' | head -1)
        [ -n "$LOCAL_IP" ] && IFACE_NAME="rmnet"
    fi
    # 最后兜底：取第一个有 IP 的接口
    if [ -z "$LOCAL_IP" ]; then
        LOCAL_IP=$(ifconfig 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -1)
        [ -n "$LOCAL_IP" ] && IFACE_NAME="auto"
    fi
fi

# IPv6（公网，需要网络访问）
IPV6_ADDR=$(curl -6 -s --connect-timeout 2 ifconfig.me 2>/dev/null || echo "")

# ============================================================
# 3. CPU 信息
# ============================================================
CPU_CORES=$(nproc 2>/dev/null || echo "?")

# CPU 型号
CPU_MODEL=$(getprop ro.board.platform 2>/dev/null || echo "")
if [ -z "$CPU_MODEL" ]; then
    CPU_MODEL=$(getprop ro.product.cpu.abi 2>/dev/null || echo "ARM")
fi

# CPU 使用率 — 通过 top 获取（Termux 可用）
CPU_USAGE="0.0"
if command -v top &>/dev/null; then
    TOP_OUT=$(top -bn1 2>/dev/null)
    if [ -n "$TOP_OUT" ]; then
        # 标准 Linux top: "%Cpu(s):  5.2 us,  2.1 sy,  0.0 ni, 92.0 id, ..."
        CPU_IDLE=$(echo "$TOP_OUT" | grep -oP '\d+\.?\d*\s*id' | head -1 | grep -oP '\d+\.?\d*')
        if [ -n "$CPU_IDLE" ]; then
            CPU_USAGE=$(fval "100 - $CPU_IDLE" "0.0")
        else
            # Android/Termux top 可能输出不同格式
            CPU_IDLE=$(echo "$TOP_OUT" | grep -oP '\d+% idle' | head -1 | grep -oP '\d+')
            if [ -n "$CPU_IDLE" ]; then
                CPU_USAGE=$(fval "100 - $CPU_IDLE" "0.0")
            fi
        fi
    fi
fi

# ============================================================
# 4. 内存信息
# ============================================================
MEM_TOTAL_FMT="?"
MEM_USED_FMT="?"
MEM_UNIT="MB"

if command -v free &>/dev/null; then
    FREE_OUT=$(free -m 2>/dev/null)
    if [ -n "$FREE_OUT" ]; then
        MEM_TOTAL=$(echo "$FREE_OUT" | awk '/^Mem:/{print $2}')
        MEM_USED=$(echo "$FREE_OUT"  | awk '/^Mem:/{print $3}')
        if [ -n "$MEM_TOTAL" ] && [ -n "$MEM_USED" ]; then
            if [ "$MEM_TOTAL" -ge 1024 ] 2>/dev/null; then
                MEM_UNIT="GB"
                MEM_TOTAL_FMT=$(fval "$MEM_TOTAL / 1024" "?")
                MEM_USED_FMT=$(fval  "$MEM_USED  / 1024" "?")
            else
                MEM_TOTAL_FMT="$MEM_TOTAL"
                MEM_USED_FMT="$MEM_USED"
            fi
        fi
    fi
fi

# ============================================================
# 5. 储存信息
# ============================================================
DISK_USED_GB="?"
DISK_TOTAL_GB="?"
DISK_UNIT="GB"

if command -v df &>/dev/null; then
    DISK_INFO=$(df -k /data 2>/dev/null | awk 'NR==2 {print $2, $3}')
    if [ -n "$DISK_INFO" ]; then
        DISK_TOTAL_KB=$(echo "$DISK_INFO" | awk '{print $1}')
        DISK_USED_KB=$(echo  "$DISK_INFO" | awk '{print $2}')
        DISK_TOTAL_GB=$(fval "$DISK_TOTAL_KB / 1024 / 1024" "?")
        DISK_USED_GB=$(fval  "$DISK_USED_KB  / 1024 / 1024" "?")
    fi
fi

# ============================================================
# 6. 运行时间
# ============================================================
UPTIME="?"

# 尝试 uptime -p（pretty 格式）
UPTIME_RAW=$(uptime -p 2>/dev/null | sed 's/^up //')
if [ -z "$UPTIME_RAW" ]; then
    # 尝试标准 uptime
    UPTIME_RAW=$(uptime 2>/dev/null | sed 's/.*up \([^,]*\).*/\1/')
fi
if [ -n "$UPTIME_RAW" ]; then
    UPTIME="$UPTIME_RAW"
fi

# ============================================================
# 7. 电池信息（需要 termux-api）
# ============================================================
BAT_LEVEL=""
BAT_STATUS=""
BAT_TEMP=""

if command -v termux-battery-status &>/dev/null; then
    BAT_JSON=$(termux-battery-status 2>/dev/null || echo "")
    if [ -n "$BAT_JSON" ]; then
        BAT_LEVEL=$(echo "$BAT_JSON"    | grep -o '"percentage":[0-9]*' | cut -d: -f2)
        BAT_STATUS=$(echo "$BAT_JSON"   | grep -o '"status":"[^"]*"' | cut -d: -f2 | tr -d '"')
        BAT_TEMP_RAW=$(echo "$BAT_JSON" | grep -o '"temperature":[0-9.]*' | cut -d: -f2)
        if [ -n "$BAT_TEMP_RAW" ]; then
            BAT_TEMP=$(fval "$BAT_TEMP_RAW / 10" "0")
        fi
    fi
fi

# ============================================================
# 8. 数值清洗（确保所有值都是合法 JSON）
# ============================================================
clean_num() {
    local v="$1" def="${2:-0}"
    # 去除空格，检查是否为有效数字
    v=$(echo "$v" | xargs 2>/dev/null)
    if [ -z "$v" ] || [ "$v" = "?" ] || [ "$v" = "-" ]; then
        echo "$def"
    else
        # 匹配整数或小数
        if echo "$v" | grep -qE '^[0-9]+\.?[0-9]*$'; then
            echo "$v"
        else
            echo "$def"
        fi
    fi
}

clean_str() {
    local v="$1" def="${2:-?}"
    v=$(echo "$v" | xargs 2>/dev/null)
    if [ -z "$v" ] || [ "$v" = "?" ]; then
        echo "$def"
    else
        # 转义 JSON 特殊字符
        echo "$v" | sed 's/\\/\\\\/g; s/"/\\"/g'
    fi
}

# 清洗所有即将写入 JSON 的值
V_CPU_USAGE=$(clean_num "$CPU_USAGE" "0")
V_CPU_CORES=$(clean_num "$CPU_CORES" "0")
V_CPU_MODEL=$(clean_str "$CPU_MODEL" "ARM")
V_MEM_USED=$(clean_num "$MEM_USED_FMT" "0")
V_MEM_TOTAL=$(clean_num "$MEM_TOTAL_FMT" "0")
V_MEM_UNIT=$(clean_str "$MEM_UNIT" "MB")
V_DISK_USED=$(clean_num "$DISK_USED_GB" "0")
V_DISK_TOTAL=$(clean_num "$DISK_TOTAL_GB" "0")
V_UPTIME=$(clean_str "$UPTIME" "?")
V_DEV_MODEL=$(clean_str "$DEV_FULL" "Unknown")
V_ANDROID=$(clean_str "$ANDROID_VER" "?")
V_KERNEL=$(clean_str "$KERNEL_VER" "?")
V_LOCAL_IP=$(clean_str "$LOCAL_IP" "")
V_IPV6=$(clean_str "$IPV6_ADDR" "")
V_IFACE=$(clean_str "$IFACE_NAME" "")

# 网络部分
NETWORK_BLOCK=""
if [ -n "$V_LOCAL_IP" ] && [ "$V_LOCAL_IP" != "?" ]; then
    NETWORK_BLOCK="\"network\": {\"ip\": \"${V_LOCAL_IP}\", \"ipv6\": \"${V_IPV6}\", \"iface\": \"${V_IFACE}\"},"
fi

# 电池部分
BATTERY_BLOCK=""
if [ -n "${BAT_LEVEL:-}" ] && [ -n "${BAT_STATUS:-}" ]; then
    B_LEVEL=$(clean_num "${BAT_LEVEL:-0}" "0")
    B_STATUS=$(clean_str "${BAT_STATUS:-Unknown}" "Unknown")
    B_TEMP=$(clean_num "${BAT_TEMP:-0}" "0")
    BATTERY_BLOCK=",\"battery\": {\"level\": ${B_LEVEL}, \"status\": \"${B_STATUS}\", \"temp\": ${B_TEMP}}"
fi

mkdir -p "$(dirname "$OUTPUT")" 2>/dev/null || true

cat > "$OUTPUT" <<EOF
{
  "device": {"model": "${V_DEV_MODEL}", "android": "${V_ANDROID}", "kernel": "${V_KERNEL}"},
  ${NETWORK_BLOCK}
  "cpu": {"usage": ${V_CPU_USAGE}, "cores": ${V_CPU_CORES}, "model": "${V_CPU_MODEL}"},
  "memory": {"used": ${V_MEM_USED}, "total": ${V_MEM_TOTAL}, "unit": "${V_MEM_UNIT}"},
  "disk": {"used": ${V_DISK_USED}, "total": ${V_DISK_TOTAL}, "unit": "GB"},
  "uptime": "${V_UPTIME}"${BATTERY_BLOCK}
}
EOF
