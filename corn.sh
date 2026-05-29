#!/bin/bash
# ============================================================
# 系统资源采集脚本
# 使用 cron 每 30 秒执行一次，写入 dashboard.json
# ============================================================
CPU=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
MEM_USED=$(free -m | awk '/^Mem:/{print $3}')
MEM_TOTAL=$(free -m | awk '/^Mem:/{print $2}')
DISK_USED=$(df -h / | awk 'NR==2{print $3}' | sed 's/G//')
DISK_TOTAL=$(df -h / | awk 'NR==2{print $2}' | sed 's/G//')
UPTIME=$(uptime -p | sed 's/up //')

cat > /path/to/Blog/dashboard.json <<EOF
{
  "cpu": ${CPU},
  "memory": { "used": ${MEM_USED}, "total": ${MEM_TOTAL}, "unit": "MB" },
  "disk": { "used": ${DISK_USED}, "total": ${DISK_TOTAL}, "unit": "GB" },
  "uptime": "${UPTIME}"
}
EOF
