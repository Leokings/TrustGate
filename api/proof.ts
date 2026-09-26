import { STUDIONET_CONTRACT_ADDRESS } from '../src/lib/public-config.js';
import { readClearance } from '../src/server/genlayer-read.js';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60',
  'X-Content-Type-Options': 'nosniff',
};

export default {
  async fetch(request: Request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') {
      return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers });
    }
    const id = new URL(request.url).searchParams.get('id') || '';
    if (!/^[1-9]\d{0,19}$/.test(id)) {
      return Response.json({
        ok: false,
        error: 'INVALID_CLEARANCE_ID',
        message: 'Use a positive clearance ID, for example /api/proof?id=1.',
      }, { status: 400, headers: { ...headers, 'Cache-Control': 'no-store' } });
    }
    try {
      const clearance = await readClearance(BigInt(id));
      return Response.json({ ok: true, contract: STUDIONET_CONTRACT_ADDRESS, clearance }, { headers });
    } catch (error) {
      return Response.json({
        ok: false,
        error: 'CLEARANCE_NOT_FOUND',
        message: error instanceof Error ? error.message : 'The clearance could not be read.',
      }, { status: 404, headers: { ...headers, 'Cache-Control': 'no-store' } });
    }
  },
};
