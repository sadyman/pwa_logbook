// Point d'entrée du Worker Cloudflare (Workers + Static Assets)
// - /api/pull (GET) et /api/sync (POST) : protégés par la clé X-Logbook-Key (auth.js)
// - tout le reste : fichiers statiques de public/ (binding ASSETS)

import { checkAuth } from './auth.js';
import { handlePull } from './pull.js';
import { handleSync } from './sync.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname.startsWith('/api/')) {
      const denied = checkAuth(request, env);
      if (denied) return denied;

      if (pathname === '/api/pull') {
        return request.method === 'GET' ? handlePull(env) : json(405, { error: 'Méthode non autorisée' });
      }
      if (pathname === '/api/sync') {
        return request.method === 'POST' ? handleSync(request, env) : json(405, { error: 'Méthode non autorisée' });
      }
      return json(404, { error: 'Endpoint inconnu' });
    }

    return env.ASSETS.fetch(request);
  },
};
