const crypto = require('node:crypto');

module.exports = function observability(app, service) {
  const stats = {
    startedAt: new Date().toISOString(),
    requests: 0,
    errors5xx: 0,
    totalMs: 0,
  };

  app.use((req, res, next) => {
    if (req.path === '/health') return next();

    const suppliedId = req.get('X-Request-Id');
    const id = suppliedId && /^[A-Za-z0-9._:-]{1,128}$/.test(suppliedId)
      ? suppliedId
      : crypto.randomUUID();
    req.id = id;
    res.setHeader('X-Request-Id', id);
    const started = process.hrtime.bigint();

    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      stats.requests += 1;
      stats.totalMs += ms;
      if (res.statusCode >= 500) stats.errors5xx += 1;
      console.log(JSON.stringify({
        time: new Date().toISOString(),
        service,
        id,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms: Math.round(ms),
      }));
    });

    next();
  });

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service,
      uptimeSec: Math.round(process.uptime()),
    });
  });

  app.get('/metrics', (req, res) => {
    res.json({
      service,
      startedAt: stats.startedAt,
      requests: stats.requests,
      errors5xx: stats.errors5xx,
      avgMs: stats.requests ? Math.round(stats.totalMs / stats.requests) : 0,
    });
  });
};
