<?php
/**
 * Licenser SDK client — HTTP wrapper + state machine.
 *
 * State stored in a single option (Config->option_key):
 *   {
 *     "key":            string,       // plaintext (only on this site)
 *     "domain":         string,
 *     "instance_token": string,
 *     "valid":          bool,
 *     "status":         string,
 *     "expires_at":     ?string,
 *     "last_check":     int,          // epoch
 *     "last_success":   int,          // epoch
 *     "last_error":     ?string,
 *     "license":        ?array,
 *     "activation":     ?array,
 *   }
 *
 * @package Licenser_SDK
 */

namespace __LICENSER_NAMESPACE__\Licenser;

defined( 'ABSPATH' ) || exit;

class Client {

	/** @var Config */
	private $cfg;

	/** @var Cache */
	private $cache;

	public function __construct( Config $cfg ) {
		$this->cfg   = $cfg;
		$this->cache = new Cache( $cfg );
	}

	public function config(): Config {
		return $this->cfg;
	}

	public function cache(): Cache {
		return $this->cache;
	}

	public function state(): array {
		$default = array(
			'key'            => '',
			'domain'         => $this->site_domain(),
			'instance_token' => '',
			'valid'          => false,
			'status'         => 'unknown',
			'expires_at'     => null,
			'last_check'     => 0,
			'last_success'   => 0,
			'last_error'     => null,
			'license'        => null,
			'activation'     => null,
		);
		$state = (array) get_option( $this->cfg->option_key, array() );
		return array_merge( $default, $state );
	}

	private function save_state( array $state ): void {
		update_option( $this->cfg->option_key, $state, false );
	}

	public function site_domain(): string {
		$home = wp_parse_url( home_url() );
		$host = $home['host'] ?? '';
		return strtolower( preg_replace( '#^www\.#', '', (string) $host ) );
	}

	// ---------------------------------------------------------------------
	// State queries
	// ---------------------------------------------------------------------

	/**
	 * Returns true if the SDK currently considers the license valid.
	 * Uses the cached result; falls back to the grace period if the server is unreachable.
	 */
	public function is_valid(): bool {
		$s = $this->state();
		if ( ! $s['key'] ) {
			return false;
		}
		// Refresh in foreground if cache is stale and we haven't checked recently.
		if ( $this->cache->is_stale( $s ) ) {
			$this->refresh_validation();
			$s = $this->state();
		}
		if ( $s['valid'] ) {
			return true;
		}
		// Grace period: last_success within grace window.
		if ( $this->cfg->grace_days > 0 && $s['last_success'] > 0 ) {
			$grace_seconds = $this->cfg->grace_days * DAY_IN_SECONDS;
			if ( ( time() - (int) $s['last_success'] ) < $grace_seconds ) {
				return true;
			}
		}
		return false;
	}

	public function license_key(): string {
		return (string) ( $this->state()['key'] ?? '' );
	}

	// ---------------------------------------------------------------------
	// Operations
	// ---------------------------------------------------------------------

	public function activate( string $key ) {
		$body = $this->request(
			'POST',
			'/activate',
			array(
				'license_key' => $key,
				'domain'      => $this->site_domain(),
				'product'     => $this->cfg->product_slug,
				'version'     => $this->cfg->version,
				'wp_version'  => get_bloginfo( 'version' ),
				'php_version' => PHP_VERSION,
			)
		);
		if ( is_wp_error( $body ) ) {
			return $body;
		}
		$state                   = $this->state();
		$state['key']            = $key;
		$state['domain']         = $this->site_domain();
		$state['instance_token'] = (string) ( $body['instance_token'] ?? '' );
		$state['valid']          = true;
		$state['status']         = $body['license']['status'] ?? 'active';
		$state['expires_at']     = $body['license']['expires_at'] ?? null;
		$state['license']        = $body['license'] ?? null;
		$state['activation']     = $body['activation'] ?? null;
		$state['last_check']     = time();
		$state['last_success']   = time();
		$state['last_error']     = null;
		$this->save_state( $state );
		return $body;
	}

