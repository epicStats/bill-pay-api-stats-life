const crypto = require('crypto');
const https = require('https'); // built-in, no install needed

const SECRET_KEY = 'deos_CsIeYePAIbiaknmhlCBSOkDAgIk8-Tst4HeJDhOLYU44eyekWT5X-rNBAhz';
const API_BASE_URL = 'https://portal.lipapay.co.tz'; // replace with your actual URL

// ── Hash Generator ──
function generateHash(data, secretKey) {
  const json = JSON.stringify(data);
  const sha256Digest = crypto.createHash('sha256').update(json, 'utf8').digest();
  return crypto.createHmac('sha256', secretKey).update(sha256Digest).digest('hex');
}

// ── JWT Generator ──
function generateJWT(userId, secretKey) {
  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ userId, iat: now, exp: now + 120 })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

// ── API Request Helper ──
async function apiRequest(endpoint, data) {
  const hash  = generateHash(data, SECRET_KEY);
  const token = generateJWT('IMART', SECRET_KEY); // ← replace with your actual userId

  const body = JSON.stringify({ Data: data, Hash: hash });

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`, // ← token passed here
    },
    body,
  });

  const result = await response.json();
  console.log('Status:', response.status);
  console.log('Response:', JSON.stringify(result, null, 2));
  return result;
}

// ── Name Lookup ───
async function nameLookup(billIdentifier) {
  const data = {
    BillIdentifier: billIdentifier,
    Currency: "TZS",
    Language: "sw",
    Country: "TZ",
    TimeStamp: new Date().toISOString(),
    BillType: "123456789"
  };
  return apiRequest('/api/merchant/name-lookup', data);
}

// ── Payment ───
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
    BillType: "123456789",
  };
  return apiRequest('/api/merchant/payment', data);
}

// ── Run ───
(async () => {
  // Test Name Lookup
  await nameLookup('123456789');

  // Test Payment (uncomment when ready)
  await processPayment({
  FspReferenceId: 'fsp123456',
  PgReferenceId: 'pg123456',
  Amount: 1000,
  BillIdentifier: '123456789',
  FspCode: 'FSP123',
  });
})();