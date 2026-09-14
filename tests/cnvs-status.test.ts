import { describe, it, expect } from 'vitest';
import { rollUpStatus, publicIncident, type IncidentRow } from '@/lib/cnvs/status';

const incident = (impact: IncidentRow['impact']): Pick<IncidentRow, 'impact'> => ({ impact });

describe('rollUpStatus', () => {
  it('is operational when everything is', () => {
    expect(rollUpStatus([{ status: 'operational' }, { status: 'operational' }], [])).toBe('operational');
  });

  it('reports the worst component', () => {
    expect(rollUpStatus(
      [{ status: 'operational' }, { status: 'degraded' }, { status: 'major_outage' }],
      [],
    )).toBe('major_outage');
  });

  it('ranks maintenance below degraded', () => {
    expect(rollUpStatus([{ status: 'maintenance' }, { status: 'degraded' }], [])).toBe('degraded');
    expect(rollUpStatus([{ status: 'maintenance' }, { status: 'operational' }], [])).toBe('maintenance');
  });

  it('lets an open incident drag the headline down', () => {
    expect(rollUpStatus([{ status: 'operational' }], [incident('critical')])).toBe('major_outage');
    expect(rollUpStatus([{ status: 'operational' }], [incident('major')])).toBe('partial_outage');
    expect(rollUpStatus([{ status: 'operational' }], [incident('minor')])).toBe('degraded');
  });

  it('ignores a no-impact incident', () => {
    expect(rollUpStatus([{ status: 'operational' }], [incident('none')])).toBe('operational');
  });

  it('never lifts a component status back up', () => {
    expect(rollUpStatus([{ status: 'major_outage' }], [incident('minor')])).toBe('major_outage');
  });

  it('is operational with nothing configured', () => {
    expect(rollUpStatus([], [])).toBe('operational');
  });
});

describe('publicIncident', () => {
  it('exposes the public fields and withholds the internal ones', () => {
    const row: IncidentRow = {
      id: 'i1', title: 'Image generation failing', body: 'Investigating.',
      status: 'investigating', impact: 'major', components: ['ai_image'],
      started_at: '2026-09-14T10:00:00Z', resolved_at: null,
      created_by: 'otw.srl@gmail.com', updated_at: '2026-09-14T10:05:00Z',
      updated_by: 'otw.srl@gmail.com',
    };
    const pub = publicIncident(row);
    expect(pub).toEqual({
      id: 'i1', title: 'Image generation failing', body: 'Investigating.',
      status: 'investigating', impact: 'major', components: ['ai_image'],
      started_at: '2026-09-14T10:00:00Z', updated_at: '2026-09-14T10:05:00Z', resolved_at: null,
    });
    expect(pub).not.toHaveProperty('created_by');
    expect(pub).not.toHaveProperty('updated_by');
  });

  it('defaults a null components array to empty', () => {
    const pub = publicIncident({ components: null } as unknown as IncidentRow);
    expect(pub.components).toEqual([]);
  });
});
