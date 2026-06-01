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
    static async fromLSPConnection(options) {
        const api = new API(options);
        await api.ensureInitialized();
        return api;
    }
    async ensureInitialized() {
        if (!this.initialized) {
            const response = await this.client.apiRequest("initialize", null);
            const getCanonicalFileName = createGetCanonicalFileName(response.useCaseSensitiveFileNames);
            const currentDirectory = response.currentDirectory;
            this.toPath = (fileName) => toPath(fileName, currentDirectory, getCanonicalFileName);
            this.initialized = true;
        }
    }
    async parseConfigFile(file) {
        await this.ensureInitialized();
        return this.client.apiRequest("parseConfigFile", { file });
    }
    async updateSnapshot(params) {
        await this.ensureInitialized();
        const requestParams = params ?? {};
        if (requestParams.openProject) {
            requestParams.openProject = resolveFileName(requestParams.openProject);
        }
        const data = await this.client.apiRequest("updateSnapshot", requestParams);
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
    async close() {
        // Dispose all active snapshots
        for (const snapshot of [...this.activeSnapshots]) {
            await snapshot.dispose();
        }
        // Release the latest snapshot's cache refs if still held
        if (this.latestSnapshot) {
            this.sourceFileCache.releaseSnapshot(this.latestSnapshot.id);
            this.latestSnapshot = undefined;
        }
        await this.client.close();
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
    async getDefaultProjectForFile(file) {
        this.ensureNotDisposed();
        const data = await this.client.apiRequest("getDefaultProjectForFile", {
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
    async dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.objectRegistry.clear();
        this.onDispose();
        await this.client.apiRequest("release", { handle: this.id });
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
    async getSourceFile(file) {
        const fileName = resolveFileName(file);
        const path = this.toPath(fileName);
        // Check if we already have a retained cache entry for this (snapshot, project) pair
        const retained = this.sourceFileCache.getRetained(path, this.snapshotId, this.projectId);
        if (retained) {
            return retained;
        }
        // Fetch from server
        const binaryData = await this.client.apiRequestBinary("getSourceFile", {
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
    async getSyntacticDiagnostics(file) {
        const data = await this.client.apiRequest("getSyntacticDiagnostics", {
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
    async getSemanticDiagnostics(file) {
        const data = await this.client.apiRequest("getSemanticDiagnostics", {
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
    async getSuggestionDiagnostics(file) {
        const data = await this.client.apiRequest("getSuggestionDiagnostics", {
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
    async getDeclarationDiagnostics(file) {
        const data = await this.client.apiRequest("getDeclarationDiagnostics", {
            snapshot: this.snapshotId,
            project: this.projectId,
            ...(file !== undefined ? { file } : {}),
        });
        return data ?? [];
    }
    /**
     * Get config file parsing diagnostics for the project.
     */
    async getConfigFileParsingDiagnostics() {
        const data = await this.client.apiRequest("getConfigFileParsingDiagnostics", {
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
    async getSymbolAtLocation(nodeOrNodes) {
        if (Array.isArray(nodeOrNodes)) {
            const data = await this.client.apiRequest("getSymbolsAtLocations", {
                snapshot: this.snapshotId,
                project: this.projectId,
                locations: nodeOrNodes.map(node => getNodeId(node)),
            });
            return data.map(d => d ? this.objectRegistry.getOrCreateSymbol(d) : undefined);
        }
        const data = await this.client.apiRequest("getSymbolAtLocation", {
            snapshot: this.snapshotId,
            project: this.projectId,
            location: getNodeId(nodeOrNodes),
        });
        return data ? this.objectRegistry.getOrCreateSymbol(data) : undefined;
    }
    async getSymbolAtPosition(file, positionOrPositions) {
        if (typeof positionOrPositions === "number") {
            const data = await this.client.apiRequest("getSymbolAtPosition", {
                snapshot: this.snapshotId,
                project: this.projectId,
                file,
                position: positionOrPositions,
            });
            return data ? this.objectRegistry.getOrCreateSymbol(data) : undefined;
        }
        const data = await this.client.apiRequest("getSymbolsAtPositions", {
            snapshot: this.snapshotId,
            project: this.projectId,
            file,
            positions: positionOrPositions,
        });
        return data.map(d => d ? this.objectRegistry.getOrCreateSymbol(d) : undefined);
    }
    async getTypeOfSymbol(symbolOrSymbols) {
        if (Array.isArray(symbolOrSymbols)) {
            const data = await this.client.apiRequest("getTypesOfSymbols", {
                snapshot: this.snapshotId,
                project: this.projectId,
                symbols: symbolOrSymbols.map(s => s.id),
            });
            return data.map(d => d ? this.objectRegistry.getOrCreateType(d) : undefined);
        }
        const data = await this.client.apiRequest("getTypeOfSymbol", {
            snapshot: this.snapshotId,
            project: this.projectId,
            symbol: symbolOrSymbols.id,
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    async getDeclaredTypeOfSymbol(symbol) {
        const data = await this.client.apiRequest("getDeclaredTypeOfSymbol", {
            snapshot: this.snapshotId,
            project: this.projectId,
            symbol: symbol.id,
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    async getTypeAtLocation(nodeOrNodes) {
        if (Array.isArray(nodeOrNodes)) {
            const data = await this.client.apiRequest("getTypeAtLocations", {
                snapshot: this.snapshotId,
                project: this.projectId,
                locations: nodeOrNodes.map(node => getNodeId(node)),
            });
            return data.map(d => d ? this.objectRegistry.getOrCreateType(d) : undefined);
        }
        const data = await this.client.apiRequest("getTypeAtLocation", {
            snapshot: this.snapshotId,
            project: this.projectId,
            location: getNodeId(nodeOrNodes),
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    async getSignaturesOfType(type, kind) {
        const data = await this.client.apiRequest("getSignaturesOfType", {
            snapshot: this.snapshotId,
            project: this.projectId,
            type: type.id,
            kind,
        });
        return data.map(d => this.objectRegistry.getOrCreateSignature(d));
    }
    async getResolvedSignature(node) {
        const data = await this.client.apiRequest("getResolvedSignature", {
            snapshot: this.snapshotId,
            project: this.projectId,
            location: getNodeId(node),
        });
        return data ? this.objectRegistry.getOrCreateSignature(data) : undefined;
    }
    async getTypeAtPosition(file, positionOrPositions) {
        if (typeof positionOrPositions === "number") {
            const data = await this.client.apiRequest("getTypeAtPosition", {
                snapshot: this.snapshotId,
                project: this.projectId,
                file,
                position: positionOrPositions,
            });
            return data ? this.objectRegistry.getOrCreateType(data) : undefined;
        }
        const data = await this.client.apiRequest("getTypesAtPositions", {
            snapshot: this.snapshotId,
            project: this.projectId,
            file,
            positions: positionOrPositions,
        });
        return data.map(d => d ? this.objectRegistry.getOrCreateType(d) : undefined);
    }
    async resolveName(name, meaning, location, excludeGlobals) {
        // Distinguish Node (has `kind`) from DocumentPosition (has `document` and `position`)
        const isNode = location && "kind" in location;
        const data = await this.client.apiRequest("resolveName", {
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
    async getResolvedSymbol(node) {
        const text = node.text;
        if (!text)
            return undefined;
        return this.resolveName(text, SymbolFlags.Value | SymbolFlags.ExportValue, node);
    }
    async getContextualType(node) {
        const data = await this.client.apiRequest("getContextualType", {
            snapshot: this.snapshotId,
            project: this.projectId,
            location: getNodeId(node),
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    async getBaseTypeOfLiteralType(type) {
        const data = await this.client.apiRequest("getBaseTypeOfLiteralType", {
            snapshot: this.snapshotId,
            project: this.projectId,
            type: type.id,
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    async getNonNullableType(type) {
        const data = await this.client.apiRequest("getNonNullableType", {
            snapshot: this.snapshotId,
            project: this.projectId,
            type: type.id,
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    async getTypeFromTypeNode(node) {
        const data = await this.client.apiRequest("getTypeFromTypeNode", {
            snapshot: this.snapshotId,
            project: this.projectId,
            location: getNodeId(node),
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    async getWidenedType(type) {
        const data = await this.client.apiRequest("getWidenedType", {
            snapshot: this.snapshotId,
            project: this.projectId,
            type: type.id,
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    async getParameterType(signature, index) {
        const data = await this.client.apiRequest("getParameterType", {
            snapshot: this.snapshotId,
            project: this.projectId,
            signature: signature.id,
            index,
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    async isArrayLikeType(type) {
        return this.client.apiRequest("isArrayLikeType", {
            snapshot: this.snapshotId,
            project: this.projectId,
            type: type.id,
        });
    }
    async getShorthandAssignmentValueSymbol(node) {
        const data = await this.client.apiRequest("getShorthandAssignmentValueSymbol", {
            snapshot: this.snapshotId,
            project: this.projectId,
            location: getNodeId(node),
        });
        return data ? this.objectRegistry.getOrCreateSymbol(data) : undefined;
    }
    async getTypeOfSymbolAtLocation(symbol, location) {
        const data = await this.client.apiRequest("getTypeOfSymbolAtLocation", {
            snapshot: this.snapshotId,
            project: this.projectId,
            symbol: symbol.id,
            location: getNodeId(location),
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    async getIntrinsicType(method) {
        const data = await this.client.apiRequest(method, {
            snapshot: this.snapshotId,
            project: this.projectId,
        });
        return this.objectRegistry.getOrCreateType(data);
    }
    async getAnyType() {
        return this.getIntrinsicType("getAnyType");
    }
    async getStringType() {
        return this.getIntrinsicType("getStringType");
    }
    async getNumberType() {
        return this.getIntrinsicType("getNumberType");
    }
    async getBooleanType() {
        return this.getIntrinsicType("getBooleanType");
    }
    async getVoidType() {
        return this.getIntrinsicType("getVoidType");
    }
    async getUndefinedType() {
        return this.getIntrinsicType("getUndefinedType");
    }
    async getNullType() {
        return this.getIntrinsicType("getNullType");
    }
    async getNeverType() {
        return this.getIntrinsicType("getNeverType");
    }
    async getUnknownType() {
        return this.getIntrinsicType("getUnknownType");
    }
    async getBigIntType() {
        return this.getIntrinsicType("getBigIntType");
    }
    async getESSymbolType() {
        return this.getIntrinsicType("getESSymbolType");
    }
    async typeToTypeNode(type, enclosingDeclaration, flags) {
        const binaryData = await this.client.apiRequestBinary("typeToTypeNode", {
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
    async signatureToSignatureDeclaration(signature, kind, enclosingDeclaration, flags) {
        const binaryData = await this.client.apiRequestBinary("signatureToSignatureDeclaration", {
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
    async typeToString(type, enclosingDeclaration, flags) {
        return this.client.apiRequest("typeToString", {
            snapshot: this.snapshotId,
            project: this.projectId,
            type: type.id,
            location: enclosingDeclaration ? getNodeId(enclosingDeclaration) : undefined,
            flags,
        });
    }
    async isContextSensitive(node) {
        return this.client.apiRequest("isContextSensitive", {
            snapshot: this.snapshotId,
            project: this.projectId,
            location: getNodeId(node),
        });
    }
    async getReturnTypeOfSignature(signature) {
        const data = await this.client.apiRequest("getReturnTypeOfSignature", {
            snapshot: this.snapshotId,
            project: this.projectId,
            signature: signature.id,
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    async getRestTypeOfSignature(signature) {
        const data = await this.client.apiRequest("getRestTypeOfSignature", {
            snapshot: this.snapshotId,
            project: this.projectId,
            signature: signature.id,
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    async getTypePredicateOfSignature(signature) {
        const data = await this.client.apiRequest("getTypePredicateOfSignature", {
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
    async getBaseTypes(type) {
        const data = await this.client.apiRequest("getBaseTypes", {
            snapshot: this.snapshotId,
            project: this.projectId,
            type: type.id,
        });
        return data ? data.map(d => this.objectRegistry.getOrCreateType(d)) : [];
    }
    async getPropertiesOfType(type) {
        const data = await this.client.apiRequest("getPropertiesOfType", {
            snapshot: this.snapshotId,
            project: this.projectId,
            type: type.id,
        });
        return data ? data.map(d => this.objectRegistry.getOrCreateSymbol(d)) : [];
    }
    async getIndexInfosOfType(type) {
        const data = await this.client.apiRequest("getIndexInfosOfType", {
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
    async getConstraintOfTypeParameter(type) {
        const data = await this.client.apiRequest("getConstraintOfTypeParameter", {
            snapshot: this.snapshotId,
            project: this.projectId,
            type: type.id,
        });
        return data ? this.objectRegistry.getOrCreateType(data) : undefined;
    }
    async getTypeArguments(type) {
        const data = await this.client.apiRequest("getTypeArguments", {
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
    async printNode(node, options = {}) {
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
    async resolve(project) {
        const sourceFile = await project.program.getSourceFile(this.path);
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
    async getParent() {
        const data = await this.client.apiRequest("getParentOfSymbol", { snapshot: this.snapshotId, symbol: this.id });
        return data ? this.objectRegistry.getOrCreateSymbol(data) : undefined;
    }
    async getMembers() {
        const data = await this.client.apiRequest("getMembersOfSymbol", { snapshot: this.snapshotId, symbol: this.id });
        return data ? data.map(d => this.objectRegistry.getOrCreateSymbol(d)) : [];
    }
    async getExports() {
        const data = await this.client.apiRequest("getExportsOfSymbol", { snapshot: this.snapshotId, symbol: this.id });
        return data ? data.map(d => this.objectRegistry.getOrCreateSymbol(d)) : [];
    }
    async getExportSymbol() {
        const data = await this.client.apiRequest("getExportSymbolOfSymbol", { snapshot: this.snapshotId, symbol: this.id });
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
    async getSymbol() {
        const data = await this.client.apiRequest("getSymbolOfType", { snapshot: this.snapshotId, type: this.id });
        return data ? this.objectRegistry.getOrCreateSymbol(data) : undefined;
    }
    async fetchType(handle, method) {
        const cached = handle ? this.objectRegistry.getType(handle) : undefined;
        if (cached)
            return cached;
        const data = await this.client.apiRequest(method, { snapshot: this.snapshotId, type: this.id });
        if (!data)
            throw new Error(`${method} returned null for type ${this.id}`);
        return this.objectRegistry.getOrCreateType(data);
    }
    async fetchTypes(method) {
        const data = await this.client.apiRequest(method, { snapshot: this.snapshotId, type: this.id });
        return data ? data.map(d => this.objectRegistry.getOrCreateType(d)) : [];
    }
    async getTarget() {
        return this.fetchType(this.target, "getTargetOfType");
    }
    async getTypes() {
        return this.fetchTypes("getTypesOfType");
    }
    async getTypeParameters() {
        return this.fetchTypes("getTypeParametersOfType");
    }
    async getOuterTypeParameters() {
        return this.fetchTypes("getOuterTypeParametersOfType");
    }
    async getLocalTypeParameters() {
        return this.fetchTypes("getLocalTypeParametersOfType");
    }
    async getObjectType() {
        return this.fetchType(this.objectType, "getObjectTypeOfType");
    }
    async getIndexType() {
        return this.fetchType(this.indexType, "getIndexTypeOfType");
    }
    async getCheckType() {
        return this.fetchType(this.checkType, "getCheckTypeOfType");
    }
    async getExtendsType() {
        return this.fetchType(this.extendsType, "getExtendsTypeOfType");
    }
    async getBaseType() {
        return this.fetchType(this.baseType, "getBaseTypeOfType");
    }
    async getConstraint() {
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