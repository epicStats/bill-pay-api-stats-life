const crypto = require('crypto');  // built-in, no install needed

const SECRET_KEY = 'deos_CsIeYePAIbiaknmhlCBSOkDAgIk8-Tst4HeJDhOLYU44eyekWT5X-rNBAhz';

// ── Hash Generator ────────────────────────────────────────────────────────────
function generateHash(data, secretKey) {
  const json = JSON.stringify(data);
  const sha256Digest = crypto.createHash('sha256').update(json, 'utf8').digest();
  return crypto.createHmac('sha256', secretKey).update(sha256Digest).digest('hex');
}

// ── JWT Generator (no external library needed) ────────────────────────────────
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

// ── Test ──────────────────────────────────────────────────────────────────────
const data = {
  BillIdentifier: "123456789",
  Currency: "TZS",
  Language: "sw",
  Country: "TZ",
  TimeStamp: new Date().toISOString(),
  BillType: "123456789"
};

const hash  = generateHash(data, SECRET_KEY);
const token = generateJWT('IMART', SECRET_KEY);

console.log('Hash:',  hash);
console.log('Token:', token);

console.log('\nFull request body:');
console.log(JSON.stringify({ Data: data, Hash: hash }, null, 2));