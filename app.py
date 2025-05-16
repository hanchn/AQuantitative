import requests
import time
import json
import os
from datetime import datetime, timedelta

LOG_DIR = 'log'
CONFIG_PATH = 'config.json'

def ensure_log_dir():
    if not os.path.exists(LOG_DIR):
        os.makedirs(LOG_DIR)

def fetch_price(stock_code):
    url = f'https://hq.sinajs.cn/list={stock_code}'
    try:
        resp = requests.get(url, timeout=5)
        data = resp.text.split(',')
        if len(data) < 6 or not data[3]:
            return None
        curr = float(data[3])
        high = float(data[4])
        low = float(data[5])
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        return {'time': now, 'curr': curr, 'high': high, 'low': low}
    except Exception as e:
        return {'time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'), 'error': str(e)}

class StockTracker:
    def __init__(self, code, buy_price, sell_price):
        self.code = code
        self.buy_price = buy_price
        self.sell_price = sell_price
        self.highest = None
        self.lowest = None
        self.has_position = False
        self.buy_price_real = 0
        self.data_buffer = []
        # 文件分片相关
        self.file_start = datetime.now()
        self.file = self._get_new_log_file()
        self.last_write = datetime.now()
    
    def _get_new_log_file(self):
        self.file_start = datetime.now()
        filename = f"{self.code}_{self.file_start.strftime('%Y-%m-%d_%H%M')}.log"
        filepath = os.path.join(LOG_DIR, filename)
        return open(filepath, 'a', encoding='utf-8')

    def update(self):
        info = fetch_price(self.code)
        self.data_buffer.append(info)
        if isinstance(info, dict) and 'curr' in info:
            curr = info['curr']
            if self.highest is None or curr > self.highest:
                self.highest = curr
            if self.lowest is None or curr < self.lowest:
                self.lowest = curr

            if not self.has_position and curr <= self.buy_price:
                print(f"{info['time']} [{self.code}] 建议买入！买入价: {curr:.2f}")
                self.has_position = True
                self.buy_price_real = curr

            if self.has_position and curr >= self.sell_price:
                profit = curr - self.buy_price_real
                print(f"{info['time']} [{self.code}] 建议卖出！卖出价: {curr:.2f}，盈利: {profit:.2f}")
                self.has_position = False

    def maybe_rotate_file(self, file_interval):
        now = datetime.now()
        if (now - self.file_start).total_seconds() >= file_interval:
            self.file.close()
            self.file = self._get_new_log_file()

    def maybe_write_log(self, write_interval):
        now = datetime.now()
        if (now - self.last_write).total_seconds() >= write_interval and self.data_buffer:
            for entry in self.data_buffer:
                self.file.write(json.dumps(entry, ensure_ascii=False) + '\n')
            self.file.flush()
            self.data_buffer = []
            self.last_write = now

def load_config(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def main():
    ensure_log_dir()
    config = load_config(CONFIG_PATH)
    interval = config.get('interval', 60)  # 抓取频率
    write_interval = config.get('write_interval', 60)  # 写盘频率
    file_interval = config.get('file_interval', 600)   # 文件分片频率
    stocks_cfg = config['stocks']
    stocks = [StockTracker(cfg['code'], cfg['buy_price'], cfg['sell_price']) for cfg in stocks_cfg]
    print(f"监控 {len(stocks)} 支股票，抓取频率: {interval}s，写入频率: {write_interval}s，日志分片: {file_interval}s")
    while True:
        for s in stocks:
            try:
                s.update()
                s.maybe_write_log(write_interval)
                s.maybe_rotate_file(file_interval)
            except Exception as e:
                print(f"异常: {e}")
        time.sleep(interval)

if __name__ == '__main__':
    main()
