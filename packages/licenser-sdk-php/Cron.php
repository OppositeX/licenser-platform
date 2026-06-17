<?php
/**
 * SDK-side cron — refreshes validation in the background so a server outage doesn't
 * brick the site at the moment is_valid() is called.
 *
 * Hook is unique per plugin (suffixed with option_key) so multiple SDK-using plugins
 * don't share a schedule.
 *
 * @package Licenser_SDK
 */

namespace __LICENSER_NAMESPACE__\Licenser;

defined( 'ABSPATH' ) || exit;

class Cron {

	/** @var Client */
	private $client;

	public function __construct( Client $client ) {
		$this->client = $client;
	}

	public function hook(): string {
		return 'licenser_sdk_refresh_' . $this->client->config()->option_key;
	}

	public function register(): void {
		add_action( $this->hook(), array( $this, 'run' ) );
		register_activation_hook( $this->client->config()->plugin_file, array( $this, 'schedule' ) );
		register_deactivation_hook( $this->client->config()->plugin_file, array( $this, 'unschedule' ) );
		// Ensure schedule exists if plugin was already active when SDK was added.
		add_action( 'admin_init', array( $this, 'schedule' ) );
	}

	public function schedule(): void {
		if ( ! wp_next_scheduled( $this->hook() ) ) {
			wp_schedule_event( time() + 600, 'twicedaily', $this->hook() );
		}
	}

	public function unschedule(): void {
		$ts = wp_next_scheduled( $this->hook() );
		if ( $ts ) {
			wp_unschedule_event( $ts, $this->hook() );
		}
	}

	public function run(): void {
		$this->client->refresh_validation();
	}
}
