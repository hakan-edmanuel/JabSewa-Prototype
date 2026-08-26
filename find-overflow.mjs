export default async function run(page, ui) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:5173/seller');
  await page.waitForTimeout(600);

  const culprits = await page.evaluate(() => {
    const docWidth = document.documentElement.clientWidth;
    const all = document.querySelectorAll('*');
    const wide = [];
    all.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.right > docWidth + 1 || rect.width > docWidth + 1) {
        wide.push({
          tag: el.tagName,
          className: el.className,
          id: el.id,
          width: Math.round(rect.width),
          right: Math.round(rect.right),
          text: el.innerText ? el.innerText.slice(0, 30) : ''
        });
      }
    });
    return wide;
  });
  return culprits;
}
