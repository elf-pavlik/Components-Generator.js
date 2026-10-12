import type { AST, TSESTree, TSESTreeOptions } from '@typescript-eslint/typescript-estree';
/**
 * Converts the AST of a TypeScript source file (.ts) into the shape
 * that the TypeScript compiler would emit in a declaration file (.d.ts).
 *
 * Only the class-level differences that are relevant for component generation are handled:
 * * Constructor parameter properties are emitted as class fields.
 * * Constructor parameters with a default value become optional parameters.
 * * Overloaded constructors lose their implementation signature.
 * * Private fields lose their type and initializer.
 * * Missing field and parameter types are inferred from simple initializers, or `any` otherwise.
 */
export declare class SourceDeclarationConverter {
    /**
     * Convert the given AST in-place.
     * @param ast The AST of a TypeScript source file.
     * @return The converted AST.
     */
    convert(ast: AST<TSESTreeOptions>): AST<TSESTreeOptions>;
    protected visit(node: unknown): void;
    /**
     * Convert the given class body in-place.
     * @param classBody A class body.
     */
    convertClassBody(classBody: TSESTree.ClassBody): void;
    /**
     * Convert a constructor parameter in-place.
     * Parameters with a default value become optional parameters,
     * and missing types are inferred from the default value.
     * @param param A constructor parameter.
     */
    convertParameter<T extends TSESTree.Parameter>(param: T): T | TSESTree.Identifier;
    /**
     * Create a field for the given constructor parameter property.
     * @param param A parameter property.
     * @param identifier The identifier of the parameter.
     */
    createField(param: TSESTree.TSParameterProperty, identifier: TSESTree.Identifier): TSESTree.PropertyDefinition;
    /**
     * Convert a class field in-place.
     * Private fields lose their type, and missing types are inferred from the initializer.
     * @param field A class field.
     */
    convertField(field: TSESTree.PropertyDefinition): void;
    /**
     * Infer the type of the given expression.
     * Only simple expressions are supported, other expressions will lead to `any`.
     * @param expression An optional expression.
     * @param location The node that determines the location of the created type annotation.
     */
    inferTypeAnnotation(expression: TSESTree.Expression | null, location: TSESTree.Node): TSESTree.TSTypeAnnotation;
    inferType(expression: TSESTree.Expression | null, location: TSESTree.Node): TSESTree.TypeNode;
    protected isConstTypeReference(typeNode: TSESTree.TypeNode): boolean;
}
