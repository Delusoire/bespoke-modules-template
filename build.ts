import path from "node:path";
import fs from "node:fs/promises";

import { Glob } from "bun";

import type { Metadata } from "/hooks/module";
import debounce from "lodash/debounce";
import { ClassMap, Transpiler } from "./transpile";

const reloadSpotifyDocument = debounce(
	() =>
		Bun.spawn({
			cmd: [
				"pwsh",
				"-NoProfile",
				"-NonInteractive",
				"-ExecutionPolicy",
				"Bypass",
				"-EncodedCommand",
				Buffer.from("Start-Process -Wait spotify:app:rpc:reload", "utf-16le").toString("base64"),
			],
			stdout: "pipe",
		}),
	3000,
);


function readJSON<T>(path: string | URL): Promise<Awaited<T>> {
	return Bun.file(path).json()
}



// TODO: add cli options for these
const classmap = await readJSON<ClassMap>("./classmap.json")
const metadata = await readJSON<Metadata>("./metadata.json");

const transpiler = new Transpiler(classmap)

async function initialBuild() {
	const toJsGlob = "./**/*.{ts,tsx}";
	const cssEntry = metadata.entries.css;
	if (cssEntry) {
		const toCssFile = cssEntry.replace(/\.css$/, ".scss");
		await transpiler.toCSS(toCssFile, [toJsGlob]);
	}
	const toJsFiles = new Glob(toJsGlob).scan(".");
	for await (const toJsFile of toJsFiles) {
		if (toJsFile.includes("node_modules")) continue;
		await transpiler.toJS(toJsFile);
	}
	reloadSpotifyDocument();
}

async function watchBuild() {
	const watcher = fs.watch(".", { recursive: true });
	for await (const event of watcher) {
		const { filename, eventType } = event;
		console.log(`${filename} was ${eventType}d`);
		switch (path.extname(filename)) {
			case ".scss": {
				const toJsGlob = "./**/*.{ts,tsx}";
				const cssEntry = metadata.entries.css;
				if (cssEntry) {
					const toCssFile = cssEntry.replace(/\.css$/, ".scss");
					await transpiler.toCSS(toCssFile, [toJsGlob]);
				}
				reloadSpotifyDocument();
				break;
			}
			case ".ts":
			case ".tsx": {
				await transpiler.toJS(filename);
				reloadSpotifyDocument();
				break;
			}
		}
	}
}

const timeStart = Date.now();

await initialBuild();

console.log(`Build finished in ${(Date.now() - timeStart) / 1000}s!`);
console.log("Watching for further changes");

await watchBuild();
