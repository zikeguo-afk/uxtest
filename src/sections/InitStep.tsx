import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Cpu, Globe, Zap, Terminal, ArrowRight } from 'lucide-react';

interface InitStepProps {
  targetUrl: string;
  onUrlChange: (url: string) => void;
  onNext: () => Promise<void> | void;
}

export function InitStep({ targetUrl, onUrlChange, onNext }: InitStepProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([
    '🟢 系统初始化：UXAgent 平台启动',
    '当前状态：连接通用浏览器连接器 (Universal Browser Connector)...',
    '初始化 Playwright 无头模式...',
    '加载模型上下文协议 (MCP)...',
    '系统提示：请输入待测试的网站URL。'
  ]);

  const handleSubmit = async () => {
    if (!targetUrl) return;
    
    setIsLoading(true);
    
    // 模拟系统日志
    const newLogs = [
      `正在连接: ${targetUrl}`,
      '建立安全连接...',
      '加载页面资源...',
      '初始化 DOM 分析器...',
      '准备完成，开始源代码检查...'
    ];
    
    for (const log of newLogs) {
      await new Promise(resolve => setTimeout(resolve, 300));
      setLogs(prev => [...prev, log]);
    }
    
    try {
      await onNext();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 系统状态卡片 */}
      <div className="animate-slide-up">
        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-slate-100">系统初始化</CardTitle>
                <CardDescription className="text-slate-400">
                  UXAgent 平台正在启动测试环境
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 系统日志 */}
            <div className="bg-slate-950 rounded-lg p-4 font-mono text-sm space-y-1 max-h-48 overflow-y-auto">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={`animate-fade-in ${
                    log.includes('🟢') ? 'text-emerald-400' :
                    log.includes('连接') ? 'text-blue-400' :
                    log.includes('准备') ? 'text-amber-400' :
                    'text-slate-400'
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <span className="text-slate-600">[{String(index).padStart(2, '0')}]</span> {log}
                </div>
              ))}
              <div className="animate-pulse text-emerald-500">
                <span className="text-slate-600">[{String(logs.length).padStart(2, '0')}]</span> _
              </div>
            </div>

            {/* URL 输入 */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <Globe className="w-4 h-4 text-slate-500" />
                目标网站 URL
              </label>
              <div className="flex gap-3">
                <Input
                  value={targetUrl}
                  onChange={(e) => onUrlChange(e.target.value)}
                  placeholder="https://www.example.com"
                  className="flex-1 bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/50 focus:ring-emerald-500/20"
                />
                <Button
                  onClick={handleSubmit}
                  disabled={!targetUrl || isLoading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                >
                  {isLoading ? (
                    <div className="animate-spin">
                      <Zap className="w-4 h-4" />
                    </div>
                  ) : (
                    <>
                      开始分析
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 功能特性 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-slide-up" style={{ animationDelay: '200ms' }}>
        {[
          {
            icon: Terminal,
            title: '源代码分析',
            description: 'AI 自动检查 DOM 结构、交互元素和无障碍性'
          },
          {
            icon: Cpu,
            title: '多智能体测试',
            description: '模拟不同用户画像进行真实场景测试'
          },
          {
            icon: Zap,
            title: '情感分析',
            description: '追踪用户情感变化，识别 frustration 点'
          }
        ].map((feature, index) => (
          <Card key={index} className="bg-slate-900/30 border-slate-800/50">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <feature.icon className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-slate-200">{feature.title}</h3>
                  <p className="text-xs text-slate-500 mt-1">{feature.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
