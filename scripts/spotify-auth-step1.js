const CLIENT_ID = '2aa0050d9d0a45519af3426f3dca0b69';
const REDIRECT_URI = 'https://elliexcenteno.com/spotify-callback.html';
const SCOPES = 'user-read-recently-played user-top-read';

const authUrl = `https://accounts.spotify.com/authorize?response_type=code`
  + `&client_id=${CLIENT_ID}`
  + `&scope=${encodeURIComponent(SCOPES)}`
  + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
  + `&show_dialog=true`;

console.log('\nsend ellie this url:\n');
console.log(authUrl);
console.log('\nshe taps it on her phone, logs into spotify, hits authorize.');
console.log('she\'ll land on a page showing a code — have her text it back to you.');
console.log('then run: node scripts/spotify-auth-step2.js <code>\n');
