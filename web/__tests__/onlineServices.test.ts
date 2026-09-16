// The web app's service stubs and the server's allowlist are generated from the
// service modules. A new async service function that was never regenerated
// would be missing on web and refused by the server — so fail here instead.

const { staleFiles } = require('../../scripts/online-services');

describe('online services', () => {
  it('web/services and server/src/rpc/registry.ts match the service modules', () => {
    expect(staleFiles()).toEqual([]);
  });
});
