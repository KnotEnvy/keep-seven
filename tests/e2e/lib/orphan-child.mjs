// Child of tests/e2e/i4.test.mjs: launches a headless browser through tools/browser.mjs, says so, and waits to be killed.
import { launchBrowser } from '../../../tools/browser.mjs';

const browser = await launchBrowser();
await browser.newPage();
console.log('ready ' + process.pid);
setInterval(() => {}, 1000);
