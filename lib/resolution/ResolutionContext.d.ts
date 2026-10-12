import type { AST, TSESTreeOptions } from '@typescript-eslint/typescript-estree';
/**
 * Context for loading files.
 */
export declare class ResolutionContext {
    private readonly parsedCache;
    private readonly sourceDeclarationConverter;
    constructor();
    /**
     * Reads the content of a file
     * @param filePath The file path
     * @return The content of the file
     */
    getFileContent(filePath: string): Promise<string>;
    /**
     * Check if the given file exists.
     * @param filePath The file path.
     */
    fileExists(filePath: string): Promise<boolean>;
    /**
     * Resolve the correct type declarations path for a specific path used
     * in the exports.
     *
     * @param {string} filePath File path without .d.ts or .ts
     * @returns {Promise<string>} Promise of the file path without .d.ts or .ts that is
     *  either equal to the parameter or the index of the directory.
     */
    resolveTypesPath(filePath: string): Promise<string>;
    /**
     * Determine the file that holds the types for the given path.
     * Declaration files (.d.ts) are preferred, with TypeScript source files (.ts) as fallback.
     * @param filePath A typescript file path, without extension.
     * @return The file path with extension.
     */
    resolveTypeScriptFilePath(filePath: string): Promise<string>;
    /**
     * Write the content of a file.
     * If any of the underlying directories do not exist, they will be created.
     *
     * @param filePath The file path.
     * @param content The content of the file.
     */
    writeFileContent(filePath: string, content: string): Promise<void>;
    /**
     * Gets the content of a TypeScript file based on its filepath without extension
     * @param filePath A typescript file path, without extension.
     * @return The content of the file
     */
    getTypeScriptFileContent(filePath: string): Promise<string>;
    /**
     * Parse the given typescript contents into an abstract syntax tree.
     * @param contents Typescript file contents.
     * @return An abstract syntax tree.
     */
    parseTypescriptContents(contents: string): AST<TSESTreeOptions>;
    /**
     * Parse a given typescript file into an abstract syntax tree.
     * This method has a built-in cache, so repeated calls for the same file are safe.
     * @param filePath A typescript file path, without extension.
     * @return - An abstract syntax tree.
     */
    parseTypescriptFile(filePath: string): Promise<AST<TSESTreeOptions>>;
    /**
     * Parse a given typescript file into an abstract syntax tree, without caching.
     * TypeScript source files are converted into the shape of a declaration file.
     * @param filePath A typescript file path, without extension.
     * @return - An abstract syntax tree.
     */
    parseTypescriptFileUncached(filePath: string): Promise<AST<TSESTreeOptions>>;
    /**
     * Determine the path to the index file of the given package.
     * @param packageName A package name.
     * @param currentFilePath The file from which resolution should start.
     *                        The requested package has to be a dependency of this file's package.
     */
    resolvePackageIndex(packageName: string, currentFilePath: string): string;
    resolvePackageIndexInner(req: NodeJS.Require, packageName: string, currentFilePath: string): string;
}
