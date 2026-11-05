// Cloudflare Pages middleware — s'exécute avant chaque route /api/*
// Exige l'en-tête X-Logbook-Key égal à la variable d'environnement LOGBOOK_API_KEY.
// Env var Cloudflare Pages (dashboard → Settings → Variables and Secrets, type "Secret") :
//   LOGBOOK_API_KEY → longue chaîne aléatoire (ex. 32+ caractères)
// Pas d'en-têtes CORS : l'app appelle l'API depuis la même origine, les autres sites sont bloqués par le navigateur.

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function deny(status, error) {
  return new Response(JSON.stringify({ error }), { status, headers: JSON_HEADERS });
}

// Comparaison à temps constant (évite de deviner la clé caractère par caractère)
function safeEqual(a, b) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) {
    diff |= (ea[i] || 0) ^ (eb[i] || 0);
  }
  return diff === 0;
}

export async function onRequest({ request, env, next }) {
  const expected = env.LOGBOOK_API_KEY;
  if (!expected) return deny(500, 'Env var manquante : LOGBOOK_API_KEY');

  const provided = request.headers.get('X-Logbook-Key') || '';
  if (!provided || !safeEqual(provided, expected)) return deny(401, 'Clé API invalide ou absente');

  return next();
}
