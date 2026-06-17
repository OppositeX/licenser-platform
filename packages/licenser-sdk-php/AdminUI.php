<?php
/**
 * SDK admin page — license input/activate/deactivate UI.
 *
 * Lives under the configured `menu_parent` (default Settings → <admin_label>).
 *
 * @package Licenser_SDK
 */

namespace __LICENSER_NAMESPACE__\Licenser;

defined( 'ABSPATH' ) || exit;

class AdminUI {

	/** @var Client */
	private $client;

	public function __construct( Client $client ) {
		$this->client = $client;
	}

	public function register(): void {
		add_action( 'admin_menu', array( $this, 'menu' ) );
		add_action( 'admin_post_' . $this->action_key( 'activate' ),   array( $this, 'handle_activate' ) );
		add_action( 'admin_post_' . $this->action_key( 'deactivate' ), array( $this, 'handle_deactivate' ) );
		add_action( 'admin_post_' . $this->action_key( 'refresh' ),    array( $this, 'handle_refresh' ) );
		add_action( 'admin_notices', array( $this, 'admin_notice' ) );
	}

	private function action_key( string $suffix ): string {
		return 'licenser_sdk_' . $this->client->config()->option_key . '_' . $suffix;
	}

	public function menu(): void {
		$cfg = $this->client->config();
		add_submenu_page(
			$cfg->menu_parent,
			$cfg->admin_label,
			$cfg->admin_label,
			$cfg->cap,
			$cfg->option_key . '_license',
			array( $this, 'render' )
		);
	}

