# cmds - command discovery CLI command

A modern system command discovery tool that bridges user intent with executable commands. More than a `$PATH` searcher — it's a semantic index and interactive manual for system commands. Designed for both human developers and LLM Agents.

## 决策记录

1. **只发现不执行**：专注于"发现"与"解释"，不负责执行命令。
2. **双层搜索策略**：优先使用 `xdb` 进行 Embedding + 向量检索；`xdb` 不可用时 fallback 到 fzf 风格的模糊匹配（fuzzysort）。`xdb` 可用性在扫描阶段检测并记录到运行时索引中，搜索时无需每次 `which`。
3. **双层数据架构**：静态 tldr 全量索引（随包分发）+ 运行时索引（用户本地，仅含当前 OS 实际安装的命令）。
4. **TTY 自动检测**：stdout 为 TTY 时输出人类可读 Markdown，为 Pipe 时自动切换 JSON。

## 1. Role

- **Semantic Search**: Find commands by natural language intent (`cmds find`).
- **Info Lookup**: Show detailed metadata for a specific command (`cmds info`).
- **List & Filter**: Browse installed commands by category (`cmds list`).
- **Scan & Index**: Scan system for installed commands, build runtime index (`cmds scan`).

## 2. Tech Stack & Project Structure

遵循 `pai` repo 约定：

- **TypeScript + ESM** (Node 20+)
- **构建**: tsup (ESM, shebang banner)
- **测试**: vitest + fast-check
- **CLI 解析**: commander
- **模糊匹配**: fuzzysort (or similar)
- **向量搜索**: 通过外部 `xdb` 命令（独立 repo，可选依赖）
- **数据源**: tldr-pages `pages/common`（本地 clone at `../tldr`）

## 3. Data Directory Layout

| Purpose | Path |
|---------|------|
| Runtime index + config | `~/.config/cmds/` |
| Static tldr full index | Bundled with package, `dist/data/tldr-index.json` |

## 4. Data Architecture

### 4.1 Static Data: tldr Full Index (bundled)

