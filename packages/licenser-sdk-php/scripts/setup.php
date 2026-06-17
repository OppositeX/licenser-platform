<?php
/**
 * Licenser SDK setup script.
 *
 * Replaces the `__LICENSER_NAMESPACE__` placeholder in every SDK file with
 * the host plugin's namespace, so multiple SDK copies on the same WordPress
 * site don't collide.
 *
 * Run ONCE after dropping the SDK into your plugin:
 *
 *   php sdk/scripts/setup.php --namespace="MyPlugin"
 *
 * Or interactively (prompts for namespace):
 *
 *   php sdk/scripts/setup.php
 *
 * The script is idempotent — re-running with a different namespace updates the
 * placeholders. Safe to commit the rewritten files; they're no longer generic.
 */

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This script must be run from the command line.\n");
    exit(1);
}

$opts = getopt('', ['namespace::', 'help::', 'dir::']);

if (isset($opts['help'])) {
    echo <<<HELP
Usage: php setup.php [--namespace=Name] [--dir=path]

  --namespace=Name   PHP namespace prefix to inject (e.g. MyPlugin). The SDK will
                     live at <Name>\Licenser\* after rewriting.
  --dir=path         SDK directory to rewrite. Defaults to the parent of this script.
  --help             Show this help.

HELP;
    exit(0);
}

$sdkDir = $opts['dir'] ?? realpath(__DIR__ . '/..');
if (!$sdkDir || !is_dir($sdkDir)) {
    fwrite(STDERR, "Cannot resolve SDK directory: {$sdkDir}\n");
    exit(1);
}

$ns = $opts['namespace'] ?? null;
if ($ns === null || $ns === '') {
    fwrite(STDOUT, "Plugin namespace (e.g. MyPlugin): ");
    $ns = trim((string) fgets(STDIN));
}

if (!preg_match('/^[A-Z][A-Za-z0-9_]*(?:\\\\[A-Z][A-Za-z0-9_]*)*$/', $ns)) {
    fwrite(STDERR, "Namespace must be PascalCase, e.g. MyPlugin or MyVendor\\MyPlugin. Got: {$ns}\n");
    exit(1);
}

$placeholder = '__LICENSER_NAMESPACE__';

$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($sdkDir, RecursiveDirectoryIterator::SKIP_DOTS));
$rewritten = 0;
$skipped   = 0;

foreach ($it as $file) {
    /** @var SplFileInfo $file */
    if (!$file->isFile()) continue;
    $path = $file->getPathname();
    $ext  = strtolower($file->getExtension());
    if (!in_array($ext, ['php', 'md'], true)) continue;
    // Don't rewrite the setup script itself.
    if (basename($path) === basename(__FILE__)) { $skipped++; continue; }

    $contents = file_get_contents($path);
    if ($contents === false) continue;
    if (strpos($contents, $placeholder) === false) { $skipped++; continue; }

    $new = str_replace($placeholder, $ns, $contents);
    file_put_contents($path, $new);
    $rewritten++;
    fwrite(STDOUT, "  rewrote {$path}\n");
}

fwrite(STDOUT, "\nDone. Namespace set to: {$ns}\\Licenser\n");
fwrite(STDOUT, "Files rewritten: {$rewritten}, skipped: {$skipped}\n");
fwrite(STDOUT, "\nNext steps:\n");
fwrite(STDOUT, "  1. require_once __DIR__ . '/includes/licenser-sdk/SDK.php';\n");
fwrite(STDOUT, "  2. \\{$ns}\\Licenser\\SDK::init([\n");
fwrite(STDOUT, "       'server_url'   => 'https://licenser-platform.vercel.app',\n");
fwrite(STDOUT, "       'product_slug' => 'your-plugin-slug',\n");
fwrite(STDOUT, "       'plugin_file'  => __FILE__,\n");
fwrite(STDOUT, "       'option_key'   => 'your_plugin_license',\n");
fwrite(STDOUT, "       // plugin_slug + version are auto-derived from plugin_file; pass them only to override.\n");
fwrite(STDOUT, "       // 'menu_parent' => 'your-plugin-menu-slug',  // optional — nest under your top-level menu\n");
fwrite(STDOUT, "     ]);\n");
