// Headless Chrome (GPU) screenshots of the running dev server.
// usage: node tools/shoot.cjs '<json>'
// json = { out, w, h, url, start, views: [{ name, hour, view:[x,y,z,yaw,pitch], wait, eval, measure }] }
const { chromium } = require(process.env.PW_CORE || '/Users/afthab/claude/afthab-edit/engine/node_modules/playwright-core');
const cfg = JSON.parse(process.argv[2] || '{}');
(async () => {
  const browser = await chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: cfg.w || 1440, height: cfg.h || 900 }, deviceScaleFactor: cfg.dsf || 1, hasTouch: !!cfg.touch });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const t0 = Date.now();
  await page.goto(cfg.url || 'http://127.0.0.1:5247/?hour=18.75&view=1.5,3,27,0,0', { waitUntil: 'load' });
  try { await page.waitForFunction(() => window.__meadow, null, { timeout: 90000 }); }
  catch (e) {
    console.log('NO __meadow after 90s');
    console.log(logs.slice(0, 40).join('\n'));
    await page.screenshot({ path: (cfg.out || '/tmp') + '/fail.png' });
    await browser.close();
    return;
  }
  console.log('ready in', Date.now() - t0, 'ms');
  if (cfg.start) await page.evaluate(() => document.querySelector('.go')?.click());
  else if (!cfg.keepStart) await page.evaluate(() => document.querySelector('.start')?.classList.add('gone'));
  for (const v of cfg.views || [{ name: 'default', wait: 3000 }]) {
    await page.evaluate((v) => {
      const o = window.__meadow;
      if (v.hour !== undefined) o.tod.setHour(v.hour, true);
      if (v.view) o.view(...v.view);
      if (v.eval) (0, eval)(v.eval);
    }, v);
    await page.waitForTimeout(v.wait || 2500);
    if (v.measure) { const r = await page.evaluate(v.measure); console.log('measure', v.name, JSON.stringify(r)); continue; }
    const stats = await page.evaluate(() => ({ ...window.__meadow.stats }));
    const path = `${cfg.out}/${v.name}.${cfg.type || 'jpg'}`;
    await page.screenshot({ path, type: cfg.type === 'png' ? 'png' : 'jpeg', quality: 88 });
    console.log(v.name, JSON.stringify(stats), path);
  }
  const errs = logs.filter((l) => /error|warn|fail/i.test(l));
  console.log('console issues:', errs.length);
  console.log(errs.slice(0, 30).join('\n').slice(0, 6000));
  await browser.close();
})();
