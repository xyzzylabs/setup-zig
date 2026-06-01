import { SyntaxKind } from "#enums/syntaxKind";
let syntaxKindNames;
function getSyntaxKindNames() {
    if (!syntaxKindNames) {
        syntaxKindNames = new Map();
        for (const name of Object.keys(SyntaxKind)) {
            const val = SyntaxKind[name];
            if (typeof val === "number" && !syntaxKindNames.has(val)) {
                syntaxKindNames.set(val, name);
            }
        }
        syntaxKindNames.set(SyntaxKind.EndOfFile, "EndOfFileToken");
    }
    return syntaxKindNames;
}
export function formatSyntaxKind(kind) {
    return getSyntaxKindNames().get(kind) ?? `Unknown(${kind})`;
}
export function tryCast(value, test) {
    return value !== undefined && test(value) ? value : undefined;
}
export function cast(value, test) {
    if (value !== undefined && test(value))
        return value;
    throw new Error(`Invalid cast. The supplied value ${value} did not pass the test '${test.name}'.`);
}
//# sourceMappingURL=utils.js.map