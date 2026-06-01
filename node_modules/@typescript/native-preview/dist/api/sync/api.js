//
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// !!! THIS FILE IS AUTO-GENERATED - DO NOT EDIT !!!
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//
// Source: src/api/async/api.ts
// Regenerate: npm run generate (from _packages/native-preview)
//
/// <reference path="../node/node.ts" preserve="true" />
import { DiagnosticCategory } from "#enums/diagnosticCategory";
import { ElementFlags } from "#enums/elementFlags";
import { NodeBuilderFlags } from "#enums/nodeBuilderFlags";
import { ObjectFlags } from "#enums/objectFlags";
import { SignatureFlags } from "#enums/signatureFlags";
import { SignatureKind } from "#enums/signatureKind";
import { SymbolFlags } from "#enums/symbolFlags";
import { TypeFlags } from "#enums/typeFlags";
import { TypePredicateKind } from "#enums/typePredicateKind";
import { ModifierFlags, } from "../../ast/index.js";
import { encodeNode, uint8ArrayToBase64, } from "../node/encoder.js";
import { decodeNode, findDescendant, getNodeId, parseNodeHandle, readParseOptionsKey, readSourceFileHash, RemoteSourceFile, } from "../node/node.js";
import { ObjectRegistry } from "../objectRegistry.js";
import { createGetCanonicalFileName, toPath, } from "../path.js";
import { resolveFileName } from "../proto.js";
import { SourceFileCache } from "../sourceFileCache.js";
import { Client, } from "./client.js";
export { DiagnosticCategory, ElementFlags, ModifierFlags, NodeBuilderFlags, ObjectFlags, SignatureFlags, SignatureKind, SymbolFlags, TypeFlags, TypePredicateKind };
export { documentURIToFileName, fileNameToDocumentURI } from "../path.js";
export class API {
    client;
    sourceFileCache;
    toPath;
    initialized = false;
    activeSnapshots = new Set();
    latestSnapshot;
    constructor(options) {
        this.client = new Client(options);
        this.sourceFileCache = new SourceFileCache();
    }
    /**
     * Create an API instance from an existing LSP connection's API session.
     * Use this when connecting to an API pipe provided by an LSP server via custom/initializeAPISession.
     */
    static fromLSPConnection(options) {
        const api = new API(options);
        api.ensureInitialized();
        return api;
    }
    ensureInitialized() {
        if (!this.initialized) {
            const response = this.client.apiRequest("initialize", null);
            const getCanonicalFileName = createGetCanonicalFileName(response.useCaseSensitiveFileNames);
            const currentDirectory = response.currentDirectory;
            this.toPath = (fileName) => toPath(fileName, currentDirectory, getCanonicalFileName);
            this.initialized = true;
        }
    }
    parseConfigFile(file) {
        this.ensureInitialized();
        return this.client.apiRequest("parseConfigFile", { file });
    }
    updateSnapshot(params) {
        this.ensureInitialized();
        const requestParams = params ?? {};
        if (requestParams.openProject) {
            requestParams.openProject = resolveFileName(requestParams.openProject);
        }
        const data = this.client.apiRequest("updateSnapshot", requestParams);
        // Retain cached source files from previous snapshot for unchanged files
        if (this.latestSnapshot) {
            this.sourceFileCache.retainForSnapshot(data.snapshot, this.latestSnapshot.id, data.changes);
            if (this.latestSnapshot.isDisposed()) {
                this.sourceFileCache.releaseSnapshot(this.latestSnapshot.id);
            }
        }
        const snapshot = new Snapshot(data, this.client, this.sourceFileCache, this.toPath, () => {
            this.activeSnapshots.delete(snapshot);
            if (snapshot !== this.latestSnapshot) {
                this.sourceFileCache.releaseSnapshot(snapshot.id);
            }
        });
        this.latestSnapshot = snapshot;
        this.activeSnapshots.add(snapshot);
        return snapshot;
    }
    close() {
        // Dispose all active snapshots
        for (const snapshot of [...this.activeSnapshots]) {
            snapshot.dispose();
        }
        // Release the latest snapshot's cache refs if still held
        if (this.latestSnapshot) {
            this.sourceFileCache.releaseSnapshot(this.latestSnapshot.id);
            this.latestSnapshot = undefined;
        }
        this.client.close();
        this.sourceFileCache.clear();
    }
    clearSourceFileCache() {
        this.sourceFileCache.clear();
    }
}
export class Snapshot {
    id;
    projectMap;
    toPath;
    client;
    objectRegistry;
    disposed = false;
    onDispose;
    constructor(data, client, sourceFileCache, toPath, onDispose) {
        this.id = data.snapshot;
        this.client = client;
        this.toPath = toPath;
        this.onDispose = onDispose;
        this.objectRegistry = new ObjectRegistry({
            createSymbol: symbolData => new Symbol(symbolData, this.client, this.id, this.objectRegistry),
            createType: typeData => new TypeObject(typeData, this.client, this.id, this.objectRegistry),
            createSignature: sigData => new Signature(sigData, this.objectRegistry),
        });
        // Create projects
        this.projectMap = new Map();
        for (const projData of data.projects) {
            const project = new Project(projData, this.id, client, this.objectRegistry, sourceFileCache, toPath);
            this.projectMap.set(toPath(projData.configFileName), project);
        }
    }
    getProjects() {
        this.ensureNotDisposed();
        return [...this.projectMap.values()];
    }
    getProject(configFileName) {
        this.ensureNotDisposed();
        return this.projectMap.get(this.toPath(configFileName));
    }
    getDefaultProjectForFile(file) {
        this.ensureNotDisposed();
        const data = this.client.apiRequest("getDefaultProjectForFile", {
            snapshot: this.id,
            file,
        });
        if (!data)
            return undefined;
        return this.projectMap.get(this.toPath(data.configFileName));
    }
    [globalThis.Symbol.dispose]() {
        this.dispose();
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.objectRegistry.clear();
        this.onDispose();
        this.client.apiRequest("release", { handle: this.id });
    }
    isDisposed() {
        return this.disposed;
    }
    ensureNotDisposed() {
        if (this.disposed) {
            throw new Error("Snapshot is disposed");
        }
    }
}
export class Project {
    id;
    configFileName;
    compilerOptions;
    rootFiles;
    program;
    checker;
    emitter;
    client;
    constructor(data, snapshotId, client, objectRegistry, sourceFileCache, toPath) {
        this.id = data.id;
        this.configFileName = data.configFileName;
        this.compilerOptions = data.compilerOptions;
        this.rootFiles = data.rootFiles;
        this.client = client;
        this.program = new Program(snapshotId, this.id, client, sourceFileCache, toPath);
        this.checker = new Checker(snapshotId, this.id, client, objectRegistry);
        this.emitter = new Emitter(client);
    }
}
export class Program {
    snapshotId;
    projectId;
    client;
    sourceFileCache;
    toPath;
    decoder = new TextDecoder();
    constructor(snapshotId, projectId, client, sourceFileCache, toPath) {
        this.snapshotId = snapshotId;
        this.projectId = projectId;
        this.client = client;
        this.sourceFileCache = sourceFileCache;
        this.toPath = toPath;
    }
    getSourceFile(file) {
        const fileName = resolveFileName(file);
        const path = this.toPath(fileName);
        // Check if we already have a retained cache entry for this (snapshot, project) pair
        const retained = this.sourceFileCache.getRetained(path, this.snapshotId, this.projectId);
        if (retained) {
            return retained;
        }
        // Fetch from server
        const binaryData = this.client.apiRequestBinary("getSourceFile", {
            snapshot: this.snapshotId,
            project: this.projectId,
            file,
        });
        if (!binaryData) {
            return undefined;
        }
        const view = new DataView(binaryData.buffer, binaryData.byteOffset, binaryData.byteLength);
        const contentHash = readSourceFileHash(view);
        const parseOptionsKey = readParseOptionsKey(view);
        // Create a new RemoteSourceFile and cache it (set returns existing if hash matches)
        const sourceFile = new RemoteSourceFile(binaryData, this.decoder);
        return this.sourceFileCache.set(path, sourceFile, parseOptionsKey, contentHash, this.snapshotId, this.projectId);
    }
    /**
     * Get syntactic (parse) diagnostics for a specific file or all files.
     * @param file - Optional file to get diagnostics for. If omitted, returns diagnostics for all files.
     */
    getSyntacticDiagnostics(file) {
        const data = this.client.apiRequest("getSyntacticDiagnostics", {
            snapshot: this.snapshotId,
            project: this.projectId,
            ...(file !== undefined ? { file } : {}),
        });
        return data ?? [];
    }
    /**
     * Get semantic (type-check) diagnostics for a specific file or all files.
     * @param file - Optional file to get diagnostics for. If omitted, returns diagnostics for all files.
     */
    getSemanticDiagnostics(file) {
        const data = this.client.apiRequest("getSemanticDiagnostics", {
            snapshot: this.snapshotId,
            project: this.projectId,
            ...(file !== undefined ? { file } : {}),
        });
        return data ?? [];
    }
    /**
     * Get suggestion diagnostics for a specific file or all files.
     * @param file - Optional file to get diagnostics for. If omitted, returns diagnostics for all files.
     */
    getSuggestionDiagnostics(file) {
        const data = this.client.apiRequest("getSuggestionDiagnostics", {
            snapshot: this.snapshotId,
            project: this.projectId,
            ...(file !== undefined ? { file } : {}),
        });
        return data ?? [];
    }
    /**
     * Get declaration emit diagnostics for a specific file or all files.
     * @param file - Optional file to get diagnostics for. If omitted, returns diagnostics for all files.
     */
    getDeclarationDiagnostics(file) {
        const data = this.client.apiRequest("getDeclarationDiagnostics", {
            snapshot: this.snapshotId,
            project: this.projectId,
            ...(file !== undefined ? { file } : {}),
        });
        return data ?? [];
    }
    /**
     * Get config file parsing diagnostics for the project.
     */
    getConfigFileParsingDiagnostics() {
        const data = this.client.apiRequest("getConfigFileParsingDiagnostics", {
            snapshot: this.snapshotId,
            project: this.projectId,
        });
        return data ?? [];
    }
}
export class Checker {
    snapshotId;
    projectId;
    client;
    objectRegistry;
    constructor(snapshotId, projectId, client, objectRegistry) {
        this.snapshotId = snapshotId;
        this.projectId = projectId;
        this.client = client;
        this.objectRegistry = objectRegistry;
    }
    getSymbolAtLocation(nodeOrNodes) {
        if (Array.isArray(nodeOrNodes)) {
            const data = this.client.apiRequest("getSymbolsAtLocations", {
                snapshot: this.snapshotId,
                project: this.projectId,
                locations: nodeOrNodes.map(node => getNodeId(node)),
            });
            return data.map(d => d ? this.objectRegistry.getOrCreateSymbol(d) : undefined);
        }
        const data = this.client.apiRequest("getSymbolAtLocation", {
            snapshot: this.snapshotId,
            project: this.projectId,
            location: getNodeId(nodeOrNodes),
        });
        return data ? this.objectRegistry.getOrCreateSymbol(data) : undefined;
    }
    getSymbolAtPosition(file, positionOrPositions) {
        if (typeof positionOrPositions === "number") {
            const data = this.client.apiRequest("getSymbolAtPosition", {
                snapshot: this.snapshotId,
                project: this.projectId,
                file,
                position: positionOrPositions,
            });
            return data ? this.objectRegistry.getOrCreateSymbol(data) : undefined;
        }
        const data = this.client.apiRequest("getSymbolsAtPositions", {
            snapshot: this.snapshotId,
            project: this.projectId,
            file,
            positions: positionOrPositions,
        });
        return data.map(d => d ? this.objectRegistry.getOrCreateSymbol(d) : undefined);
    }
    getTypeOfSymbol(symbolOrSymbols) {
        if (Array.isArray(symbolOrSymbols)) {
            const data = this.client.apiRequest("getTypesOfSymbols", {
                snapshot: this.snapshotId,
                project: this.projectId,
                symbols: symbolOrSymbols.map(s => s.id),
            });
            return data.map(d => d ? this.objectRegistry.getOrCreateType(d) : undefined);
        }
        const data = this.client.apiRequest("getTypeOfSymbol", {
            snapshot: this.snapshotId,
            project: this.projectId,
            symbol: symbolOrSymbols.id,
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    getDeclaredTypeOfSymbol(symbol) {
        const data = this.client.apiRequest("getDeclaredTypeOfSymbol", {
            snapshot: this.snapshotId,
            project: this.projectId,
            symbol: symbol.id,
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    getTypeAtLocation(nodeOrNodes) {
        if (Array.isArray(nodeOrNodes)) {
            const data = this.client.apiRequest("getTypeAtLocations", {
                snapshot: this.snapshotId,
                project: this.projectId,
                locations: nodeOrNodes.map(node => getNodeId(node)),
            });
            return data.map(d => d ? this.objectRegistry.getOrCreateType(d) : undefined);
        }
        const data = this.client.apiRequest("getTypeAtLocation", {
            snapshot: this.snapshotId,
            project: this.projectId,
            location: getNodeId(nodeOrNodes),
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    getSignaturesOfType(type, kind) {
        const data = this.client.apiRequest("getSignaturesOfType", {
            snapshot: this.snapshotId,
            project: this.projectId,
            type: type.id,
            kind,
        });
        return data.map(d => this.objectRegistry.getOrCreateSignature(d));
    }
    getResolvedSignature(node) {
        const data = this.client.apiRequest("getResolvedSignature", {
            snapshot: this.snapshotId,
            project: this.projectId,
            location: getNodeId(node),
        });
        return data ? this.objectRegistry.getOrCreateSignature(data) : undefined;
    }
    getTypeAtPosition(file, positionOrPositions) {
        if (typeof positionOrPositions === "number") {
            const data = this.client.apiRequest("getTypeAtPosition", {
                snapshot: this.snapshotId,
                project: this.projectId,
                file,
                position: positionOrPositions,
            });
            return data ? this.objectRegistry.getOrCreateType(data) : undefined;
        }
        const data = this.client.apiRequest("getTypesAtPositions", {
            snapshot: this.snapshotId,
            project: this.projectId,
            file,
            positions: positionOrPositions,
        });
        return data.map(d => d ? this.objectRegistry.getOrCreateType(d) : undefined);
    }
    resolveName(name, meaning, location, excludeGlobals) {
        // Distinguish Node (has `kind`) from DocumentPosition (has `document` and `position`)
        const isNode = location && "kind" in location;
        const data = this.client.apiRequest("resolveName", {
            snapshot: this.snapshotId,
            project: this.projectId,
            name,
            meaning,
            location: isNode ? getNodeId(location) : undefined,
            file: !isNode && location ? location.document : undefined,
            position: !isNode && location ? location.position : undefined,
            excludeGlobals,
        });
        return data ? this.objectRegistry.getOrCreateSymbol(data) : undefined;
    }
    getResolvedSymbol(node) {
        const text = node.text;
        if (!text)
            return undefined;
        return this.resolveName(text, SymbolFlags.Value | SymbolFlags.ExportValue, node);
    }
    getContextualType(node) {
        const data = this.client.apiRequest("getContextualType", {
            snapshot: this.snapshotId,
            project: this.projectId,
            location: getNodeId(node),
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    getBaseTypeOfLiteralType(type) {
        const data = this.client.apiRequest("getBaseTypeOfLiteralType", {
            snapshot: this.snapshotId,
            project: this.projectId,
            type: type.id,
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    getNonNullableType(type) {
        const data = this.client.apiRequest("getNonNullableType", {
            snapshot: this.snapshotId,
            project: this.projectId,
            type: type.id,
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    getTypeFromTypeNode(node) {
        const data = this.client.apiRequest("getTypeFromTypeNode", {
            snapshot: this.snapshotId,
            project: this.projectId,
            location: getNodeId(node),
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    getWidenedType(type) {
        const data = this.client.apiRequest("getWidenedType", {
            snapshot: this.snapshotId,
            project: this.projectId,
            type: type.id,
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    getParameterType(signature, index) {
        const data = this.client.apiRequest("getParameterType", {
            snapshot: this.snapshotId,
            project: this.projectId,
            signature: signature.id,
            index,
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    isArrayLikeType(type) {
        return this.client.apiRequest("isArrayLikeType", {
            snapshot: this.snapshotId,
            project: this.projectId,
            type: type.id,
        });
    }
    getShorthandAssignmentValueSymbol(node) {
        const data = this.client.apiRequest("getShorthandAssignmentValueSymbol", {
            snapshot: this.snapshotId,
            project: this.projectId,
            location: getNodeId(node),
        });
        return data ? this.objectRegistry.getOrCreateSymbol(data) : undefined;
    }
    getTypeOfSymbolAtLocation(symbol, location) {
        const data = this.client.apiRequest("getTypeOfSymbolAtLocation", {
            snapshot: this.snapshotId,
            project: this.projectId,
            symbol: symbol.id,
            location: getNodeId(location),
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    getIntrinsicType(method) {
        const data = this.client.apiRequest(method, {
            snapshot: this.snapshotId,
            project: this.projectId,
        });
        return this.objectRegistry.getOrCreateType(data);
    }
    getAnyType() {
        return this.getIntrinsicType("getAnyType");
    }
    getStringType() {
        return this.getIntrinsicType("getStringType");
    }
    getNumberType() {
        return this.getIntrinsicType("getNumberType");
    }
    getBooleanType() {
        return this.getIntrinsicType("getBooleanType");
    }
    getVoidType() {
        return this.getIntrinsicType("getVoidType");
    }
    getUndefinedType() {
        return this.getIntrinsicType("getUndefinedType");
    }
    getNullType() {
        return this.getIntrinsicType("getNullType");
    }
    getNeverType() {
        return this.getIntrinsicType("getNeverType");
    }
    getUnknownType() {
        return this.getIntrinsicType("getUnknownType");
    }
    getBigIntType() {
        return this.getIntrinsicType("getBigIntType");
    }
    getESSymbolType() {
        return this.getIntrinsicType("getESSymbolType");
    }
    typeToTypeNode(type, enclosingDeclaration, flags) {
        const binaryData = this.client.apiRequestBinary("typeToTypeNode", {
            snapshot: this.snapshotId,
            project: this.projectId,
            type: type.id,
            location: enclosingDeclaration ? getNodeId(enclosingDeclaration) : undefined,
            flags,
        });
        if (!binaryData)
            return undefined;
        return decodeNode(binaryData);
    }
    signatureToSignatureDeclaration(signature, kind, enclosingDeclaration, flags) {
        const binaryData = this.client.apiRequestBinary("signatureToSignatureDeclaration", {
            snapshot: this.snapshotId,
            project: this.projectId,
            signature: signature.id,
            kind,
            location: enclosingDeclaration ? getNodeId(enclosingDeclaration) : undefined,
            flags,
        });
        if (!binaryData)
            return undefined;
        return decodeNode(binaryData);
    }
    typeToString(type, enclosingDeclaration, flags) {
        return this.client.apiRequest("typeToString", {
            snapshot: this.snapshotId,
            project: this.projectId,
            type: type.id,
            location: enclosingDeclaration ? getNodeId(enclosingDeclaration) : undefined,
            flags,
        });
    }
    isContextSensitive(node) {
        return this.client.apiRequest("isContextSensitive", {
            snapshot: this.snapshotId,
            project: this.projectId,
            location: getNodeId(node),
        });
    }
    getReturnTypeOfSignature(signature) {
        const data = this.client.apiRequest("getReturnTypeOfSignature", {
            snapshot: this.snapshotId,
            project: this.projectId,
            signature: signature.id,
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    getRestTypeOfSignature(signature) {
        const data = this.client.apiRequest("getRestTypeOfSignature", {
            snapshot: this.snapshotId,
            project: this.projectId,
            signature: signature.id,
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    getTypePredicateOfSignature(signature) {
        const data = this.client.apiRequest("getTypePredicateOfSignature", {
            snapshot: this.snapshotId,
            project: this.projectId,
            signature: signature.id,
        });
        if (!data)
            return undefined;
        return {
            kind: data.kind,
            parameterIndex: data.parameterIndex,
            parameterName: data.parameterName,
            type: data.type ? this.objectRegistry.getOrCreateType(data.type) : undefined,
        };
    }
    getBaseTypes(type) {
        const data = this.client.apiRequest("getBaseTypes", {
            snapshot: this.snapshotId,
            project: this.projectId,
            type: type.id,
        });
        return data ? data.map(d => this.objectRegistry.getOrCreateType(d)) : [];
    }
    getPropertiesOfType(type) {
        const data = this.client.apiRequest("getPropertiesOfType", {
            snapshot: this.snapshotId,
            project: this.projectId,
            type: type.id,
        });
        return data ? data.map(d => this.objectRegistry.getOrCreateSymbol(d)) : [];
    }
    getIndexInfosOfType(type) {
        const data = this.client.apiRequest("getIndexInfosOfType", {
            snapshot: this.snapshotId,
            project: this.projectId,
            type: type.id,
        });
        if (!data)
            return [];
        return data.map(d => ({
            keyType: this.objectRegistry.getOrCreateType(d.keyType),
            valueType: this.objectRegistry.getOrCreateType(d.valueType),
            isReadonly: d.isReadonly ?? false,
        }));
    }
    getConstraintOfTypeParameter(type) {
        const data = this.client.apiRequest("getConstraintOfTypeParameter", {
            snapshot: this.snapshotId,
            project: this.projectId,
            type: type.id,
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    getTypeArguments(type) {
        const data = this.client.apiRequest("getTypeArguments", {
            snapshot: this.snapshotId,
            project: this.projectId,
            type: type.id,
        });
        return data ? data.map(d => this.objectRegistry.getOrCreateType(d)) : [];
    }
}
export class Emitter {
    client;
    constructor(client) {
        this.client = client;
    }
    printNode(node, options = {}) {
        const encoded = encodeNode(node);
        const base64 = uint8ArrayToBase64(encoded);
        return this.client.apiRequest("printNode", {
            data: base64,
            ...options,
        });
    }
}
export class NodeHandle {
    kind;
    pos;
    end;
    path;
    constructor(handle) {
        const parsed = parseNodeHandle(handle);
        this.pos = parsed.pos;
        this.end = parsed.end;
        this.kind = parsed.kind;
        this.path = parsed.path;
    }
    /**
     * Resolve this handle to the actual AST node by fetching the source file
     * from the given project and finding the node at the stored position.
     */
    resolve(project) {
        const sourceFile = project.program.getSourceFile(this.path);
        if (!sourceFile) {
            return undefined;
        }
        // Find the node at the stored position with matching kind and end
        return findDescendant(sourceFile, this.pos, this.end, this.kind);
    }
}
export class Symbol {
    client;
    snapshotId;
    objectRegistry;
    id;
    name;
    flags;
    checkFlags;
    declarations;
    valueDeclaration;
    constructor(data, client, snapshotId, objectRegistry) {
        this.client = client;
        this.snapshotId = snapshotId;
        this.objectRegistry = objectRegistry;
        this.id = data.id;
        this.name = data.name;
        this.flags = data.flags;
        this.checkFlags = data.checkFlags;
        this.declarations = (data.declarations ?? []).map(d => new NodeHandle(d));
        this.valueDeclaration = data.valueDeclaration ? new NodeHandle(data.valueDeclaration) : undefined;
    }
    getParent() {
        const data = this.client.apiRequest("getParentOfSymbol", { snapshot: this.snapshotId, symbol: this.id });
        return data ? this.objectRegistry.getOrCreateSymbol(data) : undefined;
    }
    getMembers() {
        const data = this.client.apiRequest("getMembersOfSymbol", { snapshot: this.snapshotId, symbol: this.id });
        return data ? data.map(d => this.objectRegistry.getOrCreateSymbol(d)) : [];
    }
    getExports() {
        const data = this.client.apiRequest("getExportsOfSymbol", { snapshot: this.snapshotId, symbol: this.id });
        return data ? data.map(d => this.objectRegistry.getOrCreateSymbol(d)) : [];
    }
    getExportSymbol() {
        const data = this.client.apiRequest("getExportSymbolOfSymbol", { snapshot: this.snapshotId, symbol: this.id });
        return this.objectRegistry.getOrCreateSymbol(data);
    }
}
class TypeObject {
    client;
    snapshotId;
    objectRegistry;
    id;
    flags;
    objectFlags;
    value;
    target;
    typeParameters;
    outerTypeParameters;
    localTypeParameters;
    elementFlags;
    fixedLength;
    readonly;
    texts;
    objectType;
    indexType;
    checkType;
    extendsType;
    baseType;
    substConstraint;
    constructor(data, client, snapshotId, objectRegistry) {
        this.client = client;
        this.snapshotId = snapshotId;
        this.objectRegistry = objectRegistry;
        this.id = data.id;
        this.flags = data.flags;
        if (data.objectFlags !== undefined)
            this.objectFlags = data.objectFlags;
        if (data.value !== undefined)
            this.value = data.value;
        if (data.target !== undefined)
            this.target = data.target;
        if (data.typeParameters !== undefined)
            this.typeParameters = data.typeParameters;
        if (data.outerTypeParameters !== undefined)
            this.outerTypeParameters = data.outerTypeParameters;
        if (data.localTypeParameters !== undefined)
            this.localTypeParameters = data.localTypeParameters;
        if (data.elementFlags !== undefined)
            this.elementFlags = data.elementFlags;
        if (data.fixedLength !== undefined)
            this.fixedLength = data.fixedLength;
        if (data.readonly !== undefined)
            this.readonly = data.readonly;
        if (data.texts !== undefined)
            this.texts = data.texts;
        if (data.objectType !== undefined)
            this.objectType = data.objectType;
        if (data.indexType !== undefined)
            this.indexType = data.indexType;
        if (data.checkType !== undefined)
            this.checkType = data.checkType;
        if (data.extendsType !== undefined)
            this.extendsType = data.extendsType;
        if (data.baseType !== undefined)
            this.baseType = data.baseType;
        if (data.substConstraint !== undefined)
            this.substConstraint = data.substConstraint;
    }
    getSymbol() {
        const data = this.client.apiRequest("getSymbolOfType", { snapshot: this.snapshotId, type: this.id });
        return data ? this.objectRegistry.getOrCreateSymbol(data) : undefined;
    }
    fetchType(handle, method) {
        const cached = handle ? this.objectRegistry.getType(handle) : undefined;
        if (cached)
            return cached;
        const data = this.client.apiRequest(method, { snapshot: this.snapshotId, type: this.id });
        if (!data)
            throw new Error(`${method} returned null for type ${this.id}`);
        return this.objectRegistry.getOrCreateType(data);
    }
    fetchTypes(method) {
        const data = this.client.apiRequest(method, { snapshot: this.snapshotId, type: this.id });
        return data ? data.map(d => this.objectRegistry.getOrCreateType(d)) : [];
    }
    getTarget() {
        return this.fetchType(this.target, "getTargetOfType");
    }
    getTypes() {
        return this.fetchTypes("getTypesOfType");
    }
    getTypeParameters() {
        return this.fetchTypes("getTypeParametersOfType");
    }
    getOuterTypeParameters() {
        return this.fetchTypes("getOuterTypeParametersOfType");
    }
    getLocalTypeParameters() {
        return this.fetchTypes("getLocalTypeParametersOfType");
    }
    getObjectType() {
        return this.fetchType(this.objectType, "getObjectTypeOfType");
    }
    getIndexType() {
        return this.fetchType(this.indexType, "getIndexTypeOfType");
    }
    getCheckType() {
        return this.fetchType(this.checkType, "getCheckTypeOfType");
    }
    getExtendsType() {
        return this.fetchType(this.extendsType, "getExtendsTypeOfType");
    }
    getBaseType() {
        return this.fetchType(this.baseType, "getBaseTypeOfType");
    }
    getConstraint() {
        return this.fetchType(this.substConstraint, "getConstraintOfType");
    }
}
export class Signature {
    flags;
    id;
    declaration;
    typeParameters;
    parameters;
    thisParameter;
    target;
    constructor(data, objectRegistry) {
        this.id = data.id;
        this.flags = data.flags;
        this.declaration = data.declaration ? new NodeHandle(data.declaration) : undefined;
        this.typeParameters = (data.typeParameters ?? []).map(id => {
            return objectRegistry.getOrCreateType({ id, flags: 0 });
        });
        this.parameters = (data.parameters ?? []).map(id => {
            return objectRegistry.getOrCreateSymbol({ id, name: "", flags: 0, checkFlags: 0 });
        });
        this.thisParameter = data.thisParameter
            ? objectRegistry.getOrCreateSymbol({ id: data.thisParameter, name: "", flags: 0, checkFlags: 0 })
            : undefined;
        this.target = data.target
            ? objectRegistry.getOrCreateSignature({ id: data.target, flags: 0 })
            : undefined;
    }
    get hasRestParameter() {
        return (this.flags & SignatureFlags.HasRestParameter) !== 0;
    }
    get isConstruct() {
        return (this.flags & SignatureFlags.Construct) !== 0;
    }
    get isAbstract() {
        return (this.flags & SignatureFlags.Abstract) !== 0;
    }
}
//# sourceMappingURL=api.js.map