'use client';

import { useMemo, useState } from 'react';

const NAMESPACE_RE = /^[A-Z][A-Za-z0-9_]*(?:\\[A-Z][A-Za-z0-9_]*)*$/;
const SLUG_RE = /^[a-z][a-z0-9-]*$/;

const PANEL: React.CSSProperties = {
  background: '#1a1d24',
  border: '1px solid #2a2e36',
  borderRadius: 10,
  padding: 18,
  marginBottom: 12,
};

const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#cbd5e1',
  textTransform: 'uppercase',
  letterSpacing: '.04em',
  marginBottom: 6,
};

const INPUT: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #353a44',
  background: '#0f1116',
  color: '#e6e8eb',
  fontFamily: 'monospace',
  fontSize: 13,
};

const HINT: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: 11,
  marginTop: 4,
  lineHeight: 1.5,
};

const ERR: React.CSSProperties = {
  color: '#fca5a5',
  fontSize: 11,
  marginTop: 4,
};

const PRE: React.CSSProperties = {
  background: '#0f1116',
  border: '1px solid #2a2e36',
  borderRadius: 6,
  padding: 14,
  margin: 0,
  fontSize: 12,
  lineHeight: 1.6,
  color: '#e6e8eb',
  overflow: 'auto',
  whiteSpace: 'pre',
};

function optionKeyFromSlug(slug: string): string {
  return slug.replaceAll('-', '_') + '_license';
}

function pluginSlugFromNamespace(ns: string): string {
  // Acme\AwesomePlugin -> acme-awesome-plugin (rough best-guess for the WP "dir/main.php" hint)
  const last = ns.split('\\').pop() ?? ns;
  return last.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export default function WpInstallForm({ base }: { base: string }) {
  const [namespace, setNamespace] = useState('Acme\\AwesomePlugin');
  const [slug, setSlug] = useState('awesome-plugin');
  const [optionKey, setOptionKey] = useState('');
  const [menuParent, setMenuParent] = useState('options-general.php');
  const [copied, setCopied] = useState(false);

  const namespaceOk = NAMESPACE_RE.test(namespace);
  const slugOk = SLUG_RE.test(slug);
  const effectiveOptionKey = optionKey.trim() || optionKeyFromSlug(slug);
  const downloadUrl = namespaceOk
    ? `/admin/sdk/download?namespace=${encodeURIComponent(namespace)}`
    : '/admin/sdk/download';

  const pluginDir = pluginSlugFromNamespace(namespace);
  const pluginFile = `${pluginDir}/${pluginDir}.php`;

  const snippet = useMemo(() => {
    const lines = [
      `require_once __DIR__ . '/includes/licenser-sdk/SDK.php';`,
      ``,
      `\\${namespace}\\Licenser\\SDK::init([`,
      `    'server_url'   => '${base}',`,
      `    'product_slug' => '${slug}',`,
      `    'plugin_file'  => __FILE__,`,
      `    'option_key'   => '${effectiveOptionKey}',`,
    ];
    if (menuParent && menuParent !== 'options-general.php') {
      lines.push(`    'menu_parent'  => '${menuParent}',  // submenu under your plugin's top-level menu`);
    }
    lines.push(`]);`);
    return lines.join('\n');
  }, [namespace, slug, effectiveOptionKey, menuParent, base]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can still select & copy manually */
    }
  }

  return (
    <div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginBottom: 14 }}>
        <div>
          <label style={LABEL}>PHP namespace</label>
          <input
            style={{ ...INPUT, borderColor: namespaceOk ? '#353a44' : '#7f1d1d' }}
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
          {namespaceOk ? (
            <p style={HINT}>
              SDK will become <code style={{ color: '#a78bfa' }}>{namespace}\Licenser\SDK</code>.
            </p>
          ) : (
            <p style={ERR}>
              Must be PascalCase, optionally with <code>\</code> between segments (e.g. <code>Acme\AwesomePlugin</code>).
            </p>
          )}
        </div>

        <div>
          <label style={LABEL}>Product slug</label>
          <input
            style={{ ...INPUT, borderColor: slugOk ? '#353a44' : '#7f1d1d' }}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
          {slugOk ? (
            <p style={HINT}>Must match the slug on <a href="/admin/products" style={{ color: '#a78bfa' }}>/admin/products</a>.</p>
          ) : (
            <p style={ERR}>Lowercase letters, digits, and hyphens only.</p>
          )}
        </div>

        <div>
          <label style={LABEL}>Option key (WP DB)</label>
          <input
            style={INPUT}
            value={optionKey}
            placeholder={optionKeyFromSlug(slug)}
            onChange={(e) => setOptionKey(e.target.value)}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
          <p style={HINT}>Unique per plugin. Defaults to <code>{optionKeyFromSlug(slug)}</code> if blank.</p>
        </div>

        <div>
          <label style={LABEL}>Menu parent</label>
          <input
            style={INPUT}
            value={menuParent}
            onChange={(e) => setMenuParent(e.target.value)}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
          <p style={HINT}>
            <code>options-general.php</code> = Settings menu (default). Pass your plugin's top-level menu slug to nest the License page under it.
          </p>
        </div>
      </div>

      <div style={PANEL}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 600 }}>1. Download the pre-rewritten SDK</div>
          <a
            href={downloadUrl}
            aria-disabled={!namespaceOk}
            style={{
              display: 'inline-block',
              background: namespaceOk ? '#7c3aed' : '#3a3450',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              padding: '8px 14px',
              borderRadius: 6,
              textDecoration: 'none',
              pointerEvents: namespaceOk ? 'auto' : 'none',
            }}
          >
            ⬇ Download zip
          </a>
        </div>
        <p style={{ color: '#94a3b8', fontSize: 12, margin: 0, lineHeight: 1.6 }}>
          Server-side namespace rewrite — the zip arrives with every <code style={{ color: '#a78bfa' }}>__LICENSER_NAMESPACE__</code> already replaced by <code style={{ color: '#a78bfa' }}>{namespaceOk ? namespace : '…'}</code>. No <code style={{ color: '#a78bfa' }}>php setup.php</code> step needed. Extract into <code style={{ color: '#a78bfa' }}>{pluginDir}/includes/</code>.
        </p>
      </div>

      <div style={PANEL}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 600 }}>2. Paste this into <code style={{ color: '#a78bfa' }}>{pluginFile}</code></div>
          <button
            type="button"
            onClick={copy}
            disabled={!namespaceOk || !slugOk}
            style={{
              background: copied ? '#166534' : '#2a2e36',
              color: '#fff',
              border: '1px solid #353a44',
              fontSize: 12,
              fontWeight: 600,
              padding: '6px 12px',
              borderRadius: 6,
              cursor: namespaceOk && slugOk ? 'pointer' : 'not-allowed',
            }}
          >
            {copied ? '✓ Copied' : 'Copy snippet'}
          </button>
        </div>
        <pre style={PRE}>{snippet}</pre>
        <p style={{ color: '#94a3b8', fontSize: 12, margin: '10px 0 0', lineHeight: 1.6 }}>
          Place this near the top of your main plugin file, after the Plugin Header comment. <code style={{ color: '#a78bfa' }}>plugin_slug</code> and <code style={{ color: '#a78bfa' }}>version</code> are auto-detected from <code style={{ color: '#a78bfa' }}>plugin_file</code>; override only if you need to.
        </p>
      </div>
    </div>
  );
}
