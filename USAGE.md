# cmds 使用指南

`cmds` 是一个系统命令发现工具，帮助你用自然语言找到合适的 CLI 命令。支持人类和 LLM Agent 使用。

## 安装

```bash
npm install
npm run build
npm link   # 全局安装 cmds 命令
```

## 快速开始

```bash
# 首次使用，先扫描系统命令
cmds scan

# 用自然语言搜索命令
cmds "find large files"

# 查看某个命令的详细信息
cmds info find

# 列出所有可用命令分类
cmds list

# 按分类浏览
cmds list --category filesystem
```

## 命令详解

### 智能路由（默认命令）

直接输入 `cmds <query>`，系统会自动判断意图：

- 如果 query 精确匹配已知命令名 → 显示该命令详情
- 否则 → 执行语义搜索

```bash
# 精确匹配 → 显示 grep 详情
cmds grep

# 非精确匹配 → 搜索相关命令
cmds "search text in files"

# 限制返回结果数量（默认 5）
cmds "compress files" --limit 3

# JSON 输出（适合脚本和 LLM Agent）
cmds "network tools" --json
```

### `cmds info <command>`

查看特定命令的详细信息，包括描述、用例、示例和注意事项。

```bash
cmds info tar
cmds info curl --json
```

- 命令必须在系统 PATH 中存在
- 优先从运行时索引获取 tldr 数据
- 索引中无数据时，自动尝试 `--help` 提取描述
- 命令不存在时退出码为 1

### `cmds list`

浏览系统可用命令。

```bash
# 概览：显示分类数量、每个分类的命令数和代表性命令
cmds list

# 按分类过滤
cmds list --category network
cmds list --category filesystem --json
```

预定义分类：`filesystem`、`text-processing`、`search`、`archive`、`process`、`system`、`network`、`shell`、`other`

### `cmds scan`

扫描系统已安装命令，生成运行时索引。

```bash
cmds scan
cmds scan --json
```

扫描流程：
1. 遍历 PATH 目录，检测所有可执行文件
2. 与内置 tldr 索引比对，提取匹配命令的元数据
3. 对部分未匹配命令尝试 `--help` 提取描述
4. 检测 xdb（向量数据库）可用性
5. 写入索引到 `~/.config/cmds/index.json`

首次使用或安装新软件后建议重新扫描。

## 输出格式

`cmds` 根据使用场景自动选择输出格式：

| 场景 | 输出格式 |
|------|----------|
| 终端交互（TTY） | Markdown 风格可读文本 |
| 管道模式（非 TTY） | JSON |
| 指定 `--json` | JSON（无论是否 TTY） |

```bash
# 人类阅读
cmds info find

# 脚本/LLM 使用
cmds info find --json
cmds "search files" | jq '.[] | .name'
```

## 退出码

| 退出码 | 含义 |
|--------|------|
| 0 | 操作成功 |
| 1 | 命令未找到 / 搜索无结果 / 分类不存在 |
| 2 | 参数错误 |

## 数据文件

- **tldr 索引**：`dist/data/tldr-index.json`（随包分发，静态数据）
- **运行时索引**：`~/.config/cmds/index.json`（`cmds scan` 生成）

运行时索引不存在时，大部分命令会提示先运行 `cmds scan`。

## 搜索机制

搜索优先级：
1. **xdb 向量检索**（如果系统安装了 `xdb` 命令且扫描时检测到可用）
2. **Fuzzysort 模糊匹配**（默认 fallback，匹配命令名、描述和示例文本）

xdb 不可用或调用失败时自动静默回退到模糊匹配。

## 示例场景

```bash
# 找压缩相关命令
cmds "compress and decompress"

# 查看 curl 怎么用
cmds curl

# 列出所有网络工具
cmds list --category network

# 在脚本中获取命令列表
cmds list --category filesystem --json | jq '.[].name'

# 搜索并取第一个结果
cmds "disk usage" --limit 1 --json | jq '.[0].name'
```
