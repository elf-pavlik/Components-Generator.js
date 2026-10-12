import type { AST, TSESTree, TSESTreeOptions } from '@typescript-eslint/typescript-estree';
import { AST_NODE_TYPES } from '@typescript-eslint/typescript-estree';

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
export class SourceDeclarationConverter {
  /**
   * Convert the given AST in-place.
   * @param ast The AST of a TypeScript source file.
   * @return The converted AST.
   */
  public convert(ast: AST<TSESTreeOptions>): AST<TSESTreeOptions> {
    this.visit(ast);
    return ast;
  }

  protected visit(node: unknown): void {
    if (Array.isArray(node)) {
      for (const child of node) {
        this.visit(child);
      }
    } else if (node && typeof node === 'object') {
      if ((<TSESTree.Node> node).type === AST_NODE_TYPES.ClassBody) {
        this.convertClassBody(<TSESTree.ClassBody> node);
      }
      for (const [ key, value ] of Object.entries(node)) {
        if (key !== 'parent' && key !== 'loc' && key !== 'range') {
          this.visit(value);
        }
      }
    }
  }

  /**
   * Convert the given class body in-place.
   * @param classBody A class body.
   */
  public convertClassBody(classBody: TSESTree.ClassBody): void {
    // Only keep the overload signatures of constructors, as is done in declaration files
    const isConstructor = (element: TSESTree.ClassElement): element is TSESTree.MethodDefinition =>
      element.type === AST_NODE_TYPES.MethodDefinition && element.kind === 'constructor';
    if (classBody.body.filter(isConstructor).length > 1) {
      classBody.body = classBody.body.filter(element => !isConstructor(element) || !element.value.body);
    }

    // Emit constructor parameter properties as fields at the start of the class body
    const parameterFields: TSESTree.PropertyDefinition[] = [];
    for (const element of classBody.body.filter(isConstructor)) {
      element.value.params = element.value.params.map((param) => {
        if (param.type === AST_NODE_TYPES.TSParameterProperty) {
          // Parameter properties can only be (optionally initialized) identifiers
          const parameter = <TSESTree.Identifier> this.convertParameter(param.parameter);
          parameterFields.push(this.createField(param, parameter));
          return parameter;
        }
        return this.convertParameter(param);
      });
    }
    classBody.body.unshift(...parameterFields);

    for (const element of classBody.body) {
      if (element.type === AST_NODE_TYPES.PropertyDefinition) {
        this.convertField(element);
      }
    }
  }

  /**
   * Convert a constructor parameter in-place.
   * Parameters with a default value become optional parameters,
   * and missing types are inferred from the default value.
   * @param param A constructor parameter.
   */
  public convertParameter<T extends TSESTree.Parameter>(param: T): T | TSESTree.Identifier {
    if (param.type === AST_NODE_TYPES.AssignmentPattern && param.left.type === AST_NODE_TYPES.Identifier) {
      const identifier = param.left;
      identifier.optional = true;
      identifier.typeAnnotation = identifier.typeAnnotation ?? this.inferTypeAnnotation(param.right, param);
      return identifier;
    }
    return param;
  }

  /**
   * Create a field for the given constructor parameter property.
   * @param param A parameter property.
   * @param identifier The identifier of the parameter.
   */
  public createField(
    param: TSESTree.TSParameterProperty,
    identifier: TSESTree.Identifier,
  ): TSESTree.PropertyDefinition {
    return <TSESTree.PropertyDefinition> <unknown> {
      type: AST_NODE_TYPES.PropertyDefinition,
      key: { ...identifier, typeAnnotation: undefined, optional: false },
      value: null,
      typeAnnotation: identifier.typeAnnotation,
      accessibility: param.accessibility,
      readonly: param.readonly,
      static: false,
      override: param.override,
      optional: identifier.optional,
      computed: false,
      declare: false,
      definite: false,
      decorators: [],
      loc: param.loc,
      range: param.range,
    };
  }

  /**
   * Convert a class field in-place.
   * Private fields lose their type, and missing types are inferred from the initializer.
   * @param field A class field.
   */
  public convertField(field: TSESTree.PropertyDefinition): void {
    if (field.accessibility === 'private') {
      field.typeAnnotation = undefined;
    } else if (field.readonly && field.value?.type === AST_NODE_TYPES.Literal &&
      [ 'string', 'number', 'boolean' ].includes(typeof field.value.value)) {
      // Readonly fields keep their literal initializer instead of a type, e.g. `readonly a = 'x';`
      field.typeAnnotation = undefined;
    } else if (!field.typeAnnotation) {
      field.typeAnnotation = this.inferTypeAnnotation(field.value, field);
    }
    field.value = null;
  }

  /**
   * Infer the type of the given expression.
   * Only simple expressions are supported, other expressions will lead to `any`.
   * @param expression An optional expression.
   * @param location The node that determines the location of the created type annotation.
   */
  public inferTypeAnnotation(
    expression: TSESTree.Expression | null,
    location: TSESTree.Node,
  ): TSESTree.TSTypeAnnotation {
    return <TSESTree.TSTypeAnnotation> {
      type: AST_NODE_TYPES.TSTypeAnnotation,
      typeAnnotation: this.inferType(expression, location),
      loc: location.loc,
      range: location.range,
    };
  }

  public inferType(expression: TSESTree.Expression | null, location: TSESTree.Node): TSESTree.TypeNode {
    const base = { loc: location.loc, range: location.range };
    // eslint-disable-next-line ts/switch-exhaustiveness-check
    switch (expression?.type) {
      case AST_NODE_TYPES.Literal:
        if (typeof expression.value === 'string') {
          return <TSESTree.TypeNode> { type: AST_NODE_TYPES.TSStringKeyword, ...base };
        }
        if (typeof expression.value === 'number') {
          return <TSESTree.TypeNode> { type: AST_NODE_TYPES.TSNumberKeyword, ...base };
        }
        if (typeof expression.value === 'boolean') {
          return <TSESTree.TypeNode> { type: AST_NODE_TYPES.TSBooleanKeyword, ...base };
        }
        break;
      case AST_NODE_TYPES.TemplateLiteral:
        return <TSESTree.TypeNode> { type: AST_NODE_TYPES.TSStringKeyword, ...base };
      case AST_NODE_TYPES.NewExpression:
        if (expression.callee.type === AST_NODE_TYPES.Identifier) {
          return <TSESTree.TypeNode> {
            type: AST_NODE_TYPES.TSTypeReference,
            typeName: expression.callee,
            typeArguments: expression.typeArguments,
            ...base,
          };
        }
        break;
      case AST_NODE_TYPES.TSAsExpression:
        if (!this.isConstTypeReference(expression.typeAnnotation)) {
          return expression.typeAnnotation;
        }
        break;
    }
    return <TSESTree.TypeNode> { type: AST_NODE_TYPES.TSAnyKeyword, ...base };
  }

  protected isConstTypeReference(typeNode: TSESTree.TypeNode): boolean {
    return typeNode.type === AST_NODE_TYPES.TSTypeReference &&
      typeNode.typeName.type === AST_NODE_TYPES.Identifier &&
      typeNode.typeName.name === 'const';
  }
}
