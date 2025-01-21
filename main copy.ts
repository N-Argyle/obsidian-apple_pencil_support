import { Plugin, MarkdownRenderChild } from 'obsidian';
import { DrawingApp } from './DrawingApp';

// interface MyPluginSettings {
// 	mySetting: string;
// }

// const DEFAULT_SETTINGS: MyPluginSettings = {
// 	mySetting: 'default'
// }

export default class DrawingPlugin extends Plugin {
	// settings: MyPluginSettings;
	public drawingApps: Map<string, DrawingApp> = new Map();

	async onload() {
		// await this.loadSettings();

		// Register the drawing view for code blocks
		this.registerMarkdownCodeBlockProcessor("pencil", (source, el, ctx) => {
			console.log('Creating new drawing instance');
			
			// Create a unique ID for this drawing instance
			const drawingId = `drawing-${ctx.sourcePath}-${Date.now()}`;

			// Create the container structure
			const container = el.createDiv({ cls: 'drawing-container' });
			const toolbar = container.createDiv({ cls: 'drawing-toolbar' });
			const canvasContainer = container.createDiv({ cls: 'canvas-container' });
			const canvas = canvasContainer.createEl('canvas', { cls: 'drawing-canvas' });

			console.log('Elements created:', {
				container: !!container,
				toolbar: !!toolbar,
				canvasContainer: !!canvasContainer,
				canvas: !!canvas,
				drawingId
			});

			// Add toolbar buttons
			this.createToolbar(toolbar);

			// Initialize the drawing app
			const drawingApp = new DrawingApp(canvas, toolbar);
			this.drawingApps.set(drawingId, drawingApp);

			console.log('Drawing app initialized:', {
				drawingId,
				hasDrawingApp: !!drawingApp
			});

			// Clean up when the element is detached
			ctx.addChild(new DrawingChild(this, drawingId));
		});

		// Add the required CSS
		this.addStyle();
	}

	private createToolbar(toolbar: HTMLElement) {
		// Create tool groups
		const toolGroup = toolbar.createDiv({ cls: 'tool-group' });
		const colorGroup = toolbar.createDiv({ cls: 'tool-group' });
		const actionGroup = toolbar.createDiv({ cls: 'tool-group' });

		// Add tool buttons (pen and eraser)
		const tools = [
			{ tool: 'pen', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>` },
			{ tool: 'eraser', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>` }
		];

		tools.forEach((tool, index) => {
			const btn = toolGroup.createEl('button', {
				cls: `tool-button ${index === 0 ? 'active' : ''}`,
				attr: { 'data-tool': tool.tool }
			});
			btn.innerHTML = tool.icon;
		});

		// Add color picker
		colorGroup.createEl('input', {
			cls: 'color-picker',
			attr: { type: 'color', value: '#000000' }
		});

		// Add brush size buttons
		['small', 'medium', 'large'].forEach(size => {
			const btn = toolGroup.createEl('button', {
				cls: `tool-button ${size === 'small' ? 'active' : ''}`,
				attr: { 'data-size': size }
			});
			btn.innerHTML = size === 'small' ? '•' : size === 'medium' ? '●' : '⬤';
		});

		// Add action buttons
		const actions = [
			{ id: 'grid-toggle', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>` },
			{ id: 'clear', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>` },
			{ id: 'undo', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>` },
			{ id: 'redo', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/></svg>` }
		];

		actions.forEach(action => {
			const btn = actionGroup.createEl('button', {
				cls: 'tool-button',
				attr: { id: action.id }
			});
			btn.innerHTML = action.icon;
		});
	}

	private addStyle() {
		const style = document.createElement('style');
		style.textContent = `
			:root {
				--toolbar-height: 60px;
				--toolbar-bg: #f0f0f0;
			}

			.drawing-container {
				position: relative;
				width: 100%;
				height: 400px;
				min-height: 400px;
				background: var(--background-primary);
				user-select: none;
			}

			.drawing-toolbar {
				position: absolute;
				top: 0;
				left: 0;
				right: 0;
				height: var(--toolbar-height);
				background: var(--background-secondary);
				display: flex;
				align-items: center;
				padding: 0 1rem;
				gap: 1rem;
				box-shadow: 0 2px 4px rgba(0,0,0,0.1);
				z-index: 1;
			}

			.canvas-container {
				position: absolute;
				top: var(--toolbar-height);
				left: 0;
				right: 0;
				bottom: 0;
				background-color: var(--background-primary);
				overflow: hidden;
			}

			.drawing-canvas {
				width: 100%;
				height: 100%;
				display: block;
			}

			.tool-group {
				display: flex;
				gap: 0.5rem;
				align-items: center;
			}

			.color-picker {
				width: 40px;
				height: 40px;
				border: none;
				padding: 0;
				border-radius: 50%;
				cursor: pointer;
				margin-right: 10px;
			}

			.tool-button {
				padding: 0;
				display: flex;
				align-items: center;
				justify-content: center;
				height: 32px;
				width: 32px;
				border: none;
				border-radius: 4px;
				cursor: pointer;
			}



			.tool-button[data-size="small"] { font-size: 12px; }
			.tool-button[data-size="medium"] { font-size: 12px; }
			.tool-button[data-size="large"] { font-size: 14px; }

			#eraser-preview {
				position: fixed;
				pointer-events: none;
				border: 2px solid #000;
				border-radius: 50%;
				display: none;
				z-index: 2;
			}
		`;
		document.head.appendChild(style);
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

class DrawingChild extends MarkdownRenderChild {
	constructor(private plugin: DrawingPlugin, private drawingId: string) {
		super(document.createElement('div'));
	}

	onunload() {
		const app = this.plugin.drawingApps.get(this.drawingId);
		if (app) {
			app.destroy();
			this.plugin.drawingApps.delete(this.drawingId);
		}
	}
}
