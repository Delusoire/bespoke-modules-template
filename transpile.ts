import path from "node:path";

import swc from "@swc/core";
import postcss from "postcss";

import atImport from "postcss-import";
import tailwindcssNesting from "tailwindcss/nesting";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import postcssRemapper from "./postcss-remapper";


export type ClassMap = Record<string, string | ClassMap>

export class Transpiler {
	constructor(private classmap: ClassMap) {}

	async toJS(file: string) {
		const dest = file.replace(/\.[^\.]+$/, ".js");
		const buffer = await Bun.file(file).text();
		const { code } = await swc.transform(buffer, {
			filename: path.basename(file),
			isModule: true,
			jsc: {
				baseUrl: ".",
				experimental: {
					plugins: [["swc-remapper", { classmap: this.classmap }]],
				},
				parser: {
					syntax: "typescript",
					tsx: true,
					decorators: true,
					dynamicImport: true,
				},
				target: "esnext",
				transform: {
					decoratorVersion: "2022-03",
					react: {
						pragma: "S.React.createElement",
						pragmaFrag: "S.React.Fragment",
					},
				},
				loose: false,
			},
			sourceMaps: false,
		});
		await Bun.write(dest, code);
	}

	async toCSS(file: string, moduleFiles: string[]) {
		const dest = file.replace(/\.[^\.]+$/, ".css");
		const buffer = await Bun.file(file).text();
		const PostCSSProcessor = await postcss.default([
			atImport(),
			tailwindcssNesting(),
			tailwindcss({
				config: {
					content: {
						relative: true,
						files: moduleFiles,
					},
				},
			}),
			autoprefixer({}),
			postcssRemapper({ classmap: this.classmap }),
		]);
		const p = await PostCSSProcessor.process(buffer, { from: file });
		await Bun.write(dest, p.css);
	}
}
