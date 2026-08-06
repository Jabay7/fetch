import {
  callWithResilience,
  disabledProvider,
  ProviderRegistry,
  providerError,
  TtlCache,
  validateInventoryStatus,
  validateProviderLocation,
  type ProviderResult,
} from '../provider-registry';

const instantSleep = () => Promise.resolve();

describe('callWithResilience', () => {
  it('returns ok results untouched', async () => {
    const result = await callWithResilience('t', async () => ({ ok: true, data: 42 }), {
      sleep: instantSleep,
    });
    expect(result).toEqual({ ok: true, data: 42 });
  });

  it('converts thrown errors into structured UPSTREAM_ERROR results', async () => {
    const result = await callWithResilience(
      't',
      async () => {
        throw new Error('connection reset');
      },
      { retries: 0, sleep: instantSleep }
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'UPSTREAM_ERROR' } });
  });

  it('times out slow calls with a TIMEOUT error', async () => {
    const result = await callWithResilience(
      't',
      () => new Promise<ProviderResult<number>>(() => {}),
      { timeoutMs: 30, retries: 0, sleep: instantSleep }
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'TIMEOUT', retryable: true } });
  });

  it('retries retryable errors and succeeds', async () => {
    let calls = 0;
    const result = await callWithResilience(
      't',
      async () => {
        calls++;
        if (calls < 3) return providerError('UPSTREAM_ERROR', 'flaky', true);
        return { ok: true as const, data: 'done' };
      },
      { retries: 3, sleep: instantSleep }
    );
    expect(calls).toBe(3);
    expect(result).toEqual({ ok: true, data: 'done' });
  });

  it('does not retry non-retryable errors (e.g. rate limits marked final)', async () => {
    let calls = 0;
    const result = await callWithResilience(
      't',
      async () => {
        calls++;
        return providerError('RATE_LIMITED', 'quota exhausted', false);
      },
      { retries: 5, sleep: instantSleep }
    );
    expect(calls).toBe(1);
    expect(result).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });

  it('stops after the retry budget', async () => {
    let calls = 0;
    const result = await callWithResilience(
      't',
      async () => {
        calls++;
        return providerError('UPSTREAM_ERROR', 'still down', true);
      },
      { retries: 2, sleep: instantSleep }
    );
    expect(calls).toBe(3);
    expect(result.ok).toBe(false);
  });

  it('emits structured logs per attempt', async () => {
    const events: Record<string, unknown>[] = [];
    await callWithResilience(
      'kroger.searchProducts',
      async () => providerError('UPSTREAM_ERROR', 'x', true),
      { retries: 1, sleep: instantSleep, log: (e) => events.push(e) }
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ label: 'kroger.searchProducts', attempt: 0, ok: false });
  });
});

describe('validateProviderLocation', () => {
  it('accepts and trims valid partial locations', () => {
    expect(validateProviderLocation({ aisle: ' G18 ', department: 'Health & Beauty' })).toEqual({
      aisle: 'G18',
      department: 'Health & Beauty',
    });
  });

  it('rejects non-object and non-string fields outright', () => {
    expect(validateProviderLocation('aisle 9')).toBeNull();
    expect(validateProviderLocation({ aisle: 9 })).toBeNull();
    expect(validateProviderLocation({ aisle: 'x'.repeat(200) })).toBeNull();
  });

  it('drops empty strings rather than storing them', () => {
    expect(validateProviderLocation({ aisle: '  ', shelf: '2' })).toEqual({ shelf: '2' });
  });
});

describe('validateInventoryStatus', () => {
  it('degrades unknown values to UNKNOWN, never invents stock', () => {
    expect(validateInventoryStatus('IN_STOCK')).toBe('IN_STOCK');
    expect(validateInventoryStatus('PLENTY')).toBe('UNKNOWN');
    expect(validateInventoryStatus(null)).toBe('UNKNOWN');
  });
});

describe('ProviderRegistry', () => {
  const stub = (id: string, retailerId: string | null) => disabledProvider(id, retailerId, 'test');

  it('routes retailer-specific providers before generic ones', () => {
    const registry = new ProviderRegistry();
    registry.register(stub('csv-import', null));
    registry.register(stub('kroger-api', 'r-kroger'));
    const providers = registry.forRetailer('r-kroger');
    expect(providers.map((p) => p.id)).toEqual(['kroger-api', 'csv-import']);
    expect(registry.forRetailer('r-other').map((p) => p.id)).toEqual(['csv-import']);
  });

  it('rejects duplicate registrations', () => {
    const registry = new ProviderRegistry();
    registry.register(stub('a', null));
    expect(() => registry.register(stub('a', null))).toThrow(/already registered/);
  });

  it('health-reports every provider without throwing', async () => {
    const registry = new ProviderRegistry();
    registry.register(stub('down', null));
    const throwing = stub('exploding', null);
    throwing.healthCheck = async () => {
      throw new Error('boom');
    };
    registry.register(throwing);
    const report = await registry.healthReport();
    expect(report.down.healthy).toBe(false);
    expect(report.exploding).toMatchObject({ healthy: false, detail: 'boom' });
  });
});

describe('disabledProvider', () => {
  it('answers every call with NOT_CONFIGURED instead of failing', async () => {
    const provider = disabledProvider('kroger-api', 'r1', 'awaiting registration');
    const search = await provider.searchProducts({ providerStoreId: 's', term: 'milk' });
    expect(search).toMatchObject({ ok: false, error: { code: 'NOT_CONFIGURED' } });
    expect((await provider.healthCheck()).healthy).toBe(false);
  });
});

describe('TtlCache', () => {
  it('expires entries after the ttl', () => {
    let clock = 0;
    const cache = new TtlCache<string>(100, () => clock);
    cache.set('k', 'v');
    expect(cache.get('k')).toBe('v');
    clock = 99;
    expect(cache.get('k')).toBe('v');
    clock = 100;
    expect(cache.get('k')).toBeUndefined();
  });
});
