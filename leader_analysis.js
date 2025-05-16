// dailyRecapHybrid.mjs
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';

const TUSHARE_TOKEN = '你的TuShareToken'; // 建议从.env读取
const TUSHARE_INDEX_API = 'https://api.tushare.pro';

async function fetchIndicesByTuShare() {
  try {
    const res = await axios.post(TUSHARE_INDEX_API, {
      api_name: 'index_daily',
      token: TUSHARE_TOKEN,
      params: {
        ts_code: '000001.SH,399001.SZ,399006.SZ', // 上证、深成、创业
        trade_date: (new Date()).toISOString().slice(0,10).replace(/-/g, '')
      },
      fields: 'ts_code,close'
    });
    if (res.data.code === 0 && res.data.data && res.data.data.items.length) {
      // 转换格式，补充index名称
      const codeMap = {
        '000001.SH': '上证指数',
        '399001.SZ': '深证成指',
        '399006.SZ': '创业板指'
      };
      return res.data.data.items.map(item => ({
        name: codeMap[item[0]],
        now: item[1]
      }));
    }
    throw new Error('TuShare无有效数据');
  } catch (err) {
    console.warn('TuShare获取指数失败:', err.message);
    return null; // fallback用
  }
}

// Playwright爬虫（和你的原本代码一致，略有优化）
async function fetchIndicesBySpider(page) {
  // 参考你原本的fetchIndices，但补充反反爬技巧
  await page.goto('https://quote.eastmoney.com/center', { waitUntil: 'networkidle' });
  await page.waitForSelector('.table-wrap .tbody .tr', { timeout: 15000 });
  const rows = await page.$$eval('.table-wrap .tbody .tr', rows => rows.map(tr => {
    const tds = tr.querySelectorAll('td');
    return {
      name: tds[1]?.innerText.trim(),
      now:  tds[2]?.innerText.replace(/,/g,''),
      close: tds[5]?.innerText.replace(/,/g,'')
    };
  }));
  return rows.filter(r=>['上证指数','深证成指','创业板指'].includes(r.name));
}

// 通用“优先API-兜底爬虫”函数
async function getIndices(page) {
  // 先走TuShare
  let indices = await fetchIndicesByTuShare();
  if (!indices || !indices.length) {
    console.log('API无效，切换爬虫...');
    indices = await fetchIndicesBySpider(page);
  }
  return indices;
}

// 其余如龙虎榜、板块同理，写成“优先API，兜底爬虫”模式

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    // 可以随机User-Agent
    userAgent: randomUserAgent()
  });
  // 如有代理，可加proxy
  let md='';
  try {
    const indices = await getIndices(page); // <-- 此处是混合方案
    md += `# ${new Date().toLocaleString()} A股复盘报告（TuShare优先，Playwright兜底）\n\n`;
    md += `## 一、三大指数\n`;
    indices.forEach(i=>md+=`- ${i.name}: 收于${i.now}点\n`);
    // 其余龙虎榜、板块同理...
    // ...
    await browser.close();
    // 写文件
    const now = new Date();
    const date = now.toISOString().slice(0,10);
    const time = now.toTimeString().slice(0,8).replace(/:/g,'-');
    await fs.mkdir('./log',{recursive:true});
    const fname = `复盘报告_${date}_${time}.md`;
    await fs.writeFile(path.join('./log',fname), md, 'utf-8');
    console.log(`报告已生成 log/${fname}`);
  } catch (e) {
    await browser.close();
    console.error('生成失败:',e);
  }
}

// 简单的User-Agent随机
function randomUserAgent() {
  const ualist = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; WOW64; rv:45.0) Gecko/20100101 Firefox/45.0',
    // ...
  ];
  return ualist[Math.floor(Math.random()*ualist.length)];
}

main();