	public function deactivate( ?string $reason = null, ?string $message = null ) {
		$state = $this->state();
		if ( ! $state['key'] ) {
			return new \WP_Error( 'no_key', __( 'No license is active.', 'licenser-sdk' ) );
		}
		$body = $this->request(
			'POST',
			'/deactivate',
			array(
				'license_key' => $state['key'],
				'domain'      => $state['domain'] ?: $this->site_domain(),
				'reason'      => $reason ?: '',
				'message'     => $message ?: '',
			)
		);
		// Even on server error, drop local state — user clearly intends to stop using.
		$this->save_state(
			array_merge(
				$this->state(),
				array(
					'key'          => '',
					'instance_token' => '',
					'valid'        => false,
					'status'       => 'deactivated',
					'license'      => null,
					'activation'   => null,
					'last_error'   => is_wp_error( $body ) ? $body->get_error_message() : null,
				)
			)
		);
		return $body;
	}

	public function refresh_validation() {
		$state = $this->state();
		if ( ! $state['key'] ) {
			return false;
		}
		$body = $this->request(
			'POST',
			'/validate',
			array(
				'license_key' => $state['key'],
				'domain'      => $state['domain'] ?: $this->site_domain(),
				'version'     => $this->cfg->version,
				'wp_version'  => get_bloginfo( 'version' ),
				'php_version' => PHP_VERSION,
			)
		);
		$state['last_check'] = time();
		if ( is_wp_error( $body ) ) {
			$state['last_error'] = $body->get_error_message();
			$this->save_state( $state );
			return $body;
		}
		$state['valid']        = ! empty( $body['valid'] );
		$state['status']       = $body['license']['status'] ?? $state['status'];
		$state['expires_at']   = $body['license']['expires_at'] ?? $state['expires_at'];
		$state['license']      = $body['license'] ?? $state['license'];
		$state['activation']   = $body['activation'] ?? $state['activation'];
		$state['last_error']   = null;
		if ( $state['valid'] ) {
			$state['last_success'] = time();
		}
		$this->save_state( $state );
		return $body;
	}

	public function update_check() {
		$state = $this->state();
		if ( ! $state['key'] ) {
			return new \WP_Error( 'no_key', 'No license' );
		}
		return $this->request(
			'GET',
			'/update-check',
			array(
				'license_key' => $state['key'],
				'domain'      => $state['domain'] ?: $this->site_domain(),
				'version'     => $this->cfg->version,
				'wp_version'  => get_bloginfo( 'version' ),
				'php_version' => PHP_VERSION,
			)
		);
	}

	public function send_feedback( string $reason, string $message = '' ) {
		$state = $this->state();
		return $this->request(
			'POST',
			'/feedback',
			array(
				'license_key' => $state['key'],
				'domain'      => $state['domain'] ?: $this->site_domain(),
				'reason'      => $reason,
				'message'     => $message,
			)
		);
	}

	// ---------------------------------------------------------------------
	// HTTP
	// ---------------------------------------------------------------------

	public function request( string $method, string $path, array $params = array() ) {
		$url = $this->cfg->server_url . '/wp-json/licenser/v1' . $path;
		$args = array(
			'timeout' => 15,
			'headers' => array(
				'Accept'     => 'application/json',
				'User-Agent' => sprintf( '%s/%s; Licenser-SDK', $this->cfg->product_slug, $this->cfg->version ),
			),
		);
		if ( 'GET' === $method ) {
			$url           = add_query_arg( $params, $url );
			$response      = wp_remote_get( $url, $args );
		} else {
			$args['body']   = wp_json_encode( $params );
			$args['headers']['Content-Type'] = 'application/json';
			$args['method'] = $method;
			$response       = wp_remote_request( $url, $args );
		}
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$body = wp_remote_retrieve_body( $response );
		$data = json_decode( $body, true );
		if ( $code >= 400 ) {
			return new \WP_Error(
				is_array( $data ) && isset( $data['code'] ) ? $data['code'] : 'licenser_http_' . $code,
				is_array( $data ) && isset( $data['message'] ) ? $data['message'] : 'HTTP ' . $code,
				$data
			);
		}
		return is_array( $data ) ? $data : array();
	}
}
