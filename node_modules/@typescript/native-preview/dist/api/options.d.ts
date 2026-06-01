/**
 * Shared utilities for the TypeScript API client.
 */
import type { FileSystem } from "./fs.ts";
export interface ClientSocketOptions {
    /** Path to the Unix domain socket or Windows named pipe for API communication */
    pipe: string;
}
export interface ClientSpawnOptions {
    /** Path to the tsgo executable. Defaults to the bundled tsgo binary. */
    tsserverPath?: string;
    /** Current working directory */
    cwd?: string;
    /** Virtual filesystem callbacks */
    fs?: FileSystem;
}
export type ClientOptions = ClientSocketOptions | ClientSpawnOptions;
export declare function isSpawnOptions(options: ClientOptions): options is ClientSpawnOptions;
export declare function resolveExePath(options: ClientSpawnOptions): string;
export interface LSPConnectionOptions extends ClientSocketOptions {
}
export interface APIOptions extends ClientSpawnOptions {
}
//# sourceMappingURL=options.d.ts.map