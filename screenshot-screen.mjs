import puppeteer from 'puppeteer-core';
import { mkdir, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = join(__dirname, 'temporary screenshots');
const url = process.argv[2] || 'http://localhost:3333';
const screenName = process.argv[3] || '';
const label = process.argv[4] ? `-${process.argv[4]}` : (screenName ? `-${screenName}` : '');

await mkdir(dir, { recursive: true });
const files = existsSync(dir) ? await readdir(dir) : [];
const nums = files.map(f => parseInt(f.match(/screenshot-(\d+)/)?.[1] ?? '0')).filter(n => n > 0);
const n = nums.length ? Math.max(...nums) + 1 : 1;
const outPath = join(dir, `screenshot-${n}${label}.png`);

const cacheBase = 'C:/Users/jbern/.cache/puppeteer/chrome';
let executablePath = '';
try {
  const builds = readdirSync(cacheBase).filter(d => d.startsWith('win64-')).sort();
  if (builds.length) executablePath = `${cacheBase}/${builds[builds.length - 1]}/chrome-win64/chrome.exe`;
} catch (e) { console.error('Chrome not found:', e.message); process.exit(1); }

const browser = await puppeteer.launch({
  executablePath, headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 }
});
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
await new Promise(r => setTimeout(r, 500));

if (screenName) {
  await page.evaluate((s) => {
    const btn = document.getElementById('tab-' + s);
    if (btn) btn.click();
  }, screenName);
  await new Promise(r => setTimeout(r, 600));
}

await page.screenshot({ path: outPath, fullPage: false });
await browser.close();
console.log(`Screenshot saved → ${outPath}`);
