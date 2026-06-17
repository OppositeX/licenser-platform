<?php
/**
 * SDK cache helpers — stale check + transient-backed update info.
 *
 * @package Licenser_SDK
 */

namespace __LICENSER_NAMESPACE__\Licenser;

defined( 'ABSPATH' ) || exit;

class Cache {

	/** @var Config */
	private $cfg;

	public function __construct( Config $cfg ) {
		$this->cfg = $cfg;
	}

	public function is_stale( array $state ): bool {
		$age = time() - (int) ( $state['last_check'] ?? 0 );
		return $age >= ( $this->cfg->cache_hours * HOUR_IN_SECONDS );
	}

	public function get_update( ): ?array {
		$val = get_transient( $this->cfg->transient_key( 'update' ) );
		return is_array( $val ) ? $val : null;
	}

	public function set_update( array $data ): void {
		set_transient( $this->cfg->transient_key( 'update' ), $data, HOUR_IN_SECONDS * 6 );
	}

	public function clear_update(): void {
		delete_transient( $this->cfg->transient_key( 'update' ) );
	}
}
