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
		$require = array( 'product_slug', 'plugin_file', 'plugin_slug', 'version', 'server_url', 'option_key' );
		foreach ( $require as $k ) {
			if ( empty( $cfg[ $k ] ) ) {
				wp_die( 'Licenser SDK: missing required init key: ' . esc_html( $k ) );
			}
		}
		$this->product_slug = sanitize_key( $cfg['product_slug'] );
		$this->plugin_file  = (string) $cfg['plugin_file'];
		$this->plugin_slug  = (string) $cfg['plugin_slug'];
		$this->version      = (string) $cfg['version'];
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
}
