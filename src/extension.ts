import {
	languages,
	Range,
	ExtensionContext,
	CompletionItemProvider,
	TextDocument,
	Position,
	CancellationToken,
	CompletionContext,
	ProviderResult,
	CompletionItem,
	CompletionList
} from "vscode";

import {
	parse,
	walk
} from "css-tree";

import fetch from 'node-fetch';

class ClassCompletionItemProvider implements CompletionItemProvider {

	readonly start = new Position(0, 0);
	readonly cache = new Map<string, Map<string, CompletionItem>>();
	readonly canComplete = /class\s*=\s*(["'])(?:(?!\1).)*$/si;
	readonly findLinkRel = /rel\s*=\s*(["'])((?:(?!\1).)+)\1/si;
	readonly findLinkHref = /href\s*=\s*(["'])((?:(?!\1).)+)\1/si;

	fetchRemoteStyleSheet(href: string): Thenable<Map<string, CompletionItem>> {
		return new Promise((resolve, reject) => {
			const selectors = new Map<string, CompletionItem>();

			fetch(href).then(res => {
				if (res.status === 200) {
					res.text().then(text => {
						walk(parse(text), (node) => {
							if (node.type === "ClassSelector") {
								selectors.set(node.name, new CompletionItem(node.name));
							};
						});
						resolve(selectors);
					}, () => {
						resolve(selectors);
					});
				} else {
					resolve(selectors);
				}
			}, () => resolve(selectors));
		});
	}

	findRemoteStyleSheets(text: string): Thenable<Map<string, CompletionItem>> {
		return new Promise((resolve, reject) => {
			const links = new Map<string, CompletionItem>();
			const findLinks = /<link([^>]+)>/gi;
			const promises = [];

			let link;

			while ((link = findLinks.exec(text)) !== null) {
				const rel = this.findLinkRel.exec(link[1]);

				if (rel && rel[2] === "stylesheet") {
					const href = this.findLinkHref.exec(link[1]);

					if (href && href[2].startsWith("http")) {
						const items = this.cache.get(href[2]);

						if (items) {
							items.forEach((value, key) => links.set(key, value));
						} else {
							promises.push(this.fetchRemoteStyleSheet(href[2]).then(items => {
								this.cache.set(href[2], items);
								items.forEach((value, key) => links.set(key, value));
							}));
						}
					}
				}
			}

			Promise.all(promises).then(() => resolve(links));
		});
	}

	provideCompletionItems(
		document: TextDocument,
		position: Position,
		token: CancellationToken,
		context: CompletionContext): ProviderResult<CompletionItem[] | CompletionList<CompletionItem>> {

		return new Promise((resolve, reject) => {
			const range = new Range(this.start, position);
			const text = document.getText(range);
			const canComplete = this.canComplete.test(text);

			if (canComplete) {
				const styles = new Map<string, CompletionItem>();
				const findStyles = /<style[^>]*>([^<]+)<\/style>/gi;

				let style;

				while ((style = findStyles.exec(text)) !== null) {
					walk(parse(style[1]), (node) => {
						if (node.type === "ClassSelector") {
							styles.set(node.name, new CompletionItem(node.name));
						};
					});
				}

				this.findRemoteStyleSheets(text).then(links => {
					styles.forEach((value, key) => links.set(key, value));
					resolve([...links.values()]);
				});
			} else {
				reject();
			}
		});
	}
}

export function activate(context: ExtensionContext) {
	context.subscriptions.push(
		languages.registerCompletionItemProvider("html",
			new ClassCompletionItemProvider(), "\"", "'"));
}

export function deactivate() { }
