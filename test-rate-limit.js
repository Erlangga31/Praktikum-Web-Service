(async () => {
  const options = process.env.API_KEY
    ? { headers: { 'X-API-Key': process.env.API_KEY } }
    : undefined;

  for (let i = 1; i <= 30; i++) {
    const res = await fetch('http://localhost:8080/catalog/', options);
    console.log(i, res.status);
  }
})().catch((error) => {
  console.error('Gagal menguji rate limit:', error);
  process.exitCode = 1;
});
