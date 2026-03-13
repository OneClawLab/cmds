# cmds - Specification

## 1. 命令概述

`cmds` 是一个现代化的系统命令发现工具，连接 **用户意图** 与 **可执行命令**。
它不仅是 `$PATH` 的搜索器，更是系统命令的语义索引和交互式手册。

核心面向两类用户：人类开发者 和 LLM Agent。

## 2. 设计原则

- **Atomic**: 专注于"发现"与"解释"，不负责执行。
- **Contextual**: 根据当前 OS 环境提供相关命令建议。
- **Machine-Friendly**: 所有子命令均支持 `--json` 输出，便于 LLM 或脚本解析。
- **Human-Readable**: 默认输出美观的 Markdown 格式（TTY 检测自动切换）。
- **Dependable**: 信息准确可靠，可被其他工具（如 `pai`）依赖。

## 3. 子命令

### A. 语义搜索: `cmds <query>`

当输入非特定命令名的字符串时，触发语义搜索。

```
cmds [options] <query>
cmds "how to convert mp4 to gif"
cmds "find large files" --limit 10
```

- `--limit <n>`: 返回结果数量，默认 5。
- `--json`: JSON 格式输出。

**智能路由**:
- 若 `<query>` 精确匹配某个已知命令名（在运行时索引中），自动走 info 逻辑。
- 否则走搜索逻辑。
- `cmds info <command>` 作为显式写法始终可用。

**搜索策略（双层）**:
1. 当系统中存在 `vdb` 命令（向量数据库，独立 repo，暂未实现）时，使用 Embedding + 向量检索。
2. Fallback: fzf 风格的模糊匹配（基于 fuzzysort 或类似库），匹配对象为命令的 name + description + examples 文本。

**`vdb` 可用性检测**:
- 在扫描阶段检测 `vdb` 命令是否存在，结果记录在运行时索引中。
- 搜索时根据记录决定走 vdb 还是 fallback，无需每次 `which`。
- 若 `vdb` 存在但调用出错，静默 fallback 到模糊匹配。

### B. 信息查询: `cmds info <command>`

展示特定命令的详细元数据。

```
cmds info <command>
cmds info find
```

- `--json`: JSON 格式输出。
- 不支持短选项（如 `-i`），统一使用子命令形式。

**输出内容**:
- Description: 命令的核心作用。
- Common Use Cases: 3-5 个最常用场景。
- Examples: 直接可用的命令模板（来自 tldr 数据）。
- Caveats: 常见坑点或安全警告。

**查询逻辑**:
1. 先在当前 OS 中确认该命令实际存在（通过 PATH 查找）。
2. 若在运行时索引中有数据，返回结构化信息。
3. 若索引中无数据，尝试执行 `<command> --help` 并提取第一段描述作为 fallback。
4. 若命令不存在于系统中，明确告知用户（退出码 1）。

### C. 列表与过滤: `cmds list`

列出系统当前可用的命令。

```
cmds list [--category <type>]
cmds list --category network
cmds list --json
```

- `--category <type>`: 按分类过滤。
- `--json`: JSON 格式输出。

**默认行为（不带 --category）**: 输出 summary 概览：
- 共多少个分类，每个分类下多少条命令。
- 每个分类列出几个代表性命令名。
- 给出进一步操作建议（如 `cmds list --category network`）。

**分类体系**（面向 LLM 设计）:
`filesystem` / `text-processing` / `search` / `archive` / `process` / `system` / `network` / `shell` / 等。
分类不宜太细也不宜太粗，实现时可根据实际数据微调。

### D. 扫描: `cmds scan`

扫描当前系统已安装的命令，生成/更新运行时索引。

```
cmds scan
cmds scan --json
```

- `--json`: JSON 格式输出扫描结果摘要。

**扫描流程**:
1. 检测系统已安装的可执行命令（优先 `compgen -c`，fallback 遍历 `$PATH`）。
2. 与随包分发的 tldr 全量索引比对，筛选出本机实际安装的命令及其 metadata。
3. 对于本机存在但 tldr 索引中没有的命令，尝试 `--help` 提取基本信息。
4. 检测 `vdb` 命令可用性，记录到索引中。
5. 将结果写入运行时索引（`~/.config/cmds/index.json`）。

## 4. 数据架构

### 4.1 静态数据: tldr 全量索引（随包分发）

