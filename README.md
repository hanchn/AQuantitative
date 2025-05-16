import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

const LOG_DIR = './log';
const REPORT_TYPE = 'A股权威复盘';

// 三大指数
const INDEXES = [
  { code: '000001', name: '上证指数' },
  { code: '399001', name: '深证成指' },
  { code: '399006', name: '创业板指' }
];

// 1. 三大指数（新浪财经）
const fetchIndexQuotes = async () => {
  try {
    const codes = INDEXES.map(idx => idx.code.startsWith('3') ? 'sz' + idx.code : 'sh' + idx.code).join(',');
    const url = `https://hq.sinajs.cn/list=${codes}`;
    const resp = await fetch(url, { headers: { 'Referer': 'https://finance.sina.com.cn' } });
    const text = await resp.text();
    const arr = text.split(';').filter(Boolean);
    return arr.map((line, i) => {
      const m = line.match(/"(.+?)"/);
      if (!m) return null;
      const data = m[1].split(',');
      const now = parseFloat(data[1]);
      const close = parseFloat(data[2]);
      const diff = now - close;
      const pct = close ? ((diff / close) * 100).toFixed(2) : '0.00';
      return {
        code: INDEXES[i].code,
        name: INDEXES[i].name,
        now: now.toFixed(2),
        close: close.toFixed(2),
        diff: diff >= 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2),
        pct: diff >= 0 ? `+${pct}` : pct
      };
    }).filter(Boolean);
  } catch (err) {
    return [];
  }
};

