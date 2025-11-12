import { expect, test } from '@playwright/test';

test('debug: check what is actually rendering', async ({ page }) => {
  // Capture console logs
  const logs: string[] = [];
  page.on('console', (msg) => {
    logs.push(`${msg.type()}: ${msg.text()}`);
  });

  await page.goto('/');

  // Wait for canvas
  await page.waitForSelector('canvas', { timeout: 10000 });

  // Wait a bit for scene to load
  await page.waitForTimeout(5000);

  // Check what's in the DOM
  const domInfo = await page.evaluate(() => {
    // Look for any video element, not just data-technique-video
    const allVideos = Array.from(document.querySelectorAll('video'));
    const techniqueVideos = allVideos.filter(v => v.hasAttribute('data-technique-video'));

    return {
      canvasExists: !!document.querySelector('canvas'),
      totalVideoCount: allVideos.length,
      videoCount: techniqueVideos.length,
      videoElements: techniqueVideos.map((v: any) => ({
        src: v.src,
        readyState: v.readyState,
        networkState: v.networkState,
        error: v.error ? { code: v.error.code, message: v.error.message } : null,
        paused: v.paused,
        muted: v.muted,
        visible: v.style.display !== 'none' && v.style.opacity !== '0',
        width: v.videoWidth,
        height: v.videoHeight
      })),
      hasWebGLContext: (() => {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement;
        if (!canvas) return false;
        try {
          return !!(canvas.getContext('webgl') || canvas.getContext('webgl2'));
        } catch {
          return false;
        }
      })()
    };
  });

  console.log('DOM Info:', JSON.stringify(domInfo, null, 2));

  // Print relevant console logs
  const videoLogs = logs.filter(log => log.includes('VIDEO DEBUG') || log.includes('CARD DEBUG') || log.includes('TEXTURE DEBUG'));
  console.log('\n=== VIDEO/CARD/TEXTURE LOGS ===');
  videoLogs.forEach(log => console.log(log));

  const errorLogs = logs.filter(log => log.includes('error:') || log.includes('Error'));
  if (errorLogs.length > 0) {
    console.log('\n=== ERROR LOGS ===');
    errorLogs.forEach(log => console.log(log));
  }

  // Take screenshot
  await page.screenshot({ path: 'test-results/debug-scene.png', fullPage: true });

  // Print summary
  console.log('\n=== SUMMARY ===');
  console.log(`Canvas exists: ${domInfo.canvasExists}`);
  console.log(`WebGL context: ${domInfo.hasWebGLContext}`);
  console.log(`Video elements created: ${domInfo.videoCount}`);
  console.log(`Videos loaded (readyState >= 2): ${domInfo.videoElements.filter(v => v.readyState >= 2).length}`);

  // This test always passes - it's just for diagnostics
  expect(domInfo.canvasExists).toBe(true);
});
