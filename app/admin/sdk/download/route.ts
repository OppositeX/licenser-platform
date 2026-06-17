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

export async function GET() {
  const zip = new JSZip();
  const folder = zip.folder('licenser-sdk');
  const scripts = folder?.folder('scripts');
  if (!folder || !scripts) {
    return Response.json({ error: 'zip-init-failed' }, { status: 500 });
  }

  for (const f of ROOT_FILES) {
    const buf = await readFile(path.join(SDK_DIR, f));
    folder.file(f, buf);
  }
  for (const f of SCRIPT_FILES) {
    const buf = await readFile(path.join(SDK_DIR, 'scripts', f));
    scripts.file(f, buf);
  }

  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="licenser-sdk-php.zip"',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'no-store',
    },
  });
}
