<?php
/**
 * SDK config object. Validates and normalizes init args.
 *
 * @package Licenser_SDK
 */

namespace __LICENSER_NAMESPACE__\Licenser;

defined( 'ABSPATH' ) || exit;

class Config {

	/** @var string */ public $product_slug;
	/** @var string */ public $plugin_file;
	/** @var string */ public $plugin_slug;
	/** @var string */ public $version;
	/** @var string */ public $server_url;
	/** @var string */ public $option_key;
	/** @var string */ public $js_global;
	/** @var string */ public $css_class;
	/** @var string */ public $admin_label;
	/** @var int */    public $cache_hours;
	/** @var int */    public $grace_days;
	/** @var bool */   public $feedback;
	/** @var string */ public $menu_parent;
	/** @var string */ public $cap;

	public function __construct( array $cfg ) {
		// Four genuinely-required keys. plugin_slug and version are auto-derived
		// from plugin_file below if not explicitly provided.
		$require = array( 'product_slug', 'plugin_file', 'server_url', 'option_key' );
		foreach ( $require as $k ) {
			if ( empty( $cfg[ $k ] ) ) {
				wp_die( 'Licenser SDK: missing required init key: ' . esc_html( $k ) );
			}
		}
		$this->product_slug = sanitize_key( $cfg['product_slug'] );
		$this->plugin_file  = (string) $cfg['plugin_file'];
		$this->plugin_slug  = ! empty( $cfg['plugin_slug'] )
			? (string) $cfg['plugin_slug']
			: plugin_basename( $this->plugin_file );  // e.g. "my-plugin/my-plugin.php"
		$this->version      = ! empty( $cfg['version'] )
			? (string) $cfg['version']
			: self::read_plugin_version( $this->plugin_file );
		$this->server_url   = untrailingslashit( esc_url_raw( $cfg['server_url'] ) );
		$this->option_key   = sanitize_key( $cfg['option_key'] );
		$this->js_global    = (string) ( $cfg['js_global']    ?? ucfirst( $this->product_slug ) . 'Licenser' );
		$this->css_class    = sanitize_html_class( (string) ( $cfg['css_class'] ?? $this->product_slug . '-licenser' ) );
		$this->admin_label  = (string) ( $cfg['admin_label']  ?? $cfg['product_slug'] . ' License' );
		$this->cache_hours  = max( 1, min( 24, (int) ( $cfg['cache_hours'] ?? 12 ) ) );
		$this->grace_days   = max( 0, (int) ( $cfg['grace_days']  ?? 7 ) );
		$this->feedback     = (bool) ( $cfg['feedback'] ?? true );
		$this->menu_parent  = (string) ( $cfg['menu_parent'] ?? 'options-general.php' );
		$this->cap          = (string) ( $cfg['cap']         ?? 'manage_options' );
	}

	public function transient_key( string $suffix ): string {
		return $this->option_key . '_lic_' . $suffix;
	}

	/**
	 * Read the Version header out of the plugin's main PHP file.
	 *
	 * Uses get_plugin_data() when wp-admin/includes/plugin.php is loadable,
	 * otherwise falls back to a small manual header parser so SDK::init() works
	 * during 'plugins_loaded' before WP exposes the helper.
	 */
	private static function read_plugin_version( string $plugin_file ): string {
		if ( ! is_readable( $plugin_file ) ) {
			return '0.0.0';
		}
		if ( ! function_exists( 'get_plugin_data' ) && defined( 'ABSPATH' ) ) {
			$inc = ABSPATH . 'wp-admin/includes/plugin.php';
			if ( is_readable( $inc ) ) {
				require_once $inc;
			}
		}
		if ( function_exists( 'get_plugin_data' ) ) {
			$data = get_plugin_data( $plugin_file, false, false );
			if ( ! empty( $data['Version'] ) ) {
				return (string) $data['Version'];
			}
		}
		// Last-resort: scan the first 8KB for `* Version: x.y.z`.
		$head = (string) file_get_contents( $plugin_file, false, null, 0, 8192 );
		if ( preg_match( '/^[ \t\/*#@]*Version:\s*(.+)$/mi', $head, $m ) ) {
			return trim( $m[1] );
		}
		return '0.0.0';
	}
}
