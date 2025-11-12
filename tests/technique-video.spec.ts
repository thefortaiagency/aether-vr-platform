import { expect, test } from '@playwright/test';

async function clickCanvasCenter(page: import('@playwright/test').Page) {
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Canvas bounding box unavailable');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.click(x, y, { delay: 25 });
}

test('technique card toggles video playback when clicked', async ({ page }) => {
  await page.goto('/');

  await page.waitForSelector('canvas');
  await page.waitForFunction(() => {
    const videos = Array.from(document.querySelectorAll('video[data-technique-video]')) as HTMLVideoElement[];
    return videos.length > 0 && videos.every((video) => video.readyState >= 2);
  });

  const firstVideo = page.locator('video[data-technique-video]').first();
  await expect(firstVideo).toHaveJSProperty('paused', true);

  await clickCanvasCenter(page);

  await expect(firstVideo).toHaveJSProperty('paused', false);
  await firstVideo.evaluate(
    (video) =>
      new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('Video did not advance in time')), 5000);
        const check = () => {
          if (video.currentTime > 0) {
            window.clearTimeout(timeout);
            resolve();
            return;
          }
          requestAnimationFrame(check);
        };
        check();
      })
  );

  const currentTime = await firstVideo.evaluate((video) => video.currentTime);
  expect(currentTime).toBeGreaterThan(0);

  await clickCanvasCenter(page);

  await expect(firstVideo).toHaveJSProperty('paused', true);
});
