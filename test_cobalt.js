const https = require('https');
const data = JSON.stringify({ url: 'https://www.youtube.com/watch?v=nufpHIRA6CM' });
const options = {
  hostname: 'api.cobalt.tools',
  path: '/api/json',
  method: 'POST',
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Content-Length': data.length
  }
};
const req = https.request(options, res => {
  let d = '';
  res.on('data', chunk => d += chunk);
  res.on('end', () => console.log(d.slice(0, 500)));
});
req.write(data);
req.end();