	public function render(): void {
		$cfg   = $this->client->config();
		$state = $this->client->state();
		$css   = esc_attr( $cfg->css_class );
		?>
		<style>
			.<?php echo $css; ?>-card { background:#1a1d24; color:#e6e8eb; border:1px solid #2a2e36; border-radius:12px; padding:22px; max-width:760px; }
			.<?php echo $css; ?>-card h2 { margin-top:0; color:#fff; }
			.<?php echo $css; ?>-card label { display:block; margin-bottom:6px; font-weight:600; color:#cbd1d9; }
			.<?php echo $css; ?>-card input[type=text] { width:100%; padding:10px 12px; border-radius:8px; border:1px solid #353a44; background:#0f1116; color:#e6e8eb; font-family:monospace; }
			.<?php echo $css; ?>-card .actions { margin-top:16px; display:flex; gap:8px; }
			.<?php echo $css; ?>-pill { display:inline-block; padding:3px 10px; border-radius:999px; font-size:12px; font-weight:600; }
			.<?php echo $css; ?>-pill.ok { background:#103b29; color:#7ee7a3; }
			.<?php echo $css; ?>-pill.warn { background:#3b2f10; color:#f0c25e; }
			.<?php echo $css; ?>-pill.bad { background:#3b1010; color:#ef7a7a; }
			.<?php echo $css; ?>-meta { margin-top:14px; font-size:13px; color:#9aa3ad; }
			.<?php echo $css; ?>-meta div { margin:2px 0; }
		</style>
		<div class="wrap">
			<h1><?php echo esc_html( $cfg->admin_label ); ?></h1>
			<div class="<?php echo $css; ?>-card">
				<?php if ( $state['key'] ) : ?>
					<h2>
						<?php esc_html_e( 'License status', 'licenser-sdk' ); ?>
						<?php
						$pill_class = $state['valid'] ? 'ok' : ( in_array( $state['status'], array( 'grace', 'pending' ), true ) ? 'warn' : 'bad' );
						?>
						<span class="<?php echo $css; ?>-pill <?php echo esc_attr( $pill_class ); ?>"><?php echo esc_html( $state['status'] ); ?></span>
					</h2>
					<div class="<?php echo $css; ?>-meta">
						<div><strong><?php esc_html_e( 'Key', 'licenser-sdk' ); ?>:</strong> <?php echo esc_html( $this->mask_key( $state['key'] ) ); ?></div>
						<div><strong><?php esc_html_e( 'Domain', 'licenser-sdk' ); ?>:</strong> <?php echo esc_html( $state['domain'] ); ?></div>
						<?php if ( ! empty( $state['expires_at'] ) ) : ?>
							<div><strong><?php esc_html_e( 'Expires', 'licenser-sdk' ); ?>:</strong> <?php echo esc_html( $state['expires_at'] ); ?></div>
						<?php endif; ?>
						<?php if ( ! empty( $state['license']['plan']['name'] ) ) : ?>
							<div><strong><?php esc_html_e( 'Plan', 'licenser-sdk' ); ?>:</strong> <?php echo esc_html( $state['license']['plan']['name'] ); ?> (max <?php echo (int) $state['license']['plan']['max_activations']; ?>)</div>
						<?php endif; ?>
						<?php if ( ! empty( $state['last_check'] ) ) : ?>
							<div><strong><?php esc_html_e( 'Last check', 'licenser-sdk' ); ?>:</strong> <?php echo esc_html( gmdate( 'Y-m-d H:i:s', (int) $state['last_check'] ) ); ?> UTC</div>
						<?php endif; ?>
						<?php if ( ! empty( $state['last_error'] ) ) : ?>
							<div style="color:#ef7a7a"><strong><?php esc_html_e( 'Last error', 'licenser-sdk' ); ?>:</strong> <?php echo esc_html( $state['last_error'] ); ?></div>
						<?php endif; ?>
					</div>
					<div class="actions">
						<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
							<?php wp_nonce_field( $this->action_key( 'refresh' ) ); ?>
							<input type="hidden" name="action" value="<?php echo esc_attr( $this->action_key( 'refresh' ) ); ?>" />
							<button class="button button-secondary"><?php esc_html_e( 'Refresh now', 'licenser-sdk' ); ?></button>
						</form>
						<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" id="<?php echo esc_attr( $cfg->css_class ); ?>-deactivate-form" data-licenser-deactivate="1" data-licenser-product="<?php echo esc_attr( $cfg->product_slug ); ?>">
							<?php wp_nonce_field( $this->action_key( 'deactivate' ) ); ?>
							<input type="hidden" name="action" value="<?php echo esc_attr( $this->action_key( 'deactivate' ) ); ?>" />
							<input type="hidden" name="reason" value="" />
							<input type="hidden" name="message" value="" />
							<button class="button button-link-delete"><?php esc_html_e( 'Deactivate this site', 'licenser-sdk' ); ?></button>
						</form>
					</div>
				<?php else : ?>
					<h2><?php esc_html_e( 'Activate license', 'licenser-sdk' ); ?></h2>
					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
						<?php wp_nonce_field( $this->action_key( 'activate' ) ); ?>
						<input type="hidden" name="action" value="<?php echo esc_attr( $this->action_key( 'activate' ) ); ?>" />
						<label for="<?php echo esc_attr( $cfg->option_key ); ?>_key"><?php esc_html_e( 'License key', 'licenser-sdk' ); ?></label>
						<input id="<?php echo esc_attr( $cfg->option_key ); ?>_key" type="text" name="license_key" placeholder="LCR-XXXXX-XXXXX-XXXXX-XXXXX" autocomplete="off" required />
						<div class="actions">
							<button class="button button-primary"><?php esc_html_e( 'Activate', 'licenser-sdk' ); ?></button>
						</div>
					</form>
				<?php endif; ?>
			</div>
		</div>
		<?php
	}

	public function handle_activate(): void {
		check_admin_referer( $this->action_key( 'activate' ) );
		if ( ! current_user_can( $this->client->config()->cap ) ) {
			wp_die( esc_html__( 'Forbidden', 'licenser-sdk' ) );
		}
		$key = isset( $_POST['license_key'] ) ? sanitize_text_field( wp_unslash( $_POST['license_key'] ) ) : '';
		$res = $this->client->activate( $key );
		$this->stash_notice( is_wp_error( $res ) ? $res->get_error_message() : __( 'License activated.', 'licenser-sdk' ), is_wp_error( $res ) ? 'error' : 'success' );
		wp_safe_redirect( $this->page_url() );
		exit;
	}

	public function handle_deactivate(): void {
		check_admin_referer( $this->action_key( 'deactivate' ) );
		if ( ! current_user_can( $this->client->config()->cap ) ) {
			wp_die( esc_html__( 'Forbidden', 'licenser-sdk' ) );
		}
		$reason  = isset( $_POST['reason'] )  ? sanitize_key( wp_unslash( $_POST['reason'] ) )  : '';
		$message = isset( $_POST['message'] ) ? sanitize_textarea_field( wp_unslash( $_POST['message'] ) ) : '';
		$res     = $this->client->deactivate( $reason ?: null, $message ?: null );
		$this->stash_notice( __( 'License deactivated.', 'licenser-sdk' ), 'success' );
		wp_safe_redirect( $this->page_url() );
		exit;
	}

	public function handle_refresh(): void {
		check_admin_referer( $this->action_key( 'refresh' ) );
		if ( ! current_user_can( $this->client->config()->cap ) ) {
			wp_die( esc_html__( 'Forbidden', 'licenser-sdk' ) );
		}
		$res = $this->client->refresh_validation();
		$this->stash_notice(
			is_wp_error( $res ) ? $res->get_error_message() : __( 'License refreshed.', 'licenser-sdk' ),
			is_wp_error( $res ) ? 'error' : 'success'
		);
		wp_safe_redirect( $this->page_url() );
		exit;
	}

	private function stash_notice( string $msg, string $type ): void {
		set_transient( $this->client->config()->transient_key( 'notice' ), array( 'msg' => $msg, 'type' => $type ), 60 );
	}

	public function admin_notice(): void {
		$notice = get_transient( $this->client->config()->transient_key( 'notice' ) );
		if ( ! $notice ) {
			return;
		}
		delete_transient( $this->client->config()->transient_key( 'notice' ) );
		printf(
			'<div class="notice notice-%s is-dismissible"><p>%s</p></div>',
			esc_attr( $notice['type'] ),
			esc_html( $notice['msg'] )
		);
	}

	private function page_url(): string {
		$cfg = $this->client->config();
		return add_query_arg(
			array( 'page' => $cfg->option_key . '_license' ),
			admin_url( $cfg->menu_parent )
		);
	}

	private function mask_key( string $key ): string {
		if ( strlen( $key ) <= 8 ) {
			return '****';
		}
		return substr( $key, 0, 4 ) . str_repeat( '•', max( 4, strlen( $key ) - 8 ) ) . substr( $key, -4 );
	}
}