// 2. 龙虎榜（权威东财PC榜单数据）
const fetchRealLHB = async () => {
  try {
    const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?sortColumns=TRADE_DATE,SECURITY_CODE&sortTypes=-1,-1&pageSize=50&pageNumber=1&reportName=RPT_DAILYBILLBOARD_DETAILS&columns=ALL&source=WEB&client=WEB';
    const resp = await fetch(url, {
      headers: {
        'Referer': 'https://data.eastmoney.com/longhu/',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    const data = await resp.json();
    if (!data?.result?.data) return [];
    return data.result.data.map(item => ({
      name: item.SECURITY_NAME_ABBR,
      code: item.SECURITY_CODE,
      date: item.TRADE_DATE,
      reason: item.EXPLANATION,
      close: item.CLOSE_PRICE,
      pct_chg: item.PCT_CHANGE,
      turnover: item.TURNOVER_VOL,
      amount: item.ACCUM_AMOUNT,
      net_amount: item.NET_BUY_AMT,
      org_net: item.ORGAN_NET_BUY_AMT
    }));
  } catch (err) {
    return [];
  }
};

// 3. 概念板块榜（东财概念榜，展示Top20，真实）
const fetchTopConceptBlocks = async (topN = 20) => {
  try {
    const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=${topN}&fs=b:CONCEPT&fields=f12,f14,f3`;
    const resp = await fetch(url, {
      headers: {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': 'https://quote.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const data = await resp.json();
    if (!data?.data?.diff) return [];
    const arr = Array.isArray(data.data.diff) ? data.data.diff : Object.values(data.data.diff);
    return arr.map(item => ({
      code: item.f12,
      name: item.f14,
      pct: item.f3
    }));
  } catch (err) {
    return [];
  }
};

// 4. 板块龙头股（东财成分榜Top3，真实）
const fetchBlockLeaders = async (blockCode, topN = 3) => {
  try {
    const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=${topN}&fid=f3&fs=b:${blockCode}&fields=f12,f14,f2,f3,f4,f6,f62,f15,f16,f152`;
    const headers = {
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Referer': 'https://quote.eastmoney.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    const resp = await fetch(url, { headers });
    const data = await resp.json();
    if (!data?.data?.diff) return [];
    const diffArr = Array.isArray(data.data.diff) ? data.data.diff : Object.values(data.data.diff);
    return diffArr.map(item => {
      const boardNum = item.f152 ? Number(item.f152) : 0;
      const boardLabel = boardNum === 1
        ? '⭐首板'
        : boardNum > 1
          ? `${boardNum}板`
          : '';
      return {
        code: item.f12,
        name: item.f14,
        price: item.f2,
        pct_chg: item.f3,
        change: item.f4,
        amount: (item.f6/1e8).toFixed(2) + '亿',
        main_in: (item.f62/1e8).toFixed(2) + '亿',
        high: item.f15,
        low: item.f16,
        board: boardLabel
      };
    });
  } catch (err) {
    return [];
  }
};

// 5. 自动快评
const generateNewsSummary = (leader) => [
  `涨幅${leader.pct_chg}%，${leader.board || ''}，主力净流入${leader.main_in}，封板价${leader.high}。`
];

// 6. 报告生成
const genProReportMd = (indexList, lhbList, conceptBlocks, blockLeadersMap, dateStr) => {
  let md = `# ${dateStr} A股权威复盘报告\n\n`;

  // 指数
  md += `## 一、今日三大指数\n`;
  indexList.forEach(i => {
    if (!i) return;
    md += `- ${i.name} 收于${i.now}点，涨跌幅${i.pct}%（昨收${i.close}），涨跌${i.diff}\n`;
  });
  md += `\n`;

  // 龙虎榜
  md += `## 二、龙虎榜\n`;
  if (!lhbList || lhbList.length === 0) {
    md += `- 今日无龙虎榜数据（休市或尚未出榜）。\n`;
  } else {
    lhbList.forEach(item => {
      md += `- ${item.name}(${item.code}) 上榜原因: ${item.reason}，收盘: ${item.close}，涨跌幅: ${item.pct_chg}%，成交额: ${(item.amount/1e8).toFixed(2)}亿，净买入: ${(item.net_amount/1e8).toFixed(2)}亿，机构净买: ${(item.org_net/1e8).toFixed(2)}亿。\n`;
    });
  }

  // 板块榜
  md += `\n## 三、热门概念板块Top20\n`;
  if (!conceptBlocks || conceptBlocks.length === 0) {
    md += `- 今日无热门概念板块。\n`;
  } else {
    conceptBlocks.forEach(block => {
      md += `\n- **${block.name}**（涨幅：${block.pct}%）\n`;
      const leaders = blockLeadersMap[block.code] || [];
      leaders.forEach(leader => {
        md += `  - ${leader.name}（${leader.code}）：涨幅${leader.pct_chg}% ${leader.board || ''} 主力净流入${leader.main_in}。\n`;
        (leader.newsSummary || []).forEach(news => {
          md += `    - ${news}\n`;
        });
      });
    });
  }

  md += `\n## 四、消息面与策略建议\n`;
  md += `- 今日消息面、事件驱动可人工补充，板块与龙虎榜龙头值得关注。\n`;

  md += `\n---\n> 数据采集自东方财富，自动归档。\n`;
  return md;
};

// 7. 主程序
const main = async () => {
  await fs.mkdir(LOG_DIR, { recursive: true });

  const now = new Date();
  const dateStr = now.toISOString().slice(0,10);
  const timeStr = now.toTimeString().slice(0,8).replace(/:/g, '-');

  // 1. 指数
  const indexList = await fetchIndexQuotes();

  // 2. 龙虎榜
  const lhbList = await fetchRealLHB();

  // 3. 概念板块榜
  const conceptBlocks = await fetchTopConceptBlocks(20);

  // 4. 各板块龙头股
  const blockLeadersMap = {};
  for (const block of conceptBlocks) {
    const leaders = await fetchBlockLeaders(block.code, 3);
    for (const leader of leaders) {
      leader.newsSummary = generateNewsSummary(leader);
    }
    blockLeadersMap[block.code] = leaders;
  }

  // 5. 生成报告
  const md = genProReportMd(indexList, lhbList, conceptBlocks, blockLeadersMap, dateStr);
  const fname = `${REPORT_TYPE}_${dateStr}_${timeStr}.md`;
  const fpath = path.join(LOG_DIR, fname);
  await fs.writeFile(fpath, md, 'utf-8');
  console.log(md);
  console.log(`\n已生成Markdown复盘报告：${fpath}`);
};

main();
