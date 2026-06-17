<?php
/**
 * Build a distributable zip of the Licenser SDK.
 *
 * Usage:
 *   php scripts/build-release.php [--version=1.0.0] [--out=dist]
 *
 * The output zip contains every PHP file in the SDK root plus the setup.php
 * script. It's the artefact you attach to a GitHub release; consumers drop it
 * into their plugin's `includes/` directory and run `php setup.php`.
 *
 * Requires the PHP `zip` extension. Build artifacts go to `dist/` by default.
 */

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This script must be run from the command line.\n");
    exit(1);
}
if (!class_exists('ZipArchive')) {
    fwrite(STDERR, "The PHP zip extension is required.\n");
    exit(1);
}

$opts    = getopt('', ['version::', 'out::', 'help::']);
if (isset($opts['help'])) {
    echo "Usage: php scripts/build-release.php [--version=1.0.0] [--out=dist]\n";
    exit(0);
}
$version = $opts['version'] ?? null;
$outDir  = $opts['out'] ?? 'dist';

$sdkDir = realpath(__DIR__ . '/..');
if (!$sdkDir) { fwrite(STDERR, "Cannot resolve SDK root.\n"); exit(1); }

// Auto-version from README if not provided. Falls back to today's date.
if ($version === null) {
    $readme = @file_get_contents($sdkDir . '/README.md');
    if ($readme && preg_match('/version[:\s]+(\d+\.\d+\.\d+)/i', $readme, $m)) {
        $version = $m[1];
    } else {
        $version = date('Y.m.d');
    }
}

$outDirAbs = $sdkDir . '/' . $outDir;
@mkdir($outDirAbs, 0775, true);
$zipPath = $outDirAbs . "/licenser-sdk-{$version}.zip";

$zip = new ZipArchive();
if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
    fwrite(STDERR, "Cannot create {$zipPath}\n");
    exit(1);
}

// Files at the SDK root we want to ship.
$includes = ['SDK.php', 'Client.php', 'Cache.php', 'Config.php', 'Cron.php', 'Updater.php', 'FeedbackModal.php', 'AdminUI.php', 'README.md'];
$added = 0;

foreach ($includes as $f) {
    $src = $sdkDir . '/' . $f;
    if (!is_file($src)) {
        fwrite(STDOUT, "  skip (missing): {$f}\n");
        continue;
    }
    $zip->addFile($src, "licenser-sdk/{$f}");
    $added++;
}

// Include setup.php under scripts/ so the zip layout matches install-sdk.sh
// and the docs (consumers run `php includes/licenser-sdk/scripts/setup.php`).
$setup = __DIR__ . '/setup.php';
if (is_file($setup)) {
    $zip->addFile($setup, 'licenser-sdk/scripts/setup.php');
    $added++;
}

// Add a minimal INSTALL.md (kept inside the zip alongside README).
$installMd = <<<MD
# Installing the Licenser SDK

1. Unzip into your plugin: `<your-plugin>/includes/licenser-sdk/`
2. Run the namespace rewriter from your plugin root:

   ```
   php includes/licenser-sdk/scripts/setup.php --namespace=MyPlugin
   ```

   Replace `MyPlugin` with your plugin's PHP namespace prefix. The script
   rewrites every SDK file in-place so the namespace becomes `MyPlugin\Licenser\*`.

3. Wire it up in your main plugin file:

   ```php
   require_once __DIR__ . '/includes/licenser-sdk/SDK.php';
   \MyPlugin\Licenser\SDK::init([
       'server_url'   => 'https://licenser-platform.vercel.app',
       'product_slug' => 'your-plugin-slug',
       'plugin_file'  => __FILE__,
       'plugin_slug'  => 'your-plugin/your-plugin.php',
       'version'      => '1.0.0',
       'option_key'   => 'your_plugin_license',
   ]);
   ```

That's it — the SDK now handles activation, validation, updates, and feedback.
MD;
$zip->addFromString('licenser-sdk/INSTALL.md', $installMd);
$added++;

$zip->close();

fwrite(STDOUT, "Built {$zipPath}\n");
fwrite(STDOUT, "Files: {$added}\n");
fwrite(STDOUT, "Size : " . round(filesize($zipPath) / 1024, 1) . " KB\n");
