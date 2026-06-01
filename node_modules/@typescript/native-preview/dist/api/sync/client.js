import { fsCallbackNames } from "../fs.js";
import { isSpawnOptions, resolveExePath, } from "../options.js";
import { SyncRpcChannel } from "../syncChannel.js";
export class Client {
    channel;
    encoder = new TextEncoder();
    constructor(options) {
        if (!isSpawnOptions(options)) {
            throw new Error("Socket connections are not yet supported in the sync client");
        }
        const cwd = options.cwd ?? process.cwd();
        const args = [
            "--api",
            "--cwd",
            cwd,
        ];
        // Enable virtual FS callbacks for each provided FS function
        const enabledCallbacks = [];
        if (options.fs) {
            for (const name of fsCallbackNames) {
                if (options.fs[name]) {
                    enabledCallbacks.push(name);
                }
            }
        }
        if (enabledCallbacks.length > 0) {
            args.push(`--callbacks=${enabledCallbacks.join(",")}`);
        }
        const channel = new SyncRpcChannel(resolveExePath(options), args);
        this.channel = channel;
        if (options.fs) {
            for (const name of enabledCallbacks) {
                const callback = options.fs[name];
                channel.registerCallback(name, (_, arg) => {
                    const result = callback(JSON.parse(arg));
                    if (name === "readFile") {
                        // readFile has 3 returns: string (content), null (not found), undefined (fall back).
                        // Wrap in object to preserve null vs undefined distinction.
                        if (result === undefined)
                            return "";
                        return JSON.stringify({ content: result });
                    }
                    return JSON.stringify(result) ?? "";
                });
            }
        }
    }
    apiRequest(method, params) {
        const encodedPayload = JSON.stringify(params);
        const result = this.channel.requestSync(method, encodedPayload);
        if (result.length) {
            return JSON.parse(result);
        }
        return undefined;
    }
    apiRequestBinary(method, params) {
        const result = this.channel.requestBinarySync(method, this.encoder.encode(JSON.stringify(params)));
        if (result.length === 0)
            return undefined;
        return result;
    }
    echo(payload) {
        return this.channel.requestSync("echo", payload);
    }
    echoBinary(payload) {
        return this.channel.requestBinarySync("echo", payload);
    }
    close() {
        this.channel.close();
    }
}
//# sourceMappingURL=client.js.map