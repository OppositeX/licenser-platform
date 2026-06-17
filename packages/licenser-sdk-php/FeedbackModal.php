<?php
/**
 * Deactivation feedback modal. Hooks the deactivation form on the SDK admin page,
 * intercepts submit, asks for a reason + optional message, then submits.
 *
 * @package Licenser_SDK
 */

namespace __LICENSER_NAMESPACE__\Licenser;

defined( 'ABSPATH' ) || exit;

class FeedbackModal {

	/** @var Client */
	private $client;

	public function __construct( Client $client ) {
		$this->client = $client;
	}

	public function register(): void {
		add_action( 'admin_footer', array( $this, 'render' ) );
	}

	public function render(): void {
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( ! $screen || strpos( (string) $screen->id, $this->client->config()->option_key . '_license' ) === false ) {
			return;
		}
		$css      = esc_attr( $this->client->config()->css_class );
		$global   = $this->client->config()->js_global;

		$reasons = array(
			'no_longer_needed'       => __( 'I no longer need this plugin', 'licenser-sdk' ),
			'temporary_deactivation' => __( 'It’s a temporary deactivation', 'licenser-sdk' ),
			'site_migration'         => __( 'I’m moving the site', 'licenser-sdk' ),
			'troubleshooting'        => __( 'I’m troubleshooting an issue', 'licenser-sdk' ),
			'found_better'           => __( 'I found a better plugin', 'licenser-sdk' ),
			'too_expensive'          => __( 'It’s too expensive', 'licenser-sdk' ),
			'broken'                 => __( 'It’s broken', 'licenser-sdk' ),
			'other'                  => __( 'Other', 'licenser-sdk' ),
		);
		?>
		<style>
			.<?php echo $css; ?>-modal-backdrop {
				position:fixed; inset:0; background:rgba(8,9,12,.65);
				display:none; align-items:center; justify-content:center;
				z-index:100000;
			}
			.<?php echo $css; ?>-modal-backdrop.open { display:flex; }
			.<?php echo $css; ?>-modal {
				background:#1a1d24; color:#e6e8eb; border:1px solid #2a2e36;
				border-radius:14px; padding:22px; width:480px; max-width:92vw;
				box-shadow:0 24px 60px rgba(0,0,0,.55);
			}
			.<?php echo $css; ?>-modal h2 { margin:0 0 12px 0; color:#fff; }
			.<?php echo $css; ?>-modal label { display:block; padding:6px 0; cursor:pointer; }
			.<?php echo $css; ?>-modal textarea {
				width:100%; height:80px; padding:10px; margin-top:8px;
				background:#0f1116; color:#e6e8eb; border:1px solid #353a44; border-radius:8px;
			}
			.<?php echo $css; ?>-modal .row { display:flex; justify-content:space-between; gap:8px; margin-top:16px; }
		</style>
		<div class="<?php echo $css; ?>-modal-backdrop" id="<?php echo $css; ?>-modal" role="dialog" aria-modal="true" aria-labelledby="<?php echo $css; ?>-title">
			<div class="<?php echo $css; ?>-modal">
				<h2 id="<?php echo $css; ?>-title"><?php esc_html_e( 'Quick — why are you deactivating?', 'licenser-sdk' ); ?></h2>
				<div>
					<?php foreach ( $reasons as $val => $label ) : ?>
						<label><input type="radio" name="<?php echo $css; ?>_reason" value="<?php echo esc_attr( $val ); ?>"> <?php echo esc_html( $label ); ?></label>
					<?php endforeach; ?>
				</div>
				<textarea placeholder="<?php esc_attr_e( 'Optional — anything we should know?', 'licenser-sdk' ); ?>"></textarea>
				<div class="row">
					<button type="button" class="button" data-licenser-cancel="1"><?php esc_html_e( 'Cancel', 'licenser-sdk' ); ?></button>
					<button type="button" class="button button-primary" data-licenser-confirm="1"><?php esc_html_e( 'Submit & deactivate', 'licenser-sdk' ); ?></button>
				</div>
			</div>
		</div>
		<script>
		(function () {
			var ns = <?php echo wp_json_encode( $global ); ?>;
			var modal = document.getElementById('<?php echo esc_js( $css ); ?>-modal');
			if (!modal) return;
			var form = document.querySelector('[data-licenser-deactivate="1"]');
			if (!form) return;
			form.addEventListener('submit', function (e) {
				if (form.dataset.licenserConfirmed === '1') return;
				e.preventDefault();
				modal.classList.add('open');
			});
			modal.querySelector('[data-licenser-cancel="1"]').addEventListener('click', function () {
				modal.classList.remove('open');
			});
			modal.querySelector('[data-licenser-confirm="1"]').addEventListener('click', function () {
				var reason = (modal.querySelector('input[name="<?php echo esc_js( $css ); ?>_reason"]:checked') || {}).value || '';
				var message = (modal.querySelector('textarea') || {}).value || '';
				form.querySelector('input[name="reason"]').value = reason;
				form.querySelector('input[name="message"]').value = message;
				form.dataset.licenserConfirmed = '1';
				form.submit();
			});
			window[ns] = window[ns] || {};
			window[ns].modal = modal;
		})();
		</script>
		<?php
	}
}
