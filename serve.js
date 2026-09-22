/* Shangan Plan - local server (zero dependency)
   - gzip compression for text assets (much faster over WiFi)
   - ETag / 304 revalidation (no re-download when unchanged)
   - filters out virtual adapters, real WiFi/Ethernet IP listed first
   - writes URLs to 访问地址.txt and auto-opens the browser */
var http = require('http');
var fs = require('fs');
var path = require('path');
var os = require('os');
var zlib = require('zlib');
var exec = require('child_process').exec;

var PORT = Number(process.env.PORT) || 4000;
var ROOT = __dirname;
var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};
var GZIP_EXT = /\.(html|css|js|json|svg|md|txt)$/i;
var VIRTUAL = /virtual|vmware|vbox|vethernet|hyper-v|wsl|docker|zerotier|tailscale|loopback|tunnel|bluetooth|pseudo/i;

var server = http.createServer(function (req, res) {
  /* URL 解码要兜住畸形百分号编码：浏览器扩展、爬虫或手工输入的
     '/%zz'、'/100%' 会让 decodeURIComponent 抛 URIError，
     未捕获的话整个服务进程会直接退出（曾经真的因此挂掉过一次）。 */
  var urlPath;
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('400 请求地址编码不合法');
    return;
  }

  /* ===== 局域网同步存储：GET 取云端状态 / PUT 存状态 ===== */
  var SYNC_FILE = path.join(ROOT, '_sync-data.json');
  if (urlPath === '/api/sync') {
    if (req.method === 'GET') {
      fs.readFile(SYNC_FILE, function (serr, data) {
        if (serr) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ ok: true, data: null, savedAt: 0 }));
          return;
        }
        try {
          var sd = JSON.parse(data.toString('utf8'));
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ ok: true, data: sd.data || null, savedAt: sd.savedAt || 0 }));
        } catch (e2) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'corrupt' }));
        }
      });
      return;
    }
    if (req.method === 'PUT') {
      var sbody = '';
      var over = false;
      req.on('data', function (c) {
        if (sbody.length > 8 * 1024 * 1024) { over = true; return; }
        sbody += c;
      });
      req.on('end', function () {
        if (over) { res.writeHead(413, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false })); return; }
        try {
          var sparsed = JSON.parse(sbody);
          if (!sparsed || !sparsed.meta || !Array.isArray(sparsed.tasks)) throw new Error('bad');
          fs.mkdir(path.dirname(SYNC_FILE), { recursive: true }, function () {
            var wrap = { savedAt: Date.now(), data: sparsed };
            fs.writeFile(SYNC_FILE, JSON.stringify(wrap), 'utf8', function (werr) {
              if (werr) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: werr.message })); return; }
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ ok: true, savedAt: wrap.savedAt }));
            });
          });
        } catch (e3) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'bad request' }));
        }
      });
      return;
    }
  }

  /* DeepSeek 出题代理：浏览器把请求转给本地服务器，由服务器转发到官方 API，避免跨域问题 */
  if (urlPath === '/api/deepseek' && req.method === 'POST') {
    var body = '';
    req.on('data', function (c) { body += c; });
    req.on('end', function () {
      try {
        var parsed = JSON.parse(body);
        var key = String(parsed.key || '');
        delete parsed.key;
        if (!key) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: { message: 'missing api key' } }));
          return;
        }
        var https = require('https');
        var apiReq = https.request({
          hostname: 'api.deepseek.com',
          path: '/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + key,
            'Content-Length': Buffer.byteLength(JSON.stringify(parsed))
          }
        }, function (apiRes) {
          var out = '';
          apiRes.on('data', function (c) { out += c; });
          apiRes.on('end', function () {
            res.writeHead(apiRes.statusCode || 502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(out);
          });
        });
        apiReq.on('error', function (err) {
          res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: { message: 'proxy: ' + err.message } }));
        });
        apiReq.write(JSON.stringify(parsed));
        apiReq.end();
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { message: 'bad request' } }));
      }
    });
    return;
  }

  if (urlPath === '/') urlPath = '/index.html';
  var file = path.normalize(path.join(ROOT, urlPath));
  if (file.indexOf(ROOT) !== 0) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.stat(file, function (err, st) {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    var ext = path.extname(file).toLowerCase();
    var etag = '"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
    var headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'ETag': etag
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }

    /* 大文件（课本 PDF 等）支持 Range + 流式传输，浏览器可在线翻阅、拖动进度 */
    var range = req.headers.range;
    if (range && /^bytes=\d*-\d*$/.test(range)) {
      var m = range.match(/(\d*)-(\d*)/);
      var start = m[1] === '' ? Math.max(st.size - 65536, 0) : +m[1];
      var end = m[2] === '' ? st.size - 1 : Math.min(+m[2], st.size - 1);
      if (start > end) { res.writeHead(416, headers); res.end(); return; }
      var rHeaders = Object.assign({}, headers, {
        'Content-Range': 'bytes ' + start + '-' + end + '/' + st.size,
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes'
      });
      res.writeHead(206, rHeaders);
      fs.createReadStream(file, { start: start, end: end }).pipe(res);
      return;
    }

    var bigFile = st.size > 5 * 1024 * 1024;
    if (bigFile) {
      res.writeHead(200, Object.assign({}, headers, { 'Content-Length': st.size, 'Accept-Ranges': 'bytes' }));
      fs.createReadStream(file).pipe(res);
      return;
    }

    fs.readFile(file, function (rerr, data) {
      if (rerr) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404'); return; }
      var canGzip = GZIP_EXT.test(ext) && data.length > 1024 &&
        /\bgzip\b/i.test(req.headers['accept-encoding'] || '');
      if (canGzip) {
        var gzHeaders = Object.assign({}, headers, { 'Content-Encoding': 'gzip' });
        res.writeHead(200, gzHeaders);
        zlib.gzip(data, function (zerr, gz) {
          if (zerr) { res.end(data); } else { res.end(gz); }
        });
      } else {
        res.writeHead(200, headers);
        res.end(data);
      }
    });
  });
});

