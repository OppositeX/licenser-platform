<?php
/**
 * Licenser SDK — generic, embedded into client plugins.
 *
 * Namespace placeholder: the literal string `__LICENSER_NAMESPACE__` is replaced
 * at install time by the embedding plugin so multiple Licenser-using plugins on
 * the same site never collide.
 *
 * Public API:
 *   __LICENSER_NAMESPACE__\Licenser\SDK::init([
 *     // Required (4 keys):
 *     'server_url'    => 'https://licenser-platform.vercel.app',
 *     'product_slug'  => 'canvas-studio',
 *     'plugin_file'   => __FILE__,
 *     'option_key'    => 'canvas_studio_license',     // unique per plugin
 *     // Optional — auto-derived from plugin_file if omitted:
 *     'plugin_slug'   => 'canvas-studio/canvas-studio.php',  // plugin_basename($plugin_file)
 *     'version'       => '1.4.2',                            // read from Plugin Header
 *     // Optional UX/isolation:
 *     'menu_parent'   => 'options-general.php',       // or your plugin's top-level menu slug
 *     'admin_label'   => 'Canvas Studio License',
 *     'js_global'     => 'CanvasStudioLicenser',
 *     'css_class'     => 'canvas-studio-licenser',
 *     'cache_hours'   => 12,
 *     'grace_days'    => 7,
 *     'feedback'      => true,
 *   ]);
 *   __LICENSER_NAMESPACE__\Licenser\SDK::is_valid();   // bool
 *   __LICENSER_NAMESPACE__\Licenser\SDK::client();     // Client instance
 *
 * @package Licenser_SDK
 */

namespace __LICENSER_NAMESPACE__\Licenser;

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( __NAMESPACE__ . '\\SDK' ) ) :

class SDK {

	/** @var Client|null */
	private static $client = null;

	/**
	 * Initialize the SDK. Idempotent.
	 */
	public static function init( array $config ): Client {
		if ( null !== self::$client ) {
			return self::$client;
		}
		require_once __DIR__ . '/Config.php';
		require_once __DIR__ . '/Client.php';
		require_once __DIR__ . '/Cache.php';
		require_once __DIR__ . '/Cron.php';
		require_once __DIR__ . '/Updater.php';
		require_once __DIR__ . '/AdminUI.php';
		require_once __DIR__ . '/FeedbackModal.php';

		$cfg = new Config( $config );
		$cli = new Client( $cfg );
		self::$client = $cli;

		// Register WP hooks.
		( new Cron( $cli ) )->register();
		( new Updater( $cli ) )->register();
		( new AdminUI( $cli ) )->register();
		if ( $cfg->feedback ) {
			( new FeedbackModal( $cli ) )->register();
		}

		return $cli;
	}

	public static function client(): ?Client {
		return self::$client;
	}

	public static function is_valid(): bool {
		return self::$client ? self::$client->is_valid() : false;
	}
}

endif;
