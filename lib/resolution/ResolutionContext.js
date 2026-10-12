"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResolutionContext = void 0;
const fs = require("node:fs");
const typescript_estree_1 = require("@typescript-eslint/typescript-estree");
const lru_cache_1 = require("lru-cache");
const PathUtil_1 = require("../util/PathUtil");
const SourceDeclarationConverter_1 = require("./SourceDeclarationConverter");
/**
 * Context for loading files.
 */
class ResolutionContext {
    constructor() {
        this.parsedCache = new lru_cache_1.LRUCache({ max: 2_048 });
        this.sourceDeclarationConverter = new SourceDeclarationConverter_1.SourceDeclarationConverter();
    }
    /**
     * Reads the content of a file
     * @param filePath The file path
     * @return The content of the file
     */
    getFileContent(filePath) {
        return new Promise((resolve, reject) => {
            fs.readFile(filePath, 'utf8', (error, data) => {
                if (error) {
                    reject(error);
                }
                else {
                    resolve(data);
                }
            });
        });
    }
    /**
     * Check if the given file exists.
     * @param filePath The file path.
     */
    fileExists(filePath) {
        return new Promise((resolve) => {
            fs.access(filePath, error => resolve(!error));
        });
    }
    /**
     * Resolve the correct type declarations path for a specific path used
     * in the exports.
     *
     * @param {string} filePath File path without .d.ts or .ts
     * @returns {Promise<string>} Promise of the file path without .d.ts or .ts that is
     *  either equal to the parameter or the index of the directory.
     */
    async resolveTypesPath(filePath) {
        if (await this.fileExists(`${filePath}.d.ts`) || await this.fileExists(`${filePath}.ts`)) {
            return filePath;
        }
        // No file found, treat as directory with an index
        return (0, PathUtil_1.normalizeFilePath)(`${filePath}/index`);
    }
    /**
     * Determine the file that holds the types for the given path.
     * Declaration files (.d.ts) are preferred, with TypeScript source files (.ts) as fallback.
     * @param filePath A typescript file path, without extension.
     * @return The file path with extension.
     */
    async resolveTypeScriptFilePath(filePath) {
        if (!await this.fileExists(`${filePath}.d.ts`) && await this.fileExists(`${filePath}.ts`)) {
            return `${filePath}.ts`;
        }
        return `${filePath}.d.ts`;
    }
    /**
     * Write the content of a file.
     * If any of the underlying directories do not exist, they will be created.
     *
     * @param filePath The file path.
     * @param content The content of the file.
     */
    async writeFileContent(filePath, content) {
        await new Promise((resolve, reject) => {
            fs.mkdir((0, PathUtil_1.filePathDirName)(filePath), { recursive: true }, (error) => {
                if (error) {
                    reject(error);
                }
                else {
                    resolve();
                }
            });
        });
        await new Promise((resolve, reject) => {
            fs.writeFile(filePath, content, 'utf8', (error) => {
                if (error) {
                    reject(error);
                }
                else {
                    resolve();
                }
            });
        });
    }
    /**
     * Gets the content of a TypeScript file based on its filepath without extension
     * @param filePath A typescript file path, without extension.
     * @return The content of the file
     */
    async getTypeScriptFileContent(filePath) {
        return this.getFileContent(await this.resolveTypeScriptFilePath(filePath));
    }
    /**
     * Parse the given typescript contents into an abstract syntax tree.
     * @param contents Typescript file contents.
     * @return An abstract syntax tree.
     */
    parseTypescriptContents(contents) {
        return (0, typescript_estree_1.parse)(contents, { loc: true, comment: true });
    }
    /**
     * Parse a given typescript file into an abstract syntax tree.
     * This method has a built-in cache, so repeated calls for the same file are safe.
     * @param filePath A typescript file path, without extension.
     * @return - An abstract syntax tree.
     */
    async parseTypescriptFile(filePath) {
        // First check cache
        const cached = this.parsedCache.get(filePath);
        if (cached) {
            return cached;
        }
        const parsed = await this.parseTypescriptFileUncached(filePath);
        this.parsedCache.set(filePath, parsed);
        return parsed;
    }
    /**
     * Parse a given typescript file into an abstract syntax tree, without caching.
     * TypeScript source files are converted into the shape of a declaration file.
     * @param filePath A typescript file path, without extension.
     * @return - An abstract syntax tree.
     */
    async parseTypescriptFileUncached(filePath) {
        const resolvedPath = await this.resolveTypeScriptFilePath(filePath);
        const indexContent = await this.getFileContent(resolvedPath);
        let parsed;
        try {
            parsed = this.parseTypescriptContents(indexContent);
        }
        catch (error) {
            throw new Error(`Could not parse file ${filePath}, invalid syntax at line ${error.lineNumber}, column ${error.column}. Message: ${error.message}`);
        }
        return resolvedPath.endsWith('.d.ts') ? parsed : this.sourceDeclarationConverter.convert(parsed);
    }
    /**
     * Determine the path to the index file of the given package.
     * @param packageName A package name.
     * @param currentFilePath The file from which resolution should start.
     *                        The requested package has to be a dependency of this file's package.
     */
    resolvePackageIndex(packageName, currentFilePath) {
        try {
            // First check if we have an @types package
            return this.resolvePackageIndexInner(require, `@types/${packageName}`, currentFilePath);
        }
        catch {
            try {
                // Fallback to the actual package
                return this.resolvePackageIndexInner(require, packageName, currentFilePath);
            }
            catch {
                // As final fallback, check if the package is a valid Node.js built-in like 'stream'.
                require.resolve(packageName, { paths: [currentFilePath] });
                // If so, require the Node.js types, and resolve the file for the built-in package
                const rootFile = this.resolvePackageIndexInner(require, `@types/node`, currentFilePath);
                return rootFile.replace(/index\.d\.ts$/u, `${packageName}.d.ts`);
            }
        }
    }
    resolvePackageIndexInner(req, packageName, currentFilePath) {
        const packageJsonPath = req.resolve(`${packageName}/package.json`, { paths: [currentFilePath] });
        const packageJson = req(packageJsonPath);
        let typesPath = packageJson.types || packageJson.typings || packageJson.main.replace(/\.js$/u, '.d.ts');
        if (!typesPath.endsWith('.ts')) {
            typesPath += '.d.ts';
        }
        return (0, PathUtil_1.joinFilePath)((0, PathUtil_1.filePathDirName)(packageJsonPath), typesPath);
    }
}
exports.ResolutionContext = ResolutionContext;
//# sourceMappingURL=ResolutionContext.js.map