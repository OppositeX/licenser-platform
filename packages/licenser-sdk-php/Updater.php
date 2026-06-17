<?php
/**
 * SDK-side updater. Hooks into WP's update transient so plugins update from the Licenser
 * server instead of WordPress.org.
 *
 * @package Licenser_SDK
 */

namespace __LICENSER_NAMESPACE__\Licenser;

defined( 'ABSPATH' ) || exit;

class Updater {

	/** @var Client */
	private $client;

	public function __construct( Client $client ) {
		$this->client = $client;
	}

	public function register(): void {
		add_filter( 'pre_set_site_transient_update_plugins', array( $this, 'inject_update' ) );
		add_filter( 'plugins_api', array( $this, 'plugins_api' ), 10, 3 );
		add_action( 'upgrader_process_complete', array( $this, 'on_upgrade' ), 10, 2 );
	}

	/**
	 * Inject our package into the WP update list when a new version is available.
	 *
	 * @param object $transient
	 * @return object
	 */
	public function inject_update( $transient ) {
		if ( ! is_object( $transient ) ) {
			return $transient;
		}
		$cfg = $this->client->config();

		$update = $this->client->cache()->get_update();
		if ( ! $update ) {
			$res = $this->client->update_check();
			if ( is_wp_error( $res ) ) {
				return $transient;
			}
			$update = $res;
			$this->client->cache()->set_update( $update );
		}
		if ( empty( $update['has_update'] ) || empty( $update['new_version'] ) || empty( $update['package'] ) ) {
			return $transient;
		}
		if ( version_compare( $update['new_version'], $cfg->version, '<=' ) ) {
			return $transient;
		}

		$item = (object) array(
			'id'            => $cfg->plugin_slug,
			'slug'          => dirname( $cfg->plugin_slug ),
			'plugin'        => $cfg->plugin_slug,
			'new_version'   => $update['new_version'],
			'url'           => $cfg->server_url,
			'package'       => $update['package'],
			'tested'        => $update['tested']       ?? '',
			'requires'      => $update['requires']     ?? '',
			'requires_php'  => $update['requires_php'] ?? '',
			'icons'         => array(),
			'banners'       => array(),
		);

		if ( ! isset( $transient->response ) || ! is_array( $transient->response ) ) {
			$transient->response = array();
		}
		$transient->response[ $cfg->plugin_slug ] = $item;
		return $transient;
	}

	/**
	 * Provide plugin information for the "View details" modal.
	 */
	public function plugins_api( $result, $action, $args ) {
		if ( 'plugin_information' !== $action ) {
			return $result;
		}
		$cfg = $this->client->config();
		if ( empty( $args->slug ) || dirname( $cfg->plugin_slug ) !== $args->slug ) {
			return $result;
		}
		$update = $this->client->cache()->get_update();
		if ( ! $update ) {
			$res = $this->client->update_check();
			if ( is_wp_error( $res ) ) {
				return $result;
			}
			$update = $res;
			$this->client->cache()->set_update( $update );
		}
		return (object) array(
			'name'          => ucfirst( $cfg->product_slug ),
			'slug'          => dirname( $cfg->plugin_slug ),
			'version'       => $update['new_version'] ?? $cfg->version,
			'tested'        => $update['tested']       ?? '',
			'requires'      => $update['requires']     ?? '',
			'requires_php'  => $update['requires_php'] ?? '',
			'sections'      => array(
				'description' => sprintf( '%s — delivered by Licenser.', esc_html( $cfg->admin_label ) ),
				'changelog'   => $update['changelog'] ?? '',
			),
			'download_link' => $update['package'] ?? '',
		);
	}

	public function on_upgrade( $upgrader, $hook_extra ): void {
		if ( ! isset( $hook_extra['action'] ) || 'update' !== $hook_extra['action'] ) {
			return;
		}
		if ( ! isset( $hook_extra['type'] ) || 'plugin' !== $hook_extra['type'] ) {
			return;
		}
		// Bust the update cache after upgrades.
		$this->client->cache()->clear_update();
	}
}
