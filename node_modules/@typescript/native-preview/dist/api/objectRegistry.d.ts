import type { SignatureResponse, SymbolResponse, TypeResponse } from "./proto.ts";
/**
 * Interface for objects with an ID that can be tracked by the registry.
 */
export interface Identifiable {
    readonly id: string;
}
/**
 * Factory functions for creating API objects.
 */
export interface ObjectFactories<TSymbol extends Identifiable, TType extends Identifiable, TSignature extends Identifiable = Identifiable> {
    createSymbol(data: SymbolResponse): TSymbol;
    createType(data: TypeResponse): TType;
    createSignature(data: SignatureResponse): TSignature;
}
/**
 * Object registry scoped to a single snapshot.
 *
 * This registry ensures that the same server-side object ID always maps to
 * the same client-side object instance within a snapshot, enabling proper
 * object identity semantics across API calls against the same snapshot.
 *
 * Symbol and type lifetimes are tied to the snapshot - when the snapshot
 * is disposed, all its objects are implicitly released.
 */
export declare class ObjectRegistry<TSymbol extends Identifiable, TType extends Identifiable, TSignature extends Identifiable = Identifiable> {
    private symbols;
    private types;
    private signatures;
    private factories;
    constructor(factories: ObjectFactories<TSymbol, TType, TSignature>);
    getOrCreateSymbol(data: SymbolResponse): TSymbol;
    getOrCreateType(data: TypeResponse): TType;
    getType(id: string): TType | undefined;
    getOrCreateSignature(data: SignatureResponse): TSignature;
    clear(): void;
}
//# sourceMappingURL=objectRegistry.d.ts.map