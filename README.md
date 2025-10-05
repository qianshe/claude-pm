# ClaudePM - Claude 本地项目管理工具

一个用于管理 Claude 本地项目的命令行工具。

## 功能特性

- 📁 列出所有本地 Claude 项目（包括中文路径）
- 🔄 切换当前活跃项目
- 📊 显示项目详细信息（大小、会话数、修改时间等）
- 💾 本地配置存储
- 🌏 自动识别中文路径
- 📝 显示会话统计信息
- 🗑️ 清理无缓存的历史项目
- 🎯 交互式会话管理（查看、选择性删除）

## 安装

### 从 npm 安装（推荐）

```bash
npm install -g @qianshe/claude-pm
```

### 本地开发安装

```bash
git clone <仓库地址>
cd ClaudePM
npm install
npm link  # 全局安装命令
```

## 配置

工具已自动配置 Claude 的默认路径，无需手动配置即可使用。

### 默认路径

**Claude Code 配置文件：**
- 所有平台: `~/.claude.json`

**Claude 项目存储目录：**
- 所有平台: `~/.claude/projects/`

### 自定义路径

如需使用自定义路径，可在首次运行时配置，配置信息将存储在：
- Windows: `%APPDATA%\claude-pm`
- macOS/Linux: `~/.config/claude-pm`

## 使用方法

> **提示：** 所有 `claude-pm` 命令都可以用 `ccpm` 替代，例如 `ccpm list` 或 `ccpm ls`

### 列出所有项目

```bash
claude-pm list
# 或使用别名
claude-pm ls
# 或使用简短命令
ccpm ls
```

### 切换项目

```bash
claude-pm switch <项目名>
# 或使用别名
claude-pm sw <项目名>
```

### 查看当前项目

```bash
claude-pm current
# 或使用别名
claude-pm c
```

### 清理无缓存项目

```bash
# 预览将要删除的项目
claude-pm clean --dry-run

# 清理无缓存的项目（会提示确认）
claude-pm clean
```

### 管理项目会话

```bash
# 管理当前活跃项目的会话（默认选中 2KB 以下的会话）
claude-pm sessions

# 管理指定项目的会话
claude-pm sessions ClaudePM

# 自定义小文件阈值（例如：5KB）
claude-pm sessions --size 5
```

## 项目结构

```
ClaudePM/
├── bin/
│   └── claude-pm.js        # CLI 入口文件
├── src/
│   ├── config.js           # 配置管理
│   ├── projectManager.js   # 项目管理核心逻辑
│   └── commands.js         # 命令实现
├── package.json
├── .gitignore
└── README.md
```

## 技术说明

### Claude 项目存储结构

**配置文件：** `~/.claude.json`
- 包含所有项目的路径映射和配置信息
- 记录项目的真实路径（包括中文路径）
- 存储最后使用的 sessionId

**项目缓存：** `~/.claude/projects/`
- 每个项目目录命名规则：`盘符--路径-分隔-符号`
  - 例如：`D:\Doc\Tecl\编程技术` → `D--Doc-Tecl-----`
  - 中文字符会被替换为 `-`
- 对话历史保存为 JSONL 格式文件
- 文件命名格式：`[session-id].jsonl`
- JSONL 文件中包含 `cwd` 字段，记录项目真实路径

### 功能实现

✅ 自动识别中文路径项目
✅ 从 `.claude.json` 读取项目配置
✅ 从 JSONL 文件解析真实路径
✅ 显示会话数量统计
✅ 支持多种项目名称匹配方式（名称/目录名/真实路径）

### 已知限制

- Claude 官方未提供项目导出功能
- `.claude.json` 文件会持续累积历史记录，可能导致性能问题

## 许可证

MIT
