// 本地 TCP 桥接：监听 127.0.0.1:7844，经 HTTP 代理 CONNECT 转发到 Cloudflare 边缘
import net from 'node:net';

const LISTEN_PORT = 7844;
const PROXY = { host: '127.0.0.1', port: 18080 };
const EDGE = { host: '198.41.192.77', port: 7844 };

const server = net.createServer((client) => {
  let id = Math.random().toString(36).slice(2, 6);
  console.log(`[bridge ${id}] client connected`);
  const upstream = net.connect(PROXY.port, PROXY.host, () => {
    console.log(`[bridge ${id}] connected to proxy, sending CONNECT`);
    upstream.write(`CONNECT ${EDGE.host}:${EDGE.port} HTTP/1.1\r\nHost: ${EDGE.host}:${EDGE.port}\r\n\r\n`);
  });
  let handshook = false;
  let buf = Buffer.alloc(0);
  let pending = Buffer.alloc(0); // 客户端在 CONNECT 完成前发送的数据
  upstream.on('data', (chunk) => {
    if (!handshook) {
      buf = Buffer.concat([buf, chunk]);
      const idx = buf.indexOf('\r\n\r\n');
      if (idx !== -1) {
        handshook = true;
        const head = buf.slice(0, idx).toString();
        console.log(`[bridge ${id}] proxy resp:`, head.split('\r\n')[0]);
        if (!/^HTTP\/1\.[01] 2\d\d/.test(head)) {
          console.log(`[bridge ${id}] CONNECT failed, closing`);
          client.end();
          upstream.end();
          return;
        }
        const rest = buf.slice(idx + 4);
        if (rest.length) client.write(rest);
        buf = null;
        // 转发 CONNECT 前缓存的客户端数据
        if (pending.length) {
          upstream.write(pending);
          pending = null;
        }
      }
    } else {
      client.write(chunk);
    }
  });
  client.on('data', (chunk) => {
    if (handshook) upstream.write(chunk);
    else { pending = Buffer.concat([pending, chunk]); }
  });
  client.on('end', () => { console.log(`[bridge ${id}] client end`); upstream.end(); });
  upstream.on('end', () => { console.log(`[bridge ${id}] upstream end`); client.end(); });
  client.on('error', (e) => { console.log(`[bridge ${id}] client err`, e.message); upstream.destroy(); });
  upstream.on('error', (e) => { console.log(`[bridge ${id}] upstream err`, e.message); client.destroy(); });
});

server.listen(LISTEN_PORT, '127.0.0.1', () => {
  console.log(`[edge-bridge] listening 127.0.0.1:${LISTEN_PORT} -> proxy ${PROXY.host}:${PROXY.port} -> ${EDGE.host}:${EDGE.port}`);
});
