import { describe, it, expect } from 'vitest';
import { formatUnit } from './units';

describe('formatUnit — singular/plural (devise/unité mandate)', () => {
  it('formatUnit(1, "PIECE") => pièce (singular)', () => {
    expect(formatUnit(1, 'PIECE')).toBe('pièce');
  });

  it('formatUnit(2, "PIECE") => pièces (plural)', () => {
    expect(formatUnit(2, 'PIECE')).toBe('pièces');
  });

  it('formatUnit(1, "SAC") => sac (singular)', () => {
    expect(formatUnit(1, 'SAC')).toBe('sac');
  });

  it('formatUnit(10, "SAC") => sacs (plural)', () => {
    expect(formatUnit(10, 'SAC')).toBe('sacs');
  });

  it('formatUnit(0, "PIECE") => pièces (0 is plural, standard FR/EN rule)', () => {
    expect(formatUnit(0, 'PIECE')).toBe('pièces');
  });

  it('formatUnit(1, "PIECE", "en") => piece (English singular)', () => {
    expect(formatUnit(1, 'PIECE', 'en')).toBe('piece');
  });

  it('formatUnit(5, "BOUTEILLE", "en") => bottles (English plural)', () => {
    expect(formatUnit(5, 'BOUTEILLE', 'en')).toBe('bottles');
  });

  it('an unknown/undefined unit code returns an empty string rather than an invented label', () => {
    expect(formatUnit(3, undefined)).toBe('');
    expect(formatUnit(3, 'NOT_A_UNIT')).toBe('');
  });
});
