import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectWallet } from './genlayer';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('injected wallet connection', () => {
  it('fails with a useful message when no EIP-1193 wallet exists', async () => {
    vi.stubGlobal('window', {});

    await expect(connectWallet()).rejects.toThrow(/Install or open an EIP-1193 wallet/);
  });

  it('requests an account and switches the wallet to StudioNet', async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === 'eth_requestAccounts') {
        return ['0x1234567890abcdef1234567890abcdef12345678'];
      }
      if (method === 'wallet_switchEthereumChain') return null;
      throw new Error(`Unexpected method: ${method}`);
    });
    vi.stubGlobal('window', { ethereum: { request } });

    await expect(connectWallet()).resolves.toBe('0x1234567890AbcdEF1234567890aBcdef12345678');
    expect(request).toHaveBeenNthCalledWith(1, { method: 'eth_requestAccounts' });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0xf22f' }],
    });
  });

  it('offers to add StudioNet when the wallet reports an unknown chain', async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === 'eth_requestAccounts') {
        return ['0x1234567890abcdef1234567890abcdef12345678'];
      }
      if (method === 'wallet_switchEthereumChain') {
        throw Object.assign(new Error('Unknown chain'), { code: 4_902 });
      }
      if (method === 'wallet_addEthereumChain') return null;
      throw new Error(`Unexpected method: ${method}`);
    });
    vi.stubGlobal('window', { ethereum: { request } });

    await connectWallet();
    expect(request).toHaveBeenLastCalledWith({
      method: 'wallet_addEthereumChain',
      params: [{
        blockExplorerUrls: ['https://genlayer-explorer.vercel.app'],
        chainId: '0xf22f',
        chainName: 'Genlayer Studio Network',
        nativeCurrency: { decimals: 18, name: 'GEN Token', symbol: 'GEN' },
        rpcUrls: ['https://studio.genlayer.com/api'],
      }],
    });
  });

  it('rejects an invalid account returned by the wallet', async () => {
    const request = vi.fn(async () => ['not-an-address']);
    vi.stubGlobal('window', { ethereum: { request } });

    await expect(connectWallet()).rejects.toThrow(/did not expose a valid account/);
    expect(request).toHaveBeenCalledOnce();
  });
});
