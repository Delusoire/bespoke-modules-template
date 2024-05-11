/* Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import selectorParser from "postcss-selector-parser";
import { ClassMap } from "../transpile";

namespace plugin {
	export interface Options {
		classmap: ClassMap;
	}
}

export default function ({ classmap }: plugin.Options) {
	return {
		postcssPlugin: "postcss-remapper",
		prepare() {
			function renameNode(node: selectorParser.ClassName) {
				const newName = node.value.split("__").reduce((obj, prop) => obj[prop.replace("-", "_")], classmap);
				if (typeof newName === "string") {
					node.value = newName;
				}
			}

			const selectorProcessor = selectorParser(selectors => {
				selectors.walkClasses(renameNode);
			});

			return {
				Rule(ruleNode) {
					if (ruleNode.parent.type !== "atrule" || !ruleNode.parent.name.endsWith("keyframes")) {
						selectorProcessor.process(ruleNode);
					}
				},
			};
		},
	};
}
