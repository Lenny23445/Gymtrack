const fs = require('fs');
const crypto = require('crypto');
const https = require('https');

const ISSUER_ID = '94731ae5-3721-47e1-9745-f9fd2d0c75cf';
const KEY_ID = '273VD75G78';
const P8_PATH = 'C:\\Users\\wolte\\Downloads\\AuthKey_273VD75G78.p8';

const privateKey = fs.readFileSync(P8_PATH, 'utf8');

function makeJWT() {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: ISSUER_ID,
    iat: now,
    exp: now + 1200,
    aud: 'appstoreconnect-v1'
  })).toString('base64url');

  const data = `${header}.${payload}`;
  const sign = crypto.createSign('SHA256');
  sign.update(data);
  const sig = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${data}.${sig}`;
}

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const token = makeJWT();
    const options = {
      hostname: 'api.appstoreconnect.apple.com',
      path,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('Fetching certificates...');
  const result = await apiGet('/v1/certificates?filter[certificateType]=IOS_DISTRIBUTION&limit=10');

  if (!result.data || result.data.length === 0) {
    console.log('No certificates found:', JSON.stringify(result, null, 2));
    return;
  }

  for (const cert of result.data) {
    console.log(`Found: ${cert.attributes.name} (${cert.attributes.certificateType}) expires ${cert.attributes.expirationDate}`);
    const certContent = cert.attributes.certificateContent;
    const certBuffer = Buffer.from(certContent, 'base64');
    const outPath = `ios_distribution_${cert.id}.cer`;
    fs.writeFileSync(outPath, certBuffer);
    console.log(`Saved to ${outPath}`);
  }
}

main().catch(console.error);
