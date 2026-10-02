import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandler,
} from 'mcp-handler';

export const runtime = 'nodejs';

const handler = protectedResourceHandler({
  authServerUrls: ['https://eiwvjreecejmwfvczvmh.supabase.co/auth/v1'],
  resourceUrl: 'https://carolqueiroz.pt/api/mcp',
});

const options = metadataCorsOptionsRequestHandler();

export { handler as GET, options as OPTIONS };
