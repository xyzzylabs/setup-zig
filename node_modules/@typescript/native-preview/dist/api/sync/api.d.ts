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
    static fromLSPConnection(options: LSPConnectionOptions): API<true>;
    private ensureInitialized;
    parseConfigFile(file: DocumentIdentifier): ConfigResponse;
    updateSnapshot(params?: FromLSP extends true ? LSPUpdateSnapshotParams : UpdateSnapshotParams): Snapshot;
    close(): void;
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
    getDefaultProjectForFile(file: DocumentIdentifier): Project | undefined;
    [globalThis.Symbol.dispose](): void;
    dispose(): void;
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
    getSourceFile(file: DocumentIdentifier): SourceFile | undefined;
    /**
     * Get syntactic (parse) diagnostics for a specific file or all files.
     * @param file - Optional file to get diagnostics for. If omitted, returns diagnostics for all files.
     */
    getSyntacticDiagnostics(file?: DocumentIdentifier): readonly Diagnostic[];
    /**
     * Get semantic (type-check) diagnostics for a specific file or all files.
     * @param file - Optional file to get diagnostics for. If omitted, returns diagnostics for all files.
     */
    getSemanticDiagnostics(file?: DocumentIdentifier): readonly Diagnostic[];
    /**
     * Get suggestion diagnostics for a specific file or all files.
     * @param file - Optional file to get diagnostics for. If omitted, returns diagnostics for all files.
     */
    getSuggestionDiagnostics(file?: DocumentIdentifier): readonly Diagnostic[];
    /**
     * Get declaration emit diagnostics for a specific file or all files.
     * @param file - Optional file to get diagnostics for. If omitted, returns diagnostics for all files.
     */
    getDeclarationDiagnostics(file?: DocumentIdentifier): readonly Diagnostic[];
    /**
     * Get config file parsing diagnostics for the project.
     */
    getConfigFileParsingDiagnostics(): readonly Diagnostic[];
}
export declare class Checker {
    private snapshotId;
    private projectId;
    private client;
    private objectRegistry;
    constructor(snapshotId: string, projectId: string, client: Client, objectRegistry: SnapshotObjectRegistry);
    getSymbolAtLocation(node: Node): Symbol | undefined;
    getSymbolAtLocation(nodes: readonly Node[]): (Symbol | undefined)[];
    getSymbolAtPosition(file: DocumentIdentifier, position: number): Symbol | undefined;
    getSymbolAtPosition(file: DocumentIdentifier, positions: readonly number[]): (Symbol | undefined)[];
    getTypeOfSymbol(symbol: Symbol): Type | undefined;
    getTypeOfSymbol(symbols: readonly Symbol[]): (Type | undefined)[];
    getDeclaredTypeOfSymbol(symbol: Symbol): Type | undefined;
    getTypeAtLocation(node: Node): Type | undefined;
    getTypeAtLocation(nodes: readonly Node[]): (Type | undefined)[];
    getSignaturesOfType(type: Type, kind: SignatureKind): readonly Signature[];
    getResolvedSignature(node: Node): Signature | undefined;
    getTypeAtPosition(file: DocumentIdentifier, position: number): Type | undefined;
    getTypeAtPosition(file: DocumentIdentifier, positions: readonly number[]): (Type | undefined)[];
    resolveName(name: string, meaning: SymbolFlags, location?: Node | DocumentPosition, excludeGlobals?: boolean): Symbol | undefined;
    getResolvedSymbol(node: Identifier): Symbol | undefined;
    getContextualType(node: Expression): Type | undefined;
    getBaseTypeOfLiteralType(type: Type): Type | undefined;
    getNonNullableType(type: Type): Type | undefined;
    getTypeFromTypeNode(node: TypeNode): Type | undefined;
    getWidenedType(type: Type): Type | undefined;
    getParameterType(signature: Signature, index: number): Type | undefined;
    isArrayLikeType(type: Type): boolean;
    getShorthandAssignmentValueSymbol(node: Node): Symbol | undefined;
    getTypeOfSymbolAtLocation(symbol: Symbol, location: Node): Type | undefined;
    private getIntrinsicType;
    getAnyType(): Type;
    getStringType(): Type;
    getNumberType(): Type;
    getBooleanType(): Type;
    getVoidType(): Type;
    getUndefinedType(): Type;
    getNullType(): Type;
    getNeverType(): Type;
    getUnknownType(): Type;
    getBigIntType(): Type;
    getESSymbolType(): Type;
    typeToTypeNode(type: Type, enclosingDeclaration?: Node, flags?: number): TypeNode | undefined;
    signatureToSignatureDeclaration(signature: Signature, kind: SyntaxKind, enclosingDeclaration?: Node, flags?: NodeBuilderFlags): Node | undefined;
    typeToString(type: Type, enclosingDeclaration?: Node, flags?: number): string;
    isContextSensitive(node: Node): boolean;
    getReturnTypeOfSignature(signature: Signature): Type | undefined;
    getRestTypeOfSignature(signature: Signature): Type | undefined;
    getTypePredicateOfSignature(signature: Signature): TypePredicate | undefined;
    getBaseTypes(type: Type): readonly Type[];
    getPropertiesOfType(type: Type): readonly Symbol[];
    getIndexInfosOfType(type: Type): readonly IndexInfo[];
    getConstraintOfTypeParameter(type: Type): Type | undefined;
    getTypeArguments(type: Type): readonly Type[];
}
export interface PrintNodeOptions {
    preserveSourceNewlines?: boolean;
    neverAsciiEscape?: boolean;
    terminateUnterminatedLiterals?: boolean;
}
export declare class Emitter {
    private client;
    constructor(client: Client);
    printNode(node: Node, options?: PrintNodeOptions): string;
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
    resolve(project: Project): Node | undefined;
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
    getParent(): Symbol | undefined;
    getMembers(): readonly Symbol[];
    getExports(): readonly Symbol[];
    getExportSymbol(): Symbol;
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
    getSymbol(): Symbol | undefined;
    private fetchType;
    private fetchTypes;
    getTarget(): Type;
    getTypes(): readonly Type[];
    getTypeParameters(): readonly Type[];
    getOuterTypeParameters(): readonly Type[];
    getLocalTypeParameters(): readonly Type[];
    getObjectType(): Type;
    getIndexType(): Type;
    getCheckType(): Type;
    getExtendsType(): Type;
    getBaseType(): Type;
    getConstraint(): Type;
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