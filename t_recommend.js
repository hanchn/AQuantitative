import fetch from 'node-fetch';
import fs from 'fs/promises';

const CONFIG_PATH = './config.json';

// 沪深market字段, 沪1 深0
const getSecid = code => code.startsWith('6') ? `1.${code}` : `0.${code}`;

// 拉取近90日真实日K线
const fetchKline = async (code, days = 90) => {
  const now = new Date();
  const end = now.toISOString().slice(0,10).replace(/-/g,'');
  const startDate = new Date(now - days*24*3600*1000);
  const beg = startDate.toISOString().slice(0,10).replace(/-/g,'');
  const secid = getSecid(code);
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=1&beg=${beg}&end=${end}`;
  const headers = {
    'Referer': 'https://quote.eastmoney.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };
  const resp = await fetch(url, { headers });
  const data = await resp.json();
  if (!data.data?.klines) return [];
  return data.data.klines.map(kline => {
    const [date, open, close, high, low, vol, amount, pct_chg] = kline.split(',');
    return { date, open: +open, close: +close, high: +high, low: +low, vol: +vol, amount: +amount, pct_chg: +pct_chg };
  });
};

// 简单T策略回测示例：±2%网格T，单次T全部
const analyzeTStrategy = kdata => {
  if (kdata.length < 10) return { recommend: false, reason: '数据不足' };
  let hold = 0, profit = 0, actionCount = 0, lastT = null;
  let suggestGrid = 0;
  // 统计历史振幅，推荐网格
  const pctArr = kdata.map(k => Math.abs((k.high - k.low) / k.close));
  const avgWave = pctArr.reduce((a, b) => a + b, 0) / pctArr.length;
  // 建议网格=平均振幅的一半（如日均6%，建议用3%网格T）
  suggestGrid = (avgWave * 50).toFixed(2);

  // 简单模拟：每遇涨跌3%T一次
  for (let i = 1; i < kdata.length; i++) {
    const prev = kdata[i-1].close;
    const curr = kdata[i].close;
    if (!hold && curr < prev * (1 - 0.03)) {
      hold = 100; // 假设一次买100
      lastT = curr;
      actionCount++;
    } else if (hold && curr > lastT * (1 + 0.03)) {
      profit += (curr - lastT) * hold;
      hold = 0;
      actionCount++;
    }
  }
  return {
    recommend: true,
    suggestGrid: suggestGrid + '%',
    actionCount,
    profit: profit.toFixed(2),
    desc: `推荐用${suggestGrid}%网格做T，近${kdata.length}日回测累计T次数${actionCount}，模拟收益${profit.toFixed(2)}元`
  };
};

// 主逻辑：自动读config，抓数据，输出建议
const main = async () => {
  const config = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf-8'));
  for (const stock of config.stocks) {
    const kdata = await fetchKline(stock.code, 90);
    const t_result = analyzeTStrategy(kdata);
    console.log(`\n【${stock.code} 做T策略推荐】`);
    if (t_result.recommend) {
      console.log(`- 建议网格: ${t_result.suggestGrid}`);
      console.log(`- 回测T次数: ${t_result.actionCount}`);
      console.log(`- 回测模拟收益: ${t_result.profit}`);
      console.log(`- 说明: ${t_result.desc}`);
    } else {
      console.log(`- 不推荐做T，原因：${t_result.reason}`);
    }
  }
};

main();
