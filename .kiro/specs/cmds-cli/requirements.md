# 需求文档

## 简介

`cmds` 是一个现代化的系统命令发现 CLI 工具，连接用户意图与可执行命令。它为人类开发者和 LLM Agent 提供语义搜索、命令信息查询、命令列表过滤和系统扫描功能。所有子命令均支持 JSON 输出，默认输出人类可读的 Markdown 格式，并通过 TTY 检测自动切换。

## 术语表

- **CLI**: Command Line Interface，命令行界面
- **Smart_Router**: 智能路由模块，根据用户输入判断走 info 查询还是语义搜索
- **Search_Engine**: 搜索引擎模块，负责语义搜索和模糊匹配
- **Info_Resolver**: 信息解析模块，负责查询特定命令的详细元数据
- **List_Aggregator**: 列表聚合模块，负责分类汇总和过滤命令
- **Scanner**: 扫描器模块，负责扫描系统命令并生成运行时索引
- **Output_Formatter**: 输出格式化模块，根据 TTY 状态选择输出格式
- **Runtime_Index**: 运行时索引，存储于 `~/.config/cmds/index.json`，包含当前系统已安装命令的元数据
- **Tldr_Index**: 静态 tldr 全量索引，随包分发于 `dist/data/tldr-index.json`
- **XDB**: 外部向量数据库命令，用于语义向量检索（可选依赖）
- **Fuzzysort**: 模糊匹配库，用于基于文本的模糊搜索
- **TTY**: 终端设备，用于判断 stdout 是否为交互式终端

## 需求

### 需求 1: 智能路由与默认参数解析

**User Story:** 作为用户，我希望直接输入 `cmds <query>` 时，系统能智能判断是走命令信息查询还是语义搜索，以便我无需记忆具体子命令。

#### 验收标准

1. WHEN 用户输入的 query 精确匹配 Runtime_Index 中某个已知命令名, THE Smart_Router SHALL 自动将请求路由到 Info_Resolver 逻辑
2. WHEN 用户输入的 query 不匹配任何已知命令名, THE Smart_Router SHALL 将请求路由到 Search_Engine 逻辑
3. WHEN 用户显式使用 `cmds info <command>` 子命令, THE CLI SHALL 始终将请求路由到 Info_Resolver，不经过 Smart_Router 判断
4. WHEN 未提供任何参数, THE CLI SHALL 输出帮助信息并以退出码 0 退出

### 需求 2: 语义搜索

**User Story:** 作为用户，我希望用自然语言描述我的意图（如 "find large files"），系统能返回最相关的命令列表，以便我快速找到合适的工具。

#### 验收标准

1. WHEN 用户提交搜索查询, THE Search_Engine SHALL 返回按相关性排序的命令列表
2. WHEN 用户指定 `--limit <n>` 参数, THE Search_Engine SHALL 返回最多 n 条结果
3. WHEN 用户未指定 `--limit` 参数, THE Search_Engine SHALL 默认返回最多 5 条结果
4. WHEN Runtime_Index 中记录 XDB 可用, THE Search_Engine SHALL 优先使用 XDB 进行向量检索
5. WHEN XDB 不可用或调用出错, THE Search_Engine SHALL 静默回退到 Fuzzysort 模糊匹配
6. WHEN 使用 Fuzzysort 模糊匹配, THE Search_Engine SHALL 对命令的 name、description 和 examples 文本进行匹配
7. WHEN 搜索无结果, THE CLI SHALL 以退出码 1 退出并告知用户无匹配结果

### 需求 3: 命令信息查询

**User Story:** 作为用户，我希望查看特定命令的详细信息（描述、用例、示例、注意事项），以便我了解如何正确使用该命令。

#### 验收标准

1. WHEN 查询的命令存在于系统 PATH 中且 Runtime_Index 中有数据, THE Info_Resolver SHALL 返回包含 description、common use cases、examples 和 caveats 的结构化信息
2. WHEN 查询的命令存在于系统 PATH 中但 Runtime_Index 中无数据, THE Info_Resolver SHALL 尝试执行 `<command> --help` 并提取第一段描述作为 fallback
3. WHEN 查询的命令不存在于系统 PATH 中, THE Info_Resolver SHALL 以退出码 1 退出并明确告知用户该命令未找到
4. THE Info_Resolver SHALL 通过 PATH 查找确认命令在当前系统中实际存在后再返回信息

