#!/usr/bin/env node

const https = require('https');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const PROJECT_ID = 'prj_rfz8tC09aojJEnILxLIXVGZd3Y9S';
const TEAM_ID = 'team_y66Lva6Z6McXlI2DBcOrjroQ';
const DOMAIN = 'vr.aethervtc.ai';

async function getVercelToken() {
  try {
    const { stdout } = await execPromise('cat ~/.vercel/auth.json');
    const auth = JSON.parse(stdout);
    return auth.token;
  } catch (error) {
    console.error('Failed to get Vercel token:', error.message);
    process.exit(1);
  }
}

async function addDomain(token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      name: DOMAIN
    });

    const options = {
      hostname: 'api.vercel.com',
      path: `/v10/projects/${PROJECT_ID}/domains?teamId=${TEAM_ID}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          console.log('✅ Domain added successfully!');
          console.log(JSON.parse(responseData));
          resolve(JSON.parse(responseData));
        } else {
          console.error(`❌ Failed to add domain (${res.statusCode})`);
          console.error(responseData);
          reject(new Error(responseData));
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request failed:', error.message);
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

async function main() {
  console.log(`🔧 Adding domain ${DOMAIN} to project...`);

  const token = await getVercelToken();
  console.log('✅ Vercel token retrieved');

  await addDomain(token);
}

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
