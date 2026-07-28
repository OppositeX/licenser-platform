# @gloo/licenser-client

Isomorphic TypeScript client + React hook for the [Licenser platform](https://licenser.gloo.ooo).

- ✅ Works in Node 18+, modern browsers, Bun, Deno, edge runtimes
- ✅ Zero runtime dependencies (uses native `fetch`)
- ✅ Optional React hook with cache, dedup, and focus revalidation
- ✅ Full TypeScript types

## Install

```bash
npm i @gloo/licenser-client
```

## Quick start (Node / server-side — recommended)

```ts
import { LicenserClient } from '@gloo/licenser-client';

const licenser = new LicenserClient({
  endpoint: 'https://licenser.gloo.ooo',
  productSlug: 'cnvs-runtime',
});

const result = await licenser.validate({
  key: 'LIC-XXXX-XXXX-XXXX-XXXX',
  domain: 'customer.com',
});

if (result.active) {
  console.log('Tier:', result.tier, 'Features:', result.features);
}
```

## React hook

```tsx
import { LicenseProvider, useLicense } from '@gloo/licenser-client/react';

function Root() {
  return (
    <LicenseProvider endpoint="https://licenser.gloo.ooo" productSlug="cnvs-runtime">
      <App />
    </LicenseProvider>
  );
}

function App() {
  const { license, loading, error, refresh } = useLicense({
    key: 'LIC-XXXX-XXXX-XXXX-XXXX',
  });

  if (loading) return <p>Checking license…</p>;
  if (error) return <p>Error: {error.message}</p>;
  if (!license?.active) return <p>License invalid: {license?.reason}</p>;

  return (
    <div>
      <p>Tier: {license.tier}</p>
      {license.features.includes('ai-relay') && <AiPanel />}
      <button onClick={refresh}>Refresh</button>
    </div>
  );
}
```

The hook:

- Validates on mount, then every `refreshIntervalMs` (default 1 hour)
- Revalidates on window focus
- Dedupes concurrent calls for the same key (one HTTP request, many subscribers)
- Caches across the process — two components with the same key share state

## Security note

The browser can call `/api/v2/validate` directly (CORS-open). That means any
license key embedded in client JS is **copyable by users**. For production:

- **Best:** keep the license key on your server, call `LicenserClient.validate()`
  from a Next.js / Express / Remix route handler, return the result (not the key)
  to the browser.
- **OK for tier-gated features in dev / sample apps:** call from the browser, but
  treat unauthorised access as a soft gate, not a security boundary.

## API

### `new LicenserClient(options)`

| Option | Type | Default | |
|---|---|---|---|
| `endpoint` | string | required | base URL of the Licenser platform |
| `productSlug` | string | – | sent as `slug` on every `validate()` |
| `timeoutMs` | number | `8000` | per-request timeout |
| `fetch` | function | `globalThis.fetch` | inject a custom fetch (testing / Next.js cache) |
| `headers` | record | – | extra headers on every call |

### Methods

```ts
client.activate({ key, domain, plugin_version, ... })
client.deactivate({ key, domain, instance_token })
client.validate({ key, domain, slug?, fingerprint? })   // CORS-open
client.validateLegacy({ key, site_url })                // v1 shape
client.check({ key, site_url })                         // heartbeat
client.updateCheck({ key, current })
client.updateUrl({ key, version })                      // returns the signed URL string
client.feedback({ key, reason, message })
```

All methods accept an optional `AbortSignal` as the last argument.

### `useLicense(options)`

| Option | Type | Default |
|---|---|---|
| `key` | string | (required) |
| `endpoint` | string | from `<LicenseProvider>` |
| `productSlug` | string | from `<LicenseProvider>` |
| `domain` | string | `window.location.hostname` |
| `fingerprint` | string | – |
| `refreshIntervalMs` | number | 3,600,000 (1 hour) |
| `revalidateOnFocus` | boolean | `true` |
| `dedupeMs` | number | 60,000 |
| `client` | LicenserClient | from `<LicenseProvider>` |

Returns `{ license, loading, error, refresh }`.

## License

MIT
