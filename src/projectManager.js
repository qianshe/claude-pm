const fs = require('fs');
const path = require('path');
const { getClaudeConfigPath, getClaudeCachePath } = require('./config');

/**
 * 读取 .claude.json 配置文件，获取项目路径映射
 * @returns {Object} 项目路径映射 { 真实路径: 配置信息 }
 */
function getClaudeProjects() {
  try {
    const configPath = getClaudeConfigPath();

    if (!fs.existsSync(configPath)) {
      return {};
    }

    const configContent = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);

    return config.projects || {};
  } catch (error) {
    console.warn(`读取 .claude.json 失败: ${error.message}`);
    return {};
  }
}

/**
 * 将项目目录名转换为真实路径格式
 * 例如: D--myProject-tools-ClaudePM -> D:\myProject\tools\ClaudePM
 * 注意: 由于 - 可能代表 \ 或 . 或真实的 -，此转换可能不准确
 * 建议优先从 JSONL 文件中读取 cwd 字段获取真实路径
 * @param {string} dirName - 目录名
 * @returns {string} 真实路径（可能不准确）
 */
function convertDirNameToPath(dirName) {
  // 匹配盘符部分 (如 D--, E--)
  const driveMatch = dirName.match(/^([A-Z])--/);
  if (!driveMatch) {
    return dirName;
  }

  const drive = driveMatch[1];
  // 简单替换 - 为 \（可能不准确，因为原路径中的 . 也会被转换成 -）
  const pathPart = dirName.substring(3).replace(/-/g, '\\');

  return `${drive}:\\${pathPart}`;
}

/**
 * 从项目目录中获取真实路径（从 JSONL 文件中读取 cwd）
 * @param {string} projectDir - 项目目录路径
 * @returns {string|null} 真实路径
 */
