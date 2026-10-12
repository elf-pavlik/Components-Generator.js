"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeFilePath = normalizeFilePath;
exports.joinFilePath = joinFilePath;
exports.filePathDirName = filePathDirName;
const Path = require("node:path");
/**
 * Changes a potential Windows path into a POSIX path.
 *
 * @param path - Path to check (POSIX or Windows).
 *
 * @returns The potentially changed path (POSIX).
 */
function windowsToPosixPath(path) {
    return path.replaceAll(/\\+/gu, '/');
}
/**
 * Resolves relative segments in the path.
 *
 * @param path - Path to check (POSIX or Windows).
 *
 * @returns The potentially changed path (POSIX).
 */
function normalizeFilePath(path) {
    return Path.posix.normalize(windowsToPosixPath(path));
}
/**
 * Adds the paths to the base path.
 *
 * @param basePath - The base path (POSIX or Windows).
 * @param paths - Subpaths to attach (POSIX).
 *
 * @returns The potentially changed path (POSIX).
 */
function joinFilePath(basePath, ...paths) {
    return Path.posix.join(windowsToPosixPath(basePath), ...paths);
}
/**
 * Returns the directory name of a path.
 *
 * @param path - Path to find directory of.
 *
 * @returns The directory path.
 */
function filePathDirName(path) {
    return Path.posix.dirname(windowsToPosixPath(path));
}
//# sourceMappingURL=PathUtil.js.map