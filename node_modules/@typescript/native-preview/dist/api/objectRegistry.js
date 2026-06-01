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
export class ObjectRegistry {
    symbols = new Map();
    types = new Map();
    signatures = new Map();
    factories;
    constructor(factories) {
        this.factories = factories;
    }
    getOrCreateSymbol(data) {
        let symbol = this.symbols.get(data.id);
        if (symbol) {
            return symbol;
        }
        symbol = this.factories.createSymbol(data);
        this.symbols.set(data.id, symbol);
        return symbol;
    }
    getOrCreateType(data) {
        let type = this.types.get(data.id);
        if (type) {
            return type;
        }
        type = this.factories.createType(data);
        this.types.set(data.id, type);
        return type;
    }
    getType(id) {
        return this.types.get(id);
    }
    getOrCreateSignature(data) {
        let signature = this.signatures.get(data.id);
        if (signature) {
            return signature;
        }
        signature = this.factories.createSignature(data);
        this.signatures.set(data.id, signature);
        return signature;
    }
    clear() {
        this.symbols.clear();
        this.types.clear();
        this.signatures.clear();
    }
}
//# sourceMappingURL=objectRegistry.js.map