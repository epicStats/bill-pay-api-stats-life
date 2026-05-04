const crypto = require('crypto');

const SECRET_KEY = 'deos_CsIeYePAIbiaknmhlCBSOkDAgIk8-Tst4HeJDhOLYU44eyekWT5X-rNBAhz';
const API_BASE_URL = 'https://bill-pay-api-stats-life.onrender.com';


// ── Hash Generator ────────────────────────────────────────────────────────────
function generateHash(data, secretKey) {
  const json = JSON.stringify(data);
  const sha256Digest = crypto.createHash('sha256').update(json, 'utf8').digest();
  return crypto.createHmac('sha256', secretKey).update(sha256Digest).digest('hex');
}

// ── JWT Generator ─────────────────────────────────────────────────────────────
function generateJWT(userId, secretKey) {
  const now = Math.floor(Date.now() / 1000);
  const header    = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload   = Buffer.from(JSON.stringify({ userId, iat: now, exp: now + 120 })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

// ── API Request Helper ────────────────────────────────────────────────────────
async function apiRequest(endpoint, data) {
  const hash  = generateHash(data, SECRET_KEY);
  const token = generateJWT('IMART', SECRET_KEY);
  const body  = JSON.stringify({ Data: data, Hash: hash });

  console.log('\n── Request ──────────────────────────────────');
  console.log('Endpoint:', endpoint);
  console.log('Body:', JSON.stringify({ Data: data, Hash: hash }, null, 2));

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body,
  });

  console.log('\n── Response ─────────────────────────────────');
  console.log('Status:', response.status);

  // ✅ Safely handle both JSON and HTML responses
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const result = await response.json();
    console.log('Response:', JSON.stringify(result, null, 2));
    return result;
  } else {
    const text = await response.text();
    console.log('Non-JSON response received:', text.substring(0, 300));
    return null;
  }
}

// ── Name Lookup ───────────────────────────────────────────────────────────────
async function nameLookup(billIdentifier) {
  const data = {
    BillIdentifier: billIdentifier,
    Currency: "TZS",
    Language: "sw",
    Country: "TZ",
    TimeStamp: new Date().toISOString(),
    BillType: "255714641171"
  };
  return apiRequest('/api/merchant/name-lookup', data);
}

// ── Payment ───────────────────────────────────────────────────────────────────
async function processPayment({ fspReferenceId, pgReferenceId, amount, billIdentifier, fspCode }) {
  const data = {
    FspReferenceId: fspReferenceId,
    PgReferenceId: pgReferenceId,
    Amount: amount,
    BillIdentifier: billIdentifier,
    PaymentDesc: "Utility Bill Payment",
    FspCode: fspCode,
    Country: "TZ",
    TimeStamp: new Date().toISOString(),
    BillType: "Electricity",
  };
  return apiRequest('/api/merchant/payment', data);
}

// ── Run ───────────────────────────────────────────────────────────────────────
(async () => {
  await nameLookup('255714641171');

  // ✅ camelCase keys to match the function's destructuring
  await processPayment({
    fspReferenceId: 'fsp123456',
    pgReferenceId:  'pg123456',
    amount:         20000.00,
    billIdentifier: '255714641171',
    fspCode:        'FSP123',
  });
})();