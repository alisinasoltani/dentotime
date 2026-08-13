import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:https';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const certificateDirectory = mkdtempSync(join(tmpdir(), 'dentotime-e2e-'));
const keyPath = join(certificateDirectory, 'key.pem');
const certificatePath = join(certificateDirectory, 'certificate.pem');
const certificate = spawnSync(
  'openssl',
  [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath,
    '-out', certificatePath,
    '-days', '1',
    '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1',
  ],
  { stdio: 'ignore' },
);

if (certificate.status !== 0) {
  rmSync(certificateDirectory, { recursive: true, force: true });
  throw new Error('OpenSSL is required to generate the temporary E2E TLS certificate.');
}

const publicDoctor = {
  id: 42,
  first_name: 'سارا',
  last_name: 'پزشک',
  display_name: 'سارا پزشک',
  clinic_name: 'کلینیک آزمون',
  profile_picture: null,
  likes_count: 7,
  average_rating: 4.5,
  vote_count: 8,
};

function handleMockApi(request, response) {
    const path = new URL(request.url ?? '/', 'https://127.0.0.1').pathname;
    let body;
    if (path === '/api/v1/doctors/list/') {
      body = { count: 1, next: null, previous: null, results: [publicDoctor] };
    } else if (path === '/api/v1/doctors/preview/') {
      body = [publicDoctor];
    } else if (path === '/api/v1/doctors/42/') {
      body = { ...publicDoctor, is_liked: false };
    } else if (path === '/api/v1/doctors/42/reviews/') {
      body = { count: 0, next: null, previous: null, results: [] };
    } else {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end('{"detail":"Not found"}');
      return false;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
    return true;
}

const apiServer = createServer(
  {
    key: readFileSync(keyPath),
    cert: readFileSync(certificatePath),
  },
  handleMockApi,
);
apiServer.listen(3102, '127.0.0.1');

const nextServer = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3101'],
  {
    env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' },
    stdio: 'inherit',
  },
);

const proxy = createServer(
  {
    key: readFileSync(keyPath),
    cert: readFileSync(certificatePath),
  },
  (request, response) => {
    if ((request.url ?? '').startsWith('/api/v1/doctors/')) {
      handleMockApi(request, response);
      return;
    }
    const upstream = httpRequest(
      {
        hostname: '127.0.0.1',
        port: 3101,
        method: request.method,
        path: request.url,
        headers: { ...request.headers, host: '127.0.0.1:3101' },
      },
      (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      },
    );
    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(502);
      response.end('Application server is starting.');
    });
    request.pipe(upstream);
  },
);

proxy.listen(3100, '127.0.0.1');

function shutdown() {
  proxy.close();
  apiServer.close();
  nextServer.kill();
  rmSync(certificateDirectory, { recursive: true, force: true });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
process.once('exit', () => {
  rmSync(certificateDirectory, { recursive: true, force: true });
});
