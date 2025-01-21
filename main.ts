import { Plugin, MarkdownRenderChild } from 'obsidian';

import { html } from './backup';
import { DrawingApp } from './DrawingAppNew';

// interface MyPluginSettings {
// 	mySetting: string;
// }

// const DEFAULT_SETTINGS: MyPluginSettings = {
// 	mySetting: 'default'
// }

const rgbToHex = (rgb: string) => {
	const [r, g, b] = rgb.split(',').map(Number);
	return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export default class DrawingPlugin extends Plugin {
	// settings: MyPluginSettings;
	public drawingApps: Map<string, DrawingApp> = new Map();

	async onload() {
		// await this.loadSettings();

		// Register the drawing view for code blocks
		this.registerMarkdownCodeBlockProcessor("pencil", (source, el, ctx) => {
			console.log('Creating new drawing instance');

			// Create a unique ID for this drawing instance
			const drawingId = `drawing-${ctx.sourcePath}`;

			// Create the container structure
			const container = el.createDiv({ cls: 'drawing-container' });
			container.innerHTML = html;
			container.id = 'drawing-container';
			container.style.width = "100%";
			container.style.height = "500px";

			// Get CSS variable for background-secondary
			const style = getComputedStyle(document.body);
			const backgroundPrimary = style.getPropertyValue('--background-primary');
			const backgroundSecondary = style.getPropertyValue('--background-secondary');
			const dividerColor = style.getPropertyValue('--divider-color');
			const textColor = style.getPropertyValue('--text-normal');
			console.log('backgroundPrimary', backgroundPrimary);
			const initColors = {
				backgroundPrimary: backgroundPrimary,
				backgroundSecondary: backgroundSecondary,
				dividerColor: dividerColor,
				textColor: textColor,
			}
			console.log('initColors', initColors);
			// Wait for container to be fully rendered before initializing DrawingApp
			setTimeout(() => {
				const app = new DrawingApp(initColors);
				this.drawingApps.set(drawingId, app);
			}, 0);

		})
	}




	onunload() {
		// Clean up all drawing instances
		this.drawingApps.forEach(app => app.destroy());
		this.drawingApps.clear();
	}

	// async loadSettings() {
	// 	this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	// }

	// async saveSettings() {
	// 	await this.saveData(this.settings);
	// }
}
