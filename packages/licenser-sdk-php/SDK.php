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
 *     'product_slug'  => 'canvas-studio',
 *     'plugin_file'   => __FILE__,
 *     'plugin_slug'   => 'canvas-studio/canvas-studio.php',
 *     'version'       => '1.4.2',
 *     'server_url'    => 'https://licenser-platform.vercel.app',
 *     'option_key'    => 'canvas_studio_license',     // unique per plugin
 *     'js_global'     => 'CanvasStudioLicenser',      // unique window global
 *     'css_class'     => 'canvas-studio-licenser',    // unique CSS namespace
 *     'admin_label'   => 'Canvas Studio License',
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
