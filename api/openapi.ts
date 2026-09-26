import { TRUSTGATE_VERSION } from '../src/lib/public-config.js';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=300, s-maxage=3600',
  'X-Content-Type-Options': 'nosniff',
};

export default {
  fetch(request: Request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') {
      return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers });
    }
    const origin = new URL(request.url).origin;
    return Response.json({
      openapi: '3.1.0',
      info: {
        title: 'TrustGate API',
        version: TRUSTGATE_VERSION,
        description: 'Stateless preflight and proof reads. Consensus writes are signed directly on GenLayer by the wallet named in fromAddress.',
      },
      servers: [{ url: origin }],
      paths: {
        '/api/health': { get: { summary: 'Read API and deployed-contract health', responses: { 200: { description: 'Healthy' } } } },
        '/api/preflight': {
          post: {
            summary: 'Validate and deterministically inspect a transaction',
            requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PreflightRequest' } } } },
            responses: { 200: { description: 'Preflight result' }, 400: { description: 'Invalid request' } },
          },
        },
        '/api/proof': {
          get: {
            summary: 'Read a finalized clearance by numeric ID',
            parameters: [{ name: 'id', in: 'query', required: true, schema: { type: 'string', pattern: '^[1-9]\\d*$' } }],
            responses: { 200: { description: 'Finalized clearance' }, 404: { description: 'Not found' } },
          },
        },
      },
      components: {
        schemas: {
          PreflightRequest: {
            type: 'object',
            additionalProperties: false,
            required: ['chainId', 'transactionNonce', 'fromAddress', 'toAddress', 'valueWei', 'calldata', 'intent'],
            properties: {
              requestReference: { type: 'string', maxLength: 64 },
              policyId: { type: 'string', enum: ['conservative-v1', 'balanced-v1', 'experimental-v1'], default: 'balanced-v1' },
              chainId: { type: 'string', pattern: '^\\d+$' },
              transactionNonce: { type: 'string', pattern: '^\\d+$' },
              fromAddress: { type: 'string' },
              toAddress: { type: 'string' },
              valueWei: { type: 'string', pattern: '^\\d+$' },
              calldata: { type: 'string', pattern: '^0x(?:[0-9a-fA-F]{2})*$' },
              intent: { type: 'string', minLength: 8, maxLength: 600 },
              evidenceUrls: { type: 'array', maxItems: 3, items: { type: 'string', format: 'uri' } },
              validForSeconds: { type: 'string', pattern: '^\\d+$', default: '3600' },
            },
          },
        },
      },
    }, { headers });
  },
};
