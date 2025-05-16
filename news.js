import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

async function fetchCCTVNews() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://news.cctv.com/', { timeout: 30000 });
  await page.waitForSelector('.content_area .title', { timeout: 10000 });

  // 央视新闻主页头条+要闻列表
  const news = await page.$$eval('.content_area .title', nodes =>
    nodes.slice(0, 20).map(node => {
      const a = node.querySelector('a');
      return {
        title: a?.innerText?.trim() || '',
        url: a?.href || ''
      };
    })
  );

  // 补充抓简介（抓取新闻摘要或第一段，速度慢可选）
  // for (let i = 0; i < news.length; i++) {
  //   if (!news[i].url) continue;
  //   try {
  //     await page.goto(news[i].url, { timeout: 10000 });
  //     await page.waitForSelector('p', { timeout: 5000 });
  //     const desc = await page.$eval('p', p => p.innerText.trim());
  //     news[i].brief = desc;
  //   } catch {}
  // }

  await browser.close();
  return news.filter(n => n.title && n.url);
}

async function saveNews(news) {
  const now = new Date();
  const date = now.toISOString().slice(0,10);
  const time = now.toTimeString().slice(0,8).replace(/:/g,'-');
  let md = `# ${date} ${time} 中央新闻前20条（央视新闻 Playwright）\n\n`;
  news.forEach((n,i)=>{
    md += `### ${i+1}. [${n.title}](${n.url})\n`;
    // if(n.brief) md += `- 简介：${n.brief}\n`;
    md += '\n';
  });
  await fs.mkdir('./news',{recursive:true});
  const fname = `中央新闻_${date}_${time}.md`;
  await fs.writeFile(path.join('./news', fname), md, 'utf-8');
  console.log(`央视新闻已保存：news/${fname}`);
}

(async () => {
  try {
    const news = await fetchCCTVNews();
    if (news.length === 0) {
      throw new Error('页面结构可能变化或被反爬，未抓到任何新闻');
    }
    await saveNews(news);
  } catch (e) {
    console.error('新闻抓取失败：', e.message || e);
  }
})();
