# licenser-sdk-php

Drop-in PHP SDK for embedding [Licenser](https://licenser.gloo.ooo) licensing,
update delivery, and pre-deactivation feedback into a WordPress plugin.

Sibling to [`@gloo/licenser-client`](../licenser-client-js/) (JS/React/Node) — both
call the same REST surface and respect the same rules.

## Files

| File | Role |
|---|---|
| `SDK.php` | Public entry point: `SDK::init($cfg)`, `SDK::is_valid()`, `SDK::client()` |
| `Config.php` | Validates init args |
| `Client.php` | HTTP wrapper + state machine, single-option storage |
| `Cache.php` | 12–24h cache + update transient |
| `Cron.php` | Twice-daily background validation refresh |
| `Updater.php` | Hooks WP update transient + `plugins_api` |
| `AdminUI.php` | Settings → License page (PHP-rendered, dark mode) |
| `FeedbackModal.php` | Pre-deactivation feedback modal |
| `scripts/setup.php` | Namespace rewriter — run once after install |
| `scripts/build-release.php` | Builds a distributable zip for GitHub releases |
| `scripts/install-sdk.sh` | One-shot: copy SDK into a target plugin + rewrite namespace |

## Install

### Option A — one-shot script (recommended, macOS/Linux)

From this package directory (`packages/licenser-sdk-php/`):

```bash
./scripts/install-sdk.sh \
  ../../../my-plugin/includes/licenser-sdk \
  'MyVendor\\MyPlugin'
```

The namespace argument gets appended with `\Licenser` automatically, so pass the parent
prefix only. Backslashes must be shell-escaped (`\\`).

### Option B — manual copy + setup (Windows or when you want to inspect)

1. Copy every `*.php` file from this package root plus `scripts/setup.php` into
   `your-plugin/includes/licenser-sdk/` (matching the same layout).
2. From your plugin root, run the namespace rewriter once:

   ```bash
   php includes/licenser-sdk/scripts/setup.php --namespace=MyPlugin
   ```

   The script replaces every `__LICENSER_NAMESPACE__` placeholder so the SDK becomes
   `MyPlugin\Licenser\*`. It's idempotent — re-running with a different namespace
   updates the placeholders in place.

### Option C — release zip (for distribution outside this repo)

Build a zip you can attach to a GitHub release:

```bash
php scripts/build-release.php --version=1.0.0
# → dist/licenser-sdk-1.0.0.zip
```

Consumers unzip the result into `includes/licenser-sdk/` and run `scripts/setup.php` from
inside the zip. The zip contents are byte-identical to what `install-sdk.sh` writes.

## Wire it up

```php
require_once __DIR__ . '/includes/licenser-sdk/SDK.php';

\MyPlugin\Licenser\SDK::init([
    'server_url'   => 'https://licenser.gloo.ooo',
    'product_slug' => 'your-plugin-slug',
    'plugin_file'  => __FILE__,
    'option_key'   => 'my_plugin_license',  // unique per plugin — avoids option collisions
]);
```

Only four required keys. `plugin_slug` and `version` are auto-derived from `plugin_file`
(via `plugin_basename()` and the plugin header's `Version:` line). Pass them explicitly
only if you need to override the defaults.

The API is **static** — `SDK::init()` registers every WP hook on first call and is idempotent.
There is no `new SDK(...)` constructor and no `$sdk->boot()` method.

## Why namespace rewriting matters

Every PHP file declares `namespace __LICENSER_NAMESPACE__\Licenser;`. If two plugins
ship the SDK under the same namespace, WordPress autoloads the first one and silently
ignores the second — a "stale SDK" bug that's nearly impossible to trace. Rewriting the
namespace per-plugin (e.g. to `MyPlugin\Licenser`) makes every copy isolated.

## init() config

```php
\MyPlugin\Licenser\SDK::init([
    // Required (4 keys) — Config.php wp_die()s if any of these are missing
    'server_url'   => 'https://licenser.gloo.ooo',
    'product_slug' => 'canvas-studio',
    'plugin_file'  => __FILE__,
    'option_key'   => 'canvas_studio_license',  // unique per plugin

    // Auto-derived from plugin_file — pass explicitly only to override
    'plugin_slug'  => 'canvas-studio/canvas-studio.php',  // plugin_basename($plugin_file)
    'version'      => '1.4.2',                            // read from Plugin Header

    // Recommended (must be unique across plugins on the same site)
    'js_global'    => 'CanvasStudioLicenser',
    'css_class'    => 'canvas-studio-licenser',

    // Optional UX
    'admin_label'  => 'Canvas Studio License',
    'menu_parent'  => 'options-general.php',  // or your plugin's top-level menu slug
    'cache_hours'  => 12,    // 1-24
    'grace_days'   => 7,
    'feedback'     => true,
    'cap'          => 'manage_options',
]);
```

### Nesting License under your plugin's menu

If your plugin already calls `add_menu_page()` with slug `my-plugin`, just set
`'menu_parent' => 'my-plugin'`. If it doesn't, register one at priority 9 so the
SDK's `admin_menu` hook (priority 10) can attach to it:

```php
add_action('admin_menu', function () {
    add_menu_page('My Plugin', 'My Plugin', 'manage_options', 'my-plugin', '__return_null', 'dashicons-admin-generic', 65);
}, 9);
```

## Public API

```php
SDK::is_valid();   // bool — uses cache + grace period
SDK::client();     // Client instance for advanced ops:
//   ->activate($key)
//   ->deactivate($reason, $message)
//   ->refresh_validation()
//   ->update_check()
//   ->send_feedback($reason, $message)
//   ->state()         // current state array
```

## How updates work

1. The SDK schedules a twice-daily cron (`Cron::run`) that hits `/api/v1/validate` to keep state fresh.
2. WP triggers `pre_set_site_transient_update_plugins` → SDK calls `/api/v1/update-check`.
3. If `has_update`, the SDK injects a package URL into the update list.
4. WP downloads from `/api/v1/update?token=…`. The platform verifies the HMAC token, re-validates the license + activation, and streams the release zip.
5. After install, `upgrader_process_complete` clears the SDK's update cache.

## Grace period

If the platform is unreachable, `is_valid()` falls back to a grace period (default 7 days
from last successful validation). This prevents customer sites from breaking during a
Licenser outage.

## Security

- License key plaintext is stored only in the SDK's option (single key, never in plugin meta).
- The SDK never sends the plaintext key over HTTP except to the configured `server_url` (HTTPS strongly recommended).
- All HMAC verification happens server-side; the SDK only handles raw URLs returned by the platform.
