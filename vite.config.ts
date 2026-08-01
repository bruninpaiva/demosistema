import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  // @lovable.dev/mcp-js has a path-separator bug on native Windows (it compares a
  // posix-normalized project root against win32-resolved paths and throws). Skip it
  // there; it still runs normally on Lovable/Linux/WSL.
  plugins: process.platform === "win32" ? [] : [mcpPlugin()],
});