function getRealPathFromJsonl(projectDir) {
  try {
    const files = fs.readdirSync(projectDir);
    const jsonlFile = files.find(f => f.endsWith('.jsonl'));

    if (!jsonlFile) {
      return null;
    }

    const jsonlPath = path.join(projectDir, jsonlFile);
    const content = fs.readFileSync(jsonlPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    // 查找包含 cwd 的行
    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.cwd) {
          return json.cwd;
        }
      } catch (e) {
        // 跳过无效的 JSON 行
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * 将真实路径转换为目录名格式
 * 例如: D:\myProject\top.qianshe\ClaudePM -> D--myProject-top-qianshe-ClaudePM
 * @param {string} realPath - 真实路径
 * @returns {string} 目录名
 */
function convertPathToDirName(realPath) {
  if (!realPath) return '';

  // Windows 路径格式：D:\path\to\project
  const normalized = realPath.replace(/\//g, '\\');
  const match = normalized.match(/^([A-Z]):\\/);

  if (match) {
    const drive = match[1];
    // 替换 \ 和 . 为 -
    const pathPart = normalized.substring(3).replace(/[\\\.]/g, '-');
    return `${drive}--${pathPart}`;
  }

  return realPath;
}

/**
 * 读取本地项目列表（包含 .claude.json 中的所有项目）
 * @returns {Array} 项目列表
 */
function getLocalProjects() {
  try {
    const cachePath = getClaudeCachePath();
    const claudeProjects = getClaudeProjects();

    // 1. 先读取所有缓存目录，建立反向映射
    const cacheDirMap = new Map(); // dirName -> projectDir
    if (fs.existsSync(cachePath)) {
      const items = fs.readdirSync(cachePath, { withFileTypes: true });
      items
        .filter(item => item.isDirectory())
        .forEach(dir => {
          cacheDirMap.set(dir.name, path.join(cachePath, dir.name));
        });
    }

    // 2. 遍历 .claude.json 中的项目，反向查找缓存目录
    const projectMap = new Map();

    Object.entries(claudeProjects).forEach(([realPath, config]) => {
      const expectedDirName = convertPathToDirName(realPath);

      // 查找匹配的缓存目录
      let actualDirName = null;
      let projectDir = null;

      if (cacheDirMap.has(expectedDirName)) {
        // 精确匹配
        actualDirName = expectedDirName;
        projectDir = cacheDirMap.get(expectedDirName);
      } else {
        // 尝试从缓存目录中查找（通过 JSONL 文件中的 cwd 匹配）
        for (const [dirName, dirPath] of cacheDirMap.entries()) {
          const cwdPath = getRealPathFromJsonl(dirPath);
          if (cwdPath && cwdPath === realPath) {
            actualDirName = dirName;
            projectDir = dirPath;
            break;
          }
        }
      }

      const hasCacheDir = !!projectDir && fs.existsSync(projectDir);
      let stats = null;
      let size = 0;
      let sessionCount = 0;

      if (hasCacheDir) {
        stats = fs.statSync(projectDir);
        size = getDirectorySize(projectDir);
        sessionCount = getSessionCount(projectDir);
        // 从映射中移除已匹配的
        cacheDirMap.delete(actualDirName);
      }

      projectMap.set(realPath, {
        dirName: actualDirName || expectedDirName,
        name: path.basename(realPath),
        displayName: realPath,
        path: projectDir || path.join(cachePath, expectedDirName),
        realPath: realPath,
        lastModified: stats ? stats.mtime : new Date(0),
        size: size,
        sessionCount: sessionCount,
        lastSessionId: config.lastSessionId,
        hasCache: hasCacheDir,
        // 从配置中获取统计信息
        lastDuration: config.lastDuration,
        lastCost: config.lastCost,
      });
    });

    // 3. 添加缓存目录中剩余的（未在配置文件中的）项目
    for (const [dirName, projectDir] of cacheDirMap.entries()) {
      let realPath = getRealPathFromJsonl(projectDir);

      if (!realPath) {
        realPath = convertDirNameToPath(dirName);
      }

      // 如果这个路径还没有被添加
      if (!projectMap.has(realPath)) {
        const stats = fs.statSync(projectDir);

        projectMap.set(realPath, {
          dirName: dirName,
          name: path.basename(realPath),
          displayName: realPath,
          path: projectDir,
          realPath: realPath,
          lastModified: stats.mtime,
          size: getDirectorySize(projectDir),
          sessionCount: getSessionCount(projectDir),
          lastSessionId: null,
          hasCache: true,
        });
      }
    }

    // 转换为数组并排序（按最后修改时间倒序）
    const projects = Array.from(projectMap.values())
      .sort((a, b) => b.lastModified - a.lastModified);

    return projects;
  } catch (error) {
    throw new Error(`读取项目列表失败: ${error.message}`);
  }
}

/**
 * 获取项目中的会话数量
 * @param {string} projectDir - 项目目录
 * @returns {number} 会话数量
 */
function getSessionCount(projectDir) {
  try {
    const files = fs.readdirSync(projectDir);
    return files.filter(f => f.endsWith('.jsonl')).length;
  } catch (error) {
    return 0;
  }
}

/**
 * 获取指定项目信息
 * @param {string} projectName - 项目名称、目录名或真实路径
 * @returns {Object|null} 项目信息
 */
function getProjectInfo(projectName) {
  const projects = getLocalProjects();

  // 尝试多种匹配方式
  return projects.find(p =>
    p.name === projectName ||
    p.dirName === projectName ||
    p.displayName === projectName ||
    p.realPath === projectName
  ) || null;
}

/**
 * 计算目录大小
 * @param {string} dirPath - 目录路径
 * @returns {number} 目录大小（字节）
 */
function getDirectorySize(dirPath) {
  let totalSize = 0;

  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const item of items) {
      const itemPath = path.join(dirPath, item.name);

      if (item.isDirectory()) {
        totalSize += getDirectorySize(itemPath);
      } else {
        const stats = fs.statSync(itemPath);
        totalSize += stats.size;
      }
    }
  } catch (error) {
    // 忽略无法访问的文件/目录
  }

  return totalSize;
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的大小
 */
function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * 获取最近使用的项目（从 .claude.json 自动识别）
 * @returns {string|null} 最近使用的项目路径
 */
function getMostRecentProject() {
  try {
    const claudeProjects = getClaudeProjects();

    // 找出最后有 lastSessionId 的项目（表示最近使用）
    let mostRecentPath = null;
    let hasLastSessionId = false;

    for (const [projectPath, config] of Object.entries(claudeProjects)) {
      if (config.lastSessionId) {
        // 简单判断：有 lastSessionId 的就是最近使用的
        // 如果有多个，取第一个（配置文件中的顺序可能反映使用顺序）
        if (!hasLastSessionId) {
          mostRecentPath = projectPath;
          hasLastSessionId = true;
        }
      }
    }

    return mostRecentPath;
  } catch (error) {
    return null;
  }
}

module.exports = {
  getLocalProjects,
  getProjectInfo,
  formatSize,
  getMostRecentProject,
};
