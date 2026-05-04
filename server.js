const crypto  = require('crypto');
const express = require('express');

const app       = express();
const PORT      = 3000;
const SECRET_KEY = 'deos_CsIeYePAIbiaknmhlCBSOkDAgIk8-Tst4HeJDhOLYU44eyekWT5X-rNBAhz';

app.use(express.json());

// ── Hash Generator ────────────────────────────────────────────────────────────
function generateHash(data, secretKey) {
  const json        = JSON.stringify(data);
  const sha256Digest = crypto.createHash('sha256').update(json, 'utf8').digest();
  return crypto.createHmac('sha256', secretKey).update(sha256Digest).digest('hex');
}

// ── JWT Verifier ──────────────────────────────────────────────────────────────
function verifyJWT(token, secretKey) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Wrong number of segments');

  const [header, payload, signature] = parts;

  // Re-compute the expected signature
  const expectedSig = crypto
    .createHmac('sha256', secretKey)
    .update(`${header}.${payload}`)
    .digest('base64url');

  if (expectedSig !== signature) throw new Error('Invalid signature');

  // Decode and validate claims
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  const now    = Math.floor(Date.now() / 1000);

  if (claims.exp < now) throw new Error('Expired token');
  if (claims.iat > now + 30) throw new Error('Token issued in the future');

  return claims;
}

// ── Auth Middleware ───────────────────────────────────────────────────────────
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      Status: 'Failed',
      StatusCode: 1,
      Message: 'Missing authorization token',
    });
  }

  try {
    req.claims = verifyJWT(token, SECRET_KEY);
    next();
  } catch (err) {
    return res.status(401).json({
      Status: 'Failed',
      StatusCode: 1,
      Message: `Invalid token or signature: ${err.message}`,
    });
  }
}

// ── Hash Verification Middleware ──────────────────────────────────────────────
function verifyHash(req, res, next) {
  const { Data, Hash } = req.body;

  if (!Data || !Hash) {
    return res.status(400).json({
      Status: 'Failed',
      StatusCode: 1,
      Message: 'Missing Data or Hash field',
    });
  }

  const expectedHash = generateHash(Data, SECRET_KEY);

  if (expectedHash !== Hash) {
    return res.status(400).json({
      Status: 'Failed',
      StatusCode: 1,
      Message: 'Hash verification failed',
    });
  }

  next();
}

// ── Name Lookup Endpoint ──────────────────────────────────────────────────────
app.post('/api/merchant/name-lookup', authenticate, verifyHash, (req, res) => {
  const { BillIdentifier } = req.body.Data;

  console.log(`[Name Lookup] BillIdentifier: ${BillIdentifier} | User: ${req.claims.userId}`);

  // Hardcoded dummy data — replace with DB query later
  return res.status(200).json({
    Name:            'John Doe',
    BillAmount:      150,
    BillIdentifier:  BillIdentifier,
    Status:          'Success',
    Message:         'Name found for the provided BillIdentifier.',
    StatusCode:      0,
  });
});

// ── Payment Endpoint ──────────────────────────────────────────────────────────
app.post('/api/merchant/payment', authenticate, verifyHash, (req, res) => {
  const { BillIdentifier, Amount, FspReferenceId, PgReferenceId } = req.body.Data;

  console.log(`[Payment] BillIdentifier: ${BillIdentifier} | Amount: ${Amount} | User: ${req.claims.userId}`);

  // Hardcoded dummy response — replace with actual payment logic later
  return res.status(200).json({
    MerchantReferenceId: `IMART-${Date.now()}`,
    Status:              'Success',
    StatusCode:          0,
    Message:             'Payment successful.',
  });
});

// ── 404 Handler (prevents HTML error pages) ───────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    Status:     'Failed',
    StatusCode: 1,
    Message:    `Route ${req.method} ${req.path} not found`,
  });
});

// ── Global Error Handler (prevents HTML error pages) ─────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({
    Status:     'Failed',
    StatusCode: 1,
    Message:    'Internal server error',
  });
});

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});