### 需求 4: 命令列表与过滤

**User Story:** 作为用户，我希望列出系统当前可用的命令并按分类过滤，以便我浏览和发现可用工具。

#### 验收标准

1. WHEN 用户执行 `cmds list` 不带 `--category` 参数, THE List_Aggregator SHALL 输出 summary 概览，包含分类数量、每个分类的命令数量、每个分类的代表性命令名以及进一步操作建议
2. WHEN 用户指定 `--category <type>` 参数, THE List_Aggregator SHALL 仅返回该分类下的所有已安装命令
3. WHEN 用户指定的 category 不存在或该分类下无命令, THE List_Aggregator SHALL 以退出码 1 退出并告知用户
4. THE List_Aggregator SHALL 使用预定义的分类体系（filesystem、text-processing、search、archive、process、system、network、shell 等）

### 需求 5: 系统扫描

**User Story:** 作为用户，我希望扫描当前系统已安装的命令并生成运行时索引，以便其他子命令能基于最新数据工作。

#### 验收标准

1. WHEN 用户执行 `cmds scan`, THE Scanner SHALL 检测系统已安装的可执行命令
2. WHEN 扫描检测到命令, THE Scanner SHALL 与 Tldr_Index 比对，筛选出本机实际安装的命令及其 metadata
3. WHEN 本机存在但 Tldr_Index 中没有的命令, THE Scanner SHALL 尝试 `--help` 提取基本信息
4. WHEN 扫描完成, THE Scanner SHALL 检测 XDB 命令可用性并记录到 Runtime_Index 中
5. WHEN 扫描完成, THE Scanner SHALL 将结果写入 Runtime_Index（`~/.config/cmds/index.json`），包含 lastScanTime 和 systemInfo
6. WHEN Runtime_Index 目录不存在, THE Scanner SHALL 自动创建 `~/.config/cmds/` 目录

### 需求 6: 输出格式化

**User Story:** 作为用户或 LLM Agent，我希望根据使用场景获得合适的输出格式，以便人类能阅读美观文本，程序能解析结构化 JSON。

#### 验收标准

1. WHEN stdout 为 TTY 且未指定 `--json`, THE Output_Formatter SHALL 输出人类可读的 Markdown 风格格式化文本
2. WHEN stdout 不是 TTY（管道模式）, THE Output_Formatter SHALL 自动输出 JSON 格式
3. WHEN 用户显式指定 `--json` 参数, THE Output_Formatter SHALL 输出结构化 JSON，无论 stdout 是否为 TTY
4. THE Output_Formatter SHALL 确保所有子命令（search、info、list、scan）均支持 `--json` 输出

### 需求 7: 数据架构与索引管理

**User Story:** 作为开发者，我希望系统有清晰的数据架构，静态 tldr 索引随包分发，运行时索引按需更新，以便数据可靠且可维护。

#### 验收标准

1. THE CLI SHALL 从 `dist/data/tldr-index.json` 加载静态 Tldr_Index 数据
2. THE CLI SHALL 从 `~/.config/cmds/index.json` 加载 Runtime_Index 数据
3. WHEN Runtime_Index 不存在, THE CLI SHALL 提示用户先运行 `cmds scan`
4. THE Runtime_Index SHALL 包含 xdbAvailable（boolean）、lastScanTime（ISO 时间戳）和 systemInfo 元数据字段
5. WHEN 读取 Runtime_Index 文件失败（格式损坏等）, THE CLI SHALL 提示用户重新运行 `cmds scan`

### 需求 8: 退出码规范

**User Story:** 作为脚本或 LLM Agent 的调用者，我希望 CLI 遵循标准退出码约定，以便我能可靠地判断执行结果。

#### 验收标准

1. WHEN 操作成功完成, THE CLI SHALL 以退出码 0 退出
2. WHEN 命令未找到或搜索无结果, THE CLI SHALL 以退出码 1 退出
3. WHEN 参数错误或用法错误, THE CLI SHALL 以退出码 2 退出
