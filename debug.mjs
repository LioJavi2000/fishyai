import puppeteer from 'puppeteer-core';
import { readdirSync } from 'fs';

const cacheBase = 'C:/Users/jbern/.cache/puppeteer/chrome';
let executablePath = '';
try {
  const builds = readdirSync(cacheBase).filter(d => d.startsWith('win64-')).sort();
  if (builds.length) executablePath = `${cacheBase}/${builds[builds.length - 1]}/chrome-win64/chrome.exe`;
} catch (e) { console.error('Chrome not found'); process.exit(1); }

const browser = await puppeteer.launch({
  executablePath, headless: true,
  args: ['--no-sandbox'],
  defaultViewport: { width: 1440, height: 900 }
});
const page = await browser.newPage();

const errors = [];
const warnings = [];
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
  if (msg.type() === 'warning') warnings.push(msg.text());
});
page.on('pageerror', err => errors.push('PAGE ERROR: ' + err.message));

await page.goto('http://localhost:3333', { waitUntil: 'networkidle0', timeout: 20000 });
await new Promise(r => setTimeout(r, 500));

const screens = ['onboard1','onboard2','auth','feed','scan','processing','result','log','map','leaderboard','profile','paywall'];
const screenErrors = {};

for (const s of screens) {
  const before = errors.length;
  await page.evaluate((name) => {
    const btn = document.getElementById('tab-' + name);
    if (btn) btn.click(); else console.error('TAB MISSING: tab-' + name);
  }, s);
  await new Promise(r => setTimeout(r, 500));

  // Check for missing DOM elements
  const checks = await page.evaluate((name) => {
    const issues = [];
    const screen = document.getElementById('screen-' + name);
    if (!screen) issues.push('screen element missing: screen-' + name);
    else {
      // Check all buttons inside have onclick or event listeners
      const btns = screen.querySelectorAll('button, [onclick]');
      btns.forEach(b => {
        if (b.tagName === 'BUTTON' && !b.onclick && !b.getAttribute('onclick')) {
          issues.push(`button missing handler: "${b.textContent.trim().slice(0,30)}"`);
        }
      });
      // Check all .tog elements
      screen.querySelectorAll('.tog').forEach((t, i) => {
        if (!t.onclick && !t.getAttribute('onclick')) issues.push(`toggle #${i} missing onclick`);
      });
    }
    return issues;
  }, s);

  if (checks.length) screenErrors[s] = checks;
  if (errors.length > before) screenErrors[s] = [...(screenErrors[s] || []), ...errors.slice(before)];
}

// Test shutter flow
await page.evaluate(() => document.getElementById('tab-scan')?.click());
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => { const s = document.querySelector('.shutter'); if(s) s.click(); else console.error('SHUTTER MISSING'); });
await new Promise(r => setTimeout(r, 400));
const afterShutter = await page.evaluate(() => document.getElementById('screen-processing')?.classList.contains('active'));
if (!afterShutter) errors.push('Shutter click did not navigate to processing screen');

// Test like button
await page.evaluate(() => document.getElementById('tab-feed')?.click());
await new Promise(r => setTimeout(r, 300));
const likeResult = await page.evaluate(() => {
  const btn = document.getElementById('like-1');
  if (!btn) return 'like-1 element missing';
  const before = btn.querySelector('.like-count')?.textContent;
  btn.click();
  const after = btn.querySelector('.like-count')?.textContent;
  return { before, after, toggled: btn.classList.contains('liked') };
});

// Test lure dropdown
await page.evaluate(() => document.getElementById('tab-log')?.click());
await new Promise(r => setTimeout(r, 300));
const lureResult = await page.evaluate(() => {
  const inp = document.getElementById('lure-input');
  if (!inp) return 'lure-input missing';
  inp.click();
  const drop = document.getElementById('lure-dropdown');
  return { dropExists: !!drop, dropOpen: drop?.classList.contains('open') };
});

// Test plan selection
await page.evaluate(() => document.getElementById('tab-paywall')?.click());
await new Promise(r => setTimeout(r, 300));
const planResult = await page.evaluate(() => {
  const annual = document.getElementById('plan-annual');
  if (!annual) return 'plan-annual missing';
  annual.click();
  const btn = document.getElementById('subscribe-btn');
  return { annualSelected: annual.classList.contains('sel'), btnText: btn?.textContent?.trim() };
});

await browser.close();

console.log('\n═══════════════════════════════');
console.log('  FISHY AI DEBUG REPORT');
console.log('═══════════════════════════════\n');

if (errors.length === 0) console.log('✅ No JS console errors\n');
else { console.log('❌ JS ERRORS:'); errors.forEach(e => console.log('  -', e)); console.log(); }

if (warnings.length === 0) console.log('✅ No console warnings\n');
else { console.log('⚠️  WARNINGS:', warnings.length, 'total\n'); }

if (Object.keys(screenErrors).length === 0) console.log('✅ All screens passed element checks\n');
else { console.log('❌ SCREEN ISSUES:'); Object.entries(screenErrors).forEach(([s,errs]) => { console.log(`  [${s}]`); errs.forEach(e => console.log('    -', e)); }); console.log(); }

console.log('INTERACTION TESTS:');
console.log(`  Like toggle: ${JSON.stringify(likeResult)}`);
console.log(`  Lure dropdown: ${JSON.stringify(lureResult)}`);
console.log(`  Plan selection: ${JSON.stringify(planResult)}`);
console.log(`  Shutter→Processing: ${afterShutter ? '✅' : '❌'}`);
