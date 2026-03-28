import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const entryHtmlPath = path.join(rootDir, 'index.html');
const entryModulePath = path.join(rootDir, 'js', 'main.js');
const stylesPath = path.join(rootDir, 'css', 'styles.css');
const outputDir = path.join(rootDir, 'dist');
const outputHtmlPath = path.join(outputDir, 'trench-warfare-standalone.html');

const importFromRegex = /^\s*import\s+([\s\S]*?)\s+from\s+['"](.+?)['"];\s*(?:\/\/[^\n]*)?$/gm;
const importSideEffectRegex = /^\s*import\s+['"](.+?)['"];\s*(?:\/\/[^\n]*)?$/gm;
const exportedVarRegex = /export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/g;
const exportedFunctionRegex = /export\s+function\s+([A-Za-z_$][\w$]*)/g;
const exportedClassRegex = /export\s+class\s+([A-Za-z_$][\w$]*)/g;
const exportListRegex = /export\s*\{\s*([^}]+)\s*\};?/g;
const exportDefaultRegex = /export\s+default\b/g;

const modules = new Map();

function toModuleId(filePath) {
    return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function resolveModulePath(fromFilePath, specifier) {
    if (!specifier.startsWith('.')) {
        throw new Error(`Unsupported non-relative import "${specifier}" in ${toModuleId(fromFilePath)}.`);
    }

    const resolvedPath = path.resolve(path.dirname(fromFilePath), specifier);
    return path.extname(resolvedPath) ? resolvedPath : `${resolvedPath}.js`;
}

function renderNamedBindings(bindingsSource) {
    return bindingsSource
        .split(',')
        .map((binding) => binding.trim())
        .filter(Boolean)
        .map((binding) => {
            const [imported, local] = binding.split(/\s+as\s+/).map((part) => part.trim());
            return local ? `${imported}: ${local}` : imported;
        })
        .join(', ');
}

function renderImport(clause, targetModuleId) {
    const trimmedClause = clause.trim();

    if (!trimmedClause) {
        return `__require(${JSON.stringify(targetModuleId)});`;
    }

    if (trimmedClause.startsWith('{')) {
        return `const { ${renderNamedBindings(trimmedClause.slice(1, -1))} } = __require(${JSON.stringify(targetModuleId)});`;
    }

    if (trimmedClause.startsWith('* as ')) {
        return `const ${trimmedClause.slice(5).trim()} = __require(${JSON.stringify(targetModuleId)});`;
    }

    const commaIndex = trimmedClause.indexOf(',');
    if (commaIndex === -1) {
        return `const ${trimmedClause} = __require(${JSON.stringify(targetModuleId)}).default;`;
    }

    const defaultBinding = trimmedClause.slice(0, commaIndex).trim();
    const remainder = trimmedClause.slice(commaIndex + 1).trim();
    const statements = [];

    if (defaultBinding) {
        statements.push(`const ${defaultBinding} = __require(${JSON.stringify(targetModuleId)}).default;`);
    }

    if (remainder.startsWith('{')) {
        statements.push(`const { ${renderNamedBindings(remainder.slice(1, -1))} } = __require(${JSON.stringify(targetModuleId)});`);
    } else if (remainder.startsWith('* as ')) {
        statements.push(`const ${remainder.slice(5).trim()} = __require(${JSON.stringify(targetModuleId)});`);
    } else {
        throw new Error(`Unsupported import clause "${trimmedClause}".`);
    }

    return statements.join('\n');
}

async function collectModule(filePath) {
    const normalizedPath = path.resolve(filePath);
    if (modules.has(normalizedPath)) {
        return;
    }

    let source = await readFile(normalizedPath, 'utf8');
    const imports = [];
    const exports = [];

    if (exportDefaultRegex.test(source)) {
        throw new Error(`Default exports are not supported in ${toModuleId(normalizedPath)}.`);
    }

    source = source.replace(importSideEffectRegex, (match, specifier) => {
        imports.push({ clause: '', specifier });
        return '';
    });

    source = source.replace(importFromRegex, (match, clause, specifier) => {
        imports.push({ clause: clause.trim(), specifier });
        return '';
    });

    source = source.replace(exportedVarRegex, (match, kind, name) => {
        exports.push({ local: name, exported: name });
        return `${kind} ${name}`;
    });

    source = source.replace(exportedFunctionRegex, (match, name) => {
        exports.push({ local: name, exported: name });
        return `function ${name}`;
    });

    source = source.replace(exportedClassRegex, (match, name) => {
        exports.push({ local: name, exported: name });
        return `class ${name}`;
    });

    source = source.replace(exportListRegex, (match, exportList) => {
        const bindings = exportList
            .split(',')
            .map((binding) => binding.trim())
            .filter(Boolean);

        bindings.forEach((binding) => {
            const [local, exported] = binding.split(/\s+as\s+/).map((part) => part.trim());
            exports.push({ local, exported: exported || local });
        });

        return '';
    });

    const dependencyPaths = imports.map(({ specifier }) => resolveModulePath(normalizedPath, specifier));

    modules.set(normalizedPath, {
        id: toModuleId(normalizedPath),
        source: source.trim(),
        imports,
        exports,
        dependencyPaths,
    });

    for (const dependencyPath of dependencyPaths) {
        await collectModule(dependencyPath);
    }
}

function buildBundleSource() {
    const moduleDefinitions = [];

    for (const [filePath, moduleRecord] of [...modules.entries()].sort((a, b) => a[1].id.localeCompare(b[1].id))) {
        const importLines = moduleRecord.imports.map(({ clause, specifier }) => {
            const dependencyId = toModuleId(resolveModulePath(filePath, specifier));
            return renderImport(clause, dependencyId);
        });

        const exportLines = moduleRecord.exports.map(({ local, exported }) => {
            return `exports.${exported} = ${local};`;
        });

        const moduleBody = [
            ...importLines,
            moduleRecord.source,
            ...exportLines,
        ].filter(Boolean).join('\n\n');

        moduleDefinitions.push(`__define(${JSON.stringify(moduleRecord.id)}, (exports, __require) => {\n${moduleBody}\n});`);
    }

    return `
const __modules = new Map();

function __define(id, factory) {
    __modules.set(id, { factory, exports: {}, initialized: false, initializing: false });
}

function __require(id) {
    const record = __modules.get(id);
    if (!record) {
        throw new Error(\`Missing bundled module: \${id}\`);
    }

    if (record.initialized || record.initializing) {
        return record.exports;
    }

    record.initializing = true;
    record.factory(record.exports, __require);
    record.initializing = false;
    record.initialized = true;
    return record.exports;
}

${moduleDefinitions.join('\n\n')}

__require(${JSON.stringify(toModuleId(entryModulePath))});
`.trim();
}

function inlineStyles(htmlSource, stylesSource) {
    const styleTag = `<style>\n${stylesSource.trim()}\n</style>`;
    const updatedHtml = htmlSource.replace(
        /<link\s+rel="stylesheet"\s+href="css\/styles\.css">\s*/i,
        `${styleTag}\n    `
    );

    if (updatedHtml === htmlSource) {
        throw new Error('Could not find the stylesheet link tag in index.html.');
    }

    return updatedHtml;
}

function inlineAppScript(htmlSource, bundleSource) {
    const scriptTag = `<script type="module">\n${bundleSource.replace(/<\/script>/gi, '<\\/script>')}\n</script>`;
    const updatedHtml = htmlSource.replace(
        /<script\s+type="module"\s+src="js\/main\.js"><\/script>\s*/i,
        `${scriptTag}\n`
    );

    if (updatedHtml === htmlSource) {
        throw new Error('Could not find the app module script tag in index.html.');
    }

    return updatedHtml;
}

async function build() {
    await collectModule(entryModulePath);

    const [htmlSource, stylesSource] = await Promise.all([
        readFile(entryHtmlPath, 'utf8'),
        readFile(stylesPath, 'utf8'),
    ]);

    const bundleSource = buildBundleSource();
    let outputHtml = inlineStyles(htmlSource, stylesSource);
    outputHtml = inlineAppScript(outputHtml, bundleSource);

    await mkdir(outputDir, { recursive: true });
    await writeFile(outputHtmlPath, outputHtml, 'utf8');

    console.log(`Built ${path.relative(rootDir, outputHtmlPath)}`);
}

build().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
