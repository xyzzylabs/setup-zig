import { type ClientOptions, type ClientSocketOptions, type ClientSpawnOptions } from "../options.ts";
export type { ClientOptions, ClientSocketOptions, ClientSpawnOptions };
export declare class Client {
    private channel;
    private encoder;
    constructor(options: ClientOptions);
    apiRequest<T>(method: string, params?: unknown): T;
    apiRequestBinary(method: string, params?: unknown): Uint8Array | undefined;
    echo(payload: string): string;
    echoBinary(payload: Uint8Array): Uint8Array;
    close(): void;
}
//# sourceMappingURL=client.d.ts.map