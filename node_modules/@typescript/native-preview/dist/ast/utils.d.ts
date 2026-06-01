import { SyntaxKind } from "#enums/syntaxKind";
export declare function formatSyntaxKind(kind: SyntaxKind): string;
export declare function tryCast<TOut extends TIn, TIn = any>(value: TIn | undefined, test: (value: TIn) => value is TOut): TOut | undefined;
export declare function cast<TOut extends TIn, TIn = any>(value: TIn | undefined, test: (value: TIn) => value is TOut): TOut;
//# sourceMappingURL=utils.d.ts.map