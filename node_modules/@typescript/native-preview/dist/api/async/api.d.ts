/// <reference path="../node/node.d.ts" preserve="true" />
import { DiagnosticCategory } from "#enums/diagnosticCategory";
import { ElementFlags } from "#enums/elementFlags";
import { NodeBuilderFlags } from "#enums/nodeBuilderFlags";
import { ObjectFlags } from "#enums/objectFlags";
import { SignatureFlags } from "#enums/signatureFlags";
import { SignatureKind } from "#enums/signatureKind";
import { SymbolFlags } from "#enums/symbolFlags";
import { TypeFlags } from "#enums/typeFlags";
import { TypePredicateKind } from "#enums/typePredicateKind";
import { type Expression, type Identifier, ModifierFlags, type Node, type Path, type SourceFile, type SyntaxKind, type TypeNode } from "../../ast/index.ts";
import { ObjectRegistry } from "../objectRegistry.ts";
import type { APIOptions, LSPConnectionOptions } from "../options.ts";
import type { ConfigResponse, DocumentIdentifier, DocumentPosition, LSPUpdateSnapshotParams, ProjectResponse, SignatureResponse, SymbolResponse, TypeResponse, UpdateSnapshotParams, UpdateSnapshotResponse } from "../proto.ts";
import { SourceFileCache } from "../sourceFileCache.ts";
import { Client, type ClientSocketOptions, type ClientSpawnOptions } from "./client.ts";
import type { AssertsIdentifierTypePredicate, AssertsThisTypePredicate, ConditionalType, Diagnostic, IdentifierTypePredicate, IndexedAccessType, IndexInfo, IndexType, InterfaceType, IntersectionType, LiteralType, ObjectType, StringMappingType, SubstitutionType, TemplateLiteralType, ThisTypePredicate, TupleType, Type, TypeParameter, TypePredicate, TypePredicateBase, TypeReference, UnionOrIntersectionType, UnionType } from "./types.ts";
export { DiagnosticCategory, ElementFlags, ModifierFlags, NodeBuilderFlags, ObjectFlags, SignatureFlags, SignatureKind, SymbolFlags, TypeFlags, TypePredicateKind };
export type { APIOptions, ClientSocketOptions, ClientSpawnOptions, DocumentIdentifier, DocumentPosition, LSPConnectionOptions };
export type { AssertsIdentifierTypePredicate, AssertsThisTypePredicate, ConditionalType, Diagnostic, IdentifierTypePredicate, IndexedAccessType, IndexInfo, IndexType, InterfaceType, IntersectionType, LiteralType, ObjectType, StringMappingType, SubstitutionType, TemplateLiteralType, ThisTypePredicate, TupleType, Type, TypeParameter, TypePredicate, TypePredicateBase, TypeReference, UnionOrIntersectionType, UnionType };
export { documentURIToFileName, fileNameToDocumentURI } from "../path.ts";
/** Type alias for the snapshot-scoped object registry */
type SnapshotObjectRegistry = ObjectRegistry<Symbol, TypeObject, Signature>;
export declare class API<FromLSP extends boolean = false> {
    private client;
    private sourceFileCache;
    private toPath;
    private initialized;
    private activeSnapshots;
    private latestSnapshot;
    constructor(options: APIOptions | LSPConnectionOptions);
    /**
     * Create an API instance from an existing LSP connection's API session.
     * Use this when connecting to an API pipe provided by an LSP server via custom/initializeAPISession.
     */
    static fromLSPConnection(options: LSPConnectionOptions): Promise<API<true>>;
    private ensureInitialized;
    parseConfigFile(file: DocumentIdentifier): Promise<ConfigResponse>;
    updateSnapshot(params?: FromLSP extends true ? LSPUpdateSnapshotParams : UpdateSnapshotParams): Promise<Snapshot>;
    close(): Promise<void>;
    clearSourceFileCache(): void;
}
export declare class Snapshot {
    readonly id: string;
    private projectMap;
    private toPath;
    private client;
    private objectRegistry;
    private disposed;
    private onDispose;
    constructor(data: UpdateSnapshotResponse, client: Client, sourceFileCache: SourceFileCache, toPath: (fileName: string) => Path, onDispose: () => void);
    getProjects(): readonly Project[];
    getProject(configFileName: string): Project | undefined;
    getDefaultProjectForFile(file: DocumentIdentifier): Promise<Project | undefined>;
    [globalThis.Symbol.dispose](): void;
    dispose(): Promise<void>;
    isDisposed(): boolean;
    private ensureNotDisposed;
}
export declare class Project {
    readonly id: string;
    readonly configFileName: string;
    readonly compilerOptions: Record<string, unknown>;
    readonly rootFiles: readonly string[];
    readonly program: Program;
    readonly checker: Checker;
    readonly emitter: Emitter;
    private client;
    constructor(data: ProjectResponse, snapshotId: string, client: Client, objectRegistry: SnapshotObjectRegistry, sourceFileCache: SourceFileCache, toPath: (fileName: string) => Path);
}
export declare class Program {
    private snapshotId;
    private projectId;
    private client;
    private sourceFileCache;
    private toPath;
    private decoder;
    constructor(snapshotId: string, projectId: string, client: Client, sourceFileCache: SourceFileCache, toPath: (fileName: string) => Path);
    getSourceFile(file: DocumentIdentifier): Promise<SourceFile | undefined>;
    /**
     * Get syntactic (parse) diagnostics for a specific file or all files.
     * @param file - Optional file to get diagnostics for. If omitted, returns diagnostics for all files.
     */
    getSyntacticDiagnostics(file?: DocumentIdentifier): Promise<readonly Diagnostic[]>;
    /**
     * Get semantic (type-check) diagnostics for a specific file or all files.
     * @param file - Optional file to get diagnostics for. If omitted, returns diagnostics for all files.
     */
    getSemanticDiagnostics(file?: DocumentIdentifier): Promise<readonly Diagnostic[]>;
    /**
     * Get suggestion diagnostics for a specific file or all files.
     * @param file - Optional file to get diagnostics for. If omitted, returns diagnostics for all files.
     */
    getSuggestionDiagnostics(file?: DocumentIdentifier): Promise<readonly Diagnostic[]>;
    /**
     * Get declaration emit diagnostics for a specific file or all files.
     * @param file - Optional file to get diagnostics for. If omitted, returns diagnostics for all files.
     */
    getDeclarationDiagnostics(file?: DocumentIdentifier): Promise<readonly Diagnostic[]>;
    /**
     * Get config file parsing diagnostics for the project.
     */
    getConfigFileParsingDiagnostics(): Promise<readonly Diagnostic[]>;
}
export declare class Checker {
    private snapshotId;
    private projectId;
    private client;
    private objectRegistry;
    constructor(snapshotId: string, projectId: string, client: Client, objectRegistry: SnapshotObjectRegistry);
    getSymbolAtLocation(node: Node): Promise<Symbol | undefined>;
    getSymbolAtLocation(nodes: readonly Node[]): Promise<(Symbol | undefined)[]>;
    getSymbolAtPosition(file: DocumentIdentifier, position: number): Promise<Symbol | undefined>;
    getSymbolAtPosition(file: DocumentIdentifier, positions: readonly number[]): Promise<(Symbol | undefined)[]>;
    getTypeOfSymbol(symbol: Symbol): Promise<Type | undefined>;
    getTypeOfSymbol(symbols: readonly Symbol[]): Promise<(Type | undefined)[]>;
    getDeclaredTypeOfSymbol(symbol: Symbol): Promise<Type | undefined>;
    getTypeAtLocation(node: Node): Promise<Type | undefined>;
    getTypeAtLocation(nodes: readonly Node[]): Promise<(Type | undefined)[]>;
    getSignaturesOfType(type: Type, kind: SignatureKind): Promise<readonly Signature[]>;
    getResolvedSignature(node: Node): Promise<Signature | undefined>;
    getTypeAtPosition(file: DocumentIdentifier, position: number): Promise<Type | undefined>;
    getTypeAtPosition(file: DocumentIdentifier, positions: readonly number[]): Promise<(Type | undefined)[]>;
    resolveName(name: string, meaning: SymbolFlags, location?: Node | DocumentPosition, excludeGlobals?: boolean): Promise<Symbol | undefined>;
    getResolvedSymbol(node: Identifier): Promise<Symbol | undefined>;
    getContextualType(node: Expression): Promise<Type | undefined>;
    getBaseTypeOfLiteralType(type: Type): Promise<Type | undefined>;
    getNonNullableType(type: Type): Promise<Type | undefined>;
    getTypeFromTypeNode(node: TypeNode): Promise<Type | undefined>;
    getWidenedType(type: Type): Promise<Type | undefined>;
    getParameterType(signature: Signature, index: number): Promise<Type | undefined>;
    isArrayLikeType(type: Type): Promise<boolean>;
    getShorthandAssignmentValueSymbol(node: Node): Promise<Symbol | undefined>;
    getTypeOfSymbolAtLocation(symbol: Symbol, location: Node): Promise<Type | undefined>;
    private getIntrinsicType;
    getAnyType(): Promise<Type>;
    getStringType(): Promise<Type>;
    getNumberType(): Promise<Type>;
    getBooleanType(): Promise<Type>;
    getVoidType(): Promise<Type>;
    getUndefinedType(): Promise<Type>;
    getNullType(): Promise<Type>;
    getNeverType(): Promise<Type>;
    getUnknownType(): Promise<Type>;
    getBigIntType(): Promise<Type>;
    getESSymbolType(): Promise<Type>;
    typeToTypeNode(type: Type, enclosingDeclaration?: Node, flags?: number): Promise<TypeNode | undefined>;
    signatureToSignatureDeclaration(signature: Signature, kind: SyntaxKind, enclosingDeclaration?: Node, flags?: NodeBuilderFlags): Promise<Node | undefined>;
    typeToString(type: Type, enclosingDeclaration?: Node, flags?: number): Promise<string>;
    isContextSensitive(node: Node): Promise<boolean>;
    getReturnTypeOfSignature(signature: Signature): Promise<Type | undefined>;
    getRestTypeOfSignature(signature: Signature): Promise<Type | undefined>;
    getTypePredicateOfSignature(signature: Signature): Promise<TypePredicate | undefined>;
    getBaseTypes(type: Type): Promise<readonly Type[]>;
    getPropertiesOfType(type: Type): Promise<readonly Symbol[]>;
    getIndexInfosOfType(type: Type): Promise<readonly IndexInfo[]>;
    getConstraintOfTypeParameter(type: Type): Promise<Type | undefined>;
    getTypeArguments(type: Type): Promise<readonly Type[]>;
}
export interface PrintNodeOptions {
    preserveSourceNewlines?: boolean;
    neverAsciiEscape?: boolean;
    terminateUnterminatedLiterals?: boolean;
}
export declare class Emitter {
    private client;
    constructor(client: Client);
    printNode(node: Node, options?: PrintNodeOptions): Promise<string>;
}
export declare class NodeHandle {
    readonly kind: SyntaxKind;
    readonly pos: number;
    readonly end: number;
    readonly path: Path;
    constructor(handle: string);
    /**
     * Resolve this handle to the actual AST node by fetching the source file
     * from the given project and finding the node at the stored position.
     */
    resolve(project: Project): Promise<Node | undefined>;
}
export declare class Symbol {
    private client;
    private snapshotId;
    private objectRegistry;
    readonly id: string;
    readonly name: string;
    readonly flags: SymbolFlags;
    readonly checkFlags: number;
    readonly declarations: readonly NodeHandle[];
    readonly valueDeclaration: NodeHandle | undefined;
    constructor(data: SymbolResponse, client: Client, snapshotId: string, objectRegistry: SnapshotObjectRegistry);
    getParent(): Promise<Symbol | undefined>;
    getMembers(): Promise<readonly Symbol[]>;
    getExports(): Promise<readonly Symbol[]>;
    getExportSymbol(): Promise<Symbol>;
}
declare class TypeObject implements Type {
    private client;
    private snapshotId;
    private objectRegistry;
    readonly id: string;
    readonly flags: TypeFlags;
    readonly objectFlags: ObjectFlags;
    readonly value: string | number | boolean;
    readonly target: string;
    readonly typeParameters: readonly string[];
    readonly outerTypeParameters: readonly string[];
    readonly localTypeParameters: readonly string[];
    readonly elementFlags: readonly ElementFlags[];
    readonly fixedLength: number;
    readonly readonly: boolean;
    readonly texts: readonly string[];
    readonly objectType: string;
    readonly indexType: string;
    readonly checkType: string;
    readonly extendsType: string;
    readonly baseType: string;
    readonly substConstraint: string;
    constructor(data: TypeResponse, client: Client, snapshotId: string, objectRegistry: SnapshotObjectRegistry);
    getSymbol(): Promise<Symbol | undefined>;
    private fetchType;
    private fetchTypes;
    getTarget(): Promise<Type>;
    getTypes(): Promise<readonly Type[]>;
    getTypeParameters(): Promise<readonly Type[]>;
    getOuterTypeParameters(): Promise<readonly Type[]>;
    getLocalTypeParameters(): Promise<readonly Type[]>;
    getObjectType(): Promise<Type>;
    getIndexType(): Promise<Type>;
    getCheckType(): Promise<Type>;
    getExtendsType(): Promise<Type>;
    getBaseType(): Promise<Type>;
    getConstraint(): Promise<Type>;
}
export declare class Signature {
    private flags;
    readonly id: string;
    readonly declaration?: NodeHandle | undefined;
    readonly typeParameters?: readonly Type[] | undefined;
    readonly parameters: readonly Symbol[];
    readonly thisParameter?: Symbol | undefined;
    readonly target?: Signature | undefined;
    constructor(data: SignatureResponse, objectRegistry: SnapshotObjectRegistry);
    get hasRestParameter(): boolean;
    get isConstruct(): boolean;
    get isAbstract(): boolean;
}
//# sourceMappingURL=api.d.ts.map