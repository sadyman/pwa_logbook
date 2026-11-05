// Handler Worker — proxy Airtable pour batch sync
// Route : POST /api/sync
// Secrets du Worker (dashboard → Worker → Settings → Variables and Secrets) :
//   TK_LOGBOOK_UBER  → Personal Access Token Airtable
//   logbook_uber     → Base ID Airtable (ex. appXXXXXXXXXXXXXX)
//   LOGBOOK_API_KEY  → clé partagée exigée par auth.js (en-tête X-Logbook-Key)

const AIRTABLE_API = 'https://api.airtable.com/v0';

const TABLE_MAP = {
  courses:       'Courses',
  recharges:     'Recharges',
  depenses:      'Depenses',
  encaissements: 'Encaissements',
};

const FIELD_MAP = {
  courses: {
    date: 'Date', kmDebut: 'KmDebut', kmFin: 'KmFin',
    kmAffaires: 'KmAffaires', revenu: 'Revenu', pourboire: 'Pourboire',
    prime: 'Prime', dureeMin: 'DureeMin',
  },
  recharges: {
    date: 'Date', lieu: 'Lieu', kwh: 'Kwh', cout: 'Cout', pctAffaires: 'PctAffaires',
  },
  depenses: {
    date: 'Date', categorie: 'Categorie', montant: 'Montant', pctAffaires: 'PctAffaires',
  },
  encaissements: {
    date: 'Date', montant: 'Montant', note: 'Note',
  },
};

function toAirtableFields(table, payload) {
  const map = FIELD_MAP[table] || {};
  const fields = {};
  for (const [k, v] of Object.entries(payload)) {
    if (map[k] !== undefined) fields[map[k]] = v;
  }
  return fields;
}

async function atRequest(method, path, body, env) {
  const baseId = env.logbook_uber;
  const token  = env.TK_LOGBOOK_UBER;
  if (!baseId || !token) throw new Error('Env vars manquantes : logbook_uber / TK_LOGBOOK_UBER');
  const res = await fetch(`${AIRTABLE_API}/${baseId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    let msg = `Airtable HTTP ${res.status}`;
    try { const j = JSON.parse(raw); msg = j.error?.message || j.error?.type || msg; } catch {}
    throw new Error(`${msg} (${path})`);
  }
  return res.status !== 204 ? res.json() : null;
}

// Même origine que l'app → pas d'en-têtes CORS. Auth : voir auth.js
const HEADERS = { 'Content-Type': 'application/json' };

export async function handleSync(request, env) {
  let items;
  try {
    items = await request.json();
    if (!Array.isArray(items)) throw new Error('Expected array');
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: HEADERS });
  }

  const results = await Promise.all(items.map(async item => {
    const { table, action, localId, payload, airtableId } = item;
    const airtableName = TABLE_MAP[table];
    if (!airtableName) return { localId, success: false, error: `Unknown table: ${table}` };

    try {
      if (action === 'create') {
        const data = await atRequest('POST', `/${airtableName}`, { fields: toAirtableFields(table, payload) }, env);
        return { localId, airtableId: data.id, success: true };

      } else if (action === 'update') {
        if (!airtableId) return { localId, success: false, error: 'Missing airtableId' };
        await atRequest('PATCH', `/${airtableName}/${airtableId}`, { fields: toAirtableFields(table, payload) }, env);
        return { localId, airtableId, success: true };

      } else if (action === 'delete') {
        if (!airtableId) return { localId, success: true };
        await atRequest('DELETE', `/${airtableName}/${airtableId}`, null, env);
        return { localId, airtableId, success: true };

      } else {
        return { localId, success: false, error: `Unknown action: ${action}` };
      }
    } catch (err) {
      return { localId, airtableId, success: false, error: err.message };
    }
  }));

  return new Response(JSON.stringify(results), { status: 200, headers: HEADERS });
}
