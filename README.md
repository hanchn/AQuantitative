```
nohup python stock_monitor.py > run.log 2>&1 &
```
---

### **用法**

1. 给脚本**添加执行权限**：

   ```bash
   chmod +x stock_monitor.sh
   ```

2. **一键启动：**

   ```bash
   ./stock_monitor.sh
   ```

3. **后台一直跑，日志在 `run.log`，所有 Python 错误和输出都在这。**

---

### **如何关闭脚本**




          
# 关于如何关闭 sudo nohup 进程

根据您提供的进程信息，我看到您的 `stock_monitor.py` 进程是通过 `sudo nohup` 命令启动的：

```
0  8935  3617   0  2:48PM ttys335    0:00.02 sudo nohup python stock_monitor.py 
501 10637  3617   0  2:50PM ttys335    0:00.00 grep stock_monitor.py
```

这就是为什么您可能无法正常关闭它的原因。当使用 `sudo` 启动进程时，该进程以 root 权限运行，普通的 `kill` 命令可能无法终止它。

## 正确关闭 sudo 启动的进程

1. **使用 sudo kill 命令**：
   ```bash
   sudo kill 8935
   ```
   
   这里 `8935` 是您进程的 PID（进程 ID）。

2. **如果普通 kill 不起作用，使用强制终止信号**：
   ```bash
   sudo kill -9 8935
   ```

3. **确认进程已终止**：
   ```bash
   ps -ef | grep stock_monitor.py
   ```

## 避免未来出现此问题的建议

在您的 `app.py` 文件中，我注意到您使用了标准的 Python 代码来运行股票监控程序。为了避免未来需要使用 `sudo` 启动（除非确实需要 root 权限），您可以：

1. 确保您的程序不需要 root 权限运行
2. 在 `stock_monitor.sh` 脚本中避免使用 `sudo`
3. 如果您需要写入日志目录，确保该目录对您的用户有写入权限：
   ```bash
   chmod -R 755 log
   ```

