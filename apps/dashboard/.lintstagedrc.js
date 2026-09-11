const fs = require('fs').promises;
const path = require('path');
const { ESLint } = require('eslint');
const ts = require('typescript');

const projectRoot = process.cwd();

const prepareTsConfigForLint = (config) => {
  if (!config.compilerOptions) {
    config.compilerOptions = {};
  }
  delete config.compilerOptions.composite;
  delete config.compilerOptions.tsBuildInfoFile;
  const currentBaseUrl = config.compilerOptions.baseUrl ?? '.';

  config.compilerOptions.baseUrl = path.resolve(projectRoot, currentBaseUrl);

  return config;
};

// 尝试使用 TypeScript 的文件展开能力来解析 include patterns 至具体文件路径集合
const expandTsIncludesToSet = (config) => {
  const emptySet = new Set();

  if (!config?.include?.length) return emptySet;
  if (!ts || !ts.sys || !ts.sys.readDirectory) return emptySet;

  try {
    // ts.sys.readDirectory(baseDir, extensions, excludes, includes)
    const files = ts.sys.readDirectory(projectRoot, ['vue', 'ts', 'tsx'], config?.exclude, config.include);

    return new Set(files);
  } catch {
    return emptySet;
  }
};

const generateTSConfig = async (stagedFiles) => {
  if (!stagedFiles.length) return [];

  // 读取 app 和 node 配置
  const [tsAppConfigRaw, tsNodeConfigRaw] = await Promise.all([
    fs.readFile(path.resolve('tsconfig.app.json'), 'utf8'),
    fs.readFile(path.resolve('tsconfig.node.json'), 'utf8'),
  ]);
  const tsAppConfig = prepareTsConfigForLint(JSON.parse(tsAppConfigRaw));
  const tsNodeConfig = prepareTsConfigForLint(JSON.parse(tsNodeConfigRaw));

  const nodeFilesSet = expandTsIncludesToSet(tsNodeConfig);
  const appFilesSet = expandTsIncludesToSet(tsAppConfig);

  const resolvedStagedFiles = stagedFiles.map((f) => path.resolve(f));

  const nodeFilesToCheck = resolvedStagedFiles.filter((f) => nodeFilesSet.has(f));
  const appFilesToCheck = resolvedStagedFiles.filter((f) => appFilesSet.has(f));

  const commands = [];

  if (appFilesToCheck.length > 0) {
    // app 动态 include + 排除 node include，避免重复校验
    const srcDir = path.resolve('src/**/*.d.ts');

    tsAppConfig.include = [...appFilesToCheck, srcDir];

    const tsAppLintPath = path.resolve('node_modules/tsconfig.app.lint.json');

    await fs.writeFile(tsAppLintPath, JSON.stringify(tsAppConfig, null, 2));
    commands.push(`vue-tsc --noEmit --project ${tsAppLintPath}`);
  }

  if (nodeFilesToCheck.length > 0) {
    tsNodeConfig.include = nodeFilesToCheck;
    const tsNodeLintPath = path.resolve('node_modules/tsconfig.node.lint.json');

    await fs.writeFile(tsNodeLintPath, JSON.stringify(tsNodeConfig, null, 2));
    commands.push(`vue-tsc --noEmit --project ${tsNodeLintPath}`);
  }

  return commands;
};

// 处理 eslint warning: File ignored by default.
const removeEslintIgnored = async (stagedFilenames) => {
  if (stagedFilenames.length === 0) return '';
  const eslint = new ESLint();
  const isIgnored = await Promise.all(
    stagedFilenames.map((file) => eslint.isPathIgnored(file)),
  );
  const filteredFiles = stagedFilenames.filter((_, i) => !isIgnored[i]);

  return `eslint --max-warnings=0 ${filteredFiles
    .map((item) => `'${item}'`)
    .join(' ')}`;
};

module.exports = {
  'src/**/*.{vue,css,scss}': 'stylelint --allow-empty-input',
  '*.{vue,ts,tsx}': async (files) => {
    const eslintCmd = await removeEslintIgnored(files);
    const tscCmds = await generateTSConfig(files);

    return [eslintCmd, ...tscCmds];
  },
  '*.{json,js,jsx}': [removeEslintIgnored],
  'src/**/*.{json,json5,jsonc}': 'textlint --config .textlintrc.json',
};
