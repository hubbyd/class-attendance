#!/usr/bin/env bash
# 一键线上部署：edge-bridge → cloudflared quick tunnel → 后端服务
# 用法: bash scripts/online.sh
# 依赖: node, cloudflared, curl; 出网代理 http://127.0.0.1:18080

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROXY="${HTTPS_PROXY:-http://127.0.0.1:18080}"
CLOUDFLARED_DIR="$ROOT/.cloudflared"
BRIDGE_PORT=7844
SERVER_PORT="${PORT:-3001}"

mkdir -p "$CLOUDFLARED_DIR"

log() { printf '\033[1;36m[online]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[online] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- 0. 前置检查 ----------
command -v cloudflared >/dev/null || die "未安装 cloudflared"
command -v curl >/dev/null || die "未安装 curl"
command -v node >/dev/null || die "未安装 node"

# ---------- 1. /etc/hosts 把边缘域名指到本地桥接 ----------
EDGE_HOSTS="region1.v2.argotunnel.com region2.v2.argotunnel.com"
NEED_HOSTS=0
for h in $EDGE_HOSTS; do
  if ! grep -q "$h" /etc/hosts 2>/dev/null; then NEED_HOSTS=1; break; fi
done
if [ "$NEED_HOSTS" -eq 1 ]; then
  log "写入 /etc/hosts 边缘域名重定向（需要 root）"
  if [ "$(id -u)" -eq 0 ]; then
    echo "127.0.0.1 $EDGE_HOSTS" >> /etc/hosts
  else
    echo "127.0.0.1 $EDGE_HOSTS" | sudo tee -a /etc/hosts >/dev/null || die "无法写入 /etc/hosts"
  fi
fi

# ---------- 2. 清理旧进程 ----------
log "清理旧进程..."
pkill -f "node scripts/edge-bridge.js" 2>/dev/null || true
pkill -f "cloudflared tunnel" 2>/dev/null || true
pkill -f "node server/index.js" 2>/dev/null || true
sleep 1

# ---------- 3. 启动 edge-bridge ----------
log "启动 edge-bridge (127.0.0.1:$BRIDGE_PORT -> proxy -> cloudflare edge)"
node scripts/edge-bridge.js > "$ROOT/.cloudflared/bridge.log" 2>&1 &
BRIDGE_PID=$!
sleep 1
kill -0 "$BRIDGE_PID" 2>/dev/null || die "edge-bridge 启动失败，查看 .cloudflared/bridge.log"

# ---------- 4. 申请快速隧道 ----------
log "向 Cloudflare 申请快速隧道..."
TUNNEL_JSON=$(curl -s -x "$PROXY" -X POST https://api.trycloudflare.com/tunnel \
  -H "Content-Type: application/json" -d '{}')
echo "$TUNNEL_JSON" | grep -q '"success":true' || die "隧道申请失败: $TUNNEL_JSON"

TUNNEL_ID=$(echo "$TUNNEL_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).result.id)})")
TUNNEL_NAME=$(echo "$TUNNEL_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).result.name)})")
TUNNEL_HOST=$(echo "$TUNNEL_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).result.hostname)})")
TUNNEL_SECRET=$(echo "$TUNNEL_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).result.secret)})")
ACCOUNT_TAG=$(echo "$TUNNEL_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).result.account_tag)})")

PUBLIC_URL="https://$TUNNEL_HOST"
log "隧道: $TUNNEL_ID"
log "公网地址: $PUBLIC_URL"

# ---------- 5. 写凭证 + 配置 ----------
cat > "$CLOUDFLARED_DIR/$TUNNEL_ID.json" <<EOF
{"AccountTag":"$ACCOUNT_TAG","TunnelID":"$TUNNEL_ID","TunnelName":"$TUNNEL_NAME","TunnelSecret":"$TUNNEL_SECRET"}
EOF

cat > "$CLOUDFLARED_DIR/config.yml" <<EOF
tunnel: $TUNNEL_ID
credentials-file: $CLOUDFLARED_DIR/$TUNNEL_ID.json
protocol: http2
ingress:
  - hostname: $TUNNEL_HOST
    service: http://localhost:$SERVER_PORT
  - service: http_status:404
EOF

# ---------- 6. 启动后端（带 PUBLIC_URL） ----------
log "启动后端服务 (localhost:$SERVER_PORT)"
PUBLIC_URL="$PUBLIC_URL" node server/index.js > "$ROOT/.cloudflared/server.log" 2>&1 &
SERVER_PID=$!
sleep 1
kill -0 "$SERVER_PID" 2>/dev/null || die "后端启动失败，查看 .cloudflared/server.log"

# ---------- 7. 启动 cloudflared ----------
log "启动 cloudflared 隧道..."
cloudflared tunnel --config "$CLOUDFLARED_DIR/config.yml" run > "$ROOT/.cloudflared/cloudflared.log" 2>&1 &
CLOUDFLARED_PID=$!

# ---------- 8. 等待隧道就绪 ----------
log "等待隧道注册..."
READY=0
for i in $(seq 1 30); do
  if grep -q "Registered tunnel connection" "$ROOT/.cloudflared/cloudflared.log" 2>/dev/null; then
    READY=1; break
  fi
  sleep 1
done
if [ "$READY" -ne 1 ]; then
  log "隧道注册超时，查看日志: tail -50 .cloudflared/cloudflared.log"
  die "隧道未就绪"
fi

# ---------- 9. 验证公网可达 ----------
log "验证公网可达..."
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' -x "$PROXY" "$PUBLIC_URL/" || echo "000")
if [ "$HTTP_CODE" != "200" ]; then
  die "公网首页返回 $HTTP_CODE，隧道可能未就绪"
fi

echo
echo "========================================"
echo "  ✅ 部署成功！"
echo "  公网地址: $PUBLIC_URL"
echo "  教师端: $PUBLIC_URL/"
echo "  学生端扫码教师页面内的二维码即可"
echo "========================================"
echo
echo "进程 PID: bridge=$BRIDGE_PID server=$SERVER_PID cloudflared=$CLOUDFLARED_PID"
echo "停止: pkill -f edge-bridge; pkill -f cloudflared; pkill -f 'node server/index.js'"
echo

# 前台持有，保持进程存活
wait
