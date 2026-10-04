import { describe, expect, it } from 'vitest';
import { clearDestroyedPixiFilterInputs } from '../../../src/components/visualizer/pixiDisplayResources';

// test/unit/desktop/pixiFilterResize.test.ts — resize compatibility never replaces live or active filter resources.
describe('Pixi filter inputs after a desktop resize', () => {
  it('clears source-null and destroyed inputs outside a filter pass', () => {
    const missingSource = { inputTexture: { source: null, destroyed: false } };
    const destroyed = { inputTexture: { source: {}, destroyed: true } };
    const filter = { _filterStackIndex: 0, _filterStack: [missingSource, destroyed] };
    clearDestroyedPixiFilterInputs({ filter });
    expect(missingSource.inputTexture).toBeNull();
    expect(destroyed.inputTexture).toBeNull();
  });

  it('preserves valid pooled inputs and empty entries', () => {
    const texture = { source: {}, destroyed: false };
    const valid = { inputTexture: texture };
    const empty = { inputTexture: null };
    const filter = { _filterStackIndex: 0, _filterStack: [valid, empty] };
    clearDestroyedPixiFilterInputs({ filter });
    expect(valid.inputTexture).toBe(texture);
    expect(empty.inputTexture).toBeNull();
    expect(filter._filterStack).toEqual([valid, empty]);
  });

  it('does not change any inputs while a filter pass is active', () => {
    const texture = { source: null, destroyed: true };
    const entry = { inputTexture: texture };
    clearDestroyedPixiFilterInputs({ filter: { _filterStackIndex: 1, _filterStack: [entry] } });
    expect(entry.inputTexture).toBe(texture);
  });

  it('tolerates renderers without the Pixi 8.21 cache', () => {
    expect(() => clearDestroyedPixiFilterInputs({})).not.toThrow();
    expect(() => clearDestroyedPixiFilterInputs({ filter: {} })).not.toThrow();
  });
});
