import http from 'http';
import fs from 'fs/promises';
import path from 'path';

const PORT = Number(process.env.PORT ?? 4173);
const HOST = process.env.HOST ?? '127.0.0.1';
const root = path.resolve(__dirname, '..');
const dashboardRoot = path.join(root, 'dashboard');

const mimeTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function resolveRequestPath(urlPath: string): string {
  if (urlPath === '/' || urlPath === '/index.html') {
    return path.join(dashboardRoot, 'index.html');
  }

  if (urlPath === '/styles.css' || urlPath === '/app.js') {
    return path.join(dashboardRoot, urlPath.slice(1));
  }

  if (urlPath.startsWith('/output/')) {
    return path.join(root, urlPath.slice(1));
  }

  return path.join(dashboardRoot, urlPath.slice(1));
}

const server = http.createServer(async (request, response) => {
  const urlPath = request.url ?? '/';
  const filePath = resolveRequestPath(urlPath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const extension = path.extname(filePath);
    response.writeHead(200, {
      'Content-Type': mimeTypes[extension] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(content);
  } catch (error) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(`Not found: ${urlPath}`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Atlas Brief is running at http://${HOST}:${PORT}`);
});
