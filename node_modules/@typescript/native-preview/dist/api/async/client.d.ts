import { type ClientOptions, type ClientSocketOptions, type ClientSpawnOptions } from "../options.ts";
export type { ClientOptions, ClientSocketOptions, ClientSpawnOptions };
/**
 * Client handles communication with the TypeScript API server
 * over STDIO (spawned process) or a Unix domain socket using JSON-RPC.
 */
export declare class Client {
    private socket;
    private process;
    private connection;
    private options;
    private connected;
    constructor(options: ClientOptions);
    connect(): Promise<void>;
    private connectViaSpawn;
    private connectViaSocket;
    private registerFSCallbacks;
    apiRequest<T>(method: string, params?: unknown): Promise<T>;
    apiRequestBinary(method: string, params?: unknown): Promise<Uint8Array | undefined>;
    close(): Promise<void>;
}
//# sourceMappingURL=client.d.ts.map