server.on('error', function (err) {
  if (err.code === 'EADDRINUSE') {
    console.log('Port ' + PORT + ' is already in use.');
    console.log('The app is probably already running. Open:');
    console.log('  http://localhost:' + PORT);
    try {
      if (process.platform === 'win32') {
        exec('start "" "http://localhost:' + PORT + '"', { windowsHide: true });
      } else if (process.platform === 'darwin') {
        exec('open http://localhost:' + PORT);
      } else {
        exec('xdg-open http://localhost:' + PORT);
      }
    } catch (e) {}
  } else {
    console.log('Server error: ' + err.message);
  }
});

server.listen(PORT, '0.0.0.0', function () {
  var real = [];
  var others = [];
  var nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (name) {
    (nets[name] || []).forEach(function (i) {
      if (i.family !== 'IPv4' || i.internal) return;
      if (VIRTUAL.test(name)) others.push({ addr: i.address, name: name });
      else real.push({ addr: i.address, name: name });
    });
  });
  var list = real.concat(others);

  var consoleLines = [];
  consoleLines.push('================================================');
  consoleLines.push('  SHANGAN PLAN IS RUNNING  (port ' + PORT + ')');
  consoleLines.push('================================================');
  consoleLines.push('');
  consoleLines.push('  PC    :  http://localhost:' + PORT);
  consoleLines.push('  PHONE :  (phone and PC must be on the SAME WiFi)');
  list.forEach(function (e, idx) {
    consoleLines.push('           http://' + e.addr + ':' + PORT + (idx === 0 ? '   <- try this one first' : ''));
  });
  if (!list.length) {
    consoleLines.push('           (no LAN address found, check your WiFi)');
  }
  consoleLines.push('');
  consoleLines.push('  Browser opens automatically. If not, type the URL above.');
  consoleLines.push('  These URLs are also saved in the file: 访问地址.txt');
  consoleLines.push('  Keep this window open while using the app. Ctrl+C to stop.');
  consoleLines.push('');
  consoleLines.forEach(function (l) { console.log(l); });

  var fileLines = consoleLines.slice();
  list.forEach(function (e, idx) {
    fileLines.push('  ( ' + (idx + 1) + ' ) http://' + e.addr + ':' + PORT + '   adapter: ' + e.name + (idx === 0 ? '   <- recommended' : ''));
  });
  try {
    fs.writeFileSync(path.join(ROOT, '访问地址.txt'), fileLines.join(os.EOL) + os.EOL, 'utf8');
  } catch (e) {}

  /* 兜底：任何未被捕获的异常都不该让本地服务悄悄退出——
     服务一停，用户那边只是「页面打不开」，很难联想到真实原因。 */
  process.on('uncaughtException', function (err) {
    console.error('\n[serve] 未捕获异常（服务继续运行）：', err && err.message ? err.message : err);
  });
  process.on('unhandledRejection', function (err) {
    console.error('\n[serve] 未处理的 Promise 拒绝（服务继续运行）：', err && err.message ? err.message : err);
  });

  try {
    if (process.platform === 'win32') {
      exec('start "" "http://localhost:' + PORT + '"', { windowsHide: true });
    } else if (process.platform === 'darwin') {
      exec('open http://localhost:' + PORT);
    } else {
      exec('xdg-open http://localhost:' + PORT);
    }
  } catch (e) {}
});
