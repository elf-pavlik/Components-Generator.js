"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SourceDeclarationConverter = void 0;
const typescript_estree_1 = require("@typescript-eslint/typescript-estree");
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
class SourceDeclarationConverter {
    /**
     * Convert the given AST in-place.
     * @param ast The AST of a TypeScript source file.
     * @return The converted AST.
     */
    convert(ast) {
        this.visit(ast);
        return ast;
    }
    visit(node) {
        if (Array.isArray(node)) {
            for (const child of node) {
                this.visit(child);
            }
        }
        else if (node && typeof node === 'object') {
            if (node.type === typescript_estree_1.AST_NODE_TYPES.ClassBody) {
                this.convertClassBody(node);
            }
            for (const [key, value] of Object.entries(node)) {
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
    convertClassBody(classBody) {
        // Only keep the overload signatures of constructors, as is done in declaration files
        const isConstructor = (element) => element.type === typescript_estree_1.AST_NODE_TYPES.MethodDefinition && element.kind === 'constructor';
        if (classBody.body.filter(isConstructor).length > 1) {
            classBody.body = classBody.body.filter(element => !isConstructor(element) || !element.value.body);
        }
        // Emit constructor parameter properties as fields at the start of the class body
        const parameterFields = [];
        for (const element of classBody.body.filter(isConstructor)) {
            element.value.params = element.value.params.map((param) => {
                if (param.type === typescript_estree_1.AST_NODE_TYPES.TSParameterProperty) {
                    // Parameter properties can only be (optionally initialized) identifiers
                    const parameter = this.convertParameter(param.parameter);
                    parameterFields.push(this.createField(param, parameter));
                    return parameter;
                }
                return this.convertParameter(param);
            });
        }
        classBody.body.unshift(...parameterFields);
        for (const element of classBody.body) {
            if (element.type === typescript_estree_1.AST_NODE_TYPES.PropertyDefinition) {
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
    convertParameter(param) {
        if (param.type === typescript_estree_1.AST_NODE_TYPES.AssignmentPattern && param.left.type === typescript_estree_1.AST_NODE_TYPES.Identifier) {
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
    createField(param, identifier) {
        return {
            type: typescript_estree_1.AST_NODE_TYPES.PropertyDefinition,
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
    convertField(field) {
        if (field.accessibility === 'private') {
            field.typeAnnotation = undefined;
        }
        else if (field.readonly && field.value?.type === typescript_estree_1.AST_NODE_TYPES.Literal &&
            ['string', 'number', 'boolean'].includes(typeof field.value.value)) {
            // Readonly fields keep their literal initializer instead of a type, e.g. `readonly a = 'x';`
            field.typeAnnotation = undefined;
        }
        else if (!field.typeAnnotation) {
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
    inferTypeAnnotation(expression, location) {
        return {
            type: typescript_estree_1.AST_NODE_TYPES.TSTypeAnnotation,
            typeAnnotation: this.inferType(expression, location),
            loc: location.loc,
            range: location.range,
        };
    }
    inferType(expression, location) {
        const base = { loc: location.loc, range: location.range };
        // eslint-disable-next-line ts/switch-exhaustiveness-check
        switch (expression?.type) {
            case typescript_estree_1.AST_NODE_TYPES.Literal:
                if (typeof expression.value === 'string') {
                    return { type: typescript_estree_1.AST_NODE_TYPES.TSStringKeyword, ...base };
                }
                if (typeof expression.value === 'number') {
                    return { type: typescript_estree_1.AST_NODE_TYPES.TSNumberKeyword, ...base };
                }
                if (typeof expression.value === 'boolean') {
                    return { type: typescript_estree_1.AST_NODE_TYPES.TSBooleanKeyword, ...base };
                }
                break;
            case typescript_estree_1.AST_NODE_TYPES.TemplateLiteral:
                return { type: typescript_estree_1.AST_NODE_TYPES.TSStringKeyword, ...base };
            case typescript_estree_1.AST_NODE_TYPES.NewExpression:
                if (expression.callee.type === typescript_estree_1.AST_NODE_TYPES.Identifier) {
                    return {
                        type: typescript_estree_1.AST_NODE_TYPES.TSTypeReference,
                        typeName: expression.callee,
                        typeArguments: expression.typeArguments,
                        ...base,
                    };
                }
                break;
            case typescript_estree_1.AST_NODE_TYPES.TSAsExpression:
                if (!this.isConstTypeReference(expression.typeAnnotation)) {
                    return expression.typeAnnotation;
                }
                break;
        }
        return { type: typescript_estree_1.AST_NODE_TYPES.TSAnyKeyword, ...base };
    }
    isConstTypeReference(typeNode) {
        return typeNode.type === typescript_estree_1.AST_NODE_TYPES.TSTypeReference &&
            typeNode.typeName.type === typescript_estree_1.AST_NODE_TYPES.Identifier &&
            typeNode.typeName.name === 'const';
    }
}
exports.SourceDeclarationConverter = SourceDeclarationConverter;
//# sourceMappingURL=SourceDeclarationConverter.js.map