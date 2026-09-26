(() => {
  const listeners = new Map();
  const requests = [];
  const state = {
    account: '0x1234567890abcdef1234567890abcdef12345678',
  };

  const provider = {
    async request({ method, params }) {
      requests.push({ method, params });
      if (method === 'eth_requestAccounts') return [state.account];
      if (method === 'wallet_switchEthereumChain') return null;
      throw new Error(`Unexpected mock-wallet method: ${method}`);
    },
    on(event, listener) {
      const existing = listeners.get(event) || new Set();
      existing.add(listener);
      listeners.set(event, existing);
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener);
    },
  };

  Object.defineProperty(window, 'ethereum', {
    configurable: true,
    value: provider,
  });
  Object.defineProperty(window, '__trustGateMockWallet', {
    configurable: true,
    value: {
      requests,
      emit(event, value) {
        for (const listener of listeners.get(event) || []) listener(value);
      },
      listenerCount(event) {
        return listeners.get(event)?.size || 0;
      },
      setAccount(account) {
        state.account = account;
      },
    },
  });
})();
