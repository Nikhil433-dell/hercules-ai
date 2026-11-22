const { chromium } = require('playwright-core');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');

const work = path.join(__dirname, '.build');
const assets = path.join(__dirname, '../../website/assets');
const staging = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'hercules-showcase-'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  module._compile(compiled.outputText, filename);
};
const { normalizeHeadlines } = require('../src/services/newsMonitor.ts');

// Capture the Chromium compositor on a monotonic clock while the UI is being used.
// Frame durations preserve actual cursor travel, clicks, scrolling and reading pauses.
async function record(browser) {
  const data = JSON.parse(fs.readFileSync(path.join(work, 'data.json')));
  const symbol = data.symbol;
  const date = new Date(data.captured).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  data.articles = normalizeHeadlines(data);
  const page = await browser.newPage({ viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1, locale: 'en-US' });
  const debug = await page.context().newCDPSession(page);
  const cdp = (name, args) => debug.send(name, args);
  const run = code => page.evaluate(code);
  const metrics = (width, height, deviceScaleFactor) => cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile: false });
  await metrics(1920, 1080, 1);
  await page.goto(pathToFileURL(path.join(__dirname, 'stage.html')).href);
  const title = await run('window.session = window.boot(' + JSON.stringify(data) + '); window.session.storyTitle');
  await run('document.getElementById("footnote").textContent = ' + JSON.stringify(symbol + '  /  Recorded ' + date));
  await sleep(300);
  const capture = async (format, extra = {}) => Buffer.from((await cdp('Page.captureScreenshot', {
    format, fromSurface: true, ...extra,
  })).data, 'base64');
  const frames = [];
  const chapters = [];
  const start = performance.now();
  let captureError;
  const collectFrame = ({ data, sessionId }) => {
    const file = 'frame-' + frames.length + '.jpg';
    const time = performance.now() - start;
    try {
      fs.writeFileSync(path.join(staging, file), Buffer.from(data, 'base64'));
      frames.push({ time, file });
    } catch (error) { captureError = error; }
    cdp('Page.screencastFrameAck', {sessionId}).catch(error => { captureError = error; });
  };
  debug.on('Page.screencastFrame', collectFrame);
  await cdp('Page.startScreencast', { format: 'jpeg', quality: 94, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  async function chapter(label, headline, caption) {
    chapters.push({ time: performance.now() - start, label: headline });
    const copy = JSON.stringify([label, headline, caption]);
    await run(`(() => {
      const nodes = ['chapter','headline','caption'].map(id => document.getElementById(id));
      ${copy}.forEach((value, i) => { nodes[i].textContent = value; });
      document.querySelector('.film-copy').animate([{opacity:.3,translate:'0 5px'},{opacity:1,translate:'0 0'}], {duration:300});
    })()`);
  }
  // Position the actual renderer control before delivering native Chromium input.
  function element(selector, prefix = '') {
    return `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(el => el.textContent.trim().startsWith(${JSON.stringify(prefix)}))`;
  }
  async function frameControl(target, fraction = .28) {
    await run(`(() => { const el = ${target}; if (!el) throw Error('Missing recording target');
      const scroller = el.closest('.article-scroll, .news-feed');
      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        const dy = (el.getBoundingClientRect().top - rect.top) * scroller.clientHeight / rect.height - scroller.clientHeight * ${fraction};
        scroller.scrollBy({top:dy,behavior:'smooth'});
      }
    })()`);
    await sleep(650);
  }
  async function click(target, scroll = true) {
    if (scroll) await frameControl(target);
    const point = await run(`(() => { const el = ${target}; const r=el.getBoundingClientRect();
      const x = r.x + Math.min(r.width * .48, 125), y = r.y + r.height * .48;
      if (!el.contains(document.elementFromPoint(x,y))) throw Error('Recording control obscured: '+el.textContent.slice(0,50));
      document.getElementById('pointer').style.transform = 'translate('+x/2+'px,'+y/2+'px)'; return {x,y}; })()`);
    await sleep(520);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await run("document.getElementById('pointer').classList.add('pressed')");
    for (const type of ['mousePressed', 'mouseReleased']) {
      await cdp('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
    }
    await sleep(500);
    await run("document.getElementById('pointer').classList.remove('pressed')");
  }
  async function reveal(section, prefix, label, headline, caption) {
    const control = element(section + ' summary', prefix);
    await chapter(label, headline, caption);
    await click(control);
    if (!(await run(`(${control}).parentElement.open`))) throw Error('Disclosure did not expand: ' + prefix);
    await sleep(1900);
  }

  try {
    await chapter('Hercules for macOS', 'Inside the news.', 'Open the H to bring the latest market stories into view.');
    await sleep(1300);
    await click(element('#tray'), false);
    await chapter('The news feed', 'Choose a story.', 'A ticker beside the headline gives you a way into the company behind it.');
    await sleep(950);
    const storyButton = element('.card-open', title);
    await frameControl(storyButton);
    await click(storyButton, false);
    await chapter('Company exposure', 'Follow the evidence.', 'Read the source excerpt behind the company link, then check the quote and its timestamp.');
    await sleep(850);
    fs.writeFileSync(path.join(staging, 'walkthrough-poster.png'), await capture('png'));
    await frameControl(element('.impact-company > strong'), .06);
    await sleep(1700);
    await chapter('Company news dossier', 'Look back.', 'See how often the company appeared in saved coverage before this story.');
    await click(element('button', 'Company news dossier'));
    const dossier = '[aria-label="' + symbol + ' news dossier"]';
    const dossierItems = await run(`Array.from(document.querySelectorAll('${dossier} summary'), el => el.textContent)`);
    if (!dossierItems.length) throw Error('Choose a story with earlier coverage');
    await sleep(1600);
    for (const item of dossierItems) {
      await reveal(dossier, item, 'Company news dossier', item.startsWith('Earlier coverage') ? 'Read the earlier story.' : 'Inspect the context.',
        'Open the supporting detail and see where the evidence came from.');
    }
    await chapter('Stock thesis', 'Check the thesis.', 'Compare the news signal with the price history and financial evidence available for ' + symbol + '.');
    await click(element('button', 'Check stock thesis'));
    const research = '[aria-label="' + symbol + ' research assessment"]';
    await frameControl(element(research + ' h4'), .07);
    await sleep(1900);
    const sections = [
      ['Technicals', 'Read the price trend.', 'Review moving averages, momentum and drawdown alongside the daily close.'],
      ['Fundamentals', 'Inspect the financials.', 'Check the reported metrics and see which inputs are incomplete.'],
      ['Risks', 'Weigh the risks.', 'Open the caveats before deciding how much weight to give the assessment.'],
      ['Local news history', 'Count the precedents.', 'See which event types have appeared in the saved company history.'],
      ['Method and sources', 'Trace the sources.', 'The assessment keeps its methodology and market-data sources within reach.'],
    ];
    const summaries = await run(`Array.from(document.querySelectorAll('${research} summary'), el => el.textContent)`);
    for (const summary of summaries) {
      const [prefix, heading, caption] = sections.find(([prefix]) => summary.startsWith(prefix)) || [summary, summary, 'Review the evidence behind this assessment.'];
      await reveal(research, prefix, symbol + ' / Stock thesis', heading, caption);
    }
    await chapter('Hercules for macOS', 'Back to the feed.', 'One click returns you to the rest of the day’s stories.');
    await click(element('.article-header button', '‹ All news'), false);
    await sleep(1800);
  } finally {
    await cdp('Page.stopScreencast');
    debug.off('Page.screencastFrame', collectFrame);
  }
  if (captureError) throw captureError;
  if (frames.length < 25) throw Error('Insufficient browser frames');
  const end = performance.now() - start;
  // Use a taller viewport for the 3x stills. The film keeps its original framing.
  await page.addStyleTag({ content: '#scene{width:100vw;height:100vh;transform:none} #product, #product[data-view]{inset:0;width:100%;height:100%;} #pointer,.film-copy,.film-bar,.film-foot{display:none}' });
  async function photo(name) {
    await sleep(350);
    fs.writeFileSync(path.join(staging, name + '-preview.png'), await capture('png'));
  }
  await metrics(360, 650, 3);
  await run('window.session.panel()');
  await photo('feed');
  await metrics(300, 175, 3);
  await run('window.session.popup()');
  await photo('popup');
  await metrics(420, 750, 3);
  await run('window.electronAPI.openArticle(' + JSON.stringify(data.articles.find(item => item.title === title).id) + ')');
  await photo('article');
  await metrics(420, 470, 3);
  await run(element('button', 'Company news dossier') + '.click()');
  await run(element('.stock-research summary', 'Earlier coverage') + '.click()');
  await frameControl(element('button', 'Hide company dossier'), .03);
  await photo('dossier');
  await run(element('button', 'Check stock thesis') + '.click()');
  await run(element('.research-section summary', 'Technicals') + '.click()');
  await frameControl(element('.research-section summary', 'Technicals'), .05);
  await photo('technicals');
  await page.close();
  const timing = frames.flatMap((frame, i) => [
    "file '" + frame.file + "'", 'option framerate 1000', 'duration ' + (((frames[i+1]?.time ?? end) - frame.time) / 1000).toFixed(4),
  ]);
  timing.push("file '" + frames.at(-1).file + "'", 'option framerate 1000');
  fs.writeFileSync(path.join(staging, 'timings.txt'), timing.join('\n'));
  execFileSync(process.env.HERCULES_FFMPEG || 'ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'timings.txt',
    '-vf', 'fps=25', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'walkthrough.mp4',
  ], { cwd: staging });
  const timestamp = ms => new Date(Math.floor(ms)).toISOString().slice(11, 23);
  const cues = chapters.map(({ time, label }, i) => timestamp(i ? time : 0) + ' --> ' + timestamp(chapters[i+1]?.time ?? end) + '\n' + label);
  fs.writeFileSync(path.join(staging, 'walkthrough.vtt'), 'WEBVTT\n\n' + cues.join('\n\n') + '\n');
  for (const file of fs.readdirSync(staging).filter(name => /\.(png|mp4|vtt)$/.test(name))) {
    fs.copyFileSync(path.join(staging, file), path.join(assets, file));
  }
  console.log('Captured', frames.length, 'frames and', chapters.length, 'chapters over', (end / 1000).toFixed(1), 'seconds.');
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try { await record(browser); }
  finally { await browser.close(); fs.rmSync(staging, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
