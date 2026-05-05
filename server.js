const crypto  = require('crypto');
const express = require('express');
const mysql = require('mysql2/promise');

const app       = express();
const PORT      = process.env.PORT || 3000;
const SECRET_KEY = 'deos_CsIeYePAIbiaknmhlCBSOkDAgIk8-Tst4HeJDhOLYU44eyekWT5X-rNBAhz';

app.use(express.json());

// ── DB Connection ─────────────────────────────────────────────────────────────
const db = mysql.createPool({
  host:     'nozomi.proxy.rlwy.net',      
  port:      35069,       
  user:     'root',      
  password: 'IxZsgjlZdisXUCYSQkDMrzGWdQxFHqGr',  
  database: 'railway',  
  waitForConnections: true,
  connectionLimit:    10,
  ssl: {
    rejectUnauthorized: false  // ← Required for Railway MySQL
  }
});

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
  console.log('[Auth Header]', authHeader);
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : null;

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

// ── Log Request ───────────────────────────────────────────────────────────────
async function logRequest(endpoint, userId, billIdentifier, requestBody, response, statusCode) {
  try {
    await db.execute(
      `INSERT INTO request_logs (endpoint, user_id, bill_identifier, request_body, response, status_code)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [endpoint, userId, billIdentifier, JSON.stringify(requestBody), JSON.stringify(response), statusCode]
    );
  } catch (err) {
    console.error('[Log Error]', err.message);
  }
}

// ── Name Lookup Endpoint ──────────────────────────────────────────────────────
app.post('/api/merchant/name-lookup', authenticate, verifyHash, async (req, res) => {
  const { BillIdentifier } = req.body.Data;

  try {
    // Query DB for bill and customer
    const [rows] = await db.execute(
      `SELECT c.name, b.amount, b.bill_type, b.bill_identifier, b.status
       FROM bills b
       JOIN customers c ON c.id = b.customer_id
       WHERE b.bill_identifier = ?
       LIMIT 1`,
      [BillIdentifier]
    );

    if (rows.length === 0) {
      const response = { Status: 'Failed', StatusCode: 1, Message: 'Bill not found for the provided BillIdentifier.' };
      await logRequest('/api/merchant/name-lookup', req.claims.userId, BillIdentifier, req.body, response, 404);
      return res.status(404).json(response);
    }

    const bill = rows[0];

    const response = {
      Name:           bill.name,
      BillAmount:     parseFloat(bill.amount),
      BillIdentifier: bill.bill_identifier,
      Status:         'Success',
      Message:        'Name found for the provided BillIdentifier.',
      StatusCode:     0,
    };

    await logRequest('/api/merchant/name-lookup', req.claims.userId, BillIdentifier, req.body, response, 200);
    return res.status(200).json(response);

  } catch (err) {
    console.error('[Name Lookup Error]', err.message);
    const response = { Status: 'Failed', StatusCode: 1, Message: 'Internal server error' };
    await logRequest('/api/merchant/name-lookup', req.claims.userId, BillIdentifier, req.body, response, 500);
    return res.status(500).json(response);
  }
});

// ── Payment Endpoint ──────────────────────────────────────────────────────────
app.post('/api/merchant/payment', authenticate, verifyHash, async (req, res) => {
  const { BillIdentifier, Amount, FspReferenceId, PgReferenceId, FspCode, PaymentDesc } = req.body.Data;

  try {
    // Find the bill
    const [rows] = await db.execute(
      `SELECT b.id, b.amount, b.status FROM bills b WHERE b.bill_identifier = ? LIMIT 1`,
      [BillIdentifier]
    );

    if (rows.length === 0) {
      const response = { Status: 'Failed', StatusCode: 1, Message: 'Bill not found.' };
      await logRequest('/api/merchant/payment', req.claims.userId, BillIdentifier, req.body, response, 404);
      return res.status(404).json(response);
    }

    const bill                = rows[0];
    const merchantReferenceId = `STATS-${Date.now()}`;

    // Record the payment
    await db.execute(
      `INSERT INTO payments (bill_id, fsp_reference_id, pg_reference_id, merchant_reference_id, fsp_code, amount, payment_desc, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'success')`,
      [bill.id, FspReferenceId, PgReferenceId, merchantReferenceId, FspCode, Amount, PaymentDesc]
    );

    // Mark bill as paid
    await db.execute(
      `UPDATE bills SET status = 'paid', updated_at = NOW() WHERE id = ?`,
      [bill.id]
    );

    const response = {
      MerchantReferenceId: merchantReferenceId,
      Status:              'Success',
      StatusCode:          0,
      Message:             'Payment successful.',
    };

    await logRequest('/api/merchant/payment', req.claims.userId, BillIdentifier, req.body, response, 200);
    return res.status(200).json(response);

  } catch (err) {
    console.error('[Payment Error]', err.message);
    const response = { Status: 'Failed', StatusCode: 1, Message: 'Internal server error' };
    await logRequest('/api/merchant/payment', req.claims.userId, BillIdentifier, req.body, response, 500);
    return res.status(500).json(response);
  }
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
  console.log(`Server running on https://bill-pay-api-stats-life.onrender.com:${PORT}`);
});