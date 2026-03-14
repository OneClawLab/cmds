import type { Command } from 'commander';

// ── Help text data ──────────────────────────────────────────

const MAIN_EXAMPLES = `
Examples:
  $ cmds "find large files"                           # 自然语言搜索
  $ cmds grep                                         # 精确匹配 → 显示详情
  $ cmds info tar                                     # 查看命令详情
  $ cmds list --category network                      # 按分类浏览
  $ cmds scan                                         # 扫描系统命令

Prerequisites:
  首次使用请先运行 cmds scan 生成运行时索引。

Pipe:
  非 TTY 环境下自动输出 JSON（适合脚本和 LLM Agent）。`;

const MAIN_VERBOSE = `
Data Files:
  运行时索引: ~/.config/cmds/index.json (cmds scan 生成)
  tldr 索引:  随包分发的静态数据

Output:
  终端交互 (TTY): Markdown 风格可读文本
  管道模式 (非 TTY): JSON
  指定 --json: JSON（无论是否 TTY）

Search:
  1. xdb 向量检索（如果可用）
  2. Fuzzysort 模糊匹配（默认 fallback）

Exit Codes:
  0  操作成功
  1  命令未找到 / 搜索无结果 / 分类不存在
  2  参数错误`;

const INFO_EXAMPLES = `
Examples:
  $ cmds info tar                                     # 查看 tar 详情
  $ cmds info curl --json                             # JSON 输出`;

const LIST_EXAMPLES = `
Examples:
  $ cmds list                                         # 概览所有分类
  $ cmds list --category network                      # 按分类过滤
  $ cmds list --category filesystem --json            # JSON 输出

Categories: filesystem, text-processing, search, archive, process, system, network, shell, other`;

const SCAN_EXAMPLES = `
Examples:
  $ cmds scan                                         # 扫描系统命令
  $ cmds scan --json                                  # JSON 输出

Note:
  索引文件写入 ~/.config/cmds/index.json
  首次使用或安装新软件后建议重新扫描。`;

// ── Setup functions ─────────────────────────────────────────

export function installHelp(program: Command): void {
  program.addHelpText('after', MAIN_EXAMPLES);
  installVerboseHelp(program);
}

export function addSubcommandExamples(cmd: Command, name: string): void {
  const examples: Record<string, string> = {
    'info': INFO_EXAMPLES,
    'list': LIST_EXAMPLES,
    'scan': SCAN_EXAMPLES,
  };
  const text = examples[name];
  if (text) {
    cmd.addHelpText('after', text);
  }
}

function installVerboseHelp(program: Command): void {
  program.option('--verbose', '(与 --help 一起使用) 显示完整帮助信息');
  program.on('option:verbose', () => {
    (program as unknown as Record<string, boolean>).__verboseHelp = true;
  });
  program.addHelpText('afterAll', () => {
    if ((program as unknown as Record<string, boolean>).__verboseHelp) {
      return MAIN_VERBOSE;
    }
    return '';
  });
}
