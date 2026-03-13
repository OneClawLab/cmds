以下是为 `cmds` 设计的 **Specification (SPEC)**。这份设计遵循 Unix 哲学，确保它既能作为 LLM 的高效工具，也能作为人类用户的日常利器。

---

## 1. 命令概述 (Overview)

`cmds` 是一个现代化的系统能力发现工具，旨在连接 **用户意图 (Intent)** 与 **二进制执行 (Binary Execution)**。它不仅是 `$PATH` 的搜索器，更是系统功能的语义索引和交互式手册。

## 2. 设计原则 (Design Principles)

* **Atomic (原子性)**: 专注于“发现”与“解释”，不负责执行。
* **Contextual (上下文相关)**: 能够根据当前操作系统环境提供相关的命令建议。
* **Machine-Friendly (机器友好)**: 提供结构化的输出格式（如 JSON），便于 LLM 或脚本解析。
* **Human-Readable (人类易读)**: 默认输出美观的 Markdown 或 TUI 界面。

---

## 3. 功能指令 (Sub-commands & Usage)

### A. 语义搜索 (Search by Intent)

这是 `cmds` 的核心。当输入非特定命令名的字符串时，触发语义搜索。

* **用法**: `cmds [options] <query>`
* **示例**: `cmds "how to convert mp4 to gif"`
* **逻辑**:
1. 对 `<query>` 进行 Embedding。
2. 在本地向量库（包含常用 Linux 命令的描述和示例）中进行相似度检索。
3. 返回相关度最高的 Top 3-5 个命令及其一句话简介。



### B. 信息查询 (Info/Inspection)

展示特定命令的详细元数据。

* **用法**: `cmds info <command>` 或 `cmds -i <command>`
* **输出内容**:
* **Description**: 该命令的核心作用。
* **Common Use Cases**: 3-5 个最常用的场景。
* **Examples**: 直接可用的命令模板（类似 `tldr`）。
* **Caveats**: 使用该命令的常见坑点或安全警告。



### C. 列表与过滤 (List & Filter)

列出系统当前可用的命令。

* **用法**: `cmds list [--category <type>]`
* **示例**: `cmds list --category "network"` (列出所有与网络相关的工具)。

---

## 4. 逻辑架构 (Logical Architecture)

* **Input Parser**: 解析用户输入，识别是“特定命令名”还是“模糊意图”。
* **Semantic Engine**: 桥接 `pai` 或本地轻量级模型（如 Transformer.js），将意图转换为向量。
* **Knowledge Base**:
* **Static**: 离线的 `man` pages 和 `tldr` 数据集。
* **Dynamic**: 扫描当前系统的 `$PATH` 和别名（Alias）。


* **Output Formatter**: 根据环境（TTY 或 Pipe）自动选择输出 Markdown 或 JSON。

---

## 5. 交互示例 (Sample Interaction)

### LLM 调用流程：

1. **Step 1 (Discovery)**:
`$ cmds "find large files over 100MB"`
*Output*: `1. find (Find files in a directory hierarchy)`
2. **Step 2 (Inspection)**:
`$ cmds info find`
*Output*: `Example: find /path -type f -size +100M`
3. **Step 3 (Action)**:
LLM 通过 `pai` 或直接执行生成的命令。

---

## 6. 技术规格 (Technical Specs)

* **Runtime**: Node.js (与你的 `pai` 保持一致)。
* **Storage**:
* **Vector DB**: LanceDB (嵌入式，高性能，适合本地 RAG)。
    注: 这个不打算放在 这个 repo 里，而是需要再做一个另外的向量数据库命令。
* **Metadata**: SQLite 或简单的 JSON 索引。
    注: 暂时用JSON文件即可。

* **Integrations**:
* 支持从 `man` 自动抽取摘要。
* 支持读取用户的 `~/.bash_history` 来权重化搜索结果（可选）。
