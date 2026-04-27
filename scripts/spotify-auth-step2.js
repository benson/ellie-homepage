const CLIENT_ID = '2aa0050d9d0a45519af3426f3dca0b69';
const CLIENT_SECRET = '4de7171c474a45198ba5fcf3dc6c2cec';
const REDIRECT_URI = 'https://elliexcenteno.com/spotify-callback.html';

const code = process.argv[2];
if (!code) {
  console.error('usage: node spotify-auth-step2.js <code>');
  process.exit(1);
}

async function main() {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  const data = await res.json();
  if (!data.refresh_token) {
    console.error('error:', data);
    process.exit(1);
  }

  console.log('\nrefresh token:\n');
  console.log(data.refresh_token);
  console.log('\nadd this as SPOTIFY_REFRESH_TOKEN in the repo secrets.');
  console.log('also add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET (same as your homepage repo).\n');
}

main();
