import { env } from 'cloudflare:workers';
import { handleApi } from '@/core/api.mjs';
export const dynamic = 'force-dynamic';
const route = (request: Request) => handleApi(request, env.DB, env);
export { route as GET, route as POST, route as PATCH };
