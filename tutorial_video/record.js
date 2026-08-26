const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  console.log('Starting browser...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--window-size=1280,720', '--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: 'videos/',
      size: { width: 1280, height: 720 }
    }
  });

  const page = await context.newPage();
  
  console.log('Navigating to http://localhost:19985');
  await page.goto('http://localhost:19985');
  
  await page.waitForTimeout(2000);
  
  await context.close();
  await browser.close();
  console.log('Done recording.');
  
  const files = fs.readdirSync('videos/');
  console.log('Recorded video files:', files);
})();