import { describe, expect, it } from 'vitest';
import { extrahiereEinladungsToken, extrahiereTokenAusEingabe } from './einladung';

describe('extrahiereEinladungsToken', () => {
  it('liest den Token aus einem Query-String', () => {
    expect(extrahiereEinladungsToken('?einladung=abc-123')).toBe('abc-123');
  });

  it('liefert null ohne den Parameter', () => {
    expect(extrahiereEinladungsToken('?andererParam=xyz')).toBeNull();
  });

  it('liefert null bei leerem Wert', () => {
    expect(extrahiereEinladungsToken('?einladung=')).toBeNull();
  });

  it('kommt mit mehreren Parametern aus', () => {
    expect(extrahiereEinladungsToken('?utm_source=mail&einladung=abc-123&ref=x')).toBe('abc-123');
  });
});

describe('extrahiereTokenAusEingabe', () => {
  it('lässt einen nackten Token unverändert', () => {
    expect(extrahiereTokenAusEingabe('  abc-123  ')).toBe('abc-123');
  });

  it('zieht den Token aus einer eingefügten vollständigen URL', () => {
    expect(extrahiereTokenAusEingabe('https://app.smile2go.de/?einladung=abc-123')).toBe(
      'abc-123'
    );
  });

  it('kommt mit zusätzlichen Parametern in der eingefügten URL aus', () => {
    expect(
      extrahiereTokenAusEingabe('https://app.smile2go.de/?utm=x&einladung=abc-123&y=z')
    ).toBe('abc-123');
  });
});
