import {
  STUDIONET_CHAIN_ID,
  STUDIONET_CONTRACT_ADDRESS,
  TRUSTGATE_VERSION,
} from '../src/lib/public-config.js';
import { readContractInfo } from '../src/server/genlayer-read.js';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=30',
  'X-Content-Type-Options': 'nosniff',
};

export default {
  async fetch(request: Request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') {
      return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers });
    }

    try {
      const contract = await readContractInfo();
      return Response.json({
        ok: true,
        service: 'TrustGate API',
        apiVersion: TRUSTGATE_VERSION,
        network: { name: 'GenLayer StudioNet', chainId: STUDIONET_CHAIN_ID },
        contract: { address: STUDIONET_CONTRACT_ADDRESS, ...contract },
        capabilities: {
          deterministicPreflight: '/api/preflight',
          proofLookup: '/api/proof?id=1',
          openapi: '/api/openapi',
          consensusSubmission: 'Direct to GenLayer with the requester wallet',
        },
      }, { headers });
    } catch (error) {
      return Response.json({
        ok: false,
        error: 'STUDIONET_UNAVAILABLE',
        message: error instanceof Error ? error.message : 'Unable to read the deployed contract.',
      }, { status: 503, headers: { ...headers, 'Cache-Control': 'no-store' } });
    }
  },
};
