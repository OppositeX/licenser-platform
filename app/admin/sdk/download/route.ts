import type { NextRequest } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

export const dynamic = 'force-dynamic';

const SDK_DIR = path.join(process.cwd(), 'packages', 'licenser-sdk-php');

const ROOT_FILES = [
  'SDK.php',
  'Client.php',
  'Cache.php',
  'Config.php',
  'Cron.php',
  'Updater.php',
  'FeedbackModal.php',
  'AdminUI.php',
  'README.md',
];

const SCRIPT_FILES = ['setup.php'];

// Same shape as scripts/setup.php's regex: PascalCase segments joined by `\`.
// e.g. `MyPlugin`, `Acme\AwesomePlugin`, `Gloo\WcComplimentaryProducts`.
const NAMESPACE_RE = /^[A-Z][A-Za-z0-9_]*(?:\\[A-Z][A-Za-z0-9_]*)*$/;

const PLACEHOLDER = '__LICENSER_NAMESPACE__';

function rewriteIfText(filename: string, buf: Buffer, namespace: string | null): Buffer | string {
  if (!namespace) return buf;
  if (!/\.(php|md)$/i.test(filename)) return buf;
  return buf.toString('utf8').replaceAll(PLACEHOLDER, namespace);
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('namespace');
  let namespace: string | null = null;
  if (raw) {
    if (!NAMESPACE_RE.test(raw)) {
      return Response.json(
        { error: 'invalid-namespace', message: 'Must be PascalCase, optionally with \\ between segments, e.g. Acme\\AwesomePlugin.' },
        { status: 400 },
      );
    }
    namespace = raw;
  }

  const zip = new JSZip();
  const folder = zip.folder('licenser-sdk');
  const scripts = folder?.folder('scripts');
  if (!folder || !scripts) {
    return Response.json({ error: 'zip-init-failed' }, { status: 500 });
  }

  for (const f of ROOT_FILES) {
    const buf = await readFile(path.join(SDK_DIR, f));
    folder.file(f, rewriteIfText(f, buf, namespace));
  }
  for (const f of SCRIPT_FILES) {
    const buf = await readFile(path.join(SDK_DIR, 'scripts', f));
    scripts.file(f, rewriteIfText(f, buf, namespace));
  }

  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const filename = namespace
    ? `licenser-sdk-${namespace.replaceAll('\\', '-').toLowerCase()}.zip`
    : 'licenser-sdk-php.zip';

  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'no-store',
    },
  });
}
