import path from "node:path";

import swc from "@swc/core";
import postcss from "postcss";

import atImport from "postcss-import";
import tailwindcssNesting from "tailwindcss/nesting";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

export async function transpileToJs(file: string) {
	const dest = file.replace(/\.[^\.]+$/, ".js");
	const buffer = await Bun.file(file).text();
	const { code: js } = await swc.transform(buffer, {
		filename: path.basename(file),
		sourceMaps: false,
		jsc: {
			baseUrl: ".",
			parser: {
				syntax: "typescript",
				tsx: true,
				decorators: true,
				dynamicImport: true,
			},
			transform: {
				decoratorVersion: "2022-03",
				react: {
					pragma: "S.React.createElement",
					pragmaFrag: "S.React.Fragment",
				},
			},
			target: "esnext",
			loose: false,
		},
		isModule: true,
	});
	await Bun.write(dest, js);
}

export async function transpileToCss(file: string, moduleFiles: string[]) {
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
	]);
	const p = await PostCSSProcessor.process(buffer, { from: file });
	await Bun.write(dest, p.css);
}
