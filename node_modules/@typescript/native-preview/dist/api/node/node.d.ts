import { type FileReference, type Node, type Path, SyntaxKind } from "../../ast/index.ts";
import { RemoteNode, RemoteNodeList } from "./node.generated.ts";
import { type SourceFileInfo } from "./node.infrastructure.ts";
export { RemoteNode, RemoteNodeList } from "./node.generated.ts";
export { readParseOptionsKey, readSourceFileHash, RemoteNodeBase } from "./node.infrastructure.ts";
export declare class RemoteSourceFile extends RemoteNode implements SourceFileInfo {
    readonly nodes: (RemoteNode | RemoteNodeList)[];
    readonly _offsetNodes: number;
    readonly _offsetStringTableOffsets: number;
    readonly _offsetStringTable: number;
    readonly _offsetExtendedData: number;
    readonly _offsetStructuredData: number;
    readonly _decoder: TextDecoder;
    constructor(data: Uint8Array, decoder: TextDecoder);
    readFileReferences(structuredDataOffset: number): readonly FileReference[];
    readNodeIndexArray(structuredDataOffset: number): readonly Node[];
    readStringArray(structuredDataOffset: number): readonly string[];
    /** @internal */
    getOrCreateNodeAtIndex(index: number): Node;
    private get extendedDataOffset();
    get fileName(): string;
    get path(): string;
    get languageVariant(): number;
    get scriptKind(): number;
    get referencedFiles(): readonly FileReference[];
    get typeReferenceDirectives(): readonly FileReference[];
    get libReferenceDirectives(): readonly FileReference[];
    get imports(): readonly Node[];
    get moduleAugmentations(): readonly Node[];
    get ambientModuleNames(): readonly string[];
    get externalModuleIndicator(): Node | true | undefined;
    get isDeclarationFile(): boolean;
}
/**
 * Find a descendant node at a specific position with matching kind and end position.
 */
export declare function findDescendant(root: Node, pos: number, end: number, kind: SyntaxKind): Node | undefined;
/**
 * Parsed components of a node handle.
 */
export interface ParsedNodeHandle {
    pos: number;
    end: number;
    kind: SyntaxKind;
    path: Path;
}
/**
 * Parse a node handle string into its components.
 * Handle format: "pos.end.kind.path" where path may contain dots.
 */
export declare function parseNodeHandle(handle: string): ParsedNodeHandle;
/**
 * Decode binary-encoded AST data into a Node.
 * Works for any binary-encoded node, including synthetic nodes
 * (e.g. from typeToTypeNode) that don't have a source file.
 */
export declare function decodeNode(data: Uint8Array): Node;
/**
 * Get the unique ID string for a remote node.
 * Throws if the node is not a RemoteNode (i.e. not decoded from binary data).
 */
export declare function getNodeId(node: Node): string;
//# sourceMappingURL=node.d.ts.map