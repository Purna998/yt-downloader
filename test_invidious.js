const https = require('https');
https.get('https://vid.puffyan.us/api/v1/videos/nufpHIRA6CM', (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log(data.slice(0, 500)));
});
