// api/kommo-test.js

export default async function handler(req, res) {
  try {
    const base = process.env.KOMMO_BASE_URL || 'https://tumarcarpets.kommo.com';
    const token = process.env.KOMMO_TOKEN;

    if (!base || !token) {
      return res.status(500).json({
        ok: false,
        error: 'Missing KOMMO_BASE_URL or KOMMO_TOKEN',
      });
    }

    const leadId = req.query.lead_id;

    if (!leadId) {
      return res.status(400).json({ ok: false, error: 'lead_id is required' });
    }

    const url = `${base}/api/v4/leads/${leadId}`;

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await resp.json().catch(() => ({}));

    return res.status(resp.status).json({
      ok: resp.ok,
      status: resp.status,
      data,
    });
  } catch (err) {
    console.error('kommo-test error:', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
