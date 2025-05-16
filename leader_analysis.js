// dailyRecapRealDom.mjs
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

async function fetchIndices(page) {
  await page.goto('https://quote.eastmoney.com/center');
  await page.waitForSelector('.table-wrap .tbody .tr', {timeout: 15000});
  // 上证、深证、创业板
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

async function fetchLhb(page) {
  await page.goto('https://data.eastmoney.com/longhu/');
  await page.waitForSelector('#DataTable > tbody > tr', {timeout: 15000});
  return await page.$$eval('#DataTable > tbody > tr', trs => trs.map(tr=>{
    const tds = tr.querySelectorAll('td');
    return {
      date: tds[0]?.innerText,
      code: tds[1]?.innerText,
      name: tds[2]?.innerText,
      reason: tds[3]?.innerText,
      close: tds[4]?.innerText,
      pct_chg: tds[5]?.innerText,
      amount: tds[6]?.innerText,
      net_amount: tds[9]?.innerText,
      org_net: tds[11]?.innerText
    }
  }));
}

async function fetchBlocks(page) {
  await page.goto('https://quote.eastmoney.com/center/boardlist.html#concept_board');
  await page.waitForSelector('.table tbody tr', {timeout: 15000});
  return await page.$$eval('.table tbody tr', trs => trs.slice(0,20).map(tr=>{
    const tds = tr.querySelectorAll('td');
    return {
      name: tds[1]?.innerText,
      code: tds[1]?.querySelector('a')?.href.match(/boardcode=(\w+)/)?.[1]||'',
      pct: tds[3]?.innerText
    };
  }));
}

// 板块龙头（只取第一个股票，速度优先）
async function fetchLeaders(page, blockCode) {
  if (!blockCode) return [];
  await page.goto(`https://quote.eastmoney.com/center/boardlist.html#concept_board?boardcode=${blockCode}`);
  await page.waitForSelector('.table tbody tr', {timeout: 15000});
  return await page.$$eval('.table tbody tr', trs => {
    const arr=[];
    for(let tr of trs) {
      const tds = tr.querySelectorAll('td');
      arr.push({
        name: tds[1]?.innerText,
        code: tds[1]?.querySelector('a')?.href.split('/').pop().replace('.html','')||'',
        price: tds[2]?.innerText,
        pct_chg: tds[4]?.innerText
      });
      if (arr.length>=3) break;
    }
    return arr;
  });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let md='';
  try {
    // 三大指数
    const indices = await fetchIndices(page);
    md += `# ${new Date().toLocaleString()} A股复盘报告（Playwright版）\n\n`;
    md += `## 一、三大指数\n`;
    indices.forEach(i=>md+=`- ${i.name}: 收于${i.now}点，昨收${i.close}\n`);
    // 龙虎榜
    const lhb = await fetchLhb(page);
    md += `\n## 二、龙虎榜\n`;
    lhb.slice(0,30).forEach(it=>{
      md += `- ${it.name}(${it.code}) 原因:${it.reason}，收盘:${it.close}，涨跌幅:${it.pct_chg}，成交额:${it.amount}，净买入:${it.net_amount}，机构净买:${it.org_net}\n`;
    });
    // 板块
    const blocks = await fetchBlocks(page);
    md += `\n## 三、热门概念板块Top${blocks.length}\n`;
    for(const b of blocks) {
      md+=`\n- **${b.name}**（涨幅:${b.pct}）\n`;
      const leaders = await fetchLeaders(page, b.code);
      leaders.forEach(ld=>md+=`  - ${ld.name}(${ld.code}) 涨幅:${ld.pct_chg}\n`);
    }
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

main();
