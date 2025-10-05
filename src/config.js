const Conf = require('conf');
const path = require('path');
const os = require('os');

// 配置存储 - 统一存储到 ~/.claude/claude-pm/
const config = new Conf({
  projectName: 'claude-pm',
  cwd: path.join(os.homedir(), '.claude', 'claude-pm'),
  defaults: {
    // Claude配置路径（待用户提供）
    claudeConfigPath: '',
    // Claude缓存目录（待用户提供）
    claudeCachePath: '',
    // 当前活跃项目
    currentProject: null,
  }
});

/**
 * 获取Claude配置路径
 */
function getClaudeConfigPath() {
  const configPath = config.get('claudeConfigPath');
  if (!configPath) {
    // Claude Code 配置文件路径
    // ~/.claude.json
    return path.join(os.homedir(), '.claude.json');
  }
  return configPath;
}

/**
 * 获取Claude项目目录（存储对话历史）
 */
function getClaudeCachePath() {
  const cachePath = config.get('claudeCachePath');
  if (!cachePath) {
    // Claude Code 项目存储默认路径
    // ~/.claude/projects/ (存储为 JSONL 文件)
    return path.join(os.homedir(), '.claude', 'projects');
  }
  return cachePath;
}

/**
 * 设置Claude配置路径
 */
function setClaudeConfigPath(configPath) {
  config.set('claudeConfigPath', configPath);
}

/**
 * 设置Claude缓存目录
 */
function setClaudeCachePath(cachePath) {
  config.set('claudeCachePath', cachePath);
}

/**
 * 获取当前活跃项目
 */
function getCurrentProject() {
  return config.get('currentProject');
}

/**
 * 设置当前活跃项目
 */
function setCurrentProject(projectName) {
  config.set('currentProject', projectName);
}

module.exports = {
  config,
  getClaudeConfigPath,
  getClaudeCachePath,
  setClaudeConfigPath,
  setClaudeCachePath,
  getCurrentProject,
  setCurrentProject,
};
