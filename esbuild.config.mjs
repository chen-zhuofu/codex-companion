import { build } from "esbuild";
await build({ entryPoints: ["src/plugin.js"], bundle: true, platform: "node", format: "cjs", target: "es2022", external: ["obsidian", "electron"], outfile: "main.js", charset: "utf8", logLevel: "info" });