**数据源**: [tldr-pages/tldr](https://github.com/tldr-pages/tldr) 仓库，仅使用 `pages/common` 下的英文数据（约 1000+ 命令）。

**Build 流程**:
- 提供独立的 build script，通过 npm scripts 手动调用。
- 从本地 clone 的 tldr repo（`../tldr`）读取 Markdown 文件，解析并转换为 JSON 索引。
- 生成的索引文件随 `cmds` 一起发行（放在包内 `dist/data/tldr-index.json`）。
- 由人控制何时更新数据。

**npm scripts**:
- `npm run prepare:reload` — 从 tldr repo 抓取数据，生成全量索引 JSON。
- `npm run prepare:categorize` — 补全索引中的 category 字段（可调用 `pai` 命令辅助）。

**Index format** (single JSON file, target size: a few hundred KB):

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

### 4.2 Runtime Index (user local)

**Location**: `~/.config/cmds/index.json`

**内容**: 仅包含当前 OS 上实际安装的命令：
- tldr 索引中有且本机也安装了的命令（带完整 metadata）。
- 本机安装了但 tldr 索引中没有的命令（通过 `--help` 提取的基本信息）。

**更新方式**: 通过 `cmds scan` 命令按需更新，不做定时/自动扫描。

**附加元数据**:
- `xdbAvailable`: boolean — `xdb` 命令是否可用。
- `lastScanTime`: ISO 时间戳。
- `systemInfo`: OS 类型等环境信息。

## 5. CLI Commands

### 5.1 `cmds find <query>`

Semantic search for commands by natural language intent.

```bash
cmds find "how to convert mp4 to gif"
cmds find "find large files" --limit 10
```

**Args**:
- `--limit <n>` — number of results (default 5)
- `--json` — JSON output

**搜索策略（双层）**:
1. 当系统中存在 `xdb` 命令时，使用 Embedding + 向量检索。
2. Fallback: fzf 风格的模糊匹配（基于 fuzzysort），匹配对象为命令的 name + description + examples 文本。

**`xdb` 可用性检测**:
- 在扫描阶段检测 `xdb` 命令是否存在，结果记录在运行时索引中。
- 搜索时根据记录决定走 xdb 还是 fallback，无需每次 `which`。
- 若 `xdb` 存在但调用出错，静默 fallback 到模糊匹配。

### 5.2 `cmds info <command>`

Show detailed metadata for a specific command.

```bash
cmds info find
cmds info tar --json
```

**Args**:
- `--json` — JSON output
- 不支持短选项（如 `-i`），统一使用子命令形式。

**Output contents**:
- Description: core purpose of the command.
- Common Use Cases: 3-5 most common scenarios.
- Examples: ready-to-use command templates (from tldr data).
- Caveats: common pitfalls or security warnings.

**查询逻辑**:
1. 先在当前 OS 中确认该命令实际存在（通过 PATH 查找）。
2. 若在运行时索引中有数据，返回结构化信息。
3. 若索引中无数据，尝试执行 `<command> --help` 并提取第一段描述作为 fallback。
4. 若命令不存在于系统中，明确告知用户（退出码 1）。

### 5.3 `cmds list`

List installed commands, optionally filtered by category.

```bash
cmds list
cmds list --category network
cmds list --json
```

**Args**:
- `--category <type>` — filter by category
- `--json` — JSON output

**默认行为（不带 --category）**: 输出 summary 概览：
- 共多少个分类，每个分类下多少条命令。
- 每个分类列出几个代表性命令名。
- 给出进一步操作建议（如 `cmds list --category network`）。

**Category taxonomy** (designed for LLM consumption):
`filesystem` / `text-processing` / `search` / `archive` / `process` / `system` / `network` / `shell` / etc.
分类不宜太细也不宜太粗，实现时可根据实际数据微调。

### 5.4 `cmds scan`

Scan installed commands and build/update the runtime index.

```bash
cmds scan
cmds scan --enrich
cmds scan --cmds pai,notifier,thread
cmds scan --json
```

**Args**:
- `--enrich` — additionally try `--help` / `-h` for commands without descriptions
- `--cmds <cmd1,cmd2,...>` — incremental scan for specific commands; runs `--help --verbose` (fallback `--help`) to get full USAGE output, updates runtime index and xdb. Requires a prior `cmds scan` for base index.
- `--json` — JSON output of scan summary

**全量扫描流程**:
1. 检测系统已安装的可执行命令（优先 `compgen -c`，fallback 遍历 `$PATH`）。
2. 与随包分发的 tldr 全量索引比对，筛选出本机实际安装的命令及其 metadata。
3. 对于本机存在但 tldr 索引中没有的命令，尝试 `--help` 提取基本信息。
4. 检测 `xdb` 命令可用性，记录到索引中。
5. 将结果写入运行时索引（`~/.config/cmds/index.json`）。

## 6. Internal Architecture

```
┌─────────────────┐
│  Input Parser    │  Parse user input
└──────┬──────────┘
       │
  ┌────▼──────────┐
  │ Smart Router  │  Exact match → info / otherwise → search
  └────┬──────────┘
       │
  ┌────▼──────────────┐
  │ Search Engine     │  Semantic search (xdb) / fuzzy match (fuzzysort)
  │ Info Resolver     │  Runtime index query / --help fallback
  │ List Aggregator   │  Category summary / filter
  │ Scanner           │  PATH scan / index generation
  └────┬──────────────┘
       │
  ┌────▼──────────────┐
  │ Knowledge Base    │
  │  ├─ Static: tldr full index (dist/data/)
  │  └─ Runtime: local index (~/.config/cmds/)
  └────┬──────────────┘
       │
  ┌────▼──────────────┐
  │ Output Formatter  │  TTY → Markdown / Pipe → JSON
  └───────────────────┘
```

## 7. Output Format

### 7.1 stdout / stderr Contract

- `stdout`: Command result data (search results, info output, list summary).
- `stderr`: Progress, debug, error, and warning messages.

### 7.2 Human / Machine Readability

- Default (TTY): human-readable formatted text (Markdown style).
- JSON mode (`--json`): structured JSON for LLM and script parsing.
- Auto-detection: TTY → human-readable, Pipe → JSON.

## 8. Error Handling & Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Command not found / no search results |
| `2` | Argument / usage error |

## 9. Usage Examples

### Human Usage
```bash
$ cmds find "find large files over 100MB"
# → top 5 related commands with descriptions

$ cmds find "compress a directory" --json --limit 3

$ cmds info find
# → detailed info for the find command

$ cmds list
# → category summary overview

$ cmds list --category network
# → all installed commands in the network category

$ cmds scan
# → scan system, update runtime index
```

### LLM Agent Usage
```bash
$ cmds info tar --json
$ cmds list --category archive --json
$ cmds scan --json
```

## 10. Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| (None) | cmds uses bundled data + local runtime index | `~/.config/cmds/` |
