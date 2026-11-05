// Cloudflare Pages Function — GET all records from Airtable (source of truth)
// Route : GET /api/pull
// Returns : { courses: [{airtableId, date, kmDebut, ...}], recharges: [...], depenses: [...] }

const AIRTABLE_API = 'https://api.airtable.com/v0';

const TABLE_MAP = { courses: 'Courses', recharges: 'Recharges', depenses: 'Depenses', encaissements: 'Encaissements' };

const FIELD_MAP_REVERSE = {
  courses:       { Date:'date', KmDebut:'kmDebut', KmFin:'kmFin', KmAffaires:'kmAffaires', Revenu:'revenu', Pourboire:'pourboire', Prime:'prime', DureeMin:'dureeMin' },
  recharges:     { Date:'date', Lieu:'lieu', Kwh:'kwh', Cout:'cout', PctAffaires:'pctAffaires' },
  depenses:      { Date:'date', Categorie:'categorie', Montant:'montant', PctAffaires:'pctAffaires' },
  encaissements: { Date:'date', Montant:'montant', Note:'note' },
};

async function fetchTable(tableKey, env) {
  const tableName  = TABLE_MAP[tableKey];
  const reverseMap = FIELD_MAP_REVERSE[tableKey];
  const baseId     = env.logbook_uber;
  const token      = env.TK_LOGBOOK_UBER;
  const results    = [];
  let offset;
  do {
    const url = `${AIRTABLE_API}/${baseId}/${tableName}${offset ? `?offset=${offset}` : ''}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      let msg = `Airtable HTTP ${res.status}`;
      try { const j = JSON.parse(raw); msg = j.error?.message || j.error?.type || msg; } catch {}
      throw new Error(`${msg} (${tableName})`);
    }
    const data = await res.json();
    for (const rec of data.records) {
      const local = { airtableId: rec.id };
      for (const [atKey, localKey] of Object.entries(reverseMap)) {
        if (rec.fields[atKey] !== undefined) local[localKey] = rec.fields[atKey];
      }
      results.push(local);
    }
    offset = data.offset;
  } while (offset);
  return results;
}

// Même origine que l'app → pas d'en-têtes CORS. Auth : voir _middleware.js
const HEADERS = { 'Content-Type': 'application/json' };

export async function onRequestGet({ env }) {
  if (!env.logbook_uber || !env.TK_LOGBOOK_UBER) {
    return new Response(
      JSON.stringify({ error: 'Env vars manquantes : logbook_uber / TK_LOGBOOK_UBER' }),
      { status: 500, headers: HEADERS }
    );
  }
  try {
    const [courses, recharges, depenses, encaissements] = await Promise.all([
      fetchTable('courses',       env),
      fetchTable('recharges',     env),
      fetchTable('depenses',      env),
      fetchTable('encaissements', env),
    ]);
    return new Response(JSON.stringify({ courses, recharges, depenses, encaissements }), { status: 200, headers: HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: HEADERS });
  }
}
