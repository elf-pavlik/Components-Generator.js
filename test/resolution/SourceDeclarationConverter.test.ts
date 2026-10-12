import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { AST_NODE_TYPES } from '@typescript-eslint/typescript-estree';
import { ClassFinder } from '../../lib/parse/ClassFinder';
import { ClassIndexer } from '../../lib/parse/ClassIndexer';
import { ClassLoader } from '../../lib/parse/ClassLoader';
import { CommentLoader } from '../../lib/parse/CommentLoader';
import { ConstructorLoader } from '../../lib/parse/ConstructorLoader';
import { MemberLoader } from '../../lib/parse/MemberLoader';
import { ParameterLoader } from '../../lib/parse/ParameterLoader';
import { ResolutionContext } from '../../lib/resolution/ResolutionContext';
import { SourceDeclarationConverter } from '../../lib/resolution/SourceDeclarationConverter';
import { ResolutionContextMocked } from '../ResolutionContextMocked';

describe('SourceDeclarationConverter', () => {
  const resolutionContext = new ResolutionContextMocked({});
  let converter: SourceDeclarationConverter;
  let constructorLoader: ConstructorLoader;
  let memberLoader: MemberLoader;
  let classIndexer: ClassIndexer;

  beforeEach(() => {
    converter = new SourceDeclarationConverter();
    const logger: any = { debug: jest.fn() };
    const commentLoader = new CommentLoader();
    const parameterLoader = new ParameterLoader({ commentLoader, hardErrorUnsupported: true, logger });
    constructorLoader = new ConstructorLoader({ parameterLoader });
    memberLoader = new MemberLoader({ parameterLoader });
    const classLoader = new ClassLoader({ resolutionContext, logger, commentLoader });
    classIndexer = new ClassIndexer({
      classLoader,
      classFinder: new ClassFinder({ classLoader }),
      ignoreClasses: {},
      logger,
    });
  });

  /**
   * Load the constructor parameters and members of class A from the given file,
   * without the AST references that inherently differ between source and declaration files.
   * @param fileName The file name with extension.
   * @param contents The file contents.
   */
  async function loadClass(fileName: string, contents: string): Promise<unknown> {
    resolutionContext.contentsOverrides = { [fileName]: contents };
    const A = await classIndexer.loadClassChain({
      packageName: 'p',
      localName: 'A',
      fileName: 'file',
      fileNameReferenced: 'fileReferenced',
    });
    return JSON.parse(JSON.stringify({
      parameters: constructorLoader.getConstructors({ A }).A.parameters,
      members: memberLoader.getMembers({ A }).A.members,
    }, (key, value) => key === 'origin' || key === 'classLoaded' ? undefined : value));
  }

  async function expectEquivalent(source: string, declaration: string): Promise<void> {
    const fromSource = await loadClass('file.ts', source);
    const fromDeclaration = await loadClass('file.d.ts', declaration);
    expect(fromSource).toEqual(fromDeclaration);
  }

  describe('when compared to declaration files', () => {
    it('should handle a class without constructor', async() => {
      await expectEquivalent(`
export class A {
  public run(): void {}
}
`, `
export declare class A {
    run(): void;
}
`);
    });

    it('should handle constructor parameter properties', async() => {
      await expectEquivalent(`
export class A {
  /**
   * @param b - This is b
   * @param c - This is c
   */
  public constructor(
    private readonly b: B,
    public readonly c: string,
    protected d: number,
    e: boolean,
  ) {}
}
`, `
export declare class A {
    private readonly b;
    readonly c: string;
    protected d: number;
    /**
     * @param b - This is b
     * @param c - This is c
     */
    constructor(b: B, c: string, d: number, e: boolean);
}
`);
    });

    it('should handle constructor parameters with default values', async() => {
      await expectEquivalent(`
export class A {
  public constructor(
    a: B,
    private readonly b: number = 5,
    c = 'c',
    d = new B(),
    e: string = 'e',
  ) {}
}
`, `
export declare class A {
    private readonly b;
    constructor(a: B, b?: number, c?: string, d?: B, e?: string);
}
`);
    });

    it('should handle fields', async() => {
      await expectEquivalent(`
export class A {
  public a: B;
  protected readonly logger = getLogger();
  public b = 'b';
  public c = 1;
  public d = true;
  public e = \`e\`;
  public f = new Map<string, number>();
  public g = {} as B;
  public h = null;
  public i;
  public readonly j = 'j';
  public readonly o = null;
  public static k = 1;
  private readonly l: B = new B();
  #m = 1;
  public constructor(a: B) {}
  private n(): void {}
}
`, `
export declare class A {
    #private;
    a: B;
    protected readonly logger: any;
    b: string;
    c: number;
    d: boolean;
    e: string;
    f: Map<string, number>;
    g: B;
    h: any;
    i: any;
    readonly j = "j";
    readonly o: null;
    static k: number;
    private readonly l;
    constructor(a: B);
    private n;
}
`);
    });

    it('should handle overloaded constructors', async() => {
      await expectEquivalent(`
export class A {
  public constructor(a: string);
  public constructor(a: number);
  public constructor(a: any) {}
}
`, `
export declare class A {
    constructor(a: string);
    constructor(a: number);
}
`);
    });

    it('should handle a class expression', async() => {
      resolutionContext.contentsOverrides = {
        'file.ts': `export const A = class { public constructor(private readonly a: string) {} };`,
      };
      const ast = await resolutionContext.parseTypescriptFile('file');
      const declarator = (<TSESTree.VariableDeclaration> (<TSESTree.ExportNamedDeclaration> ast.body[0])
        .declaration).declarations[0];
      expect((<TSESTree.ClassExpression> declarator.init).body.body.map(element => element.type)).toEqual([
        AST_NODE_TYPES.PropertyDefinition,
        AST_NODE_TYPES.MethodDefinition,
      ]);
    });
  });

  describe('convertParameter', () => {
    it('should keep a default value with a destructuring pattern', () => {
      const ast = new ResolutionContext().parseTypescriptContents(`function f({ a } = {}) {}`);
      const param = (<TSESTree.FunctionDeclaration> ast.body[0]).params[0];
      expect(converter.convertParameter(param)).toBe(param);
    });
  });

  describe('inferType', () => {
    function inferInitializer(initializer: string): TSESTree.TypeNode {
      const ast = new ResolutionContext().parseTypescriptContents(`const a = ${initializer};`);
      const declarator = (<TSESTree.VariableDeclaration> ast.body[0]).declarations[0];
      return converter.inferType(declarator.init, declarator);
    }

    it('should infer string literals', () => {
      expect(inferInitializer(`'a'`).type).toBe(AST_NODE_TYPES.TSStringKeyword);
    });

    it('should infer template literals', () => {
      // eslint-disable-next-line no-template-curly-in-string
      expect(inferInitializer('`a${1}`').type).toBe(AST_NODE_TYPES.TSStringKeyword);
    });

    it('should infer number literals', () => {
      expect(inferInitializer(`1`).type).toBe(AST_NODE_TYPES.TSNumberKeyword);
    });

    it('should infer boolean literals', () => {
      expect(inferInitializer(`false`).type).toBe(AST_NODE_TYPES.TSBooleanKeyword);
    });

    it('should infer constructor calls', () => {
      expect(inferInitializer(`new A<B>()`)).toMatchObject({
        type: AST_NODE_TYPES.TSTypeReference,
        typeName: { name: 'A' },
        typeArguments: { params: [{ typeName: { name: 'B' }}]},
      });
    });

    it('should infer type assertions', () => {
      expect(inferInitializer(`{} as A`)).toMatchObject({
        type: AST_NODE_TYPES.TSTypeReference,
        typeName: { name: 'A' },
      });
    });

    it('should not infer const assertions', () => {
      expect(inferInitializer(`'a' as const`).type).toBe(AST_NODE_TYPES.TSAnyKeyword);
    });

    it('should not infer constructor calls of qualified names', () => {
      expect(inferInitializer(`new a.A()`).type).toBe(AST_NODE_TYPES.TSAnyKeyword);
    });

    it('should not infer other literals', () => {
      expect(inferInitializer(`null`).type).toBe(AST_NODE_TYPES.TSAnyKeyword);
      expect(inferInitializer(`/a/u`).type).toBe(AST_NODE_TYPES.TSAnyKeyword);
    });

    it('should not infer other expressions', () => {
      expect(inferInitializer(`f()`).type).toBe(AST_NODE_TYPES.TSAnyKeyword);
    });

    it('should not infer a missing expression', () => {
      const ast = new ResolutionContext().parseTypescriptContents(`let a;`);
      const declarator = (<TSESTree.VariableDeclaration> ast.body[0]).declarations[0];
      expect(converter.inferType(null, declarator).type).toBe(AST_NODE_TYPES.TSAnyKeyword);
    });
  });
});
