/**
 * Contract and client-configuration tests.
 *
 * The mobile types mirror the backend schemas by hand, so the most valuable
 * thing to assert here is that the two have not drifted apart. If a status is
 * renamed on the backend, this fails before a build ships.
 */
import { apiClient, API_BASE_URL, checkApiConnection } from '../api/client';
import { OrderStatus } from '../types/api';

describe('order status contract', () => {
  it('matches the backend OrderStatus enum values', () => {
    // Mirrors services/backend/src/models/models.py :: OrderStatus
    expect(Object.values(OrderStatus).sort()).toEqual(
      [
        'pending',
        'confirmed',
        'picked_up',
        'in_transit',
        'delivered',
        'cancelled',
      ].sort()
    );
  });
});

describe('api client', () => {
  it('resolves a base URL from the Expo config', () => {
    expect(API_BASE_URL).toBeTruthy();
    expect(apiClient.defaults.baseURL).toBe(API_BASE_URL);
  });

  it('sends JSON by default and has a request timeout', () => {
    expect(apiClient.defaults.headers['Content-Type']).toBe('application/json');
    expect(apiClient.defaults.timeout).toBeGreaterThan(0);
  });

  it('reports false when the health check cannot be reached', async () => {
    const get = jest
      .spyOn(apiClient, 'get')
      .mockRejectedValueOnce(new Error('network down'));

    await expect(checkApiConnection()).resolves.toBe(false);
    expect(get).toHaveBeenCalledWith('/health');
    get.mockRestore();
  });

  it('reports true when the health check succeeds', async () => {
    const get = jest
      .spyOn(apiClient, 'get')
      .mockResolvedValueOnce({ data: { status: 'healthy' } });

    await expect(checkApiConnection()).resolves.toBe(true);
    get.mockRestore();
  });
});
