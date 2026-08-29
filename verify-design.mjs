export default async function run(page, ui) {
  const results = {};

  // 1. Desktop (1440px)
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(600);
  results.desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: 'verify-home-desktop.png', fullPage: true });

  // 2. Tablet (820px)
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.waitForTimeout(400);
  results.tabletOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  // 3. Mobile (390px)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  results.mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: 'verify-home-mobile.png', fullPage: true });

  return results;
}