**数据源**: [tldr-pages/tldr](https://github.com/tldr-pages/tldr) 仓库，仅使用 `pages/common` 下的英文数据（约 1000+ 命令）。

**Build 流程**:
- 提供独立的 build script，通过 npm scripts 手动调用。
- 从本地 clone 的 tldr repo（`../tldr`）读取 Markdown 文件，解析并转换为 JSON 索引。
- 生成的索引文件随 `cmds` 一起发行（放在包内 `dist/data/tldr-index.json`）。
- 由人控制何时更新数据。

**npm scripts**:
- `npm run prepare:reload` — 从 tldr repo 抓取数据，生成全量索引 JSON。
- `npm run prepare:categorize` — 补全索引中的 category 字段（可调用 `pai` 命令辅助）。

**索引格式**: 单个 JSON 文件（目标大小: 几百 KB 以内）。

**每条命令的字段**:
```json
{
  "name": "tar",
  "description": "Archiving utility.",
  "category": "archive",
  "examples": [
    {
      "description": "Create an archive from files",
      "command": "tar cf {{target.tar}} {{file1}} {{file2}}"
    }
  ],
  "aliases": [],
  "relatedCommands": [],
  "seeAlso": [],
  "tags": [],
  "platforms": ["common"]
}
```

> category 字段在 build script 中初始为空，后续通过 `prepare:categorize` 补全。
> 具体字段在实现 build script 时根据 tldr Markdown 的实际内容进一步确定。

### 4.2 运行时索引（用户本地）

**位置**: `~/.config/cmds/index.json`

**内容**: 仅包含当前 OS 上实际安装的命令：
- tldr 索引中有且本机也安装了的命令（带完整 metadata）。
- 本机安装了但 tldr 索引中没有的命令（通过 `--help` 提取的基本信息）。

**更新方式**: 通过 `cmds scan` 命令按需更新，不做定时/自动扫描。

**附加元数据**:
- `vdbAvailable`: boolean — `vdb` 命令是否可用。
- `lastScanTime`: ISO 时间戳。
- `systemInfo`: OS 类型等环境信息。

### 4.3 目录约定

| 用途 | 路径 |
|------|------|
| 运行时索引 + 配置 | `~/.config/cmds/` |
| 静态 tldr 全量索引 | 随包分发，`dist/data/tldr-index.json` |

## 5. 输出格式

### 默认模式（TTY）
人类可读的格式化文本（Markdown 风格）。

### JSON 模式（`--json`）
结构化 JSON，便于 LLM 和脚本解析。所有子命令均支持。

### 自动检测
根据 stdout 是否为 TTY 自动选择：
- TTY → 人类可读格式
- Pipe → JSON 格式

## 6. 退出码

遵循 Linux 标准约定：

| 退出码 | 含义 |
|--------|------|
| 0 | 成功 |
| 1 | 命令未找到 / 无搜索结果 |
| 2 | 参数错误 / 用法错误 |

## 7. 逻辑架构

```
┌─────────────────┐
│  Input Parser    │  解析用户输入
└──────┬──────────┘
       │
  ┌────▼──────────┐
  │ Smart Router  │  精确匹配 → info / 否则 → search
  └────┬──────────┘
       │
  ┌────▼──────────────┐
  │ Search Engine     │  语义搜索 (vdb) / 模糊匹配 (fuzzysort)
  │ Info Resolver     │  运行时索引查询 / --help fallback
  │ List Aggregator   │  分类汇总 / 过滤
  │ Scanner           │  PATH 扫描 / 索引生成
  └────┬──────────────┘
       │
  ┌────▼──────────────┐
  │ Knowledge Base    │
  │  ├─ Static: tldr 全量索引 (dist/data/)
  │  └─ Runtime: 本机索引 (~/.config/cmds/)
  └────┬──────────────┘
       │
  ┌────▼──────────────┐
  │ Output Formatter  │  TTY → Markdown / Pipe → JSON
  └───────────────────┘
```

## 8. 交互示例

### 人类使用
```bash
$ cmds "find large files over 100MB"
# → 返回 top 5 相关命令及简介

$ cmds tar
# → 精确匹配，自动走 info 逻辑

$ cmds info find
# → 显式 info 查询

$ cmds list
# → 返回分类概览 summary

$ cmds list --category network
# → 返回 network 分类下所有已安装命令

$ cmds scan
# → 扫描系统，更新运行时索引
```

### LLM Agent 调用
```bash
$ cmds "compress a directory" --json --limit 3
$ cmds info tar --json
$ cmds list --category archive --json
$ cmds scan --json
```

## 9. 技术规格

- **Runtime**: Node.js（与 `pai` 保持一致）
- **构建工具**: tsup (ESM)
- **测试框架**: vitest + fast-check
- **模糊匹配**: fuzzysort 或类似库
- **向量搜索**: 通过外部 `vdb` 命令（独立 repo，可选依赖）
- **数据源**: tldr-pages `pages/common`（本地 clone at `../tldr`）
