/* istanbul ignore file */
import type { AST, TSESTreeOptions } from '@typescript-eslint/typescript-estree';
import { ResolutionContext } from '../lib/resolution/ResolutionContext';

export class ResolutionContextMocked extends ResolutionContext {
  public contentsOverrides: Record<string, string | AST<TSESTreeOptions>>;
  public packageNameIndexOverrides: Record<string, string>;

  public constructor(
    contentsOverrides: Record<string, string | AST<TSESTreeOptions>>,
    packageNameIndexOverrides: Record<string, string> = {},
  ) {
    super();
    this.contentsOverrides = contentsOverrides;
    this.packageNameIndexOverrides = packageNameIndexOverrides;
  }

  public async fileExists(filePath: string): Promise<boolean> {
    return filePath in this.contentsOverrides;
  }

  public async getFileContent(filePath: string): Promise<string> {
    if (!(filePath in this.contentsOverrides)) {
      throw new Error(`Could not find mocked path for ${filePath}`);
    }
    return <any> this.contentsOverrides[filePath];
  }

  public async writeFileContent(filePath: string, content: string): Promise<void> {
    this.contentsOverrides[filePath] = content;
  }

  public parseTypescriptContents(contents: string): AST<TSESTreeOptions> {
    if (typeof contents !== 'string') {
      return contents;
    }
    return super.parseTypescriptContents(contents);
  }

  public async parseTypescriptFile(filePath: string): Promise<AST<TSESTreeOptions>> {
    return this.parseTypescriptFileUncached(filePath);
  }

  public resolvePackageIndex(packageName: string, currentFilePath: string): string {
    const filePath = this.packageNameIndexOverrides[packageName];
    if (!filePath) {
      throw new Error(`Could not resolve '${packageName}' from path '${currentFilePath}'`);
    }
    return filePath;
  }
}
