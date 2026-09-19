import { describe, expect, it } from 'vitest';
import { OUTBOUND_EVENTS, buildOutboundPayload } from '@/lib/licenser/outbound';

describe('outbound events', () => {
  it('emits license.credits_purchased (the credit-pack top-up event)', () => {
    expect(OUTBOUND_EVENTS).toContain('license.credits_purchased');
  });

  it('buildOutboundPayload wraps the event in the STO-004 envelope', () => {
    const raw = buildOutboundPayload('license.credits_purchased', {
      license_id: 'lic-1',
      product_id: 'prod-1',
      data: { woo_order_id: 'o-1', credit_pack: { sku: 'pack', credits: 100, quantity: 1 } },
    });
    const p = JSON.parse(raw);
    expect(p.event).toBe('license.credits_purchased');
    expect(p.license_id).toBe('lic-1');
    expect(p.product_id).toBe('prod-1');
    expect(p.data.woo_order_id).toBe('o-1');
    expect(p.data.credit_pack).toEqual({ sku: 'pack', credits: 100, quantity: 1 });
    expect(typeof p.sent_at).toBe('string');
    expect(Number.isNaN(Date.parse(p.sent_at))).toBe(false);
  });

  it('defaults license_id/product_id/data when ctx is empty', () => {
    const p = JSON.parse(buildOutboundPayload('license.issued'));
    expect(p.license_id).toBeNull();
    expect(p.product_id).toBeNull();
    expect(p.data).toEqual({});
  });
});
