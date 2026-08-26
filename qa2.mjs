export default async function run(page, ui) {
  await page.goto('http://localhost:5174/consumer');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    searchDir: getComputedStyle(document.querySelector('.consumer-search-container')).flexDirection,
  }));
  await page.screenshot({ path: 'qa-consumer-mobile-2.png' });
  // tablet
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.waitForTimeout(400);
  r.tabletOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  return r;
}
